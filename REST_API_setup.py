from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
import os
import pathlib
import json
from pydantic import BaseModel
from typing import List
import pymongo
from pymongo import MongoClient
from bson.json_util import dumps
import pymongo.errors
from scripts import ResumeProcessor  # Import ResumeProcessor class
import tempfile
import threading

lock = threading.Lock()


app = FastAPI()

# Replace with your actual MongoDB Atlas connection string
MONGODB_ATLAS_URI = "mongodb+srv://chourouk:hello@resumes.jpisuxt.mongodb.net/"
MONGODB_ATLAS_URI = os.environ["MONGODB_ATLAS_URI"]
client = MongoClient(MONGODB_ATLAS_URI)
db = client["resumes"] 

TEMP_DIR_RESUME = "temp_ResumeToProcesss"
SAVE_DIRECTORY = "Data/Processed/Resumes"

def validate_resume_file(resume_file: UploadFile):
    allowed_mime_types = ["application/pdf"]
    if resume_file.content_type not in allowed_mime_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF files are allowed.")

def check_resume_existence(file_name):
    try:
        return db.resumes.find_one({"filename": file_name}) is not None
    except pymongo.errors.PyMongoError as e:
        raise HTTPException(status_code=500,detail=f"Error checking resume existence: {str(e)}")

def save_resume_to_db(file_path, file_name):
    try:
        with open(file_path, "r") as f:
            json_data = json.load(f)
            db.resumes.insert_one({"filename": file_name, "content": json_data})
    except pymongo.errors.PyMongoError as e:
        raise HTTPException(status_code=500,detail=f"Error saving resume to db: {str(e)}")
    
def process_ResumeToProcess(ResumeToProcess):
    with lock:
        with tempfile.NamedTemporaryFile() as temp_file:
            temp_file.write(ResumeToProcess.getbuffer())
            temp_file.seek(0)
        """ # Save uploaded file temporarily
        temp_file_path = pathlib.Path(TEMP_DIR_RESUME) / ResumeToProcess.name
        temp_file_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(temp_file_path, "wb") as f:
            f.write(ResumeToProcess.getbuffer())"""

        # Process the file using the ResumeProcessor class
        processor = ResumeProcessor(temp_file.name)
        processed_file_path = processor.process()

        return processed_file_path  # Return the processed file path as a string

@app.post("/upload_resume/")
async def upload_resume(resume_file: UploadFile = File(...)):
    try:
        # Validate the uploaded file
        validate_resume_file(resume_file)
        processed_file_path = process_ResumeToProcess(resume_file)


        if processed_file_path:
            with open(processed_file_path, "r") as file:
                processed_resume_json = json.load(file)
            
            # Check if the processed resume already exists in MongoDB
            if not check_resume_existence(processed_file_path):
                # If not exists, save it to MongoDB
                save_resume_to_db(processed_file_path, resume_file.filename)
                os.remove(processed_file_path)  # Remove the processed file
                return {"message": "Resume processed and saved successfully."}
            else:
                return {"message": "Resume already exists in the database."}
        else:
            raise HTTPException(status_code=500, detail="Error processing the resume file.")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading resume: {str(e)}")
    
@app.get("/retrieve_resume/{filename}")
async def retrieve_resume(filename: str):
    try:
        # Retrieve the resume from MongoDB
        resume = db.resumes.find_one({"filename": filename})
        if resume:
            return JSONResponse(content=resume["content"])
        else:
            raise HTTPException(status_code=404, detail="Resume not found in the database.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving resume: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
