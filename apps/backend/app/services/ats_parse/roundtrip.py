"""Round trip: how much of the structured resume survives extraction, and in what order."""

from collections import defaultdict
from typing import Any

from app.schemas.models import ResumeData, normalize_resume_data
from app.services.ats_parse.models import FieldStatus, RoundTrip, RoundTripField
from app.services.ats_parse.normalize import tokens

MAX_FIELDS = 300
FOUND_THRESHOLD = 0.9
GARBLED_THRESHOLD = 0.5
MATCH_PREFIX = 6

Field = tuple[str, str]

# Header contact order per template (apps/frontend/components/resume/resume-*.tsx).
CONTACT_ORDER = ("email", "phone", "location", "website", "linkedin", "github")
CONTACT_ORDER_BY_TEMPLATE: dict[str, tuple[str, ...]] = {
    "clean": ("location", "phone", "email", "linkedin", "github", "website"),
    "latex": ("location", "phone", "email", "linkedin", "github", "website"),
    "vivid": ("website", "linkedin", "github", "email", "phone", "location"),
}
LINK_FIELDS = frozenset({"website", "linkedin", "github"})

# Entry field order as pdfminer reads each template (assets/pdf-templates/*.pdf).
# Two-row entries read the left column first: swiss-single's "title | dates"
# over "company | location" reads title, company, dates, location.
ENTRY_ORDER: dict[str, tuple[str, ...]] = {
    "workExperience": ("title", "company", "years", "location"),
    "education": ("institution", "degree", "years"),
    "personalProjects": ("name", "role", "years"),
}
_TWO_COLUMN_ENTRY_ORDER = {
    "workExperience": ("title", "company", "location", "years"),
    "education": ("institution", "years", "degree"),
}
ENTRY_ORDER_BY_TEMPLATE: dict[str, dict[str, tuple[str, ...]]] = {
    "swiss-two-column": _TWO_COLUMN_ENTRY_ORDER,
    "modern-two-column": _TWO_COLUMN_ENTRY_ORDER,
    "clean": {"workExperience": ("company", "title", "location", "years")},
    "latex": {"workExperience": ("company", "title", "years", "location")},
    "vivid": {"workExperience": ("company", "title", "years", "location")},
    "modern-deedy": {
        "workExperience": ("company", "title", "location", "years"),
        "education": ("degree", "institution", "years"),
    },
}


def canonical_resume_data(data: Any) -> dict[str, Any]:
    """Stored resume data as the print page renders it: normalized, then validated.

    Raises ``pydantic.ValidationError`` for malformed data, so the round trip
    never walks nodes of the wrong type.
    """
    raw = normalize_resume_data(dict(data)) if isinstance(data, dict) else data
    return ResumeData.model_validate(raw).model_dump(mode="json")


def _contact_text(key: str, value: Any) -> str:
    """A contact value as the header shows it: a bare link host drops "www.".

    The templates show a value starting with "http" or "//" exactly as typed.
    """
    text = str(value or "")
    if key in LINK_FIELDS and not text.startswith(("http", "//")):
        return text.removeprefix("www.")
    return text


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


def _section_fields(
    key: str, data: dict[str, Any], template: str | None
) -> list[Field]:
    if key == "summary":
        return [("summary", data.get("summary") or "")]
    if key in ENTRY_ORDER:
        order = ENTRY_ORDER_BY_TEMPLATE.get(template or "", {}).get(
            key, ENTRY_ORDER[key]
        )
        return [
            f
            for i, e in enumerate(data.get(key) or [])
            for f in _entry_fields(f"{key}[{i}]", e, order)
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
                f"customSections.{key}.items[{i}]",
                item,
                ("title", "subtitle", "location", "years"),
            )
        )
    return fields


def expected_fields(
    data: dict[str, Any], template: str | None = None
) -> tuple[list[Field], list[str]]:
    """Fields in render order, plus the keys of hidden sections."""
    info = data.get("personalInfo") or {}
    contact = CONTACT_ORDER_BY_TEMPLATE.get(template or "", CONTACT_ORDER)
    fields: list[Field] = [
        (f"personalInfo.{k}", _contact_text(k, info.get(k)))
        for k in ("name", "title", *contact)
    ]
    hidden: list[str] = []
    for meta in sorted(data.get("sectionMeta") or [], key=lambda m: m.get("order", 0)):
        key = meta.get("key")
        if not key or key == "personalInfo":
            continue
        if not meta.get("isVisible", True):
            hidden.append(key)
            continue
        fields.extend(_section_fields(key, data, template))
    return [(name, text) for name, text in fields if tokens(text)], hidden


