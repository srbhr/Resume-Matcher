#!/usr/bin/env python3
"""
Test script to verify DOCX processing dependencies for markitdown.
This script helps diagnose missing dependencies for issue #409.
"""

import sys
import tempfile
import logging
import os

def test_docx_dependencies():
    """Assert DOCX processing toolchain is functional; emit informative prints but fail via assertions."""
    print("Testing markitdown DOCX processing dependencies...")

    from importlib import import_module

    # markitdown presence
    try:
        MarkItDown = import_module("markitdown").MarkItDown  # type: ignore[attr-defined]
        print("✓ markitdown is available")
    except ImportError as e:  # pragma: no cover - explicit early fail path
        raise AssertionError(f"markitdown missing: {e}")

    # DOCX converter
    try:
        DocxConverter = import_module("markitdown.converters").DocxConverter  # type: ignore[attr-defined]
        DocxConverter()
        print("✓ markitdown DOCX support is available")
    except Exception as e:  # pragma: no cover
        raise AssertionError(
            "DOCX converter unavailable or its dependencies missing. Install with: pip install 'markitdown[all]==0.1.2'"
        ) from e

    # Initialization
    md = MarkItDown(enable_plugins=False)
    print("✓ MarkItDown initialized successfully")

    # Create temp docx and convert
    try:
        import docx  # type: ignore
    except ImportError:  # pragma: no cover
        import pytest
        pytest.skip("python-docx not installed; skipping DOCX roundtrip test")

    doc = docx.Document()
    doc.add_paragraph("Test resume content")
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp_file:
        doc.save(tmp_file.name)
        tmp_path = tmp_file.name
    try:
        result = md.convert(tmp_path)
        assert result and result.text_content, "DOCX conversion returned empty result"
        print(f"✓ DOCX conversion test successful -> {result.text_content[:50]}...")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    success = test_docx_dependencies()
    sys.exit(0 if success else 1)
