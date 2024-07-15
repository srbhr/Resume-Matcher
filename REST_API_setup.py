from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import os
import pathlib
import json
import pymongo
from pymongo import MongoClient
from bson.json_util import dumps
import pymongo.errors
from scripts import ResumeProcessor, JobDescriptionProcessor
import threading
from typing import Dict
from pydantic import BaseModel
from typing import List,Any
import logging
# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

lock = threading.Lock()
app = FastAPI()

class JobDescription(BaseModel):
    filename: str
    text_array: List[str]

# Connect to MongoDB
MONGODB_LOCAL_URI = "mongodb://localhost:27017"
client = MongoClient(MONGODB_LOCAL_URI)
db = client["resumes"] 

jd_db=client.JobDescriptions

TEMP_DIR_RESUME = "Data/temp_ResumeToProcesss"
SAVE_DIRECTORY = "Data/Processed/Resumes"

TEMP_DIR_JOBDECRIPTION = "Data/temp_JobDescriptionToProcesss"
PROCESSED_JOBDESCRIPTION_DIR = "Data/Processed/JobDescription"

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
                 # Add the line to join extracted_keywords into resume_string
                resume_string = " ".join(processed_resume_json["extracted_keywords"])
                processed_resume_json["resume_string"] = resume_string

            
            # Check if the processed resume already exists in MongoDB
            if not check_resume_existence(processed_file_name):
                
                # If not exists, save it to MongoDB
                save_resume_to_db(processed_file_path, processed_file_name,keyword_dict)
                print(processed_file_path)
                os.remove(processed_file_path)  # Remove the processed file
                
                return {"filename": processed_file_name}
            
            else:
                print(processed_file_path)
                os.remove(processed_file_path)
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


def process_ResumeToProcess2(file_path_str,file_name):
    try:
        # Open the file in binary read mode
        with open(file_path_str, "rb") as f:
            file_content = f.read()
        # Save uploaded file temporarily
        print(file_name)
        temp_file_path = pathlib.Path(TEMP_DIR_RESUME) / file_name
        temp_file_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(temp_file_path, "wb") as f:
            f.write(file_content)

        # Process the file using the ResumeProcessor class
        processor = ResumeProcessor(temp_file_path)
        processed_file_path = processor.process()
        # Extract the file name from the Path object
        file_name2 =pathlib.Path(processed_file_path).name

        # Return processed file path and name
        return processed_file_path, file_name2
    except UnicodeDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Error processing resume (encoding issue): {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing resume: {str(e)}")


# Endpoint to process resume file from absolute path
@app.post("/process_resume_from_path/")
async def process_resume_from_path(data: Dict[str, str]):
    try:
        file_path_str = data.get("file_path")
        if not file_path_str:
            raise HTTPException(status_code=400, detail="No file path provided.")

        # Convert string to Path object
        file_path = pathlib.Path(file_path_str)
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=400, detail="Invalid file path provided.")
        file_name = os.path.basename(file_path_str)
        processed_resume_path, processed_resume_name = process_ResumeToProcess2(file_path,file_name)
        
        if processed_resume_path:
            with open(processed_resume_path, "r") as file:
                processed_resume_json = json.load(file)
                keyword_dict = {keyword: value * 100 for keyword, value in processed_resume_json["keyterms"]}
                # Add the line to join extracted_keywords into resume_string
                resume_string = " ".join(processed_resume_json["extracted_keywords"])
                processed_resume_json["resume_string"] = resume_string

            # Check if the processed resume already exists in MongoDB
            if not check_resume_existence(processed_resume_name):
                
                # If not exists, save it to MongoDB
                save_resume_to_db(processed_resume_path, processed_resume_name,keyword_dict)
                print(processed_resume_path)
                #os.remove(processed_resume_path)  # Remove the processed file
                # Read the processed resume file content
            with open(processed_resume_path, "r", encoding="utf-8") as f:
                processed_resume_content = json.load(f)
            return {"filename": processed_resume_name, "content": processed_resume_content}

    except HTTPException as http_exc:
        print(f"HTTPException: {http_exc.detail}")
        raise
    except Exception as e:
        print(f"Exception: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing resume file: {str(e)}")


