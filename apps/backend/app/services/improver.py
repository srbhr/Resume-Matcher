"""Resume improvement service using LLM."""

import json
from typing import Any, Callable

from app.llm import complete_json
from app.prompts import (
    DEFAULT_IMPROVE_PROMPT_ID,
    EXTRACT_KEYWORDS_PROMPT,
    IMPROVE_RESUME_PROMPTS,
    get_language_name,
)
from app.prompts.templates import RESUME_SCHEMA
from app.schemas import ResumeData, ResumeFieldDiff, ResumeDiffSummary


async def extract_job_keywords(job_description: str) -> dict[str, Any]:
    """Extract keywords and requirements from job description.

    Args:
        job_description: Raw job description text

    Returns:
        Structured keywords and requirements
    """
    prompt = EXTRACT_KEYWORDS_PROMPT.format(job_description=job_description)

    return await complete_json(
        prompt=prompt,
        system_prompt="You are an expert job description analyzer.",
    )


async def improve_resume(
    original_resume: str,
    job_description: str,
    job_keywords: dict[str, Any],
    language: str = "en",
    prompt_id: str | None = None,
) -> dict[str, Any]:
    """Improve resume to better match job description.

    Args:
        original_resume: Original resume content (markdown)
        job_description: Target job description
        job_keywords: Extracted job keywords
        language: Output language code (en, es, zh, ja)

    Returns:
        Improved resume data matching ResumeData schema
    """
    keywords_str = json.dumps(job_keywords, indent=2)
    output_language = get_language_name(language)

    selected_prompt_id = prompt_id or DEFAULT_IMPROVE_PROMPT_ID
    prompt_template = IMPROVE_RESUME_PROMPTS.get(
        selected_prompt_id, IMPROVE_RESUME_PROMPTS[DEFAULT_IMPROVE_PROMPT_ID]
    )

    prompt = prompt_template.format(
        job_description=job_description,
        job_keywords=keywords_str,
        original_resume=original_resume,
        schema=RESUME_SCHEMA,
        output_language=output_language,
    )

    result = await complete_json(
        prompt=prompt,
        system_prompt="You are an expert resume editor. Output only valid JSON.",
        max_tokens=8192,
    )

    # Validate against schema
    validated = ResumeData.model_validate(result)
    return validated.model_dump()


def _format_entry_label(parts: list[str], fallback: str) -> str:
    label = " | ".join([part for part in parts if part])
    return label if label else fallback


def _format_experience_entry(entry: dict[str, Any], index: int) -> str:
    return _format_entry_label(
        [
            entry.get("title", ""),
            entry.get("company", ""),
            entry.get("years", ""),
        ],
        f"Work experience #{index + 1}",
    )


def _format_education_entry(entry: dict[str, Any], index: int) -> str:
    return _format_entry_label(
        [
            entry.get("degree", ""),
            entry.get("institution", ""),
            entry.get("years", ""),
        ],
        f"Education #{index + 1}",
    )


def _format_project_entry(entry: dict[str, Any], index: int) -> str:
    return _format_entry_label(
        [
            entry.get("name", ""),
            entry.get("role", ""),
            entry.get("years", ""),
        ],
        f"Project #{index + 1}",
    )


def _append_entry_changes(
    changes: list[ResumeFieldDiff],
    field_key: str,
    field_type: str,
    original_items: list[dict[str, Any]],
    improved_items: list[dict[str, Any]],
    formatter: Callable[[dict[str, Any], int], str],
) -> None:
    min_len = min(len(original_items), len(improved_items))

    for idx in range(min_len, len(improved_items)):
        changes.append(
            ResumeFieldDiff(
                field_path=f"{field_key}[{idx}]",
                field_type=field_type,
                change_type="added",
                new_value=formatter(improved_items[idx], idx),
                confidence="high",
            )
        )

    for idx in range(min_len, len(original_items)):
        changes.append(
            ResumeFieldDiff(
                field_path=f"{field_key}[{idx}]",
                field_type=field_type,
                change_type="removed",
                original_value=formatter(original_items[idx], idx),
                confidence="medium",
            )
        )


