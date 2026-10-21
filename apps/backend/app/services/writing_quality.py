"""Writing-quality rules, the writing score and the rewrite fact check. No LLM.

The rules see the summary and every work and project bullet, the rows the
rewrite loop can change. English resumes get every rule; other content
languages get the em dash rule only (the AI critic covers the rest there).
"""

import re
from collections.abc import Iterable, Iterator
from typing import Any

from app.prompts.refinement import AI_PHRASE_BLACKLIST
from app.schemas.writing import WritingFinding, WritingReport
from app.services.refiner import _keyword_in_text
from app.services.resume_preservation import _novel_numbers

EM_DASH_RE = re.compile(r"—|(?<![\w-])-{2,3}(?![\w-])|(?<=\w)-{2,3}(?=\w)")

# Openers that describe proximity to work instead of the work itself.
WEAK_OPENERS: tuple[str, ...] = (
    "responsible for",
    "helped with",
    "helped to",
    "helped",
    "assisted with",
    "assisted in",
    "assisted",
    "involved in",
    "participated in",
    "worked on",
    "tasked with",
    "duties included",
    "in charge of",
)
_WEAK_OPENER_RE = re.compile(
    r"^\W*(?:" + "|".join(re.escape(o) for o in WEAK_OPENERS) + r")\b",
    re.IGNORECASE,
)
_FIRST_PERSON_RE = re.compile(r"\bI\b|\b(?i:me|my|mine|myself)\b")
_AI_PHRASES = sorted(
    (p for p in AI_PHRASE_BLACKLIST if re.search(r"[a-z]", p)), key=len, reverse=True
)
_DIGIT_RE = re.compile(r"\d")
_LONG_BULLET_WORDS = 35
_REPEATED_OPENER_LIMIT = 3

_HARD_PENALTY = 40
_SOFT_PENALTY = 10
_METRIC_PENALTY = 5

# Fact tokens: tool-like tokens (C++, Node.js, CI/CD, S3), acronyms and
# capitalized words that do not start a sentence (names, products).
_WORD_RE = re.compile(r"[^\W_][\w+#./&-]*", re.UNICODE)
_SENTENCE_START_RE = re.compile(r"(?:^|[.!?;:]\s+|\n)\W*$")


def _is_bullet(styles: Any, index: int) -> bool:
    if not isinstance(styles, list) or index >= len(styles):
        return True
    return styles[index] != "plain"


def iter_writing_units(data: dict[str, Any]) -> Iterator[tuple[str, str]]:
    """Yield (path, text) for the summary and every work and project bullet."""
    summary = data.get("summary")
    if isinstance(summary, str) and summary.strip():
        yield "summary", summary
    for section in ("workExperience", "personalProjects"):
        entries = data.get(section)
        if not isinstance(entries, list):
            continue
        for i, entry in enumerate(entries):
            if not isinstance(entry, dict):
                continue
            rows = entry.get("description")
            if not isinstance(rows, list):
                continue
            styles = entry.get("descriptionStyles")
            for j, row in enumerate(rows):
                if isinstance(row, str) and row.strip() and _is_bullet(styles, j):
                    yield f"{section}[{i}].description[{j}]", row


def path_for_original(data: dict[str, Any], original: Any, fallback: str) -> str:
    """The path of the one line whose text is ``original``, else ``fallback``.

    Models copy a line's text reliably but sometimes shift its index, so an
    exact, unique text match is the better address for a rewrite.
    """
    if not isinstance(original, str) or not original.strip():
        return fallback
    key = " ".join(original.split()).casefold()
    matches = [
        path
        for path, text in iter_writing_units(data)
        if " ".join(text.split()).casefold() == key
    ]
    return matches[0] if len(matches) == 1 else fallback


def _excerpt(text: str, limit: int = 120) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _first_word(text: str) -> str:
    match = _WORD_RE.search(text)
    return match.group(0).casefold() if match else ""


def _entry_key(path: str) -> str:
    return path.split(".description", 1)[0]


