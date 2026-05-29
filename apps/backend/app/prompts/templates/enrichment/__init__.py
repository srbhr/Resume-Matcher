"""AI-powered resume enrichment prompts."""

from app.prompts.templates.enrichment.analyze import ENRICHMENT_ANALYZE_PROMPT
from app.prompts.templates.enrichment.enhance import ENRICHMENT_ENHANCE_PROMPT
from app.prompts.templates.enrichment.regenerate import (
    ENRICHMENT_REGENERATE_ITEM_PROMPT,
    ENRICHMENT_REGENERATE_SKILLS_PROMPT,
)

__all__ = [
    "ENRICHMENT_ANALYZE_PROMPT",
    "ENRICHMENT_ENHANCE_PROMPT",
    "ENRICHMENT_REGENERATE_ITEM_PROMPT",
    "ENRICHMENT_REGENERATE_SKILLS_PROMPT",
]
