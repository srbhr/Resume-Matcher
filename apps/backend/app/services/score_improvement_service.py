import gc
import json
import asyncio
import logging
import markdown
import numpy as np
import re

from sqlalchemy.future import select
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Optional, Tuple, AsyncGenerator, List

from app.prompt import prompt_factory
from app.schemas.json import json_schema_factory
from app.schemas.pydantic import ResumePreviewerModel, ResumeAnalysisModel
from app.agent import EmbeddingManager, AgentManager
from app.models import Resume, Job, ProcessedResume, ProcessedJob
from .exceptions import (
    ResumeNotFoundError,
    JobNotFoundError,
    ResumeParsingError,
    JobParsingError,
    ResumeKeywordExtractionError,
    JobKeywordExtractionError,
)

logger = logging.getLogger(__name__)


class ScoreImprovementService:
    """
    Service to handle scoring of resumes and jobs using embeddings.
    Fetches Resume and Job data from the database, computes embeddings,
    and calculates cosine similarity scores. Uses LLM for iteratively improving
    the scoring process.
    """

    def __init__(self, db: AsyncSession, max_retries: int = 5):
        self.db = db
        self.max_retries = max_retries
        self.md_agent_manager = AgentManager(strategy="md")
        self.json_agent_manager = AgentManager()
        self.embedding_manager = EmbeddingManager()

    @staticmethod
    def _normalize_keyword_list(raw_keywords: List[str]) -> List[str]:
        normalized: List[str] = []
        seen = set()
        for keyword in raw_keywords:
            if not isinstance(keyword, str):
                continue
            kw = keyword.strip()
            if not kw:
                continue
            if kw.lower() in seen:
                continue
            seen.add(kw.lower())
            normalized.append(kw)
        return normalized

    @staticmethod
    def _prepare_text_for_matching(text: str) -> str:
        lowered = text.lower()
        lowered = re.sub(r"[`*_>#\-]", " ", lowered)
        lowered = re.sub(r"\s+", " ", lowered)
        return lowered

    @classmethod
    def _build_skill_comparison(
        cls, keywords: List[str], resume_text: str, job_text: str
    ) -> List[Dict[str, int | str]]:
        if not keywords:
            return []
        resume_norm = cls._prepare_text_for_matching(resume_text)
        job_norm = cls._prepare_text_for_matching(job_text)
        stats: List[Dict[str, int | str]] = []
        for keyword in keywords:
            kw_lower = keyword.lower()
            pattern = re.compile(rf"(?<!\w){re.escape(kw_lower)}(?!\w)")
            resume_mentions = len(pattern.findall(resume_norm))
            job_mentions = len(pattern.findall(job_norm))
            stats.append(
                {
                    "skill": keyword,
                    "resume_mentions": resume_mentions,
                    "job_mentions": job_mentions,
                }
            )
        return stats

    @staticmethod
    def _has_summary_section(resume_text: str) -> bool:
        heading_pattern = re.compile(
            r"^\s{0,3}(?:#{1,3}|\*\*|__)?\s*(professional\s+)?(summary|profile|overview)\b",
            re.IGNORECASE,
        )
        for line in resume_text.splitlines():
            if heading_pattern.search(line.strip()):
                return True
        return False

    @staticmethod
    def _build_skill_priority_text(
        stats: List[Dict[str, int | str]], top_n: int = 12
    ) -> str:
        if not stats:
            return "    - No keyword statistics available."
        ordered = sorted(
            stats,
            key=lambda item: (
                int(item.get("job_mentions", 0)),
                int(item.get("resume_mentions", 0)),
            ),
            reverse=True,
        )
        lines: List[str] = []
        for record in ordered[:top_n]:
            skill = record.get("skill", "")
            job_mentions = int(record.get("job_mentions", 0))
            resume_mentions = int(record.get("resume_mentions", 0))
            lines.append(
                f"    - {skill} (job mentions: {job_mentions}, resume mentions: {resume_mentions})"
            )
        return "\n".join(lines)

    @classmethod
    def _build_ats_recommendations(
        cls, stats: List[Dict[str, int | str]], resume_text: str
    ) -> str:
        recommendations: List[str] = []
        if not cls._has_summary_section(resume_text):
            recommendations.append(
                "Create a concise 2-3 sentence summary section at the top that reflects the most relevant accomplishments and weaves in the priority keywords."
            )

        missing_keywords = [
            record
            for record in stats
            if int(record.get("job_mentions", 0)) > 0
            and int(record.get("resume_mentions", 0)) == 0
        ]

        if missing_keywords:
            highlighted = ", ".join(record.get("skill", "") for record in missing_keywords[:10])
            recommendations.append(
                "Emphasize factual experience that aligns with these uncovered keywords: "
                f"{highlighted}. Rephrase existing bullets so they explicitly mention the relevant tools, domains, or methodologies without inventing new work."
            )

        if not recommendations:
            recommendations.append(
                "Tighten each section so that high-priority keywords appear in strong action-driven bullets supported by concrete outcomes."
            )

        return "\n".join(f"    - {rec}" for rec in recommendations)

    def _validate_resume_keywords(
        self, processed_resume: ProcessedResume, resume_id: str
    ) -> None:
        """
        Validates that keyword extraction was successful for a resume.
        Raises ResumeKeywordExtractionError if keywords are missing or empty.
        """
        if not processed_resume.extracted_keywords:
            raise ResumeKeywordExtractionError(resume_id=resume_id)

        try:
            keywords_data = json.loads(processed_resume.extracted_keywords)
            keywords = keywords_data.get("extracted_keywords", [])
            if not keywords or len(keywords) == 0:
                raise ResumeKeywordExtractionError(resume_id=resume_id)
        except json.JSONDecodeError:
            raise ResumeKeywordExtractionError(resume_id=resume_id)

    def _validate_job_keywords(self, processed_job: ProcessedJob, job_id: str) -> None:
        """
        Validates that keyword extraction was successful for a job.
        Raises JobKeywordExtractionError if keywords are missing or empty.
        """
        if not processed_job.extracted_keywords:
            raise JobKeywordExtractionError(job_id=job_id)

        try:
            keywords_data = json.loads(processed_job.extracted_keywords)
            keywords = keywords_data.get("extracted_keywords", [])
            if not keywords or len(keywords) == 0:
                raise JobKeywordExtractionError(job_id=job_id)
        except json.JSONDecodeError:
            raise JobKeywordExtractionError(job_id=job_id)

    async def _get_resume(
        self, resume_id: str
    ) -> Tuple[Resume | None, ProcessedResume | None]:
        """
        Fetches the resume from the database.
        """
        query = select(Resume).where(Resume.resume_id == resume_id)
        result = await self.db.execute(query)
        resume = result.scalars().first()

        if not resume:
            raise ResumeNotFoundError(resume_id=resume_id)

        query = select(ProcessedResume).where(ProcessedResume.resume_id == resume_id)
        result = await self.db.execute(query)
        processed_resume = result.scalars().first()

        if not processed_resume:
            raise ResumeParsingError(resume_id=resume_id)

        self._validate_resume_keywords(processed_resume, resume_id)

        return resume, processed_resume

    async def _get_job(self, job_id: str) -> Tuple[Job | None, ProcessedJob | None]:
        """
        Fetches the job from the database.
        """
        query = select(Job).where(Job.job_id == job_id)
        result = await self.db.execute(query)
        job = result.scalars().first()

        if not job:
            raise JobNotFoundError(job_id=job_id)

        query = select(ProcessedJob).where(ProcessedJob.job_id == job_id)
        result = await self.db.execute(query)
        processed_job = result.scalars().first()

        if not processed_job:
            raise JobParsingError(job_id=job_id)

        self._validate_job_keywords(processed_job, job_id)

        return job, processed_job

    def calculate_cosine_similarity(
        self,
        extracted_job_keywords_embedding: np.ndarray,
        resume_embedding: np.ndarray,
    ) -> float:
        """
        Calculates the cosine similarity between two embeddings.
        """
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
        ats_recommendations: str,
        skill_priority_text: str,
    ) -> Tuple[str, float]:
        prompt_template = prompt_factory.get("resume_improvement")
        best_resume, best_score = resume, previous_cosine_similarity_score

        for attempt in range(1, self.max_retries + 1):
            logger.info(
                f"Attempt {attempt}/{self.max_retries} to improve resume score."
            )
            prompt = prompt_template.format(
                raw_job_description=job,
                extracted_job_keywords=extracted_job_keywords,
                raw_resume=best_resume,
                extracted_resume_keywords=extracted_resume_keywords,
                current_cosine_similarity=best_score,
                ats_recommendations=ats_recommendations,
                skill_priority_text=skill_priority_text,
            )
            improved = await self.md_agent_manager.run(prompt)
            emb = await self.embedding_manager.embed(text=improved)
            score = self.calculate_cosine_similarity(
                emb, extracted_job_keywords_embedding
            )

            if score > best_score:
                return improved, score

            logger.info(
                f"Attempt {attempt} resulted in score: {score}, best score so far: {best_score}"
            )

        return best_resume, best_score

    async def get_resume_for_previewer(self, updated_resume: str) -> Dict:
        """
        Returns the updated resume in a format suitable for the dashboard.
        """
        prompt_template = prompt_factory.get("structured_resume")
        prompt = prompt_template.format(
            json.dumps(json_schema_factory.get("resume_preview"), indent=2),
            updated_resume,
        )
        logger.info(f"Structured Resume Prompt: {prompt}")
        raw_output = await self.json_agent_manager.run(prompt=prompt)

        try:
            resume_preview: ResumePreviewerModel = ResumePreviewerModel.model_validate(
                raw_output
            )
        except ValidationError as e:
            logger.info(f"Validation error: {e}")
            return None
        return resume_preview.model_dump()

    async def get_resume_analysis(
        self,
        original_resume: str,
        improved_resume: str,
        job_description: str,
        extracted_job_keywords: str,
        extracted_resume_keywords: str,
        original_score: float,
        new_score: float,
    ) -> Dict | None:
        """Generate a structured summary comparing resume versions against the job."""

        prompt_template = prompt_factory.get("resume_analysis")
        schema = json.dumps(json_schema_factory.get("resume_analysis"), indent=2)
        prompt = prompt_template.format(
            schema,
            job_description,
            extracted_job_keywords,
            original_resume,
            extracted_resume_keywords,
            improved_resume,
            original_score,
            new_score,
        )

        raw_output = await self.json_agent_manager.run(prompt=prompt)

        try:
            analysis = ResumeAnalysisModel.model_validate(raw_output)
        except ValidationError as e:
            logger.info(f"Resume analysis validation error: {e}")
            return None

        return analysis.model_dump()

    async def run(self, resume_id: str, job_id: str) -> Dict:
        """
        Main method to run the scoring and improving process and return dict.
        """

        resume, processed_resume = await self._get_resume(resume_id)
        job, processed_job = await self._get_job(job_id)

        job_keywords_raw = json.loads(processed_job.extracted_keywords).get(
            "extracted_keywords", []
        )
        resume_keywords_raw = json.loads(processed_resume.extracted_keywords).get(
            "extracted_keywords", []
        )

        job_keywords_list = self._normalize_keyword_list(job_keywords_raw)
        resume_keywords_list = self._normalize_keyword_list(resume_keywords_raw)

        extracted_job_keywords = ", ".join(job_keywords_list)

        extracted_resume_keywords = ", ".join(resume_keywords_list)

        skill_stats_for_prompt = self._build_skill_comparison(
            keywords=job_keywords_list,
            resume_text=resume.content,
            job_text=job.content,
        )
        ats_recommendations = self._build_ats_recommendations(
            stats=skill_stats_for_prompt,
            resume_text=resume.content,
        )
        skill_priority_text = self._build_skill_priority_text(skill_stats_for_prompt)

        resume_embedding_task = asyncio.create_task(
            self.embedding_manager.embed(resume.content)
        )
        job_kw_embedding_task = asyncio.create_task(
            self.embedding_manager.embed(extracted_job_keywords)
        )
        resume_embedding, extracted_job_keywords_embedding = await asyncio.gather(
            resume_embedding_task, job_kw_embedding_task
        )

        cosine_similarity_score = self.calculate_cosine_similarity(
            extracted_job_keywords_embedding, resume_embedding
        )
        updated_resume, updated_score = await self.improve_score_with_llm(
            resume=resume.content,
            extracted_resume_keywords=extracted_resume_keywords,
            job=job.content,
            extracted_job_keywords=extracted_job_keywords,
            previous_cosine_similarity_score=cosine_similarity_score,
            extracted_job_keywords_embedding=extracted_job_keywords_embedding,
            ats_recommendations=ats_recommendations,
            skill_priority_text=skill_priority_text,
        )

        resume_preview = await self.get_resume_for_previewer(
            updated_resume=updated_resume
        )

        resume_analysis = await self.get_resume_analysis(
            original_resume=resume.content,
            improved_resume=updated_resume,
            job_description=job.content,
            extracted_job_keywords=extracted_job_keywords,
            extracted_resume_keywords=extracted_resume_keywords,
            original_score=cosine_similarity_score,
            new_score=updated_score,
        )

        skill_comparison = self._build_skill_comparison(
            keywords=job_keywords_list,
            resume_text=updated_resume,
            job_text=job.content,
        )

        logger.info(f"Resume Preview: {resume_preview}")

        execution = {
            "resume_id": resume_id,
            "job_id": job_id,
            "original_score": cosine_similarity_score,
            "new_score": updated_score,
            "updated_resume": markdown.markdown(text=updated_resume),
            "resume_preview": resume_preview,
            "details": resume_analysis.get("details") if resume_analysis else "",
            "commentary": resume_analysis.get("commentary") if resume_analysis else "",
            "improvements": resume_analysis.get("improvements") if resume_analysis else [],
            "original_resume_markdown": resume.content,
            "updated_resume_markdown": updated_resume,
            "job_description": job.content,
            "job_keywords": extracted_job_keywords,
            "skill_comparison": skill_comparison,
        }

        gc.collect()

        return execution

    async def run_and_stream(self, resume_id: str, job_id: str) -> AsyncGenerator:
        """
        Main method to run the scoring and improving process and return dict.
        """

        yield f"data: {json.dumps({'status': 'starting', 'message': 'Analyzing resume and job description...'})}\n\n"
        await asyncio.sleep(2)

        resume, processed_resume = await self._get_resume(resume_id)
        job, processed_job = await self._get_job(job_id)

        yield f"data: {json.dumps({'status': 'parsing', 'message': 'Parsing resume content...'})}\n\n"
        await asyncio.sleep(2)

        job_keywords_raw = json.loads(processed_job.extracted_keywords).get(
            "extracted_keywords", []
        )
        resume_keywords_raw = json.loads(processed_resume.extracted_keywords).get(
            "extracted_keywords", []
        )

        job_keywords_list = self._normalize_keyword_list(job_keywords_raw)
        resume_keywords_list = self._normalize_keyword_list(resume_keywords_raw)

        extracted_job_keywords = ", ".join(job_keywords_list)

        extracted_resume_keywords = ", ".join(resume_keywords_list)

        skill_stats_for_prompt = self._build_skill_comparison(
            keywords=job_keywords_list,
            resume_text=resume.content,
            job_text=job.content,
        )
        ats_recommendations = self._build_ats_recommendations(
            stats=skill_stats_for_prompt,
            resume_text=resume.content,
        )
        skill_priority_text = self._build_skill_priority_text(skill_stats_for_prompt)

        resume_embedding = await self.embedding_manager.embed(text=resume.content)
        extracted_job_keywords_embedding = await self.embedding_manager.embed(
            text=extracted_job_keywords
        )

        yield f"data: {json.dumps({'status': 'scoring', 'message': 'Calculating compatibility score...'})}\n\n"
        await asyncio.sleep(3)

        cosine_similarity_score = self.calculate_cosine_similarity(
            extracted_job_keywords_embedding, resume_embedding
        )

        yield f"data: {json.dumps({'status': 'scored', 'score': cosine_similarity_score})}\n\n"

        yield f"data: {json.dumps({'status': 'improving', 'message': 'Generating improvement suggestions...'})}\n\n"
        await asyncio.sleep(3)

        updated_resume, updated_score = await self.improve_score_with_llm(
            resume=resume.content,
            extracted_resume_keywords=extracted_resume_keywords,
            job=job.content,
            extracted_job_keywords=extracted_job_keywords,
            previous_cosine_similarity_score=cosine_similarity_score,
            extracted_job_keywords_embedding=extracted_job_keywords_embedding,
            ats_recommendations=ats_recommendations,
            skill_priority_text=skill_priority_text,
        )

        resume_preview = await self.get_resume_for_previewer(
            updated_resume=updated_resume
        )

        resume_analysis = await self.get_resume_analysis(
            original_resume=resume.content,
            improved_resume=updated_resume,
            job_description=job.content,
            extracted_job_keywords=extracted_job_keywords,
            extracted_resume_keywords=extracted_resume_keywords,
            original_score=cosine_similarity_score,
            new_score=updated_score,
        )

        skill_comparison = self._build_skill_comparison(
            keywords=job_keywords_list,
            resume_text=updated_resume,
            job_text=job.content,
        )

        if resume_analysis and resume_analysis.get("improvements"):
            for i, suggestion in enumerate(resume_analysis["improvements"]):
                payload = {
                    "status": "suggestion",
                    "index": i,
                    "text": suggestion.get("suggestion", ""),
                    "reference": suggestion.get("lineNumber"),
                }
                yield f"data: {json.dumps(payload)}\n\n"
                await asyncio.sleep(0.2)

        final_result = {
            "resume_id": resume_id,
            "job_id": job_id,
            "original_score": cosine_similarity_score,
            "new_score": updated_score,
            "updated_resume": markdown.markdown(text=updated_resume),
            "resume_preview": resume_preview,
            "details": resume_analysis.get("details") if resume_analysis else "",
            "commentary": resume_analysis.get("commentary") if resume_analysis else "",
            "improvements": resume_analysis.get("improvements") if resume_analysis else [],
            "original_resume_markdown": resume.content,
            "updated_resume_markdown": updated_resume,
            "job_description": job.content,
            "job_keywords": extracted_job_keywords,
            "skill_comparison": skill_comparison,
        }

        yield f"data: {json.dumps({'status': 'completed', 'result': final_result})}\n\n"
