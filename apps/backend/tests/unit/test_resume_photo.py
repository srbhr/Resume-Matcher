"""A resume photo is normalized to a small, metadata-free 35:45 JPEG data URL."""

import base64
import io

import pytest
from PIL import Image

from app.services.resume_photo import (
    MAX_PHOTO_BYTES,
    PHOTO_HEIGHT,
    PHOTO_WIDTH,
    PhotoTooLargeError,
    UnsupportedPhotoError,
    normalize_photo,
)

PREFIX = "data:image/jpeg;base64,"


def encode(image: Image.Image, fmt: str, **save: object) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format=fmt, **save)
    return buffer.getvalue()


def decode(data_url: str) -> Image.Image:
    assert data_url.startswith(PREFIX)
    return Image.open(io.BytesIO(base64.b64decode(data_url[len(PREFIX) :])))


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_each_accepted_format_becomes_a_35_by_45_jpeg(fmt: str) -> None:
    photo = decode(normalize_photo(encode(Image.new("RGB", (1200, 900), "navy"), fmt)))

    assert photo.format == "JPEG"
    assert photo.size == (PHOTO_WIDTH, PHOTO_HEIGHT)
    assert (PHOTO_WIDTH, PHOTO_HEIGHT) == (413, 531)  # 35 x 45 mm at 300 dpi


def test_the_crop_keeps_the_centre() -> None:
    # Red bands at both sides of a wide image, blue in the middle: a centre crop
    # to portrait keeps only blue.
    image = Image.new("RGB", (1600, 900), "red")
    image.paste(Image.new("RGB", (800, 900), "blue"), (400, 0))

    photo = decode(normalize_photo(encode(image, "PNG"))).convert("RGB")

    for x in (0, PHOTO_WIDTH - 1):
        red, _, blue = photo.getpixel((x, PHOTO_HEIGHT // 2))
        assert blue > 200 and red < 60


def test_transparency_becomes_white_not_black() -> None:
    image = Image.new("RGBA", (700, 900), (0, 0, 0, 0))

    photo = decode(normalize_photo(encode(image, "PNG"))).convert("RGB")

    assert all(channel > 245 for channel in photo.getpixel((5, 5)))


def test_a_small_photo_is_cropped_but_never_enlarged() -> None:
    photo = decode(normalize_photo(encode(Image.new("RGB", (100, 100), "gray"), "PNG")))

    assert photo.size == (78, 100)  # 35:45 of the original height, no upscaling


def test_a_camera_rotated_photo_comes_out_upright() -> None:
    # Stored landscape with EXIF orientation 6: viewers show it rotated to portrait.
    landscape = Image.new("RGB", (900, 600), "green")
    exif = Image.Exif()
    exif[0x0112] = 6

    photo = decode(normalize_photo(encode(landscape, "JPEG", exif=exif.tobytes())))

    # Upright it is 600 x 900, so the 35:45 crop takes its full width.
    assert photo.size == (PHOTO_WIDTH, PHOTO_HEIGHT)
    assert photo.getexif().get(0x0112) in (None, 1)


def test_metadata_such_as_location_is_removed() -> None:
    exif = Image.Exif()
    exif[0x010F] = "Camera maker"
    gps = exif.get_ifd(0x8825)
    gps[1] = "N"
    gps[2] = (52.0, 31.0, 0.0)  # latitude
    upload = encode(Image.new("RGB", (700, 900)), "JPEG", exif=exif)
    assert Image.open(io.BytesIO(upload)).getexif().get_ifd(0x8825)  # the input has GPS

    photo = decode(normalize_photo(upload))

    assert dict(photo.getexif()) == {}
    assert "exif" not in photo.info


@pytest.mark.parametrize(
    ("name", "data"),
    [
        ("GIF", encode(Image.new("RGB", (700, 900)), "GIF")),
        ("text", b"definitely not an image"),
        ("empty", b""),
        ("truncated JPEG", encode(Image.new("RGB", (700, 900), "red"), "JPEG")[:200]),
    ],
)
def test_anything_but_a_readable_jpeg_png_or_webp_is_refused(
    name: str, data: bytes
) -> None:
    with pytest.raises(UnsupportedPhotoError):
        normalize_photo(data)


def _jpeg_with_a_broken_exif_tag(tag_low_byte: int) -> bytes:
    """A JPEG whose first EXIF tag id is rewritten, giving that tag a wrong type."""
    image = Image.new("RGB", (60, 80), "red")
    exif = image.getexif()
    exif[0x010F] = "Cam"  # Make: ASCII; renaming it gives a numeric tag a string
    exif[0x0112] = 6  # Orientation, so the photo is turned upright
    data = bytearray(encode(image, "JPEG", exif=exif.tobytes()))
    # The TIFF header is 8 bytes, the entry count 2; the first entry's tag id follows.
    data[data.index(b"Exif\x00\x00") + 6 + 11] = tag_low_byte
    return bytes(data)


@pytest.mark.parametrize(
    "tag_low_byte",
    [0x00, 0x1A],  # ImageWidth and XResolution, each holding a string
)
def test_a_photo_with_malformed_exif_is_refused_not_a_server_error(
    tag_low_byte: int,
) -> None:
    with pytest.raises(UnsupportedPhotoError):
        normalize_photo(_jpeg_with_a_broken_exif_tag(tag_low_byte))


def test_a_file_over_the_byte_limit_is_refused_before_decoding() -> None:
    with pytest.raises(PhotoTooLargeError):
        normalize_photo(b"\xff" * (MAX_PHOTO_BYTES + 1))


def test_a_file_at_the_byte_limit_is_decoded() -> None:
    # At the limit the size check passes; these bytes then fail as an image.
    with pytest.raises(UnsupportedPhotoError):
        normalize_photo(b"\xff" * MAX_PHOTO_BYTES)


def test_huge_dimensions_are_refused_without_decoding_the_pixels() -> None:
    # A tiny file that decodes to 80 million pixels: under Pillow's own bomb
    # threshold (about 89 million), over this module's 40 million.
    bomb = encode(Image.new("1", (10000, 8000)), "PNG", optimize=True)
    assert len(bomb) < MAX_PHOTO_BYTES

    with pytest.raises(UnsupportedPhotoError):
        normalize_photo(bomb)