def calculate_resume_diff(
    original: dict[str, Any],
    improved: dict[str, Any],
) -> tuple[ResumeDiffSummary, list[ResumeFieldDiff]]:
    """计算原始简历和定制简历之间的差异

    Args:
        original: 原始简历数据字典
        improved: 改进后的简历数据字典

    Returns:
        (差异摘要, 详细变更列表)
    """
    changes: list[ResumeFieldDiff] = []

    # 1. 对比 summary
    original_summary = (original.get("summary") or "").strip()
    improved_summary = (improved.get("summary") or "").strip()
    if original_summary != improved_summary:
        changes.append(
            ResumeFieldDiff(
                field_path="summary",
                field_type="summary",
                change_type="modified",
                original_value=original_summary or None,
                new_value=improved_summary or None,
                confidence="medium",
            )
        )

    # 2. 对比技能列表
    orig_skills = set(original.get("additional", {}).get("technicalSkills", []))
    new_skills = set(improved.get("additional", {}).get("technicalSkills", []))

    for skill in new_skills - orig_skills:
        changes.append(ResumeFieldDiff(
            field_path="additional.technicalSkills",
            field_type="skill",
            change_type="added",
            new_value=skill,
            confidence="high"  # 新增技能是高风险
        ))

    for skill in orig_skills - new_skills:
        changes.append(ResumeFieldDiff(
            field_path="additional.technicalSkills",
            field_type="skill",
            change_type="removed",
            original_value=skill,
            confidence="medium"
        ))

    # 3. 对比工作经历描述
    for i, orig_exp in enumerate(original.get("workExperience", [])):
        improved_exp = improved.get("workExperience", [])[i] if i < len(improved.get("workExperience", [])) else None
        if not improved_exp:
            continue

        orig_desc = orig_exp.get("description", [])
        new_desc = improved_exp.get("description", [])

        # 使用简单的集合差异检测（可以后续优化为更智能的 diff）
        orig_set = set(orig_desc)
        new_set = set(new_desc)

        for desc in new_set - orig_set:
            changes.append(ResumeFieldDiff(
                field_path=f"workExperience[{i}].description",
                field_type="description",
                change_type="added",
                new_value=desc,
                confidence="medium"
            ))

        for desc in orig_set - new_set:
            changes.append(ResumeFieldDiff(
                field_path=f"workExperience[{i}].description",
                field_type="description",
                change_type="removed",
                original_value=desc,
                confidence="low"
            ))

    # 4. 对比认证
    orig_certs = set(original.get("additional", {}).get("certificationsTraining", []))
    new_certs = set(improved.get("additional", {}).get("certificationsTraining", []))

    for cert in new_certs - orig_certs:
        changes.append(ResumeFieldDiff(
            field_path="additional.certificationsTraining",
            field_type="certification",
            change_type="added",
            new_value=cert,
            confidence="high"
        ))

    for cert in orig_certs - new_certs:
        changes.append(ResumeFieldDiff(
            field_path="additional.certificationsTraining",
            field_type="certification",
            change_type="removed",
            original_value=cert,
            confidence="medium"
        ))

    # 5. 对比新增/删除条目
    _append_entry_changes(
        changes,
        "workExperience",
        "experience",
        original.get("workExperience", []),
        improved.get("workExperience", []),
        _format_experience_entry,
    )
    _append_entry_changes(
        changes,
        "education",
        "education",
        original.get("education", []),
        improved.get("education", []),
        _format_education_entry,
    )
    _append_entry_changes(
        changes,
        "personalProjects",
        "project",
        original.get("personalProjects", []),
        improved.get("personalProjects", []),
        _format_project_entry,
    )

    # 6. 生成摘要
    summary = ResumeDiffSummary(
        total_changes=len(changes),
        skills_added=len([c for c in changes if c.field_type == "skill" and c.change_type == "added"]),
        skills_removed=len([c for c in changes if c.field_type == "skill" and c.change_type == "removed"]),
        descriptions_modified=len([c for c in changes if c.field_type == "description"]),
        certifications_added=len([c for c in changes if c.field_type == "certification" and c.change_type == "added"]),
        high_risk_changes=len([c for c in changes if c.confidence == "high"])
    )

    return summary, changes


def generate_improvements(job_keywords: dict[str, Any]) -> list[dict[str, Any]]:
    """Generate improvement suggestions based on job keywords.

    Args:
        job_keywords: Extracted job keywords

    Returns:
        List of improvement suggestions
    """
    improvements = []

    # Generate suggestions based on required skills
    required_skills = job_keywords.get("required_skills", [])
    for skill in required_skills[:3]:  # Top 3 required skills
        improvements.append(
            {
                "suggestion": f"Emphasized '{skill}' to match job requirements",
                "lineNumber": None,
            }
        )

    # Generate suggestions based on key responsibilities
    responsibilities = job_keywords.get("key_responsibilities", [])
    for resp in responsibilities[:2]:  # Top 2 responsibilities
        improvements.append(
            {
                "suggestion": f"Aligned experience with: {resp}",
                "lineNumber": None,
            }
        )

    # Default improvement if none generated
    if not improvements:
        improvements.append(
            {
                "suggestion": "Resume content optimized for better keyword alignment with job description",
                "lineNumber": None,
            }
        )

    return improvements
