from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException,Body
import os
import pathlib
import json
import pymongo
from pymongo import MongoClient
from bson.json_util import dumps
import pymongo.errors
from scripts import ResumeProcessor, JobDescriptionProcessor
import threading
from pydantic import BaseModel
from typing import Dict,List,Any
from scripts.similarity.get_score import *
from fastapi.openapi.utils import get_openapi

lock = threading.Lock()
app = FastAPI()


# Load environment variables from the .env file
load_dotenv()

# Optionally, generate custom OpenAPI schema
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="Resume Matcher API",
        version="1.0.0",
        description="An API for processing resumes and job descriptions, calculating similarity scores, and managing job data.",
        routes=app.routes,
    )
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi


class JobDescription(BaseModel):
    filename: str
    text_array: List[str]

# Connect to MongoDB
MONGODB_LOCAL_URI = os.getenv("MONGODB_LOCAL_URI")
client = MongoClient(MONGODB_LOCAL_URI)

db = client["resumes"]
jd_db = client.JobDescriptions
ss_db = client.SimilarityScores

TEMP_DIR_RESUME = os.getenv("TEMP_DIR_RESUME")
SAVE_DIRECTORY = os.getenv("SAVE_DIRECTORY")

TEMP_DIR_JOBDESCRIPTION = os.getenv("TEMP_DIR_JOBDESCRIPTION")
PROCESSED_JOBDESCRIPTION_DIR = os.getenv("PROCESSED_JOBDESCRIPTION_DIR")


def check_resume_existence(file_name):
    return db.resumes.find_one({"filename": file_name}) is not None

def save_resume_to_db(file_path, file_name, keyword_dict,resume_string):
    try:
        with open(file_path, "r") as f:
            json_data = json.load(f)

        # Add additional data to the JSON object
        json_data["keyword_dict"] = keyword_dict
        json_data["resume_string"] = resume_string

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

            
            # Check if the processed resume already exists in MongoDB
            if not check_resume_existence(processed_file_name):
                
                # If not exists, save it to MongoDB
                save_resume_to_db(processed_file_path, processed_file_name,keyword_dict,resume_string)
                os.remove(processed_file_path)  # Remove the processed file
                
                return processed_resume_json
            
            else:
                os.remove(processed_file_path)
                return processed_resume_json
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

@app.get("/retrieve_resume_string/{filename}")
async def retrieve_resume_string(filename: str):
    try:
        # Retrieve the resume from MongoDB
        resume_data = db.resumes.find_one({"filename": filename})
        if resume_data:
            return resume_data["resume_string"]
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

            # Check if the processed resume already exists in MongoDB
            if not check_resume_existence(processed_resume_name):
                
                # If not exists, save it to MongoDB
                save_resume_to_db(processed_resume_path, processed_resume_name,keyword_dict,resume_string)
                os.remove(processed_resume_path)  # Remove the processed file
                # Read the processed resume file content
            with open(processed_resume_path, "r", encoding="utf-8") as f:
                processed_resume_content = json.load(f)
            return {"filename": processed_resume_name, "resume_string": resume_string}

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

        return {"job_descriptions": processed_job_descriptions}

        #return {"message": f"Successfully uploaded {len(result.inserted_ids)} job descriptions."}

    except Exception as e:
        import traceback
        traceback.print_exc()  # print the exception traceback
        raise HTTPException(status_code=500, detail=f"Error uploading job descriptions: {str(e)}")

@app.get("/job_descriptions", response_model=List[List[str]])
async def get_job_descriptions_filenames_and_jd_string():
    try:
        job_descriptions_docs = list(jd_db.jobDescriptions.find({}))  # Fetch all documents from collection

        filenames = []
        jd_strings = []

        # Iterate over each document
        for job_desc_doc in job_descriptions_docs:
            job_descriptions = job_desc_doc.get('job_descriptions', [])
            # Iterate over each job description object in the array
            for job_description in job_descriptions:
                filename = job_description.get('filename')
                jd_strings_item = job_description.get('jd_strings')

                # Append filename and jd_strings_item to their respective lists
                if filename:
                    filenames.append(filename)
                else:
                    filenames.append('No filename found')
                
                if jd_strings_item:
                    jd_strings.append(jd_strings_item)
                else:
                    jd_strings.append('No jd_strings found')

        # Combine filenames and jd_strings into a list of lists
        combined_list = [filenames, jd_strings]
        
        return combined_list

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching job descriptions: {str(e)}")
    
@app.get("/job_descriptions_keyterms", response_model=List)
async def get_job_descriptions_keyterms():
    try:
        job_descriptions_docs = list(jd_db.jobDescriptions.find({}))  # Fetch all documents from collection

        keyterms_list = []

        # Iterate over each document
        for job_desc_doc in job_descriptions_docs:
            job_descriptions = job_desc_doc.get('job_descriptions', [])
            # Iterate over each job description object in the array
            for job_description in job_descriptions:
                keyterms = job_description.get('keyterms', [])
                for term in keyterms:
                    keyterms_list.append([term[0], term[1]])
                

        return keyterms_list

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching job descriptions key terms: {str(e)}")
    