def check_writing(data: dict[str, Any], language: str = "en") -> list[WritingFinding]:
    """Return the rule findings for every writing unit of ``data``."""
    english = language == "en"
    findings: list[WritingFinding] = []
    openers: dict[str, dict[str, list[str]]] = {}
    for path, text in iter_writing_units(data):
        excerpt = _excerpt(text)

        def add(rule: str, severity: str) -> None:
            findings.append(
                WritingFinding(path=path, rule=rule, severity=severity, excerpt=excerpt)
            )

        if EM_DASH_RE.search(text):
            add("em_dash", "hard")
        if not english:
            continue
        is_bullet = path != "summary"
        if is_bullet and _WEAK_OPENER_RE.search(text):
            add("weak_opener", "hard")
        if _FIRST_PERSON_RE.search(text):
            add("first_person", "soft")
        lowered = text.casefold()
        if any(_keyword_in_text(phrase, lowered) for phrase in _AI_PHRASES):
            add("ai_phrase", "soft")
        if is_bullet and len(text.split()) > _LONG_BULLET_WORDS:
            add("long_bullet", "soft")
        if is_bullet and not _DIGIT_RE.search(text):
            add("no_metric", "soft")
        if is_bullet:
            word = _first_word(text)
            if word:
                openers.setdefault(_entry_key(path), {}).setdefault(word, []).append(
                    path
                )

    texts = dict(iter_writing_units(data))
    for by_word in openers.values():
        for paths in by_word.values():
            if len(paths) >= _REPEATED_OPENER_LIMIT:
                for path in paths[1:]:
                    findings.append(
                        WritingFinding(
                            path=path,
                            rule="repeated_opener",
                            severity="soft",
                            excerpt=_excerpt(texts.get(path, "")),
                        )
                    )
    return findings


def writing_score(data: dict[str, Any], findings: list[WritingFinding]) -> int | None:
    """Mean per-unit score, 0 to 100. ``None`` when there is nothing to score."""
    paths = [path for path, _ in iter_writing_units(data)]
    if not paths:
        return None
    penalties = dict.fromkeys(paths, 0)
    for finding in findings:
        if finding.path not in penalties:
            continue
        if finding.severity == "hard":
            penalties[finding.path] += _HARD_PENALTY
        elif finding.rule == "no_metric":
            penalties[finding.path] += _METRIC_PENALTY
        else:
            penalties[finding.path] += _SOFT_PENALTY
    total = sum(max(0, 100 - penalty) for penalty in penalties.values())
    return round(total / len(paths))


def writing_report(data: dict[str, Any], language: str = "en") -> WritingReport:
    """Rule findings and score for ``data``, with no critic notes."""
    findings = check_writing(data, language)
    return WritingReport(score=writing_score(data, findings), findings=findings)


def hard_paths(findings: Iterable[WritingFinding]) -> list[str]:
    """Paths with at least one hard finding, in first-seen order."""
    return list(dict.fromkeys(f.path for f in findings if f.severity == "hard").keys())


def _fact_tokens(text: str) -> set[str]:
    tokens: set[str] = set()
    for match in _WORD_RE.finditer(text):
        token = match.group(0).rstrip(".-/")
        if len(token) < 2:
            continue
        tool_like = bool(re.search(r"[\d+#]|\w[./]\w", token))
        acronym = token.isupper() and any(c.isalpha() for c in token)
        capitalized = token[0].isupper() and not _SENTENCE_START_RE.search(
            text[: match.start()]
        )
        if tool_like or acronym or capitalized:
            tokens.add(token.casefold())
    return tokens


def _word_set(text: str) -> set[str]:
    return {m.group(0).rstrip(".-/").casefold() for m in _WORD_RE.finditer(text)}


def fact_violations(
    before: str,
    after: str,
    *,
    known_terms: Iterable[str] = (),
    allowed_additions: Iterable[str] = (),
) -> list[str]:
    """Return why ``after`` is not a faithful rewrite of ``before``.

    A rewrite keeps every number, name, tool and known skill of the original
    and adds none, except the terms in ``allowed_additions``. An empty list
    means the rewrite is safe to apply.
    """
    violations: list[str] = []
    if _novel_numbers(before, after):
        violations.append("added_number")
    if _novel_numbers(after, before):
        violations.append("dropped_number")

    allowed = [term for term in allowed_additions if term.strip()]
    allowed_words: set[str] = set()
    for term in allowed:
        allowed_words |= _word_set(term)

    before_words = _word_set(before)
    after_words = _word_set(after)
    dropped = {t for t in _fact_tokens(before) if t not in after_words}
    added = {
        t
        for t in _fact_tokens(after)
        if t not in before_words and t not in allowed_words
    }
    if dropped:
        violations.append("dropped_term:" + ",".join(sorted(dropped)))
    if added:
        violations.append("added_term:" + ",".join(sorted(added)))

    allowed_keys = {term.strip().casefold() for term in allowed}
    for term in known_terms:
        if not isinstance(term, str) or not term.strip():
            continue
        in_before = _keyword_in_text(term, before)
        in_after = _keyword_in_text(term, after)
        if in_before and not in_after:
            violations.append(f"dropped_skill:{term}")
        elif in_after and not in_before and term.strip().casefold() not in allowed_keys:
            violations.append(f"added_skill:{term}")
    return list(dict.fromkeys(violations))


def scrub_em_dashes(text: str) -> str:
    """Replace em dashes and double hyphens with a comma."""
    cleaned = EM_DASH_RE.sub(", ", text)
    cleaned = re.sub(r"\s+,", ",", cleaned)
    cleaned = re.sub(r",\s*,", ",", cleaned)
    return re.sub(r"[ \t]{2,}", " ", cleaned).strip()
