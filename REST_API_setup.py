from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import os
import pathlib
import json
import pymongo
from pymongo import MongoClient
from bson.json_util import dumps
import pymongo.errors
from scripts import ResumeProcessor  # Import ResumeProcessor class
import threading


lock = threading.Lock()
app = FastAPI()

# Connect to MongoDB
MONGODB_LOCAL_URI = "mongodb://localhost:27017"
client = MongoClient(MONGODB_LOCAL_URI)
db = client["resumes"] 

TEMP_DIR_RESUME = "Data/temp_ResumeToProcesss"
SAVE_DIRECTORY = "Data/Processed/Resumes"

def check_resume_existence(file_name):
    return db.resumes.find_one({"filename": file_name}) is not None

def save_resume_to_db(file_path, file_name, keyword_dict):
    try:
        with open(file_path, "r") as f:
            json_data = json.load(f)

        # Add additional data to the JSON object
        json_data["keyword_dict"] = keyword_dict

        db.resumes.insert_one({"filename": file_name, "content": json_data})
    except pymongo.errors.PyMongoError as e:
        raise HTTPException(status_code=500, detail=f"Error saving resume to db: {str(e)}")
    
def process_ResumeToProcess(ResumeToProcess):
    with lock:
        # Save uploaded file to a temporary location
        temp_file_path = pathlib.Path(TEMP_DIR_RESUME)/ResumeToProcess.filename
        temp_file_path.parent.mkdir(parents=True, exist_ok=True)

        with open(temp_file_path, "wb") as temp_file:
            temp_file.write(ResumeToProcess.file.read())


        # Process the file using the ResumeProcessor class
        processor = ResumeProcessor(temp_file_path)
        processed_file_path = processor.process()
        # Delete the original PDF file after processing
        os.remove(temp_file_path)
        return processed_file_path , pathlib.Path(processed_file_path).name  # Return the processed file path and file name


@app.post("/upload_resume/")
async def upload_resume(resume_file: UploadFile = File(...)):
    try:
        processed_file_path, processed_file_name = process_ResumeToProcess(resume_file)
        
        if processed_file_path:
            with open(processed_file_path, "r") as file:
                processed_resume_json = json.load(file)
                keyword_dict = {keyword: value * 100 for keyword, value in processed_resume_json["keyterms"]}

            
            # Check if the processed resume already exists in MongoDB
            if not check_resume_existence(processed_file_name):
                
                # If not exists, save it to MongoDB
                save_resume_to_db(processed_file_path, processed_file_name,keyword_dict)
                os.remove(processed_file_path)  # Remove the processed file
                
                return {"filename": processed_file_name}
            
            else:
                return {"filename": processed_file_name}
        else:
            raise HTTPException(status_code=500, detail="Error processing the resume file.")

    except Exception as e:
        import traceback
        traceback.print_exc()  # print the exception traceback
        raise HTTPException(status_code=500, detail=f"Error uploading resume: {str(e)}")
    
@app.get("/retrieve_resume/{filename}")
async def retrieve_resume(filename: str):
    try:
        # Retrieve the resume from MongoDB
        resume = db.resumes.find_one({"filename": filename})
        if resume:
            return resume["content"]
        else:
            raise HTTPException(status_code=404, detail="Resume not found in the database.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving resume: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
