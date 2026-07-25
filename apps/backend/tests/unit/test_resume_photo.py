"""Unit tests for resume profile-photo validation and processing."""

from io import BytesIO

import pytest
from PIL import Image
from pydantic import ValidationError

from app.schemas.models import PhotoMutation, PhotoSettings
from app.services.resume_photo import (
    MAX_UPLOAD_BYTES,
    PhotoValidationError,
    process_uploaded_photo,
    render_photo_derivative,
    restore_photo_metadata,
    strip_photo_metadata,
)


def _image_bytes(
    image_format: str = "PNG",
    size: tuple[int, int] = (1200, 800),
) -> bytes:
    output = BytesIO()
    Image.new("RGB", size, "navy").save(output, format=image_format)
    return output.getvalue()


def _portrait_crop() -> PhotoMutation:
    return PhotoMutation(
        cropX=25,
        cropY=0,
        cropWidth=50,
        cropHeight=100,
        size=88,
    )


def test_photo_mutation_rejects_crop_outside_image_bounds() -> None:
    with pytest.raises(ValidationError, match="crop rectangle"):
        PhotoMutation(
            cropX=80,
            cropY=0,
            cropWidth=30,
            cropHeight=100,
            size=88,
        )


@pytest.mark.parametrize(
    ("field", "value"),
    (("size", 63), ("size", 113)),
)
def test_photo_mutation_rejects_display_values_outside_limits(
    field: str,
    value: float,
) -> None:
    payload = {
        "cropX": 0,
        "cropY": 0,
        "cropWidth": 100,
        "cropHeight": 100,
        "size": 88,
    }
    payload[field] = value

    with pytest.raises(ValidationError):
        PhotoMutation.model_validate(payload)


@pytest.mark.parametrize("image_format", ("JPEG", "PNG", "WEBP"))
def test_processor_normalizes_supported_images_and_renders_adaptive_webp(
    image_format: str,
) -> None:
    result = process_uploaded_photo(
        _image_bytes(image_format),
        _portrait_crop(),
    )

    source = Image.open(BytesIO(result.source_data))
    display = Image.open(BytesIO(result.display_data))

    assert source.format == "WEBP"
    assert source.size == (1200, 800)
    assert result.source_width == 1200
    assert result.source_height == 800
    assert display.format == "WEBP"
    assert display.size == (384, 512)
    assert result.aspect_ratio == pytest.approx(0.75)


def test_processor_reduces_source_long_edge_without_upscaling() -> None:
    result = process_uploaded_photo(
        _image_bytes(size=(2400, 1600)),
        _portrait_crop(),
    )

    source = Image.open(BytesIO(result.source_data))
    assert source.size == (1600, 1067)


@pytest.mark.parametrize(
    ("settings", "expected_size", "expected_ratio"),
    (
        (
            PhotoMutation(
                cropX=0,
                cropY=0,
                cropWidth=100,
                cropHeight=50,
                zoom=1,
                size=88,
            ),
            (512, 171),
            3.0,
        ),
        (
            PhotoMutation(
                cropX=25,
                cropY=0,
                cropWidth=50,
                cropHeight=75,
                zoom=1,
                size=88,
            ),
            (512, 512),
            1.0,
        ),
    ),
)
def test_processor_preserves_landscape_and_square_crop_ratios(
    settings: PhotoMutation,
    expected_size: tuple[int, int],
    expected_ratio: float,
) -> None:
    result = process_uploaded_photo(_image_bytes(), settings)
    display = Image.open(BytesIO(result.display_data))

    assert display.size == expected_size
    assert result.aspect_ratio == pytest.approx(expected_ratio)


def test_processor_rejects_corrupt_or_unsupported_data() -> None:
    with pytest.raises(PhotoValidationError, match="valid JPEG, PNG, or WebP"):
        process_uploaded_photo(b"not an image", _portrait_crop())


def test_processor_rejects_payload_over_upload_limit() -> None:
    with pytest.raises(PhotoValidationError, match="8 MB"):
        process_uploaded_photo(
            b"x" * (MAX_UPLOAD_BYTES + 1),
            _portrait_crop(),
        )


def test_derivative_can_be_regenerated_from_normalized_source() -> None:
    initial = process_uploaded_photo(
        _image_bytes(),
        _portrait_crop(),
    )
    regenerated = render_photo_derivative(
        initial.source_data,
        PhotoMutation(
            cropX=0,
            cropY=0,
            cropWidth=100,
            cropHeight=50,
            size=96,
        ),
    )

    image = Image.open(BytesIO(regenerated.data))
    assert image.format == "WEBP"
    assert image.size == (512, 171)
    assert regenerated.aspect_ratio == pytest.approx(3.0)


def test_legacy_zoom_is_ignored_and_photo_settings_default_to_square() -> None:
    mutation = PhotoMutation.model_validate(
        {
            "cropX": 0,
            "cropY": 0,
            "cropWidth": 100,
            "cropHeight": 100,
            "zoom": 2,
            "size": 88,
        }
    )

    assert "zoom" not in mutation.model_dump()
    settings = PhotoSettings.model_validate({**mutation.model_dump(), "version": 1})
    assert settings.aspectRatio == 1


def test_strip_and_restore_photo_metadata_without_mutating_inputs() -> None:
    settings = {
        "cropX": 0,
        "cropY": 0,
        "cropWidth": 100,
        "cropHeight": 100,
        "size": 88,
        "version": 3,
        "aspectRatio": 1,
    }
    source = {"personalInfo": {"name": "Ada", "photo": settings}, "summary": "A"}
    stripped = strip_photo_metadata(source)
    restored = restore_photo_metadata(source, {"personalInfo": {"name": "Ada"}})

    assert "photo" not in stripped["personalInfo"]
    assert restored["personalInfo"]["photo"] == settings
    assert source["personalInfo"]["photo"] == settings
