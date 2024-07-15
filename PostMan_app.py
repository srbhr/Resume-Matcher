import json
import pathlib
from fastapi import FastAPI, HTTPException
import os
import pymongo
from pymongo import MongoClient
from scripts import ResumeProcessor  # Import ResumeProcessor class
from typing import Dict

app = FastAPI()
# Connect to MongoDB
MONGODB_LOCAL_URI = "mongodb://localhost:27017"
client = MongoClient(MONGODB_LOCAL_URI)
db = client["resumes"] 


def check_resume_existence(file_name):
    return db.resumes.find_one({"filename": file_name}) is not None

def save_resume_to_db(file_path, file_name):
    try:
        with open(file_path, "r") as f:
            json_data = json.load(f)

        # Add additional data to the JSON object
        #json_data["keyword_dict"] = keyword_dict
        db.resumes.insert_one({"filename": file_name, "content": json_data})
    except pymongo.errors.PyMongoError as e:
        raise HTTPException(status_code=500, detail=f"Error saving resume to db: {str(e)}")
    
def process_ResumeToProcess(ResumeToProcess):
    try:
        # Example processing: read file content and save to database
        with open(ResumeToProcess, "r") as file:
            resume_content = file.read()
        print("p1")
        # Example: Using ResumeProcessor class to process the resume
        processor = ResumeProcessor(ResumeToProcess)
        processed_file_path = processor.process()
        print(processed_file_path)

        # Return processed file path and name
        return processed_file_path, pathlib.Path(processed_file_path).name
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing resume: {str(e)}")

# Endpoint to process resume file from absolute path
@app.post("/process_resume_from_path/")
async def process_resume_from_path(data: Dict[str, str]):
    try:
        print("1")
        file_path_str = data.get("file_path")
        print(file_path_str)
        if not file_path_str:
            raise HTTPException(status_code=400, detail="No file path provided.")

        # Convert string to Path object
        #file_path = pathlib.Path(file_path_str)
        file_path = file_path_str[1]
        print(file_path)
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=400, detail="Invalid file path provided.")
        print("11")

        processed_resume_path, processed_resume_name = process_ResumeToProcess(file_path)
        print('2')

        # Save processed resume to MongoDB 
        save_resume_to_db(processed_resume_path, processed_resume_name)
        print("3")
        return {"filename": processed_resume_name}

    except HTTPException as http_exc:
        print(f"HTTPException: {http_exc.detail}")
        raise
    except Exception as e:
        print(f"Exception: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing resume file: {str(e)}")
    
    

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