def _is_list_field(name: str) -> bool:
    return name.startswith("additional.") or name.endswith(".strings")


def _uses_words(name: str, field_tokens: list[str]) -> bool:
    """Lists and one-word fields score word recall; phrases score adjacent pairs."""
    return len(field_tokens) == 1 or _is_list_field(name)


def _claim_words(
    field_tokens: list[str],
    index: dict[str, list[int]],
    owner: list[int | None],
    field_id: int,
) -> float:
    """Share of the words found at text positions no other field has claimed."""
    hits = 0
    for token in field_tokens:
        pos = next((p for p in index.get(token, ()) if owner[p] is None), None)
        if pos is not None:
            owner[pos] = field_id
            hits += 1
    return hits / len(field_tokens)


def _claim_pairs(
    field_tokens: list[str],
    doc_tokens: list[str],
    pair_index: dict[tuple[str, str], list[int]],
    owner: list[int | None],
    field_id: int,
) -> float:
    """Share of adjacent pairs found; a field's own pairs may share a word.

    A pair continues the previous pair's match when it can, so a phrase is
    claimed where it appears whole rather than piecemeal across the text.
    """
    used: set[int] = set()

    def free(p: int) -> bool:
        return p not in used and {owner[p], owner[p + 1]} <= {None, field_id}

    pairs = list(zip(field_tokens, field_tokens[1:]))
    pos: int | None = None
    for pair in pairs:
        follow = -1 if pos is None else pos + 1
        if (
            0 <= follow < len(doc_tokens) - 1
            and (doc_tokens[follow], doc_tokens[follow + 1]) == pair
            and free(follow)
        ):
            pos = follow
        else:
            pos = next((p for p in pair_index.get(pair, ()) if free(p)), None)
        if pos is not None:
            used.add(pos)
            owner[pos] = owner[pos + 1] = field_id
    return len(used) / len(pairs)


def _field_scores(
    fields: list[tuple[str, list[str]]], doc_tokens: list[str]
) -> list[float]:
    """Adjacent-pair recall, so interleaved columns score lower; lists use word recall.

    Each word in the text can satisfy one field only, so a phrase repeated in
    the header cannot stand in for a body field that failed to extract. Phrases
    claim their words first: a title such as "Python Developer" cannot also make
    an omitted "Python" skill look found.
    """
    index: dict[str, list[int]] = defaultdict(list)
    pair_index: dict[tuple[str, str], list[int]] = defaultdict(list)
    for i, token in enumerate(doc_tokens):
        index[token].append(i)
        if i + 1 < len(doc_tokens):
            pair_index[(token, doc_tokens[i + 1])].append(i)
    owner: list[int | None] = [None] * len(doc_tokens)
    scores = [0.0] * len(fields)
    for field_id, (name, field_tokens) in enumerate(fields):
        if not _uses_words(name, field_tokens):
            scores[field_id] = _claim_pairs(
                field_tokens, doc_tokens, pair_index, owner, field_id
            )
    for field_id, (name, field_tokens) in enumerate(fields):
        if _uses_words(name, field_tokens):
            scores[field_id] = _claim_words(field_tokens, index, owner, field_id)
    return scores


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


def compute_roundtrip(
    data: dict[str, Any], extracted_text: str, template: str | None = None
) -> RoundTrip:
    fields, hidden = expected_fields(canonical_resume_data(data), template)
    truncated = len(fields) > MAX_FIELDS
    fields = fields[:MAX_FIELDS]
    doc_tokens = tokens(extracted_text)
    index: dict[str, list[int]] = defaultdict(list)
    for i, token in enumerate(doc_tokens):
        index[token].append(i)
    tokenized = [(name, tokens(text)) for name, text in fields]
    scores = _field_scores(tokenized, doc_tokens)

    results: list[RoundTripField] = []
    positions: list[int] = []
    weighted = total = 0.0
    last = -1
    for (name, field_tokens), value in zip(tokenized, scores):
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
