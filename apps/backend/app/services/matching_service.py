import json
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import asyncio
import numpy as np

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProcessedResume, ProcessedJob
from .exceptions import (
    ResumeParsingError,
    JobParsingError,
    ResumeNotFoundError,
    JobNotFoundError,
)
from app.agent.manager import EmbeddingManager
from app.agent.exceptions import ProviderError
from app.services.exceptions import AIProcessingError
from app.text.normalization import normalize_tokens_de
from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class MatchingWeights:
    """Weights for individual scoring components.

    The penalty weight is kept separate from positive weights and applied
    subtractively (capped at 0). Adjust as needed for tuning.
    """

    # Emphasize semantic similarity more strongly; slightly reduce lexical weights.
    skill_overlap: float = 0.25
    keyword_coverage: float = 0.20
    experience_relevance: float = 0.15
    project_relevance: float = 0.10
    education_bonus: float = 0.05
    # Semantic component; dominates when embeddings are available
    semantic_similarity: float = 0.70
    penalty_missing_critical: float = 0.15  # maximum subtractive penalty

    @property
    def total_positive(self) -> float:
        return (
            self.skill_overlap
            + self.keyword_coverage
            + self.experience_relevance
            + self.project_relevance
            + self.education_bonus
            + self.semantic_similarity
        )


