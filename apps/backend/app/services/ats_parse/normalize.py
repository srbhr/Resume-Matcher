"""Text normalization shared by checks and the round trip."""

import re
import unicodedata

_HTML_TAG = re.compile(r"</?(?:strong|em|u|a)\b[^>]*>", re.IGNORECASE)
_HYPHEN_BREAK = re.compile(r"(\w)-\n\s*(\w)")
# Three or more single letters separated by single spaces: "S U M M A R Y".
_LETTER_SPACED = re.compile(r"(?<!\S)(?:\w )+\w(?!\S)")
# Email addresses stay whole so their parts never match name or other fields.
_TOKEN = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\w+", re.UNICODE)
_CJK = re.compile(r"[぀-ヿ㐀-鿿가-힯]")


def _join_letters(match: re.Match[str]) -> str:
    run = match.group(0)
    return run.replace(" ", "") if len(run) >= 5 else run


def rejoin_letter_spacing(text: str) -> str:
    return _LETTER_SPACED.sub(_join_letters, text)


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    text = _HTML_TAG.sub("", text)
    text = _HYPHEN_BREAK.sub(r"\1-\2", text)
    text = "\n".join(rejoin_letter_spacing(line) for line in text.splitlines())
    return re.sub(r"[ \t ]+", " ", text).lower().strip()


def tokens(text: str) -> list[str]:
    """Word tokens; CJK text is split per character since it has no spaces."""
    out: list[str] = []
    for token in _TOKEN.findall(normalize(text)):
        if "@" not in token and _CJK.search(token):
            out.extend(ch for ch in token if not ch.isspace())
        else:
            out.append(token)
    return out
