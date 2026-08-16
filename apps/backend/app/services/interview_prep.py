"""Interview preparation generation service."""

import json
from typing import Any

from app.llm import (
    complete_json,
    get_llm_config,
    get_model_name,
    get_safe_max_tokens,
)
from app.prompts import INTERVIEW_PREP_PROMPT, get_language_name
from app.schemas import InterviewPrepData


_JOB_DESCRIPTION_PROMPT_CHAR_LIMIT = 12_000
_RESUME_DATA_PROMPT_CHAR_LIMIT = 30_000
_TRUNCATION_NOTICE = (
    "[Content truncated for prompt length. Use only the visible evidence; "
    "do not infer or invent omitted details.]"
)


def _truncate_text_for_prompt(value: str, max_chars: int) -> str:
    """Bound unstructured prompt input while making omissions explicit."""
    if len(value) <= max_chars:
        return value
    return f"{value[:max_chars].rstrip()}\n\n{_TRUNCATION_NOTICE}"


def _truncate_json_value(
    value: Any,
    *,
    max_string_chars: int,
    max_list_items: int,
) -> Any:
    if isinstance(value, str):
        return _truncate_text_for_prompt(value, max_string_chars)
    if isinstance(value, list):
        truncated = [
            _truncate_json_value(
                item,
                max_string_chars=max_string_chars,
                max_list_items=max_list_items,
            )
            for item in value[:max_list_items]
        ]
        if len(value) > max_list_items:
            truncated.append(
                {
                    "_prompt_truncation_notice": (
                        f"{len(value) - max_list_items} additional items omitted. "
                        "Do not infer omitted details."
                    )
                }
            )
        return truncated
    if isinstance(value, dict):
        return {
            key: _truncate_json_value(
                item,
                max_string_chars=max_string_chars,
                max_list_items=max_list_items,
            )
            for key, item in value.items()
        }
    return value


def _serialize_resume_data_for_prompt(resume_data: dict[str, Any]) -> str:
    resume_json = json.dumps(resume_data, ensure_ascii=False)
    if len(resume_json) <= _RESUME_DATA_PROMPT_CHAR_LIMIT:
        return resume_json

    for max_string_chars, max_list_items in ((2_000, 30), (1_000, 20), (500, 10)):
        bounded = _truncate_json_value(
            resume_data,
            max_string_chars=max_string_chars,
            max_list_items=max_list_items,
        )
        bounded_json = json.dumps(bounded, ensure_ascii=False)
        if len(bounded_json) <= _RESUME_DATA_PROMPT_CHAR_LIMIT:
            return bounded_json

    compact_snapshot = json.dumps(
        _truncate_json_value(resume_data, max_string_chars=250, max_list_items=5),
        ensure_ascii=False,
    )
    return json.dumps(
        {
            "_prompt_truncation_notice": _TRUNCATION_NOTICE,
            "limited_resume_snapshot": _truncate_text_for_prompt(
                compact_snapshot,
                _RESUME_DATA_PROMPT_CHAR_LIMIT - 500,
            ),
        },
        ensure_ascii=False,
    )


async def generate_interview_prep(
    resume_data: dict[str, Any],
    job_description: str,
    language: str = "en",
) -> InterviewPrepData:
    """Generate structured interview preparation for a tailored resume."""
    prompt = INTERVIEW_PREP_PROMPT.format(
        job_description=_truncate_text_for_prompt(
            job_description,
            _JOB_DESCRIPTION_PROMPT_CHAR_LIMIT,
        ),
        resume_data=_serialize_resume_data_for_prompt(resume_data),
        output_language=get_language_name(language),
    )
    config = get_llm_config()
    max_tokens = get_safe_max_tokens(get_model_name(config), requested=8192)

    result = await complete_json(
        prompt=prompt,
        system_prompt=(
            "You are a career interview coach. Output truthful, resume-grounded "
            "interview preparation as JSON only."
        ),
        max_tokens=max_tokens,
        schema_type="interview_prep",
    )

    return InterviewPrepData.model_validate(result)
