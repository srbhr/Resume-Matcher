"""Multi-pass refinement prompts and AI-phrase utilities."""

from app.prompts.templates.refinement.keyword_injection import (
    REFINEMENT_KEYWORD_INJECTION_PROMPT,
)
from app.prompts.templates.refinement.util import (
    REFINEMENT_AI_PHRASE_BLACKLIST,
    REFINEMENT_AI_PHRASE_REPLACEMENTS,
)
from app.prompts.templates.refinement.validation_polish import (
    REFINEMENT_VALIDATION_POLISH_PROMPT,
)

__all__ = [
    "REFINEMENT_AI_PHRASE_BLACKLIST",
    "REFINEMENT_AI_PHRASE_REPLACEMENTS",
    "REFINEMENT_KEYWORD_INJECTION_PROMPT",
    "REFINEMENT_VALIDATION_POLISH_PROMPT",
]
