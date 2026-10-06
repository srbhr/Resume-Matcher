"""Round trip: how much of the structured resume survives extraction, and in what order."""

from collections import Counter, defaultdict
from typing import Any

from app.services.ats_parse.models import FieldStatus, RoundTrip, RoundTripField
from app.services.ats_parse.normalize import tokens

MAX_FIELDS = 300
FOUND_THRESHOLD = 0.9
GARBLED_THRESHOLD = 0.5
MATCH_PREFIX = 6

Field = tuple[str, str]


def _join(values: Any) -> str:
    if isinstance(values, list):
        return " ".join(str(v) for v in values if v)
    return str(values or "")


def _entry_fields(
    prefix: str, entry: dict[str, Any], keys: tuple[str, ...]
) -> list[Field]:
    out: list[Field] = [(f"{prefix}.{k}", _join(entry.get(k))) for k in keys]
    description = entry.get("description")
    if isinstance(description, list):
        out.extend((f"{prefix}.description[{j}]", d) for j, d in enumerate(description))
    elif description:
        out.append((f"{prefix}.description", str(description)))
    return out


def _section_fields(key: str, data: dict[str, Any]) -> list[Field]:
    if key == "summary":
        return [("summary", data.get("summary") or "")]
    if key == "workExperience":
        return [
            f
            for i, e in enumerate(data.get("workExperience") or [])
            for f in _entry_fields(
                f"workExperience[{i}]", e, ("title", "company", "years")
            )
        ]
    if key == "education":
        return [
            f
            for i, e in enumerate(data.get("education") or [])
            for f in _entry_fields(
                f"education[{i}]", e, ("institution", "degree", "years")
            )
        ]
    if key == "personalProjects":
        return [
            f
            for i, e in enumerate(data.get("personalProjects") or [])
            for f in _entry_fields(
                f"personalProjects[{i}]", e, ("name", "role", "years")
            )
        ]
    if key == "additional":
        additional = data.get("additional") or {}
        return [
            (f"additional.{k}", _join(additional.get(k)))
            for k in (
                "technicalSkills",
                "languages",
                "certificationsTraining",
                "awards",
            )
        ]
    custom = (data.get("customSections") or {}).get(key)
    if not isinstance(custom, dict):
        return []
    fields: list[Field] = []
    if custom.get("text"):
        fields.append((f"customSections.{key}.text", custom["text"]))
    if custom.get("strings"):
        fields.append((f"customSections.{key}.strings", _join(custom["strings"])))
    for i, item in enumerate(custom.get("items") or []):
        fields.extend(
            _entry_fields(
                f"customSections.{key}.items[{i}]", item, ("title", "subtitle", "years")
            )
        )
    return fields


def expected_fields(data: dict[str, Any]) -> tuple[list[Field], list[str]]:
    """Fields in render order, plus the keys of hidden sections."""
    info = data.get("personalInfo") or {}
    fields: list[Field] = [
        (f"personalInfo.{k}", str(info.get(k) or ""))
        for k in ("name", "title", "email", "phone", "location")
    ]
    hidden: list[str] = []
    for meta in sorted(data.get("sectionMeta") or [], key=lambda m: m.get("order", 0)):
        key = meta.get("key")
        if not key or key == "personalInfo":
            continue
        if not meta.get("isVisible", True):
            hidden.append(key)
            continue
        fields.extend(_section_fields(key, data))
    return [(name, text) for name, text in fields if tokens(text)], hidden


def _is_list_field(name: str) -> bool:
    return name.startswith("additional.") or name.endswith(".strings")


def _take(wanted: list[Any], available: Counter[Any]) -> float:
    """Share of ``wanted`` found in ``available``; matches are used up."""
    hits = 0
    for item in wanted:
        if available[item] > 0:
            available[item] -= 1
            hits += 1
    return hits / len(wanted)


def _field_score(
    name: str,
    field_tokens: list[str],
    unigrams: Counter[str],
    bigrams: Counter[tuple[str, str]],
) -> float:
    """Adjacent-pair recall, so interleaved columns score lower; lists use word recall.

    Each occurrence in the text can satisfy one field only, so a phrase repeated
    in the header cannot stand in for a body field that failed to extract.
    """
    if len(field_tokens) == 1 or _is_list_field(name):
        return _take(field_tokens, unigrams)
    return _take(list(zip(field_tokens, field_tokens[1:])), bigrams)


def _position(
    field_tokens: list[str],
    doc_tokens: list[str],
    index: dict[str, list[int]],
    after: int,
) -> int | None:
    """Start of the best prefix match; ties prefer the first match after ``after``."""
    starts = next((index[t] for t in field_tokens if t in index), None)
    if not starts:
        return None
    prefix = field_tokens[:MATCH_PREFIX]

    def match_len(start: int) -> int:
        n = 0
        while (
            n < len(prefix)
            and start + n < len(doc_tokens)
            and doc_tokens[start + n] == prefix[n]
        ):
            n += 1
        return n

    best = max(match_len(s) for s in starts)
    candidates = [s for s in starts if match_len(s) == best]
    return next((s for s in candidates if s > after), candidates[0])


def kendall_fidelity(positions: list[int]) -> float:
    """Kendall tau of observed positions vs expected order, mapped to 0..1."""
    n = len(positions)
    if n < 2:
        return 1.0
    concordant = discordant = 0
    for i in range(n):
        for j in range(i + 1, n):
            if positions[j] > positions[i]:
                concordant += 1
            elif positions[j] < positions[i]:
                discordant += 1
    pairs = n * (n - 1) / 2
    return round(((concordant - discordant) / pairs + 1) / 2, 3)


def compute_roundtrip(data: dict[str, Any], extracted_text: str) -> RoundTrip:
    fields, hidden = expected_fields(data)
    truncated = len(fields) > MAX_FIELDS
    fields = fields[:MAX_FIELDS]
    doc_tokens = tokens(extracted_text)
    unigrams = Counter(doc_tokens)
    bigrams = Counter(zip(doc_tokens, doc_tokens[1:]))
    index: dict[str, list[int]] = defaultdict(list)
    for i, token in enumerate(doc_tokens):
        index[token].append(i)

    results: list[RoundTripField] = []
    positions: list[int] = []
    weighted = total = 0.0
    last = -1
    for name, text in fields:
        field_tokens = tokens(text)
        value = _field_score(name, field_tokens, unigrams, bigrams)
        status: FieldStatus = (
            "found"
            if value >= FOUND_THRESHOLD
            else "garbled"
            if value >= GARBLED_THRESHOLD
            else "missing"
        )
        if status != "missing":
            pos = _position(field_tokens, doc_tokens, index, last)
            if pos is not None:
                positions.append(pos)
                last = pos
        weighted += value * len(field_tokens)
        total += len(field_tokens)
        results.append(RoundTripField(field=name, status=status, score=round(value, 3)))
    results.extend(
        RoundTripField(field=f"section.{key}", status="hidden", score=0.0)
        for key in hidden
    )
    return RoundTrip(
        content_recall=round(weighted / total, 3) if total else 1.0,
        order_fidelity=kendall_fidelity(positions),
        truncated=truncated,
        fields=results,
    )
