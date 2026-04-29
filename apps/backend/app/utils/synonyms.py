"""Synonym normalization for ATS keyword matching."""

import re

# Pattern → canonical form (case-insensitive, whole-word match where applicable)
_SYNONYM_PAIRS: list[tuple[str, str]] = [
    (r"\bproduct owner\b", "product manager"),
    (r"\bpo\b", "product manager"),
    (r"\bprogram manager\b", "product manager"),
    (r"\bproduct mgr\b", "product manager"),
    (r"\bscrum master\b", "agile coach"),
    (r"\bml\b", "machine learning"),
    (r"(?<![@\w])ai(?![@\w])", "artificial intelligence"),
    (r"\bux\b", "user experience"),
    (r"\bui\b", "user interface"),
    (r"\bkpis?\b", "key performance indicator"),
    (r"\bokrs?\b", "objective and key result"),
    (r"\bgtm\b", "go-to-market"),
    (r"\bb2b\b", "business to business"),
    (r"\bb2c\b", "business to consumer"),
    (r"\bsaas\b", "software as a service"),
    (r"\bcrm\b", "customer relationship management"),
    (r"\berp\b", "enterprise resource planning"),
    (r"\bqa\b", "quality assurance"),
    (r"\broi\b", "return on investment"),
    (r"\bnps\b", "net promoter score"),
    (r"\bdau\b", "daily active users"),
    (r"\bmau\b", "monthly active users"),
    (r"\bsme\b", "subject matter expert"),
    (r"\bci/cd\b", "continuous integration continuous deployment"),
    (r"(?<![@\w])sql(?![@\w])", "structured query language"),
    (r"\bapi\b", "application programming interface"),
]

# Pre-compile for performance
_COMPILED: list[tuple[re.Pattern[str], str]] = [
    (re.compile(pattern, re.IGNORECASE), replacement)
    for pattern, replacement in _SYNONYM_PAIRS
]


def normalize(text: str) -> str:
    """Apply synonym normalization to text.

    Replaces abbreviations and role title variants with canonical forms
    so the LLM sees consistent terminology across JD and resume.
    """
    result = text
    for pattern, replacement in _COMPILED:
        result = pattern.sub(replacement, result)
    return result
