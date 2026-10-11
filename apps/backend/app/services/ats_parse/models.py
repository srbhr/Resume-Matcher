"""Parse-check report schema. Check text is localized client-side from id + params."""

from typing import Any, Literal

from pydantic import BaseModel, Field

SCHEMA_VERSION = "1.0"

Category = Literal["extraction", "layout", "content"]
Severity = Literal["high", "medium", "low"]
Status = Literal["pass", "warn", "fail"]
FieldStatus = Literal["found", "garbled", "missing", "hidden"]


class Check(BaseModel):
    id: str
    category: Category
    severity: Severity
    status: Status
    params: dict[str, Any] = Field(default_factory=dict)


class RoundTripField(BaseModel):
    field: str
    status: FieldStatus
    score: float


class RoundTrip(BaseModel):
    """Self-consistency of our own render, not real-ATS accuracy."""

    content_recall: float
    order_fidelity: float
    truncated: bool = False
    fields: list[RoundTripField]


class ParseCheckReport(BaseModel):
    schema_version: str = SCHEMA_VERSION
    source: Literal["upload", "render"]
    extractability: Literal["full", "partial", "none"]
    overall_score: int
    content_score: int
    page_count: int | None
    checks: list[Check]
    roundtrip: RoundTrip | None = None
    template: str | None = None
    extracted_text_preview: str
