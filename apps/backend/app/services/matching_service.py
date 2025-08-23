import json
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProcessedResume, ProcessedJob
from .exceptions import (
    ResumeParsingError,
    JobParsingError,
    ResumeNotFoundError,
    JobNotFoundError,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class MatchingWeights:
    """Weights for individual scoring components.

    The penalty weight is kept separate from positive weights and applied
    subtractively (capped at 0). Adjust as needed for tuning.
    """

    skill_overlap: float = 0.35
    keyword_coverage: float = 0.25
    experience_relevance: float = 0.20
    project_relevance: float = 0.10
    education_bonus: float = 0.05
    penalty_missing_critical: float = 0.15  # maximum subtractive penalty

    @property
    def total_positive(self) -> float:
        return (
            self.skill_overlap
            + self.keyword_coverage
            + self.experience_relevance
            + self.project_relevance
            + self.education_bonus
        )


class MatchingService:
    """Deterministic heuristic match scoring for a resume against a job.

    Uses only previously extracted structured fields (no new LLM calls) to
    produce a reproducible score (0-100) plus component breakdown.
    """

    def __init__(self, db: AsyncSession, weights: MatchingWeights | None = None) -> None:
        self.db = db
        self.weights = weights or MatchingWeights()

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

    def _extract_job_required_qualifications(self, processed_job: ProcessedJob) -> List[str]:
        if not processed_job.qualifications:
            return []
        try:
            data = json.loads(processed_job.qualifications)
            req = data.get("required", [])
            return [str(r).lower() for r in req if isinstance(r, str)]
        except Exception:
            return []

    def _component_scores(
        self,
        resume_skills: List[str],
        job_keywords: List[str],
        experience_titles: List[str],
        project_names: List[str],
        required_qualifications: List[str],
    ) -> Dict[str, float]:
        skill_kw_intersection = set(resume_skills) & set(job_keywords)
        skill_overlap = len(skill_kw_intersection) / len(set(job_keywords)) if job_keywords else 0.0

        all_resume_terms = set(resume_skills) | set(experience_titles) | set(project_names)
        matched_keywords = {kw for kw in job_keywords if kw in all_resume_terms}
        keyword_coverage = len(matched_keywords) / len(job_keywords) if job_keywords else 0.0

        exp_tokens = set()
        for t in experience_titles:
            exp_tokens.update(t.split())
        exp_matches = {kw for kw in job_keywords if kw in exp_tokens}
        experience_relevance = len(exp_matches) / len(job_keywords) if job_keywords else 0.0

        proj_tokens = set()
        for p in project_names:
            proj_tokens.update(p.split())
        proj_matches = {kw for kw in job_keywords if kw in proj_tokens}
        project_relevance = len(proj_matches) / len(job_keywords) if job_keywords else 0.0

        qualification_hits = {q for q in required_qualifications if q in all_resume_terms}
        education_bonus = 1.0 if qualification_hits else 0.0

        critical_missing = [q for q in required_qualifications if q not in all_resume_terms]
        penalty_ratio = len(critical_missing) / len(required_qualifications) if required_qualifications else 0.0

        logger.debug(
            "MatchingService component scores: skills=%s, job_keywords=%s, experiences=%s, projects=%s, required_quals=%s, "
            "skill_overlap=%.2f, keyword_coverage=%.2f, experience_relevance=%.2f, project_relevance=%.2f, education_bonus=%.2f, penalty_missing_critical=%.2f",
            resume_skills, job_keywords, experience_titles, project_names, required_qualifications,
            skill_overlap, keyword_coverage, experience_relevance, project_relevance, education_bonus, penalty_ratio
        )

        return {
            "skill_overlap": skill_overlap,
            "keyword_coverage": keyword_coverage,
            "experience_relevance": experience_relevance,
            "project_relevance": project_relevance,
            "education_bonus": education_bonus,
            "penalty_missing_critical": penalty_ratio,
        }

    def _aggregate(self, components: Dict[str, float]) -> Dict[str, float]:
        w = self.weights
        positive = (
            components["skill_overlap"] * w.skill_overlap
            + components["keyword_coverage"] * w.keyword_coverage
            + components["experience_relevance"] * w.experience_relevance
            + components["project_relevance"] * w.project_relevance
            + components["education_bonus"] * w.education_bonus
        )
        penalty = components["penalty_missing_critical"] * w.penalty_missing_critical
        raw = max(0.0, positive - penalty)
        normalized = raw / w.total_positive if w.total_positive else 0.0
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

    async def match(self, resume_id: str, job_id: str) -> Dict[str, object]:
        processed_resume = await self._get_processed_resume(resume_id)
        processed_job = await self._get_processed_job(job_id)

        resume_skills = self._extract_resume_skills(processed_resume)
        job_keywords = self._extract_job_keywords(processed_job)
        experience_titles = self._extract_resume_experiences(processed_resume)
        project_names = self._extract_resume_projects(processed_resume)
        required_qualifications = self._extract_job_required_qualifications(processed_job)

        components = self._component_scores(
            resume_skills,
            job_keywords,
            experience_titles,
            project_names,
            required_qualifications,
        )
        agg = self._aggregate(components)
        breakdown = {**components, **agg}

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
        }
