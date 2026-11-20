"""Resume photos: check an upload and turn it into a small 35:45 JPEG data URL.

Photo CVs use the 35 x 45 mm passport format; at 300 dpi that is 413 x 531 px.
The upload is re-encoded, which drops every bit of metadata (camera, location).
It is kept as a data URL because the PDF renderer loads nothing but the print
page's own origin, and an inlined image needs no request at all.
"""

import base64
import io
import struct

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_PHOTO_BYTES = 5 * 1024 * 1024
PHOTO_WIDTH, PHOTO_HEIGHT = 413, 531

# A source with more pixels is refused before they are decoded (a decompression bomb).
_MAX_SOURCE_PIXELS = 40_000_000
_ACCEPTED_FORMATS = ("JPEG", "PNG", "WEBP")
_JPEG_QUALITY = 85


class PhotoError(ValueError):
    """The upload can't be used as a resume photo."""


class UnsupportedPhotoError(PhotoError):
    """Not a readable JPEG, PNG or WebP image."""


class PhotoTooLargeError(PhotoError):
    """The file is over ``MAX_PHOTO_BYTES``."""


def normalize_photo(data: bytes) -> str:
    """The upload as a ``data:image/jpeg;base64,...`` URL, 35:45, at most 413 x 531."""
    if len(data) > MAX_PHOTO_BYTES:
        raise PhotoTooLargeError(f"photo is {len(data)} bytes; limit {MAX_PHOTO_BYTES}")
    try:
        with Image.open(io.BytesIO(data), formats=_ACCEPTED_FORMATS) as image:
            width, height = image.size
            if width * height > _MAX_SOURCE_PIXELS:
                raise UnsupportedPhotoError(f"photo has {width} x {height} pixels")
            image.load()
            upright = ImageOps.exif_transpose(image)
    except PhotoError:
        raise
    except (
        UnidentifiedImageError,
        Image.DecompressionBombError,
        OSError,
        SyntaxError,
        # Malformed EXIF: exif_transpose re-packs the tags it read, and a tag
        # with the wrong type or count fails there.
        struct.error,
        TypeError,
        ValueError,
    ) as error:
        raise UnsupportedPhotoError(str(error)) from error

    photo = _crop_to_portrait(_on_white(upright))
    if photo.width > PHOTO_WIDTH:
        photo = photo.resize((PHOTO_WIDTH, PHOTO_HEIGHT), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    photo.save(buffer, format="JPEG", quality=_JPEG_QUALITY, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode(
        "ascii"
    )


def _on_white(image: Image.Image) -> Image.Image:
    """RGB, with any transparency filled white (JPEG has no alpha; black would show)."""
    if image.mode in ("RGBA", "LA") or "transparency" in image.info:
        rgba = image.convert("RGBA")
        background = Image.new("RGB", rgba.size, "white")
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    return image.convert("RGB")


def _crop_to_portrait(image: Image.Image) -> Image.Image:
    """The largest 35:45 crop: centred across, and kept high on a tall photo,
    where the face usually is."""
    width, height = image.size
    if width * 45 > height * 35:
        crop_width = round(height * 35 / 45)
        left = (width - crop_width) // 2
        return image.crop((left, 0, left + crop_width, height))
    crop_height = round(width * 45 / 35)
    top = (height - crop_height) // 4
    return image.crop((0, top, width, top + crop_height))
