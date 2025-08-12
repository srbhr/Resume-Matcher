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
    """Test if all dependencies for DOCX processing are available"""
    print("Testing markitdown DOCX processing dependencies...")
    
    # Test 1: Check if markitdown is available
    try:
        from markitdown import MarkItDown
        print("✓ markitdown is available")
    except ImportError as e:
        print(f"✗ markitdown is missing: {e}")
        return False
    
    # Test 2: Check if markitdown has DOCX support
    try:
        from markitdown.converters import DocxConverter
        DocxConverter()
        print("✓ markitdown DOCX support is available")
    except ImportError as e:
        print(f"✗ markitdown DOCX converter is missing: {e}")
        print("  Install with: pip install 'markitdown[all]==0.1.2'")
        return False
    except Exception as e:
        if "MissingDependencyException" in str(e) or "dependencies needed to read .docx files" in str(e):
            print(f"✗ markitdown DOCX dependencies missing: {e}")
            print("  Install with: pip install 'markitdown[all]==0.1.2'")
            return False
        print(f"✗ Unexpected error with DOCX converter: {e}")
        return False
    
    # Test 3: Test markitdown initialization
    try:
        md = MarkItDown(enable_plugins=False)
        print("✓ MarkItDown initialized successfully")
    except Exception as e:
        print(f"✗ MarkItDown initialization failed: {e}")
        return False
    
    # Test 4: Create a minimal DOCX file and test conversion
    try:
        # Create a simple DOCX file for testing
        try:
            import docx
        except ImportError:
            print("✗ python-docx not available for creating test file")
            print("  Note: markitdown[all] should include this dependency")
            return False
            
        doc = docx.Document()
        doc.add_paragraph("Test resume content")
        
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp_file:
            doc.save(tmp_file.name)
            tmp_path = tmp_file.name
            
        try:
            # Test conversion
            result = md.convert(tmp_path)
            if result and result.text_content:
                print("✓ DOCX conversion test successful")
                print(f"  Converted text: {result.text_content[:50]}...")
                return True
            else:
                print("✗ DOCX conversion returned empty result")
                return False
        finally:
            # Cleanup temporary file
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
                
    except Exception as e:
        print(f"✗ DOCX conversion test failed: {e}")
        print(f"  Error type: {type(e).__name__}")
        if "MissingDependencyException" in str(e):
            print("  This is the DocxConverter MissingDependencyException mentioned in issue #409")
            print("  Install with: pip install 'markitdown[all]==0.1.2'")
        return False

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    success = test_docx_dependencies()
    sys.exit(0 if success else 1)
