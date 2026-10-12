"""Minimal one-page PDFs with the defects real-world resumes carry.

Each one is readable by pdfminer/markitdown; the upload preflight used to hang
on or reject them.
"""

import zlib

SAMPLE_TEXT = "Jane Doe - Software Engineer"
_TEXT_OPS = f"BT /F1 12 Tf 72 720 Td ({SAMPLE_TEXT}) Tj ET\n".encode()


def build_pdf(stream: bytes, *, missing_object: bool = False) -> bytes:
    """A one-page PDF whose content stream is ``stream`` (FlateDecode).

    ``missing_object`` adds an in-use xref entry for an object the file does
    not contain, as incremental saves sometimes leave behind.
    """
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(stream)
        + stream
        + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % number + body + b"\nendobj\n"
    size = len(objs) + 1 + (1 if missing_object else 0)
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % size
    out += b"".join(b"%010d 00000 n \n" % offset for offset in offsets)
    if missing_object:
        out += b"%010d 00000 n \n" % (xref - 1)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        size,
        xref,
    )
    return bytes(out)


def trailing_byte_pdf() -> bytes:
    """Content stream inflates past 64 KB and has one byte after the zlib data."""
    return build_pdf(zlib.compress(_TEXT_OPS + b"q Q\n" * 25_000) + b"\n")


def truncated_flate_pdf() -> bytes:
    """Content stream is missing its zlib checksum (a cut-off stream)."""
    return build_pdf(zlib.compress(_TEXT_OPS)[:-4])


def missing_object_pdf() -> bytes:
    """The xref lists an object that the file does not contain."""
    return build_pdf(zlib.compress(_TEXT_OPS), missing_object=True)
