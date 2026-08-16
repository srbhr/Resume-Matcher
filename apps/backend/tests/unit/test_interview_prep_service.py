from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import ValidationError

from app.services.interview_prep import generate_interview_prep


SAMPLE_RESUME = {
    "personalInfo": {"name": "Jane Doe"},
    "summary": "Backend engineer",
    "workExperience": [],
    "education": [],
    "personalProjects": [],
    "additional": {"technicalSkills": ["Python", "FastAPI"]},
}


def _valid_payload():
    return {
        "role_fit_analysis": ["Python API experience is relevant."],
        "resume_questions": [
            {
                "question": "How did you build the API?",
                "focus_area": "Backend APIs",
                "suggested_answer_points": ["Use resume-grounded API details."],
            }
        ],
        "project_follow_ups": [],
        "skill_gaps": [
            {
                "skill": "Kubernetes",
                "why_it_matters": "The JD mentions deployment.",
                "preparation_suggestion": "Review basics without claiming experience.",
            }
        ],
        "talking_points": ["Connect FastAPI work to the role."],
    }


@contextmanager
def _patched_llm_token_helpers(max_tokens: int = 4096):
    config = object()
    with patch(
        "app.services.interview_prep.get_llm_config",
        return_value=config,
    ) as mock_get_llm_config, patch(
        "app.services.interview_prep.get_model_name",
        return_value="openai/small-output-model",
    ) as mock_get_model_name, patch(
        "app.services.interview_prep.get_safe_max_tokens",
        return_value=max_tokens,
    ) as mock_get_safe_max_tokens:
        yield mock_get_llm_config, mock_get_model_name, mock_get_safe_max_tokens


@pytest.mark.asyncio
async def test_generate_interview_prep_validates_successful_json():
    with patch(
        "app.services.interview_prep.complete_json",
        new_callable=AsyncMock,
    ) as mock_complete, _patched_llm_token_helpers() as token_helpers:
        mock_complete.return_value = _valid_payload()

        result = await generate_interview_prep(SAMPLE_RESUME, "Need FastAPI", "en")

    mock_get_llm_config, mock_get_model_name, mock_get_safe_max_tokens = token_helpers
    assert result.role_fit_analysis == ["Python API experience is relevant."]
    mock_complete.assert_awaited_once()
    mock_get_llm_config.assert_called_once_with()
    mock_get_model_name.assert_called_once_with(mock_get_llm_config.return_value)
    mock_get_safe_max_tokens.assert_called_once_with(
        "openai/small-output-model",
        requested=8192,
    )
    assert mock_complete.await_args.kwargs["max_tokens"] == 4096
    assert mock_complete.await_args.kwargs["schema_type"] == "interview_prep"


@pytest.mark.asyncio
async def test_generate_interview_prep_bounds_prompt_inputs():
    with patch(
        "app.services.interview_prep.complete_json",
        new_callable=AsyncMock,
    ) as mock_complete, _patched_llm_token_helpers():
        mock_complete.return_value = _valid_payload()

        large_resume = {
            **SAMPLE_RESUME,
            "summary": "Backend engineer " + ("with API delivery evidence. " * 3000),
        }
        await generate_interview_prep(
            large_resume,
            "Need FastAPI. " + ("Detailed requirement. " * 1500),
            "en",
        )

    prompt = mock_complete.await_args.kwargs["prompt"]
    assert len(prompt) < 50_000
    assert "Content truncated for prompt length" in prompt
    assert "do not infer or invent omitted details" in prompt


@pytest.mark.asyncio
async def test_generate_interview_prep_rejects_malformed_llm_json():
    with patch(
        "app.services.interview_prep.complete_json",
        new_callable=AsyncMock,
    ) as mock_complete, _patched_llm_token_helpers():
        mock_complete.return_value = {
            "role_fit_analysis": ["Only one required key is present."]
        }

        with pytest.raises(ValidationError):
            await generate_interview_prep(SAMPLE_RESUME, "Need FastAPI", "en")