# Function to ensure similarityscores collection exists
def ensure_similarityscores_collection():
    if "similarityscores" not in ss_db.list_collection_names():
        ss_db.create_collection("similarityscores")

@app.post("/calculate_similarity_score_2/")
async def calculate_similarity_score_2(data: Dict[str, str]):
    try:
        ensure_similarityscores_collection()

        # Insert job descriptions into MongoDB collection
        collection = ss_db.similarityscores
        
        # Process resume from path
        resume_data =await process_resume_from_path(data)
        resume_filename = resume_data["filename"]
        resume_strings = resume_data["resume_string"]
        
        # Get job descriptions from MongoDB
        job_descriptions =await get_job_descriptions_filenames_and_jd_string()

        # Ensure job_descriptions is a list containing filenames and jd_strings
        if len(job_descriptions) != 2:
            raise HTTPException(status_code=500, detail="Invalid response from get_job_descriptions_filenames_and_jd_string")

        filenames = job_descriptions[0]
        jd_strings = job_descriptions[1]

        # Calculate similarity scores
        similarity_scores = []
        for i in range(len(filenames)):  # Iterate over the length of filenames or jd_strings, assuming they are the same length
            job_filename = filenames[i]
            jd_string = jd_strings[i]
            result = get_score(resume_strings, jd_string)
            similarity_score = round(result[0].score * 100, 2)
            print(similarity_score)
            similarity_scores.append({
                    "job_description_filename": job_filename,
                    "similarity_score": similarity_score  # Round to two decimal places
                })

        collection.insert_one({
            "resume_filename": resume_filename,
            "similarity_scores": similarity_scores
        })
        return {
            "resume_filename": resume_filename,
            "similarity_scores": similarity_scores
        }
    
    except HTTPException as http_exc:
        print(f"HTTPException: {http_exc.detail}")
        raise
    except Exception as e:
        print(f"Exception: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculating similarity score: {str(e)}")

@app.post("/calculate_similarity_score/")
async def calculate_similarity_score(resume_file: UploadFile = File(...)):
    try:
        ensure_similarityscores_collection()

        # Insert job descriptions into MongoDB collection
        collection = ss_db.similarityscores
        
        # Process resume from path
        resume_data =process_ResumeToProcess(resume_file)
        resume_filename=resume_data["filename"]
        resume_keyterms = resume_data["keyterms"]
        resume_strings = resume_data["resume_string"]
        
        # Get job descriptions from MongoDB
        job_descriptions =await get_job_descriptions_filenames_and_jd_string()

        # Ensure job_descriptions is a list containing filenames and jd_strings
        if len(job_descriptions) != 2:
            raise HTTPException(status_code=500, detail="Invalid response from get_job_descriptions_filenames_and_jd_string")

        filenames = job_descriptions[0]
        jd_strings = job_descriptions[1]

        # Calculate similarity scores
        similarity_scores = []
        for i in range(len(filenames)):  # Iterate over the length of filenames or jd_strings, assuming they are the same length
            job_filename = filenames[i]
            jd_string = jd_strings[i]
            result = get_score(resume_strings, jd_string)
            similarity_score = round(result[0].score * 100, 2)
            print(similarity_score)
            similarity_scores.append({
                    "job_description_filename": job_filename,
                    "similarity_score": similarity_score  # Round to two decimal places
                })

        collection.insert_one({
            "resume_filename": resume_filename,
            "similarity_scores": similarity_scores
        })
        return resume_filename,resume_keyterms
    
    except HTTPException as http_exc:
        print(f"HTTPException: {http_exc.detail}")
        raise
    except Exception as e:
        print(f"Exception: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculating similarity score: {str(e)}")

@app.get("/similarity_scores/")
async def get_similarity_scores(resume_filename: str):
    try:
        # Query MongoDB for similarity scores based on resume filename
        result = ss_db.similarityscores.find_one({"resume_filename": resume_filename})
        
        if result:
            return result["similarity_scores"]
        else:
            raise HTTPException(status_code=404, detail=f"Resume filename '{resume_filename}' not found")
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching similarity scores: {str(e)}")


@app.post("/upload_job_descriptionsss/")
async def upload_job_descriptionsss(job_descriptions_str: str = Body(...)):
    try:
        # Ensure the jobDescriptions collection exists, create it if not
        if "jobDescriptions" not in jd_db.list_collection_names():
            jd_db.create_collection("jobDescriptions")

        # Parse the input string into a list of job descriptions
        job_descriptions = json.loads(job_descriptions_str)
        
        # Insert job descriptions into MongoDB collection
        collection = jd_db.jobDescriptions
        processed_job_descriptions = []

        # Iterate through each job description in the list
        for job_desc in job_descriptions:
            filename = job_desc["filename"]
            input_text = " ".join(job_desc["text_array"])
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

        return {"job_descriptions": processed_job_descriptions}

    except Exception as e:
        import traceback
        traceback.print_exc()  # print the exception traceback
        raise HTTPException(status_code=500, detail=f"Error uploading job descriptions: {str(e)}")

# Run the FastAPI application with Swagger UI
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8000, log_level="info", reload=True)