class MatchingService:
    """Deterministic heuristic match scoring for a resume against a job.

    Uses only previously extracted structured fields (no new LLM calls) to
    produce a reproducible score (0-100) plus component breakdown.
    """

    def __init__(self, db: AsyncSession, weights: MatchingWeights | None = None) -> None:
        self.db = db
        self.weights = weights or MatchingWeights()
        self._embedding_manager = EmbeddingManager()

    async def _get_processed_resume(self, resume_id: str) -> ProcessedResume:
        q = select(ProcessedResume).where(ProcessedResume.resume_id == resume_id)
        res = await self.db.execute(q)
        obj = res.scalars().first()
        if not obj:
            # Use NotFound instead of Parsing for accurate 404 mapping
            raise ResumeNotFoundError(resume_id=resume_id)
        return obj

    async def _get_processed_job(self, job_id: str) -> ProcessedJob:
        q = select(ProcessedJob).where(ProcessedJob.job_id == job_id)
        res = await self.db.execute(q)
        obj = res.scalars().first()
        if not obj:
            raise JobNotFoundError(job_id=job_id)
        return obj

    @staticmethod
    def _safe_list(from_json: Optional[str], key: str | None = None) -> List[str]:
        if not from_json:
            return []
        try:
            data = json.loads(from_json)
        except Exception:
            return []
        if isinstance(data, dict) and key:
            val = data.get(key, [])
        else:
            val = data
        return [v for v in val if isinstance(v, str)]

    def _extract_resume_skills(self, processed_resume: ProcessedResume) -> List[str]:
        skills_raw: List[str | Dict] = []  # type: ignore
        if processed_resume.skills:
            try:
                parsed = json.loads(processed_resume.skills)
                if isinstance(parsed, dict):
                    skills_raw = parsed.get("skills", [])  # type: ignore
                elif isinstance(parsed, list):
                    skills_raw = parsed  # type: ignore
            except Exception:
                pass
        skills: List[str] = []
        for entry in skills_raw:
            if isinstance(entry, dict):
                name = entry.get("skill_name") or entry.get("skillName") or entry.get("skill")
                if name:
                    skills.append(str(name).lower())
            elif isinstance(entry, str):
                skills.append(entry.lower())
        return list({s for s in skills if s})

    def _extract_job_keywords(self, processed_job: ProcessedJob) -> List[str]:
        kws = self._safe_list(processed_job.extracted_keywords, "extracted_keywords")
        return list({k.lower() for k in kws})

    def _compose_job_text(self, processed_job: ProcessedJob, job_keywords: List[str]) -> str:
        """Compose a compact job text for embeddings from multiple fields."""
        parts: List[str] = []
        if processed_job.job_title:
            parts.append(str(processed_job.job_title))
        if processed_job.job_summary:
            parts.append(str(processed_job.job_summary))
        # responsibilities
        try:
            if processed_job.key_responsibilities:
                jd = json.loads(processed_job.key_responsibilities)
                if isinstance(jd, dict):
                    parts.extend([str(x) for x in jd.get("key_responsibilities", []) if isinstance(x, str)])
        except Exception:
            pass
        # qualifications
        try:
            if processed_job.qualifications:
                qd = json.loads(processed_job.qualifications)
                if isinstance(qd, dict):
                    parts.extend([str(x) for x in qd.get("required", []) if isinstance(x, str)])
                    parts.extend([str(x) for x in qd.get("preferred", []) if isinstance(x, str)])
        except Exception:
            pass
        if job_keywords:
            parts.append(", ".join(job_keywords))
        return "; ".join([p for p in parts if p])

    def _extract_resume_experiences(self, processed_resume: ProcessedResume) -> List[str]:
        titles: List[str] = []
        if processed_resume.experiences:
            try:
                data = json.loads(processed_resume.experiences)
                for e in data.get("experiences", []):
                    if isinstance(e, dict):
                        jt = e.get("job_title") or e.get("jobTitle")
                        if jt:
                            titles.append(str(jt).lower())
            except Exception:
                pass
        return titles

    def _extract_resume_experience_descriptions(self, processed_resume: ProcessedResume) -> List[str]:
        descs: List[str] = []
        if processed_resume.experiences:
            try:
                data = json.loads(processed_resume.experiences)
                for e in data.get("experiences", []):
                    if isinstance(e, dict):
                        ds = e.get("description")
                        if isinstance(ds, list):
                            descs.extend([str(x) for x in ds if isinstance(x, str)])
                        techs = e.get("technologies_used") or e.get("technologiesUsed")
                        if isinstance(techs, list):
                            descs.extend([str(x) for x in techs if isinstance(x, str)])
            except Exception:
                pass
        return descs

    def _extract_resume_projects(self, processed_resume: ProcessedResume) -> List[str]:
        names: List[str] = []
        if processed_resume.projects:
            try:
                data = json.loads(processed_resume.projects)
                for p in data.get("projects", []):
                    if isinstance(p, dict):
                        pn = p.get("project_name") or p.get("projectName")
                        if pn:
                            names.append(str(pn).lower())
            except Exception:
                pass
        return names

    def _extract_resume_project_descriptions(self, processed_resume: ProcessedResume) -> List[str]:
        descs: List[str] = []
        if processed_resume.projects:
            try:
                data = json.loads(processed_resume.projects)
                for p in data.get("projects", []):
                    if isinstance(p, dict):
                        d = p.get("description")
                        if isinstance(d, str):
                            descs.append(d)
                        techs = p.get("technologies_used") or p.get("technologiesUsed")
                        if isinstance(techs, list):
                            descs.extend([str(x) for x in techs if isinstance(x, str)])
            except Exception:
                pass
        return descs

    def _extract_job_required_qualifications(self, processed_job: ProcessedJob) -> List[str]:
        if not processed_job.qualifications:
            return []
        try:
            data = json.loads(processed_job.qualifications)
            req = data.get("required", [])
            return [str(r).lower() for r in req if isinstance(r, str)]
        except Exception:
            return []

    @staticmethod
    def _cosine(a: List[float] | np.ndarray, b: List[float] | np.ndarray) -> float:
        try:
            va = np.asarray(a, dtype=float).squeeze()
            vb = np.asarray(b, dtype=float).squeeze()
            denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
            if denom == 0:
                return 0.0
            return float(np.dot(va, vb) / denom)
        except Exception:
            return 0.0

    async def _semantic_similarity(self, resume_text: str, job_text: str, require_llm: bool) -> Optional[float]:
        """Compute cosine similarity between resume text and joined job keywords via embeddings.

        Returns value in [0,1] or None if embeddings unavailable and not required.
        """
        if not resume_text or not job_text:
            return 0.0
        try:
            # Parallelize two embedding requests safely
            resume_emb, kw_emb = await asyncio.gather(
                self._embedding_manager.embed(resume_text),
                self._embedding_manager.embed(job_text),
            )
            sim = self._cosine(kw_emb, resume_emb)
            # Normalize from [-1,1] to [0,1]
            norm = (sim + 1.0) / 2.0
            # Shape: suppress very small similarities to reduce noise on low-overlap cases
            # Anything below 0.20 -> 0. Linear rescale the rest to keep [0,1].
            if norm <= 0.20:
                shaped = 0.0
            else:
                shaped = (norm - 0.20) / 0.80
            return max(0.0, min(1.0, shaped))
        except ProviderError as e:
            logger.warning(f"Semantic matching unavailable: {e}")
            if require_llm:
                # Propagate as service-level AI error to map to 503 upstream if routed via API
                raise AIProcessingError("Embedding provider unavailable for semantic matching") from e
            return None

    # ──────────────────────────────────────────────────────────────────────
    # Coverage matrix (deterministic): map job requirements to resume evidence
    # ──────────────────────────────────────────────────────────────────────
    def _build_coverage_matrix(
        self,
        job_reqs: List[str],
        resume_terms: List[str],
    ) -> List[Dict[str, object]]:
        matrix: List[Dict[str, object]] = []
        resume_set = set(resume_terms)
        for req in job_reqs:
            hit = req in resume_set
            matrix.append({
                "requirement": req,
                "matched": hit,
                "evidence": req if hit else None,
            })
        return matrix

    # ──────────────────────────────────────────────────────────────────────
    # Chunk-based semantic similarity (robust on long texts)
    # ──────────────────────────────────────────────────────────────────────
    async def _semantic_similarity_chunked(
        self,
        resume_text: str,
        job_text: str,
        require_llm: bool,
        chunk_size: int,
        overlap: int,
        top_k: int,
    ) -> Optional[float]:
        try:
            if not resume_text.strip() or not job_text.strip():
                return 0.0
            # Simple whitespace-based token approximation to avoid heavy tokenizers
            def chunk(s: str) -> List[str]:
                toks = s.split()
                if not toks:
                    return [""]
                chunks: List[str] = []
                i = 0
                while i < len(toks):
                    j = min(len(toks), i + chunk_size)
                    chunks.append(" ".join(toks[i:j]))
                    if j == len(toks):
                        break
                    i = max(j - overlap, i + 1)
                return chunks

            r_chunks = chunk(resume_text)
            j_chunks = chunk(job_text)
            # Embed all chunks in parallel batches
            r_embs = await asyncio.gather(*[self._embedding_manager.embed(c) for c in r_chunks])
            j_embs = await asyncio.gather(*[self._embedding_manager.embed(c) for c in j_chunks])

            # Pairwise max similarity per job chunk, then take top-K across pairs
            scores: List[float] = []
            for je in j_embs:
                sims = [self._cosine(je, re) for re in r_embs]
                if sims:
                    scores.append(max(sims))
            if not scores:
                return 0.0
            scores_sorted = sorted(scores, reverse=True)[: max(1, top_k)]
            mean_topk = float(sum(scores_sorted) / len(scores_sorted))
            # Normalize [-1,1]→[0,1] then shape like in _semantic_similarity
            norm = (mean_topk + 1.0) / 2.0
            if norm <= 0.20:
                shaped = 0.0
            else:
                shaped = (norm - 0.20) / 0.80
            return max(0.0, min(1.0, shaped))
        except ProviderError as e:
            if require_llm:
                raise AIProcessingError("Embedding provider unavailable for semantic matching") from e
            return None

    def _component_scores(
        self,
        resume_skills: List[str],
        job_keywords: List[str],
        experience_titles: List[str],
        project_names: List[str],
        required_qualifications: List[str],
        semantic_similarity: Optional[float] = None,
    ) -> Dict[str, float]:
        # Normalize German tokens for robust lexical comparisons (fail open on error)
        try:
            norm_resume_skills = normalize_tokens_de(resume_skills)
            norm_job_keywords = normalize_tokens_de(job_keywords)
            norm_experience_titles = normalize_tokens_de(experience_titles)
            norm_project_names = normalize_tokens_de(project_names)
        except Exception:
            norm_resume_skills = resume_skills
            norm_job_keywords = job_keywords
            norm_experience_titles = experience_titles
            norm_project_names = project_names

        skill_kw_intersection = set(norm_resume_skills) & set(norm_job_keywords)
        skill_overlap = len(skill_kw_intersection) / len(set(norm_job_keywords)) if norm_job_keywords else 0.0

        # Include tokens from descriptions and technologies to better capture relevance
        desc_tokens = set()
        for d in (norm_resume_skills + norm_experience_titles + norm_project_names):
            desc_tokens.update(d.split())
        all_resume_terms = set(norm_resume_skills) | set(norm_experience_titles) | set(norm_project_names) | desc_tokens
        matched_keywords = {kw for kw in norm_job_keywords if kw in all_resume_terms}
        keyword_coverage = len(matched_keywords) / len(norm_job_keywords) if norm_job_keywords else 0.0

        exp_tokens = set()
        for t in norm_experience_titles:
            exp_tokens.update(t.split())
        exp_matches = {kw for kw in norm_job_keywords if kw in exp_tokens}
        experience_relevance = len(exp_matches) / len(norm_job_keywords) if norm_job_keywords else 0.0

        proj_tokens = set()
        for p in norm_project_names:
            proj_tokens.update(p.split())
        proj_matches = {kw for kw in norm_job_keywords if kw in proj_tokens}
        project_relevance = len(proj_matches) / len(norm_job_keywords) if norm_job_keywords else 0.0

        qualification_hits = {q for q in required_qualifications if q in all_resume_terms}
        education_bonus = 1.0 if qualification_hits else 0.0

        critical_missing = [q for q in required_qualifications if q not in all_resume_terms]
        penalty_ratio = len(critical_missing) / len(required_qualifications) if required_qualifications else 0.0

        # Semantic similarity may be injected later; default to 0 if None
        semantic_component = float(semantic_similarity or 0.0)

        logger.debug(
            "MatchingService component scores: skills=%s, job_keywords=%s, experiences=%s, projects=%s, required_quals=%s, "
            "skill_overlap=%.2f, keyword_coverage=%.2f, experience_relevance=%.2f, project_relevance=%.2f, education_bonus=%.2f, penalty_missing_critical=%.2f, semantic_similarity=%.2f",
            resume_skills, job_keywords, experience_titles, project_names, required_qualifications,
            skill_overlap, keyword_coverage, experience_relevance, project_relevance, education_bonus, penalty_ratio, semantic_component
        )

        return {
            "skill_overlap": skill_overlap,
            "keyword_coverage": keyword_coverage,
            "experience_relevance": experience_relevance,
            "project_relevance": project_relevance,
            "education_bonus": education_bonus,
            "penalty_missing_critical": penalty_ratio,
            "semantic_similarity": semantic_component,
        }

    def _aggregate(self, components: Dict[str, float]) -> Dict[str, float]:
        w = self.weights
        positive = (
            components["skill_overlap"] * w.skill_overlap
            + components["keyword_coverage"] * w.keyword_coverage
            + components["experience_relevance"] * w.experience_relevance
            + components["project_relevance"] * w.project_relevance
            + components["education_bonus"] * w.education_bonus
            + components.get("semantic_similarity", 0.0) * w.semantic_similarity
        )
        penalty = components["penalty_missing_critical"] * w.penalty_missing_critical
        raw = max(0.0, positive - penalty)
        # If semantic component isn't available (e.g., provider unavailable or empty inputs),
        # don't inflate the denominator with its weight.
        has_semantic = components.get("semantic_similarity", 0.0) > 0
        denom = w.total_positive if has_semantic else (w.total_positive - w.semantic_similarity)
        normalized = raw / denom if denom > 0 else 0.0
        logger.debug(
            "MatchingService aggregate: positive=%.4f, penalty=%.4f, raw=%.4f, normalized=%.4f, final_score=%d",
            positive, penalty, raw, normalized, int(round(normalized * 100))
        )
        return {
            "raw_weighted_score": raw,
            "normalized_score": normalized,
            "final_score": int(round(normalized * 100)),
            "weighted_positive": positive,
            "weighted_penalty": penalty,
        }

    async def match(self, resume_id: str, job_id: str, require_llm: bool = False) -> Dict[str, object]:
        processed_resume = await self._get_processed_resume(resume_id)
        processed_job = await self._get_processed_job(job_id)

        # Extract structured fields
        resume_skills = self._extract_resume_skills(processed_resume)
        job_keywords = self._extract_job_keywords(processed_job)
        experience_titles = self._extract_resume_experiences(processed_resume)
        project_names = self._extract_resume_projects(processed_resume)
        exp_descs = self._extract_resume_experience_descriptions(processed_resume)
        proj_descs = self._extract_resume_project_descriptions(processed_resume)
        required_qualifications = self._extract_job_required_qualifications(processed_job)

        # Build concise resume text from structured fields to avoid extra DB fetches
        resume_text_parts: List[str] = []
        if resume_skills:
            resume_text_parts.append(", ".join(resume_skills))
        if experience_titles:
            resume_text_parts.append(", ".join(experience_titles))
        if project_names:
            resume_text_parts.append(", ".join(project_names))
        # Enrich resume text with descriptions and technologies used
        extra_parts: List[str] = []
        if exp_descs:
            extra_parts.append("; ".join(exp_descs))
        if proj_descs:
            extra_parts.append("; ".join(proj_descs))
        resume_text = "; ".join([p for p in (*resume_text_parts, *extra_parts) if p])

        # Compose job text from multiple fields for a richer semantic comparison
        job_text = self._compose_job_text(processed_job, job_keywords)

        # Compute semantic similarity (optional, provider dependent)
        semantic_sim: Optional[float] = None
        try:
            if settings.MATCH_ENABLE_CHUNK_RETRIEVAL:
                semantic_sim = await self._semantic_similarity_chunked(
                    resume_text,
                    job_text,
                    require_llm=require_llm,
                    chunk_size=settings.MATCH_CHUNK_SIZE_TOKENS,
                    overlap=settings.MATCH_CHUNK_OVERLAP_TOKENS,
                    top_k=settings.MATCH_TOP_K_CHUNK_PAIRS,
                )
            else:
                semantic_sim = await self._semantic_similarity(resume_text, job_text, require_llm=require_llm)
        except AIProcessingError:
            # Bubble up to API layer so it's mapped to 503 when strict
            raise

        components = self._component_scores(
            resume_skills,
            job_keywords,
            experience_titles,
            project_names,
            required_qualifications,
            semantic_similarity=semantic_sim,
        )
        agg = self._aggregate(components)
        breakdown = {**components, **agg}

        # Optional coverage matrix (deterministic explanation)
        coverage_matrix: List[Dict[str, object]] = []
        if settings.MATCH_ENABLE_COVERAGE_MATRIX:
            # Build a normalized resume term set including skills, titles, project names
            try:
                norm_resume_terms = normalize_tokens_de(
                    list({*resume_skills, *experience_titles, *project_names})
                )
            except Exception:
                norm_resume_terms = list({*resume_skills, *experience_titles, *project_names})
            try:
                norm_reqs = normalize_tokens_de(required_qualifications or job_keywords)
            except Exception:
                norm_reqs = (required_qualifications or job_keywords)
            coverage_matrix = self._build_coverage_matrix(norm_reqs, norm_resume_terms)

        return {
            "resume_id": resume_id,
            "job_id": job_id,
            "score": breakdown["final_score"],
            "breakdown": breakdown,
            "counts": {
                "resume_skills": len(resume_skills),
                "job_keywords": len(job_keywords),
                "experience_titles": len(experience_titles),
                "project_names": len(project_names),
                "required_qualifications": len(required_qualifications),
            },
            "coverage": coverage_matrix,
        }
