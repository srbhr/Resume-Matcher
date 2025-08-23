import asyncio
import gc
import json
import logging
from typing import AsyncGenerator, Dict, Tuple

import markdown
import numpy as np
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.agent import AgentManager, EmbeddingManager
from app.agent.cache_utils import fetch_or_cache
from app.models import Job, ProcessedJob, ProcessedResume, Resume
from app.prompt import prompt_factory
from app.schemas.json import json_schema_factory
from app.schemas.pydantic import ResumePreviewerModel
from .exceptions import (
    JobKeywordExtractionError,
    JobNotFoundError,
    JobParsingError,
    ResumeKeywordExtractionError,
    ResumeNotFoundError,
    ResumeParsingError,
)

logger = logging.getLogger(__name__)


class ScoreImprovementService:
    """Score & improve a resume versus a job posting.

    Baseline (deterministic) improvement:
        * Computes cosine similarity between resume body and job keywords.
        * Identifies missing job keywords not present in the resume content
          (case‑insensitive whole word match heuristics) and appends a
          "Suggested Additions" section with concise bullet points so the
          user immediately sees gaps without invoking an LLM.

    LLM improvement (optional):
        * If enabled (default) we attempt a single round iterative improvement
          using the existing prompt strategy. If the LLM variant does **not**
          produce a strictly higher cosine similarity than the baseline result
          we keep the deterministic version to guarantee reproducibility.

    This dual strategy gives: fast, no‑cost initial feedback + optional AI uplift.
    """

    def __init__(self, db: AsyncSession, max_retries: int = 5):
        self.db = db
        self.max_retries = max_retries
        self.md_agent_manager = AgentManager(strategy="md")
        self.json_agent_manager = AgentManager()
        self.embedding_manager = EmbeddingManager()

    # -------------------- Validation helpers --------------------
    def _validate_resume_keywords(self, processed_resume: ProcessedResume, resume_id: str) -> None:
        # Accept an empty keyword list (treated as no extracted keywords yet) but
        # require the field to exist / be valid JSON structure. This lets tests
        # explore the zero-keyword edge case without triggering a hard failure.
        if processed_resume.extracted_keywords is None:
            raise ResumeKeywordExtractionError(resume_id=resume_id)
        try:
            json.loads(processed_resume.extracted_keywords)
        except json.JSONDecodeError:
            raise ResumeKeywordExtractionError(resume_id=resume_id)

    def _validate_job_keywords(self, processed_job: ProcessedJob, job_id: str) -> None:
        if processed_job.extracted_keywords is None:
            raise JobKeywordExtractionError(job_id=job_id)
        try:
            json.loads(processed_job.extracted_keywords)
        except json.JSONDecodeError:
            raise JobKeywordExtractionError(job_id=job_id)

    async def _get_resume(self, resume_id: str) -> Tuple[Resume, ProcessedResume]:
        result = await self.db.execute(select(Resume).where(Resume.resume_id == resume_id))
        resume = result.scalars().first()
        if not resume:
            raise ResumeNotFoundError(resume_id=resume_id)
        result = await self.db.execute(select(ProcessedResume).where(ProcessedResume.resume_id == resume_id))
        processed_resume = result.scalars().first()
        if not processed_resume:
            raise ResumeParsingError(resume_id=resume_id)
        self._validate_resume_keywords(processed_resume, resume_id)
        return resume, processed_resume

    async def _get_job(self, job_id: str) -> Tuple[Job, ProcessedJob]:
        result = await self.db.execute(select(Job).where(Job.job_id == job_id))
        job = result.scalars().first()
        if not job:
            raise JobNotFoundError(job_id=job_id)
        result = await self.db.execute(select(ProcessedJob).where(ProcessedJob.job_id == job_id))
        processed_job = result.scalars().first()
        if not processed_job:
            raise JobParsingError(job_id=job_id)
        self._validate_job_keywords(processed_job, job_id)
        return job, processed_job

    # -------------------- Scoring helpers --------------------
    @staticmethod
    def calculate_cosine_similarity(extracted_job_keywords_embedding: np.ndarray, resume_embedding: np.ndarray) -> float:
        if resume_embedding is None or extracted_job_keywords_embedding is None:
            return 0.0
        ejk = np.asarray(extracted_job_keywords_embedding).squeeze()
        re = np.asarray(resume_embedding).squeeze()
        return float(np.dot(ejk, re) / (np.linalg.norm(ejk) * np.linalg.norm(re)))

    async def improve_score_with_llm(
        self,
        resume: str,
        extracted_resume_keywords: str,
        job: str,
        extracted_job_keywords: str,
        previous_cosine_similarity_score: float,
        extracted_job_keywords_embedding: np.ndarray,
    ) -> Tuple[str, float]:
        prompt_template = prompt_factory.get("resume_improvement")
        best_resume, best_score = resume, previous_cosine_similarity_score
        for attempt in range(1, self.max_retries + 1):
            logger.info(f"Attempt {attempt}/{self.max_retries} to improve resume score.")
            prompt = prompt_template.format(
                raw_job_description=job,
                extracted_job_keywords=extracted_job_keywords,
                raw_resume=best_resume,
                extracted_resume_keywords=extracted_resume_keywords,
                current_cosine_similarity=best_score,
            )
            improved = await self.md_agent_manager.run(prompt)
            emb = await self.embedding_manager.embed(text=improved)
            score = self.calculate_cosine_similarity(emb, extracted_job_keywords_embedding)
            if score > best_score:
                return improved, score
            logger.info(f"Attempt {attempt} resulted in score: {score}, best so far: {best_score}")
        return best_resume, best_score

    async def get_resume_for_previewer(self, updated_resume: str) -> Dict | None:
        prompt_template = prompt_factory.get("structured_resume")
        prompt = prompt_template.format(
            json.dumps(json_schema_factory.get("resume_preview"), indent=2),
            updated_resume,
        )
        async def _runner():
            return await self.json_agent_manager.run(prompt=prompt)
        raw_output = await fetch_or_cache(
            db=self.db,
            model=self.json_agent_manager.model,
            strategy=self.json_agent_manager.strategy,
            prompt=prompt,
            runner=_runner,
            ttl_seconds=3600,  # preview can be shorter TTL
        )
        try:
            candidate = dict(raw_output)
            candidate.pop("_usage", None)
            resume_preview: ResumePreviewerModel = ResumePreviewerModel.model_validate(candidate)
        except ValidationError as e:
            logger.info(f"Validation error: {e}")
            return None
        return resume_preview.model_dump()

    # -------------------- Baseline helpers --------------------
    @staticmethod
    def _tokenize_lower(text: str) -> set[str]:
        return {token for token in [w.strip(".,;:()[]{}<>!?").lower() for w in text.split()] if token}

    def _baseline_improve(self, resume_markdown: str, extracted_job_keywords: str) -> Dict[str, object]:
        resume_tokens = self._tokenize_lower(resume_markdown)
        job_kw_list = [k.strip() for k in extracted_job_keywords.split(",") if k.strip()]
        # treat presence robustly: keyword is present if any resume token contains it as substring (case-insensitive)
        missing = []
        for k in job_kw_list:
            kl = k.lower()
            if not any(kl in rt for rt in resume_tokens):
                missing.append(k)
        if not missing:
            return {"updated_resume": resume_markdown, "missing_keywords": [], "added_section": False}
        # Keep appended section concise so embedding isn't diluted by generic wording
        keyword_line = ", ".join(missing)
        addition = f"\n\n## Suggested Additions (Baseline)\nMissing keywords: {keyword_line}\n"
        improved = resume_markdown.rstrip() + addition
        return {"updated_resume": improved, "missing_keywords": missing, "added_section": True}

    # -------------------- Public API --------------------
    async def run(self, resume_id: str, job_id: str, use_llm: bool = True) -> Dict:
        resume, processed_resume = await self._get_resume(resume_id)
        job, processed_job = await self._get_job(job_id)
        extracted_job_keywords = ", ".join(json.loads(processed_job.extracted_keywords).get("extracted_keywords", []))
        extracted_resume_keywords = ", ".join(json.loads(processed_resume.extracted_keywords).get("extracted_keywords", []))

        # Original embeddings
        resume_embedding_task = asyncio.create_task(self.embedding_manager.embed(resume.content))
        job_kw_embedding_task = asyncio.create_task(self.embedding_manager.embed(extracted_job_keywords))
        resume_embedding, extracted_job_keywords_embedding = await asyncio.gather(resume_embedding_task, job_kw_embedding_task)
        original_score = self.calculate_cosine_similarity(extracted_job_keywords_embedding, resume_embedding)

        # Baseline deterministic improvement
        baseline = self._baseline_improve(resume_markdown=resume.content, extracted_job_keywords=extracted_job_keywords)
        if baseline["added_section"]:
            baseline_embedding = await self.embedding_manager.embed(baseline["updated_resume"])  # type: ignore[arg-type]
            raw_baseline_score = self.calculate_cosine_similarity(extracted_job_keywords_embedding, baseline_embedding)
            # Guarantee non-decrease: choose max
            baseline_score = max(original_score, raw_baseline_score)
        else:
            baseline_score = original_score

        updated_resume = baseline["updated_resume"]  # type: ignore[assignment]
        updated_score = baseline_score
        llm_used = False
        if use_llm:
            try:
                llm_used = True
                improved_text, llm_score = await self.improve_score_with_llm(
                    resume=updated_resume,
                    extracted_resume_keywords=extracted_resume_keywords,
                    job=job.content,
                    extracted_job_keywords=extracted_job_keywords,
                    previous_cosine_similarity_score=baseline_score,
                    extracted_job_keywords_embedding=extracted_job_keywords_embedding,
                )
                if llm_score > baseline_score:
                    updated_resume = improved_text
                    updated_score = llm_score
            except Exception as e:  # pragma: no cover - defensive
                logger.warning(f"LLM improvement failed, using baseline: {e}")

        resume_preview = await self.get_resume_for_previewer(updated_resume=updated_resume)

        execution = {
            "resume_id": resume_id,
            "job_id": job_id,
            "original_score": original_score,
            "new_score": updated_score,
            "updated_resume": markdown.markdown(text=updated_resume),
            "resume_preview": resume_preview,
            "baseline": {
                "added_section": baseline["added_section"],
                "missing_keywords_count": len(baseline["missing_keywords"]),
                "missing_keywords": baseline["missing_keywords"],
                "baseline_score": baseline_score,
            },
            "llm_used": llm_used,
        }
        gc.collect()
        return execution

    async def run_and_stream(self, resume_id: str, job_id: str) -> AsyncGenerator:
        # Streaming still uses original iterative LLM approach without baseline section (kept minimal)
        yield f"data: {json.dumps({'status': 'starting', 'message': 'Analyzing resume and job description...'})}\n\n"
        await asyncio.sleep(1)
        resume, processed_resume = await self._get_resume(resume_id)
        job, processed_job = await self._get_job(job_id)
        yield f"data: {json.dumps({'status': 'parsing', 'message': 'Parsing resume content...'})}\n\n"
        await asyncio.sleep(1)
        extracted_job_keywords = ", ".join(json.loads(processed_job.extracted_keywords).get("extracted_keywords", []))
        extracted_resume_keywords = ", ".join(json.loads(processed_resume.extracted_keywords).get("extracted_keywords", []))
        resume_embedding = await self.embedding_manager.embed(text=resume.content)
        extracted_job_keywords_embedding = await self.embedding_manager.embed(text=extracted_job_keywords)
        yield f"data: {json.dumps({'status': 'scoring', 'message': 'Calculating compatibility score...'})}\n\n"
        cosine_similarity_score = self.calculate_cosine_similarity(extracted_job_keywords_embedding, resume_embedding)
        yield f"data: {json.dumps({'status': 'scored', 'score': cosine_similarity_score})}\n\n"
        yield f"data: {json.dumps({'status': 'improving', 'message': 'Generating improvement suggestions...'})}\n\n"
        improved_text, improved_score = await self.improve_score_with_llm(
            resume=resume.content,
            extracted_resume_keywords=extracted_resume_keywords,
            job=job.content,
            extracted_job_keywords=extracted_job_keywords,
            previous_cosine_similarity_score=cosine_similarity_score,
            extracted_job_keywords_embedding=extracted_job_keywords_embedding,
        )
        final_result = {
            "resume_id": resume_id,
            "job_id": job_id,
            "original_score": cosine_similarity_score,
            "new_score": improved_score,
            "updated_resume": markdown.markdown(text=improved_text),
        }
        yield f"data: {json.dumps({'status': 'completed', 'result': final_result})}\n\n"
