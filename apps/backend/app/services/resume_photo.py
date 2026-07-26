"""Validation and deterministic processing for per-resume profile photos."""

from __future__ import annotations

import copy
from dataclasses import dataclass
from io import BytesIO
from typing import Any

from PIL import Image, ImageOps, UnidentifiedImageError

from app.schemas.models import PhotoMutation

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_DIMENSION = 8000
MAX_SOURCE_EDGE = 1600
DISPLAY_EDGE = 512
WEBP_QUALITY = 85
ALLOWED_FORMATS = frozenset({"JPEG", "PNG", "WEBP"})


class PhotoValidationError(ValueError):
    """Raised when uploaded photo bytes or crop settings are unsafe or invalid."""


@dataclass(frozen=True)
class ProcessedPhoto:
    """Normalized source bytes and the display-ready derivative."""

    source_data: bytes
    display_data: bytes
    source_width: int
    source_height: int
    input_format: str
    aspect_ratio: float


@dataclass(frozen=True)
class RenderedDerivative:
    """Display bytes and the authoritative source-pixel crop ratio."""

    data: bytes
    aspect_ratio: float


def strip_photo_metadata(resume_data: dict[str, Any]) -> dict[str, Any]:
    """Deep-copy resume data and remove server-managed photo metadata."""
    result = copy.deepcopy(resume_data)
    personal_info = result.get("personalInfo")
    if isinstance(personal_info, dict):
        personal_info.pop("photo", None)
    return result


def restore_photo_metadata(
    source: dict[str, Any],
    target: dict[str, Any],
) -> dict[str, Any]:
    """Deep-copy target data and restore authoritative photo metadata from source."""
    result = copy.deepcopy(target)
    source_personal = source.get("personalInfo")
    target_personal = result.get("personalInfo")
    if not isinstance(target_personal, dict):
        target_personal = {}
        result["personalInfo"] = target_personal
    source_photo = (
        source_personal.get("photo") if isinstance(source_personal, dict) else None
    )
    if isinstance(source_photo, dict):
        target_personal["photo"] = copy.deepcopy(source_photo)
    else:
        target_personal.pop("photo", None)
    return result


def _open_supported_image(data: bytes) -> Image.Image:
    """Decode allowed raster bytes and reject corrupt or oversized images."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise PhotoValidationError("Photo must be 8 MB or smaller.")

    try:
        with Image.open(BytesIO(data)) as probe:
            image_format = probe.format
            if image_format not in ALLOWED_FORMATS:
                raise PhotoValidationError(
                    "Photo must be a valid JPEG, PNG, or WebP image."
                )
            if probe.width > MAX_DIMENSION or probe.height > MAX_DIMENSION:
                raise PhotoValidationError(
                    f"Photo dimensions must not exceed {MAX_DIMENSION} × {MAX_DIMENSION}."
                )
            probe.verify()
        image = Image.open(BytesIO(data))
        image.load()
    except PhotoValidationError:
        raise
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
        ValueError,
    ) as exc:
        raise PhotoValidationError(
            "Photo must be a valid JPEG, PNG, or WebP image."
        ) from exc

    return image


def _normalize_source(image: Image.Image) -> Image.Image:
    """Apply orientation, strip metadata, convert RGB, and bound source size."""
    normalized = ImageOps.exif_transpose(image).convert("RGB")
    if max(normalized.size) > MAX_SOURCE_EDGE:
        normalized.thumbnail(
            (MAX_SOURCE_EDGE, MAX_SOURCE_EDGE),
            Image.Resampling.LANCZOS,
        )
    return normalized


def _encode_webp(image: Image.Image, *, quality: int = WEBP_QUALITY) -> bytes:
    """Encode an image as metadata-free WebP bytes."""
    output = BytesIO()
    image.save(output, format="WEBP", quality=quality, method=6)
    return output.getvalue()


def _crop_box(
    source_width: int,
    source_height: int,
    settings: PhotoMutation,
) -> tuple[int, int, int, int]:
    """Convert percentage crop settings into a bounded source-pixel box."""
    left = round(source_width * settings.cropX / 100)
    top = round(source_height * settings.cropY / 100)
    width = round(source_width * settings.cropWidth / 100)
    height = round(source_height * settings.cropHeight / 100)

    right = min(source_width, left + width)
    bottom = min(source_height, top + height)
    if right <= left or bottom <= top:
        raise PhotoValidationError("Photo crop is empty.")
    return left, top, right, bottom


def _render_derivative(
    source: Image.Image,
    settings: PhotoMutation,
) -> RenderedDerivative:
    """Crop a normalized source and render the display derivative."""
    cropped = source.crop(_crop_box(source.width, source.height, settings))
    aspect_ratio = cropped.width / cropped.height
    if cropped.width >= cropped.height:
        output_size = (
            DISPLAY_EDGE,
            max(1, round(DISPLAY_EDGE * cropped.height / cropped.width)),
        )
    else:
        output_size = (
            max(1, round(DISPLAY_EDGE * cropped.width / cropped.height)),
            DISPLAY_EDGE,
        )
    display = cropped.resize(
        output_size,
        Image.Resampling.LANCZOS,
    )
    return RenderedDerivative(
        data=_encode_webp(display),
        aspect_ratio=aspect_ratio,
    )


def process_uploaded_photo(
    data: bytes,
    settings: PhotoMutation,
) -> ProcessedPhoto:
    """Normalize uploaded raster bytes and create their display derivative."""
    image = _open_supported_image(data)
    try:
        source = _normalize_source(image)
        source_data = _encode_webp(source)
        derivative = _render_derivative(source, settings)
        return ProcessedPhoto(
            source_data=source_data,
            display_data=derivative.data,
            source_width=source.width,
            source_height=source.height,
            input_format=image.format or "",
            aspect_ratio=derivative.aspect_ratio,
        )
    finally:
        image.close()


def render_photo_derivative(
    source_data: bytes,
    settings: PhotoMutation,
) -> RenderedDerivative:
    """Regenerate a derivative from a previously normalized WebP source."""
    source = _open_supported_image(source_data)
    try:
        return _render_derivative(source.convert("RGB"), settings)
    finally:
        source.close()
