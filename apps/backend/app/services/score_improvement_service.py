import asyncio
import gc
import json
import logging
import re
from typing import AsyncGenerator, Dict, Tuple

import markdown
import numpy as np
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.agent import AgentManager, EmbeddingManager
from app.agent.exceptions import ProviderError
from .exceptions import AIProcessingError
from app.agent.cache_utils import fetch_or_cache
from app.models import Job, ProcessedJob, ProcessedResume, Resume
from app.prompt import prompt_factory
from app.schemas.json import json_schema_factory
from app.core.config import settings
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

    def __init__(self, db: AsyncSession, max_retries: int = settings.IMPROVE_LLM_ATTEMPTS):
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
            improved_obj = await self.md_agent_manager.run(
                prompt,
                temperature=settings.LLM_TEMPERATURE,
                max_output_tokens=settings.LLM_MAX_OUTPUT_TOKENS,
            )
            # MDWrapper returns {"markdown": "```md\n...\n```"}; extract plain text for embedding/scoring
            if isinstance(improved_obj, dict) and "markdown" in improved_obj:
                improved = self._unwrap_fenced_markdown(str(improved_obj["markdown"]))
            else:
                improved = self._unwrap_fenced_markdown(str(improved_obj))
            emb = await self.embedding_manager.embed(text=improved)
            score = self.calculate_cosine_similarity(emb, extracted_job_keywords_embedding)
            if score > best_score:
                return improved, score
            logger.info(f"Attempt {attempt} resulted in score: {score}, best so far: {best_score}")
        return best_resume, best_score

    async def improve_until_target(
        self,
        *,
        base_text: str,
        base_score: float,
        job_text: str,
        extracted_job_keywords: str,
        extracted_resume_keywords: str,
        target_uplift: float,
        job_kw_embedding: np.ndarray,
        extra_rounds: int,
    ) -> Tuple[str, float, bool]:
        """Try multiple diversified LLM rounds until relative uplift >= target_uplift.

        Returns (best_text, best_score, hit_target)
        """
        best_text = base_text
        best_score = base_score
        hit = False
        # Sweep temperatures and optionally slightly increase max tokens to allow richer edits
        temps = list(getattr(settings, "IMPROVE_TEMPERATURE_SWEEP", [settings.LLM_TEMPERATURE]))
        max_tokens = max(settings.LLM_MAX_OUTPUT_TOKENS, getattr(settings, "IMPROVE_MAX_OUTPUT_TOKENS_BOOST", settings.LLM_MAX_OUTPUT_TOKENS))
        prompt_template = prompt_factory.get("resume_improvement")
        attempts = 0
        for round_idx in range(max(0, extra_rounds)):
            for t in temps:
                attempts += 1
                logger.info(f"Target uplift round {round_idx+1}/{extra_rounds}, temp={t}, attempt={attempts}")
                prompt = prompt_template.format(
                    raw_job_description=job_text,
                    extracted_job_keywords=extracted_job_keywords,
                    raw_resume=best_text,
                    extracted_resume_keywords=extracted_resume_keywords,
                    current_cosine_similarity=best_score,
                )
                try:
                    improved_obj = await self.md_agent_manager.run(
                        prompt,
                        temperature=float(t),
                        max_output_tokens=int(max_tokens),
                    )
                except Exception as e:
                    logger.info(f"improve_until_target generation failed: {e}")
                    continue
                cand = self._unwrap_fenced_markdown(improved_obj["markdown"]) if isinstance(improved_obj, dict) and "markdown" in improved_obj else self._unwrap_fenced_markdown(str(improved_obj))
                emb = await self.embedding_manager.embed(text=cand)
                score = self.calculate_cosine_similarity(job_kw_embedding, emb)
                if score > best_score:
                    best_text, best_score = cand, score
                    rel = (best_score - base_score) / max(1e-8, base_score) if base_score > 0 else (1.0 if best_score > 0 else 0.0)
                    hit = rel >= target_uplift
                    logger.info(f"New best score {best_score:.6f}; uplift={(rel*100):.2f}% (target={(target_uplift*100):.1f}%)")
                    if hit:
                        return best_text, best_score, True
        return best_text, best_score, hit

    async def get_resume_for_previewer(self, updated_resume: str) -> Dict | None:
        prompt_template = prompt_factory.get("structured_resume")
        prompt = prompt_template.format(
            json.dumps(json_schema_factory.get("resume_preview"), indent=2),
            updated_resume,
        )

        async def _runner():
            return await self.json_agent_manager.run(prompt=prompt)

        try:
            raw_output = await fetch_or_cache(
                db=self.db,
                model=self.json_agent_manager.model,
                strategy=self.json_agent_manager.strategy,
                prompt=prompt,
                runner=_runner,
                ttl_seconds=3600,  # preview can be shorter TTL
            )
        except Exception as e:  # Provider or cache execution failure should not blow up the endpoint
            # Best-effort rollback to keep request-scoped session healthy
            try:
                await self.db.rollback()
            except Exception:
                pass
            logger.info(f"Preview generation failed; returning None. reason={e}")
            return None

        # Coerce None values to empty strings recursively to satisfy Pydantic string fields
        def _sanitize(obj):
            if obj is None:
                return ""
            if isinstance(obj, dict):
                return {k: _sanitize(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [_sanitize(v) for v in obj]
            return obj

        try:
            candidate = _sanitize(dict(raw_output))
            candidate.pop("_usage", None)
            resume_preview: ResumePreviewerModel = ResumePreviewerModel.model_validate(candidate)
        except ValidationError as e:
            logger.info(f"Validation error: {e}")
            return None
        return resume_preview.model_dump()

    # -------------------- Baseline helpers --------------------
    async def _find_missing_keywords_dynamic(
        self,
        resume_markdown: str,
        extracted_job_keywords: str,
        extracted_resume_keywords: str,
        threshold: float = 0.82,
    ) -> tuple[list[str], list[str]]:
        """Use embeddings to treat semantically equivalent keywords as present.

        - job_kw_list: split by comma from job keywords
        - resume_kw_list: split by comma from resume extracted keywords
        - present if:
          a) canonical job keyword is substring of canonical resume body, OR
          b) max cosine(job_kw, any resume_kw) >= threshold
        Returns (job_kw_list_preserving_order_and_dedup, missing_list)
        """
        def canonical(s: str) -> str:
            s = s.lower()
            return re.sub(r"[^a-z0-9]+", "", s)

        job_kw_list = [k.strip() for k in extracted_job_keywords.split(",") if k.strip()]
        resume_kw_list = [k.strip() for k in extracted_resume_keywords.split(",") if k.strip()]

        # Deduplicate job keywords by canonical form while preserving order
        ordered_job_kws: list[str] = []
        seen: set[str] = set()
        for k in job_kw_list:
            c = canonical(k)
            if not c or c in seen:
                continue
            seen.add(c)
            ordered_job_kws.append(k)

        # Quick path: canonical substring presence in resume body
        canon_resume = canonical(resume_markdown)

        # Embed resume keywords and job keywords
        # Note: keep counts small; typical keyword lists are short
        async def _embed_many(texts: list[str]) -> list[np.ndarray]:
            tasks = [asyncio.create_task(self.embedding_manager.embed(t)) for t in texts]
            vecs = await asyncio.gather(*tasks)
            return [np.asarray(v).squeeze() for v in vecs]

        resume_kw_vecs: list[np.ndarray] = []
        job_kw_vecs: list[np.ndarray] = []
        if resume_kw_list:
            resume_kw_vecs = await _embed_many(resume_kw_list)
        if ordered_job_kws:
            job_kw_vecs = await _embed_many(ordered_job_kws)

        def cosine(a: np.ndarray, b: np.ndarray) -> float:
            return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

        missing: list[str] = []
        for idx, jk in enumerate(ordered_job_kws):
            cj = canonical(jk)
            if cj and cj in canon_resume:
                continue
            present = False
            if resume_kw_vecs and job_kw_vecs:
                jv = job_kw_vecs[idx]
                # max similarity against all resume keywords
                best = max((cosine(jv, rv) for rv in resume_kw_vecs), default=0.0)
                present = best >= threshold
            if not present:
                missing.append(jk)
        return ordered_job_kws, missing

    def _baseline_improve_from_lists(self, resume_markdown: str, job_kw_list: list[str], missing: list[str], *, always_core_tech: bool = False) -> Dict[str, object]:
        """Baseline weave using provided job_kw_list and missing keywords."""
        def canonical(s: str) -> str:
            s = s.lower()
            return re.sub(r"[^a-z0-9]+", "", s)

        canonical_resume = canonical(resume_markdown)

        # 1) Try to naturally weave missing keywords into key sections (low-cost, deterministic)
        improved = resume_markdown
        try:
            # De-duplicate while keeping original order
            to_add = []
            seen: set[str] = set()
            for m in missing:
                c = canonical(m)
                if c in seen:
                    continue
                seen.add(c)
                to_add.append(m)
            # Build display list for all job keywords (dedup, preserve order) for Core Technologies line
            all_job_display: list[str] = []
            _seen_all: set[str] = set()
            for jk in job_kw_list:
                cj = canonical(jk)
                if not cj or cj in _seen_all:
                    continue
                _seen_all.add(cj)
                all_job_display.append(jk.strip())
            if to_add or always_core_tech:
                # 1a) Locate a Skills section in German or English and append
                import re as _re
                skills_hdr = _re.compile(r"(?im)^(##\s*(Fähigkeiten|Skills)\s*)$")
                next_hdr = _re.compile(r"(?im)^##\s+")
                m_hdr = skills_hdr.search(improved)
                if m_hdr:
                    start = m_hdr.end()
                    m_next = next_hdr.search(improved, pos=start)
                    section_end = m_next.start() if m_next else len(improved)
                    section = improved[start:section_end]
                    # Find first non-empty line within the section
                    lines = section.splitlines()
                    idx = None
                    for i, line in enumerate(lines):
                        if line.strip():
                            idx = i
                            break
                    if idx is not None:
                        # Reorder to put job keywords first (display preserves original), dedupe by canonical form
                        base_line = lines[idx].strip()
                        existing_items = [x.strip() for x in base_line.split(",") if x.strip()]
                        existing_canon = []
                        existing_seen: set[str] = set()
                        for x in existing_items:
                            cx = canonical(x)
                            if cx in existing_seen:
                                continue
                            existing_seen.add(cx)
                            existing_canon.append((cx, x))

                        # Job keywords in given order
                        job_first: list[str] = []
                        added_first: set[str] = set()
                        for jk in job_kw_list:
                            cj = canonical(jk)
                            if not cj or cj in added_first:
                                continue
                            added_first.add(cj)
                            job_first.append(jk.strip())

                        # Append remaining existing items not already included (preserve original display)
                        final_items: list[str] = []
                        final_seen: set[str] = set()
                        for item in job_first:
                            ci = canonical(item)
                            if ci in final_seen:
                                continue
                            final_seen.add(ci)
                            final_items.append(item)
                        for cx, orig in existing_canon:
                            if cx in final_seen:
                                continue
                            final_seen.add(cx)
                            final_items.append(orig.strip())
                        # If there were missing keywords that weren't already present, make sure they're included
                        for mkw in to_add:
                            cm = canonical(mkw)
                            if cm not in final_seen:
                                final_seen.add(cm)
                                final_items.append(mkw.strip())
                        lines[idx] = ", ".join(final_items)
                    else:
                        # Empty section: create a new line with keywords
                        lines.append(", ".join([x.strip() for x in to_add]))
                    new_section = "\n".join(lines)
                    improved = improved[:start] + new_section + improved[section_end:]

                # 1b) Add a short "Core Technologies" line under the top heading / Profile section
                profile_hdr = _re.compile(r"(?im)^(##\s*(Profil|Profile)\s*)$")
                m_prof = profile_hdr.search(improved)
                if m_prof:
                    insert_pos = m_prof.end()
                    # Avoid duplicate Core Technologies lines
                    after_slice = improved[insert_pos:insert_pos + 200]
                    if "Core Technologies:" not in after_slice:
                        core_line = f"\nCore Technologies: {', '.join(all_job_display)}\n"
                        improved = improved[:insert_pos] + core_line + improved[insert_pos:]
                else:
                    # If there's a top-level title (# ...) add a Core Technologies line below it; else at top
                    h1_hdr = _re.compile(r"(?im)^(#\s+.+)$")
                    m_h1 = h1_hdr.search(improved)
                    insert_pos = m_h1.end() if m_h1 else 0
                    preview = improved[insert_pos:insert_pos + 200]
                    if "Core Technologies:" not in preview:
                        core_line = f"\n\nCore Technologies: {', '.join(all_job_display)}\n"
                        improved = improved[:insert_pos] + core_line + improved[insert_pos:]

                # If no Skills section exists at all, create one near the end
                m_hdr_after = skills_hdr.search(improved)
                if not m_hdr_after:
                    new_skills_block = "\n\n## Fähigkeiten\n" + ", ".join(all_job_display) + "\n"
                    improved = improved.rstrip() + new_skills_block

                # 1c) First bullet under the most recent experience: weave one concise sentence
                exp_hdr = _re.compile(r"(?im)^(##\s*(Berufserfahrung|Experience)\s*)$")
                m_exp = exp_hdr.search(improved)
                if m_exp:
                    exp_start = m_exp.end()
                    m_next = next_hdr.search(improved, pos=exp_start)
                    exp_end = m_next.start() if m_next else len(improved)
                    exp_block = improved[exp_start:exp_end]
                    exp_lines = exp_block.splitlines()
                    already_weaved = any(
                        ("Arbeit mit" in ln) and any(canonical(x) in canonical(ln) for x in to_add)
                        for ln in exp_lines
                    )
                    if not already_weaved:
                        for i, line in enumerate(exp_lines):
                            if line.strip().startswith("-"):
                                insert_i = i + 1
                                sub_bullet = f"  - Arbeit mit {', '.join([x.strip() for x in to_add])}"
                                exp_lines.insert(insert_i, sub_bullet)
                                break
                    new_exp_block = "\n".join(exp_lines)
                    improved = improved[:exp_start] + new_exp_block + improved[exp_end:]
        except Exception:
            improved = resume_markdown

        if not missing:
            return {"updated_resume": improved, "missing_keywords": [], "added_section": False}

        keyword_line = ", ".join(missing)
        addition = f"\n\n## Suggested Additions (Baseline)\nMissing keywords: {keyword_line}\n"
        improved = improved.rstrip() + addition
        return {"updated_resume": improved, "missing_keywords": missing, "added_section": True}
    @staticmethod
    def _extract_keywords(raw: str | None) -> list[str]:
        """Safely parse keywords from a JSON column that may be:
        - a dict with key "extracted_keywords"
        - a plain list of strings
        - the literal JSON null ("null")
        - invalid JSON
        Returns a list of strings in all cases.
        """
        if not raw:
            return []
        try:
            data = json.loads(raw)
        except Exception:
            return []
        if isinstance(data, dict):
            vals = data.get("extracted_keywords", [])
        elif isinstance(data, list):
            vals = data
        else:
            vals = []
        return [str(v) for v in vals if isinstance(v, str)]

    @staticmethod
    def _unwrap_fenced_markdown(md_text: str) -> str:
        # Return inner content from ```md ... ``` / ```markdown ... ``` / ``` ... ```
        fence_pattern = re.compile(r"```(?:md|markdown)?\s*([\s\S]*?)\s*```", re.IGNORECASE)
        m = fence_pattern.search(md_text)
        if m:
            return m.group(1).strip()
        return md_text

    @staticmethod
    def _tokenize_lower(text: str) -> set[str]:
        return {token for token in [w.strip(".,;:()[]{}<>!?").lower() for w in text.split()] if token}

    def _baseline_improve(self, resume_markdown: str, extracted_job_keywords: str) -> Dict[str, object]:
        # --- Normalization helpers (dedupe and synonym-friendly presence checks) ---
        def canonical(s: str) -> str:
            # lower, strip common punctuation/spaces so "node.js" ~ "nodejs", "ci/cd" ~ "cicd"
            s = s.lower()
            return re.sub(r"[^a-z0-9]+", "", s)

        # Prepare canonicalized resume text for robust substring matching
        canonical_resume = canonical(resume_markdown)

        # Build list of job keywords, preserve original order/case for display
        job_kw_list = [k.strip() for k in extracted_job_keywords.split(",") if k.strip()]

        # Generic normalization only (no hard-coded keyword lists)
        def normalize_kw(s: str) -> str:
            return canonical(s)

        def display_kw(s: str) -> str:
            # Preserve original keyword text
            return s.strip()

        # Determine which job keywords are truly missing (canonicalized substring test)
        seen_canon: set[str] = set()
        missing: list[str] = []
        for k in job_kw_list:
            c = normalize_kw(k)
            if not c or c in seen_canon:
                continue
            seen_canon.add(c)
            if c not in canonical_resume:
                missing.append(k)
        if not missing:
            return {"updated_resume": resume_markdown, "missing_keywords": [], "added_section": False}

        # 1) Try to naturally weave missing keywords into key sections (low-cost, deterministic)
        improved = resume_markdown
        try:
            # De-duplicate while keeping original order
            to_add = []
            seen: set[str] = set()
            for m in missing:
                c = normalize_kw(m)
                if c in seen:
                    continue
                seen.add(c)
                to_add.append(m)
            # Build display list for all job keywords (dedup, preserve order) for Core Technologies line
            all_job_display: list[str] = []
            _seen_all: set[str] = set()
            for jk in job_kw_list:
                cj = normalize_kw(jk)
                if not cj or cj in _seen_all:
                    continue
                _seen_all.add(cj)
                all_job_display.append(display_kw(jk))
            if to_add:
                # 1a) Locate a Skills section in German or English and append
                import re as _re
                skills_hdr = _re.compile(r"(?im)^(##\s*(Fähigkeiten|Skills)\s*)$")
                next_hdr = _re.compile(r"(?im)^##\s+")
                m_hdr = skills_hdr.search(improved)
                if m_hdr:
                    start = m_hdr.end()
                    m_next = next_hdr.search(improved, pos=start)
                    section_end = m_next.start() if m_next else len(improved)
                    section = improved[start:section_end]
                    # Find first non-empty line within the section
                    lines = section.splitlines()
                    idx = None
                    for i, line in enumerate(lines):
                        if line.strip():
                            idx = i
                            break
                    if idx is not None:
                        # Reorder to put job keywords first (display-cased), dedupe by canonical form
                        base_line = lines[idx].strip()
                        existing_items = [x.strip() for x in base_line.split(",") if x.strip()]
                        existing_canon = []
                        existing_seen: set[str] = set()
                        for x in existing_items:
                            cx = normalize_kw(x)
                            if cx in existing_seen:
                                continue
                            existing_seen.add(cx)
                            existing_canon.append((cx, x))

                        # Job keywords in given order
                        job_first: list[str] = []
                        added_first: set[str] = set()
                        for jk in job_kw_list:
                            cj = normalize_kw(jk)
                            if not cj or cj in added_first:
                                continue
                            added_first.add(cj)
                            job_first.append(display_kw(jk))

                        # Append remaining existing items not already included (preserve original display)
                        final_items: list[str] = []
                        final_seen: set[str] = set()
                        for item in job_first:
                            ci = normalize_kw(item)
                            if ci in final_seen:
                                continue
                            final_seen.add(ci)
                            final_items.append(item)
                        for cx, orig in existing_canon:
                            if cx in final_seen:
                                continue
                            final_seen.add(cx)
                            final_items.append(orig.strip())
                        # If there were missing keywords that weren't already present, make sure they're included
                        for mkw in to_add:
                            cm = normalize_kw(mkw)
                            if cm not in final_seen:
                                final_seen.add(cm)
                                final_items.append(display_kw(mkw))
                        lines[idx] = ", ".join(final_items)
                    else:
                        # Empty section: create a new line with keywords
                        lines.append(", ".join([display_kw(x) for x in to_add]))
                    new_section = "\n".join(lines)
                    improved = improved[:start] + new_section + improved[section_end:]

                # 1b) Add a short "Core Technologies" line under the top heading / Profile section
                profile_hdr = _re.compile(r"(?im)^(##\s*(Profil|Profile)\s*)$")
                m_prof = profile_hdr.search(improved)
                if m_prof:
                    insert_pos = m_prof.end()
                    # Insert right after profile header, keep concise
                    # Avoid duplicate Core Technologies lines
                    after_slice = improved[insert_pos:insert_pos + 200]
                    if "Core Technologies:" not in after_slice:
                        core_line = f"\nCore Technologies: {', '.join(all_job_display)}\n"
                        improved = improved[:insert_pos] + core_line + improved[insert_pos:]
                else:
                    # If there's a top-level title (# ...) add a Core Technologies line below it; else at top
                    h1_hdr = _re.compile(r"(?im)^(#\s+.+)$")
                    m_h1 = h1_hdr.search(improved)
                    insert_pos = m_h1.end() if m_h1 else 0
                    preview = improved[insert_pos:insert_pos + 200]
                    if "Core Technologies:" not in preview:
                        core_line = f"\n\nCore Technologies: {', '.join(all_job_display)}\n"
                        improved = improved[:insert_pos] + core_line + improved[insert_pos:]

                # If no Skills section exists at all, create one near the end
                m_hdr_after = skills_hdr.search(improved)
                if not m_hdr_after:
                    new_skills_block = "\n\n## Fähigkeiten\n" + ", ".join(all_job_display) + "\n"
                    improved = improved.rstrip() + new_skills_block

                # 1c) First bullet under the most recent experience: weave one concise sentence
                exp_hdr = _re.compile(r"(?im)^(##\s*(Berufserfahrung|Experience)\s*)$")
                m_exp = exp_hdr.search(improved)
                if m_exp:
                    exp_start = m_exp.end()
                    m_next = next_hdr.search(improved, pos=exp_start)
                    exp_end = m_next.start() if m_next else len(improved)
                    exp_block = improved[exp_start:exp_end]
                    exp_lines = exp_block.splitlines()
                    # Find insertion point after the first non-empty list line
                    # Avoid duplicate insertion if a similar sub-bullet already exists
                    already_weaved = any(
                        ("Arbeit mit" in ln) and any(normalize_kw(x) in normalize_kw(ln) for x in to_add)
                        for ln in exp_lines
                    )
                    if not already_weaved:
                        for i, line in enumerate(exp_lines):
                            if line.strip().startswith("-"):
                                insert_i = i + 1
                                sub_bullet = f"  - Arbeit mit {', '.join([display_kw(x) for x in to_add])}"
                                exp_lines.insert(insert_i, sub_bullet)
                                break
                    new_exp_block = "\n".join(exp_lines)
                    improved = improved[:exp_start] + new_exp_block + improved[exp_end:]
        except Exception:
            # If anything goes wrong, fall back to just adding a minimal baseline section below
            improved = resume_markdown

        # 2) Keep a concise baseline summary so the UI can show what's been added
        keyword_line = ", ".join(missing)
        addition = f"\n\n## Suggested Additions (Baseline)\nMissing keywords: {keyword_line}\n"
        improved = improved.rstrip() + addition
        return {"updated_resume": improved, "missing_keywords": missing, "added_section": True}

    def _coverage_score(self, resume_markdown: str, extracted_job_keywords: str) -> float:
        """Deterministic coverage score when embeddings are unavailable.

        Computes ratio of job keywords present in resume tokens.
        """
        resume_tokens = self._tokenize_lower(resume_markdown)
        job_kw_list = [k.strip().lower() for k in extracted_job_keywords.split(",") if k.strip()]
        if not job_kw_list:
            return 0.0
        present = 0
        for k in job_kw_list:
            if any(k in t for t in resume_tokens):
                present += 1
        return present / max(1, len(job_kw_list))

    # -------------------- Public API --------------------
    async def run(self, resume_id: str, job_id: str, use_llm: bool = True, require_llm: bool = False, *, equivalence_threshold: float | None = None, always_core_tech: bool | None = None, min_uplift: float | None = None, max_rounds: int | None = None) -> Dict:
        resume, processed_resume = await self._get_resume(resume_id)
        job, processed_job = await self._get_job(job_id)
        extracted_job_keywords = ", ".join(self._extract_keywords(processed_job.extracted_keywords))
        extracted_resume_keywords = ", ".join(self._extract_keywords(processed_resume.extracted_keywords))

        # Embeddings (with fallback)
        embeddings_ok = True
        try:
            resume_embedding_task = asyncio.create_task(self.embedding_manager.embed(resume.content))
            job_kw_embedding_task = asyncio.create_task(self.embedding_manager.embed(extracted_job_keywords))
            resume_embedding, extracted_job_keywords_embedding = await asyncio.gather(
                resume_embedding_task, job_kw_embedding_task
            )
            original_score = self.calculate_cosine_similarity(
                extracted_job_keywords_embedding, resume_embedding
            )
        except ProviderError as e:
            if require_llm:
                # Caller demands LLM/embeddings; surface a domain error
                raise AIProcessingError(str(e))
            logger.warning(
                f"Embedding provider unavailable; falling back to coverage scoring. reason={e}"
            )
            embeddings_ok = False
            # Coverage-based deterministic score in [0,1]
            original_score = self._coverage_score(
                resume_markdown=resume.content, extracted_job_keywords=extracted_job_keywords
            )

        # Baseline improvement
        if embeddings_ok:
            # Use dynamic embedding-based equivalence for flexibility (no hardcoded synonyms)
            ordered_job_kws, missing_list = await self._find_missing_keywords_dynamic(
                resume_markdown=resume.content,
                extracted_job_keywords=extracted_job_keywords,
                extracted_resume_keywords=extracted_resume_keywords,
                threshold=float(
                    equivalence_threshold if equivalence_threshold is not None else settings.IMPROVE_EQUIVALENCE_THRESHOLD
                ),
            )
            baseline = self._baseline_improve_from_lists(
                resume_markdown=resume.content,
                job_kw_list=ordered_job_kws,
                missing=missing_list,
                always_core_tech=bool(
                    settings.IMPROVE_ALWAYS_CORE_TECH if always_core_tech is None else always_core_tech
                ),
            )
        else:
            # Fallback to deterministic heuristic without embeddings
            baseline = self._baseline_improve(
                resume_markdown=resume.content, extracted_job_keywords=extracted_job_keywords
            )
        if embeddings_ok:
            if baseline["added_section"]:
                baseline_embedding = await self.embedding_manager.embed(
                    baseline["updated_resume"]
                )  # type: ignore[arg-type]
                raw_baseline_score = self.calculate_cosine_similarity(
                    extracted_job_keywords_embedding, baseline_embedding
                )
                # Guarantee non-decrease: choose max
                baseline_score = max(original_score, raw_baseline_score)
            else:
                baseline_score = original_score
        else:
            # Recompute coverage on updated text; still guarantee non-decrease
            if baseline["added_section"]:
                raw_baseline_score = self._coverage_score(  # type: ignore[arg-type]
                    baseline["updated_resume"], extracted_job_keywords
                )
                baseline_score = max(original_score, raw_baseline_score)
            else:
                baseline_score = original_score

        updated_resume = baseline["updated_resume"]  # type: ignore[assignment]
        updated_score = baseline_score
        llm_used = False
        if use_llm and embeddings_ok:
            try:
                # Give the LLM the original resume (without the appended baseline section)
                # so it can naturally weave keywords into core sections and potentially
                # exceed the baseline score.
                improved_text, llm_score = await self.improve_score_with_llm(
                    resume=resume.content,
                    extracted_resume_keywords=extracted_resume_keywords,
                    job=job.content,
                    extracted_job_keywords=extracted_job_keywords,
                    previous_cosine_similarity_score=baseline_score,
                    extracted_job_keywords_embedding=extracted_job_keywords_embedding,
                )
                if llm_score > baseline_score:
                    updated_resume = improved_text
                    updated_score = llm_score
                    llm_used = True
                # If minimum uplift is requested or globally enforced, try additional diversified rounds
                enforce = bool(settings.IMPROVE_ENFORCE_MIN_UPLIFT or (min_uplift is not None))
                target = float(min_uplift if min_uplift is not None else settings.IMPROVE_TARGET_UPLIFT_PERCENT)
                rounds = int(max_rounds if max_rounds is not None else settings.IMPROVE_MAX_ROUNDS)
                if enforce:
                    curr_rel = (updated_score - baseline_score) / max(1e-8, baseline_score) if baseline_score > 0 else (1.0 if updated_score > 0 else 0.0)
                    if curr_rel < target and rounds > 0:
                        best_text, best_score, hit = await self.improve_until_target(
                            base_text=updated_resume,
                            base_score=updated_score,
                            job_text=job.content,
                            extracted_job_keywords=extracted_job_keywords,
                            extracted_resume_keywords=extracted_resume_keywords,
                            target_uplift=target,
                            job_kw_embedding=extracted_job_keywords_embedding,
                            extra_rounds=rounds,
                        )
                        if best_score > updated_score:
                            updated_resume, updated_score = best_text, best_score
                            llm_used = True
            except Exception as e:  # pragma: no cover - defensive
                if require_llm:
                    raise AIProcessingError(str(e))
                logger.warning(f"LLM improvement failed, using baseline: {e}")

        # Preview generation is best-effort; return None on any failure inside
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

    async def run_and_stream(self, resume_id: str, job_id: str, require_llm: bool = False) -> AsyncGenerator:
        # Streaming still uses original iterative LLM approach without baseline section (kept minimal)
        yield f"data: {json.dumps({'status': 'starting', 'message': 'Analyzing resume and job description...'})}\n\n"
        await asyncio.sleep(1)
        resume, processed_resume = await self._get_resume(resume_id)
        job, processed_job = await self._get_job(job_id)
        yield f"data: {json.dumps({'status': 'parsing', 'message': 'Parsing resume content...'})}\n\n"
        await asyncio.sleep(1)
        extracted_job_keywords = ", ".join(self._extract_keywords(processed_job.extracted_keywords))
        extracted_resume_keywords = ", ".join(self._extract_keywords(processed_resume.extracted_keywords))
        try:
            resume_embedding = await self.embedding_manager.embed(text=resume.content)
            extracted_job_keywords_embedding = await self.embedding_manager.embed(text=extracted_job_keywords)
            yield f"data: {json.dumps({'status': 'scoring', 'message': 'Calculating compatibility score...'})}\n\n"
            cosine_similarity_score = self.calculate_cosine_similarity(
                extracted_job_keywords_embedding, resume_embedding
            )
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
        except ProviderError as e:
            if require_llm:
                # Emit an error event and terminate stream
                yield f"data: {json.dumps({'status': 'error', 'message': 'LLM/Embedding provider unavailable'})}\n\n"
                raise AIProcessingError(str(e))
            # Fallback streaming path without embeddings/LLM
            logger.warning(f"Streaming fallback without embeddings; reason={e}")
            coverage = self._coverage_score(resume.content, extracted_job_keywords)
            final_result = {
                "resume_id": resume_id,
                "job_id": job_id,
                "original_score": coverage,
                "new_score": coverage,
                "updated_resume": markdown.markdown(text=resume.content),
            }
            yield f"data: {json.dumps({'status': 'completed', 'result': final_result})}\n\n"
