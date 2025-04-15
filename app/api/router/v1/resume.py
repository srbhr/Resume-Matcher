from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from uuid import uuid4
from app.services.resume_service import ResumeService
from app.core import get_db_session

resume_router = APIRouter()

@resume_router.post("/upload", summary="Upload a resume in PDF format and store it into DB in HTML/Markdown format")
async def upload_resume(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db_session)
):
    """
    Accepts a PDF file, converts it to HTML/Markdown, and stores it in the database.
    
    - **file**: The PDF file to be uploaded.
    - Returns a success message with the filename and content type.
    - Raises HTTP 400 if the file is not a PDF.
    - Raises HTTP 500 if there is an error during the conversion or storage process.
    """
    request_id = getattr(request.state, "request_id", str(uuid4()))
    
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF files are allowed.")
    
    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Empty file. Please upload a valid PDF file.")
    
    try:
        ResumeService(db).convert_and_store_resume(pdf_bytes=pdf_bytes, content_type="md")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")
    
    return {"message": f"File {file.filename} successfully processed as MD and stored in the DB", "request_id": request_id}