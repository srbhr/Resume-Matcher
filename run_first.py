import json
import logging
import os

#importing the necessary classes and functions from the scripts module
from scripts import JobDescriptionProcessor, ResumeProcessor
from scripts.utils import get_filenames_from_dir, init_logging_config

#initialize the logging configuration
init_logging_config()

#DEfinition of the Paths for the resumes and job description
PROCESSED_RESUMES_PATH = "Data/Processed/Resumes"
PROCESSED_JOB_DESCRIPTIONS_PATH = "Data/Processed/JobDescription"


def read_json(filename):
    """
    Reads the json file and returns the data as a dictionary
    Args:
    filename: the name of the file to be read
    Returns:
    data: the data in the json file as a dictionary
    """
    with open(filename) as f:
        data = json.load(f) #loads the content of the file as a JSON object
    return data


def remove_old_files(files_path):
    """
    Removes all the files in the specific directory

    Args:
    files_path: the path of the directory to be cleaned
    """

    for filename in os.listdir(files_path): #list all the files in the directory
        try:
            file_path = os.path.join(files_path, filename) # Get the full path of the file

            if os.path.isfile(file_path): #checking id it's a file
                os.remove(file_path) #removes the file
        except Exception as e:
            logging.error(f"Error deleting {file_path}:\n{e}") #printing a message on the log if the deletion fails

    logging.info("Deleted old files from " + files_path) # printing a message on the log indicating successful deletion

#processing the resumes
logging.info("Started to read from Data/Resumes")
try:
    # Check if there are resumes present or not.
    # If present then parse it.
    remove_old_files(PROCESSED_RESUMES_PATH) #removing the old processed resumes

    file_names = get_filenames_from_dir("Data/Resumes")
    logging.info("Reading from Data/Resumes is now complete.")
except:
    # Exit the program if there are no resumes.
    logging.error("There are no resumes present in the specified folder.")
    logging.error("Exiting from the program.")
    logging.error("Please add resumes in the Data/Resumes folder and try again.")
    exit(1)

# Now after getting the file_names parse the resumes into a JSON Format.
logging.info("Started parsing the resumes.")
for file in file_names:
    processor = ResumeProcessor(file) # create a ResumeProcessor object
    success = processor.process()
logging.info("Parsing of the resumes is now complete.")

logging.info("Started to read from Data/JobDescription")
try:
    # Check if there are resumes present or not.
    # If present then parse it.
    remove_old_files(PROCESSED_JOB_DESCRIPTIONS_PATH) # remove old processed job description files

    file_names = get_filenames_from_dir("Data/JobDescription")
    logging.info("Reading from Data/JobDescription is now complete.")
except:
    # Exit the program if there are no resumes.
    logging.error("There are no job-description present in the specified folder.")
    logging.error("Exiting from the program.")
    logging.error("Please add resumes in the Data/JobDescription folder and try again.")
    exit(1)

# Now after getting the file_names parse the resumes into a JSON Format.
logging.info("Started parsing the Job Descriptions.")
for file in file_names:
    processor = JobDescriptionProcessor(file) # creation of a JobDEscriptionProcessor object
    success = processor.process()
logging.info("Parsing of the Job Descriptions is now complete.")
logging.info("Success now run `streamlit run streamlit_second.py`")

"""
    Removing old processing resumes before starting the new processing ensures that the directory for processed resumes only contains the latest processed files.

    benefits of this approach:
    1. Avoiding Confusion :It ensures that the directory for processed resumes only contains the latest processed files.
    2. Data Consistency: Ensures that only the most recent and relevant resumes are available in hte processed directory, maintaining cinsustency in the data.
    3. Storage management: Helps on managing the storage by deleting the unnecessary files, keeping the directory clean and optimized.
    4. Error Prevention: Minimizes the risks of processing errur due to outdated or irrelevant files being present in the processed directory.

    In conclusion the act of removing the old proccessed resumes/jobdecriptions ensures a clean slate for the new batch of resumes/jobdescriptions to be processed, leading to more reliable and accrurate results.
"""