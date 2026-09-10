"""A changed model registry must not enable unsupported GPT-5 sampling."""

from typing import Any
from unittest.mock import patch

import pytest

from app.llm import _supports_temperature


@pytest.mark.parametrize("reasoning_capability", [None, "true", 1])
def test_unknown_reasoning_capability_omits_flexible_sampling(
    reasoning_capability: Any,
) -> None:
    model_info = {
        "supported_openai_params": ["temperature"],
        "supports_reasoning": reasoning_capability,
        "supports_none_reasoning_effort": True,
    }
    with patch("app.llm.litellm.get_model_info", return_value=model_info):
        assert not _supports_temperature("gpt-5.1", 0.7, reasoning_effort=None)
        assert _supports_temperature("gpt-5.1", 1.0, reasoning_effort=None)
