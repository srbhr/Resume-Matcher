"""Whole-term keyword matching shared by scoring, tailoring and refinement."""

import re

# Han (including supplementary planes), Kana, and Hangul syllables/Jamo.
_CJK_CHAR_CLASS = (
    r"[ᄀ-ᇿ぀-ヿ㄰-㆏ㇰ-ㇿ"
    r"㐀-鿿ꥠ-꥿가-퟿豈-﫿"
    r"ｦ-ￜ\U0001b000-\U0001b16f\U00020000-\U0003ffff]"
)
_CJK_RE = re.compile(_CJK_CHAR_CLASS)


def keyword_in_text(keyword: str, text: str) -> bool:
    """Check for a CJK substring or a bounded non-CJK term in text.

    Han, Kana, and Hangul characters may adjoin Latin skills without whitespace,
    so they also form boundaries for adjacent Latin terms. Other word characters
    retain boundaries so 'python' does not match 'pythonic' and 'java' does not
    match 'javascript'.
    """
    normalized_keyword = keyword.strip().lower()
    if not normalized_keyword:
        return False
    normalized_text = text.lower()
    if _CJK_RE.search(normalized_keyword):
        return normalized_keyword in normalized_text
    escaped = re.escape(normalized_keyword)
    pattern = (
        rf"(?:(?<!\w)|(?<={_CJK_CHAR_CLASS}))"
        rf"{escaped}"
        rf"(?:(?!\w)|(?={_CJK_CHAR_CLASS}))"
    )
    return bool(re.search(pattern, normalized_text))


def normalize_skill_key(skill: str) -> str:
    """Normalize a skill for case-insensitive comparisons."""
    return re.sub(r"\s+", " ", skill.strip()).casefold()
