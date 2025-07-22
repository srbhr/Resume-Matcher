# Fix for Issue #409: Error processing file conversion DocxConverter

## Problem Description
Users were encountering a "MissingDependencyException" when trying to upload DOCX files to the Resume Matcher application. The error was:

```
Status: 500 Internal Server Error - Server response: {"detail":"Error processing file: File conversion failed after 1 attempts:\n - DocxConverter threw MissingDependencyException with message: DocxConverter recognized the input as a potential .docx file...
```

## Root Cause
The issue was caused by missing dependencies required for DOCX file processing. The `markitdown` library, which is used to convert DOCX files to text, depends on the `python-docx` package for handling DOCX files. Additionally, `python-docx` requires `lxml` for XML processing.

## Solution
Added the missing dependencies to both `requirements.txt` and `pyproject.toml`:

1. **python-docx==1.1.2** - Library for reading and writing DOCX files
2. **lxml==5.4.0** - XML processing library required by python-docx

## Changes Made

### 1. Updated requirements.txt
Added the following dependencies:
```
python-docx==1.1.2
lxml==5.4.0
```

### 2. Updated pyproject.toml
Added the same dependencies to the project configuration.

### 3. Enhanced error handling in ResumeService
- Added dependency validation during service initialization
- Improved error messages for DOCX conversion failures
- Added specific handling for MissingDependencyException

### 4. Created diagnostic test script
Added `test_docx_dependencies.py` to help diagnose DOCX processing issues.

## Installation Instructions
After pulling these changes, users need to install the new dependencies:

```bash
# Navigate to backend directory
cd apps/backend

# Install dependencies
pip install -r requirements.txt

# Or if using uv
uv pip install -r requirements.txt
```

## Testing
To verify the fix works:

1. Run the diagnostic script:
   ```bash
   python test_docx_dependencies.py
   ```

2. Test DOCX upload through the web interface
3. Check backend logs for any dependency warnings

## Related Files
- `apps/backend/requirements.txt` - Added missing dependencies
- `apps/backend/pyproject.toml` - Added missing dependencies  
- `apps/backend/app/services/resume_service.py` - Enhanced error handling
- `apps/backend/test_docx_dependencies.py` - New diagnostic script