def process_JobDescriptionToProcess(job_description_text):
    pathlib.Path(PROCESSED_JOBDESCRIPTION_DIR).mkdir(parents=True, exist_ok=True)
    # Process the text using the JobDescriptionProcessor class
    processor = JobDescriptionProcessor(job_description_text)
    jd_processed_file_path = processor.process()
    if jd_processed_file_path:
            # Load the processed job description from the saved JSON file
            with open(jd_processed_file_path, "r") as file:
                processed_job_description = json.load(file)
            
            # Calculate keyword_dict from processed_job_description
            keyword_dict = {keyword: value * 100 for keyword, value in processed_job_description["keyterms"]}
            
            # Add keyword_dict to processed_job_description
            processed_job_description["keyword_dict"] = keyword_dict
            
            # Save the updated job description back to the JSON file
            with open(jd_processed_file_path, "w") as file:
                json.dump(processed_job_description, file, indent=4)
            
    return jd_processed_file_path
    

def read_json(filename):
    with open(filename) as f:
        data = json.load(f)
    return data

def check_JobDescription_existence(file_name):
    return jd_db.resumes.find_one({"filename": file_name}) is not None

def save_JobDescriptions_to_db(file_path, file_name):
    try:
        with open(file_path, "r") as f:
            json_data = json.load(f)

        # Add additional data to the JSON object
        #json_data["keyword_dict"] = keyword_dict

        jd_db.resumes.insert_one({"filename": file_name, "content": json_data})
    except pymongo.errors.PyMongoError as e:
        raise HTTPException(status_code=500, detail=f"Error saving resume to db: {str(e)}")


# Endpoint to process jobDescription files from array of text
@app.post("/upload_job_descriptions/")
async def upload_job_descriptions(job_descriptions: List[JobDescription]):
    try:
        # Ensure the jobDescriptions collection exists, create it if not
        if "jobDescriptions" not in jd_db.list_collection_names():
            jd_db.create_collection("jobDescriptions")

        # Insert job descriptions into MongoDB collection
        collection = jd_db.jobDescriptions
        processed_job_descriptions = []

        # Iterate through each job description in the list
        for job_desc in job_descriptions:
            filename = job_desc.filename
            input_text = " ".join(job_desc.text_array)
            processor = JobDescriptionProcessor(input_text)
            processed_file_path = processor.process()
            
            if processed_file_path:
                
                with open(processed_file_path, "r") as file:
                    processed_job_description = json.load(file)
                    # Read additional data from processed job description JSON
                    jd_annotated_text_content = f"Clean Data: {processed_job_description.get('clean_data', '')}, Extracted Keywords: {processed_job_description.get('extracted_keywords', [])}"
                    jd_strings = " ".join(processed_job_description.get("extracted_keywords", []))
                    
                    # Add additional fields to processed_job_description
                    processed_job_description["jd_annotated_text_content"] = jd_annotated_text_content
                    processed_job_description["jd_strings"] = jd_strings
                    processed_job_description["filename"] = filename
                processed_job_descriptions.append(processed_job_description)


        collection.insert_one({"job_descriptions": processed_job_descriptions})

         # Remove the processed JSON file if it exists
        if os.path.exists(processed_file_path):
            os.remove(processed_file_path)

        return {"message": f"Successfully uploaded {len(processed_job_descriptions)} job descriptions."}

        #return {"message": f"Successfully uploaded {len(result.inserted_ids)} job descriptions."}

    except Exception as e:
        import traceback
        traceback.print_exc()  # print the exception traceback
        raise HTTPException(status_code=500, detail=f"Error uploading job descriptions: {str(e)}")
    

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)