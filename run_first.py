import json
import logging
from scripts.utils.ReadFiles import get_filenames_from_dir
from scripts.ResumeProcessor import ResumeProcessor
from scripts.JobDescriptionProcessor import JobDescriptionProcessor

logging.basicConfig(filename='app.log', filemode='w', level=logging.DEBUG,
                    format='%(name)s - %(levelname)s - %(message)s')

def read_json(filename):
    with open(filename) as f:
        data = json.load(f)
    return data

def process_files(directory_path, processor_class):
    try:
        file_names = get_filenames_from_dir(directory_path)
        logging.info(f'Reading from {directory_path} is now complete.')
    except:
        logging.error(f'There are no files present in {directory_path}.')
        logging.error('Exiting from the program.')
        logging.error(f'Please add files in the {directory_path} folder and try again.')
        exit(1)

    logging.info(f'Started processing files in {directory_path}.')
    for file in file_names:
        processor = processor_class(file)
        success = processor.process()
    logging.info(f'Processing of files in {directory_path} is now complete.')

if __name__ == "__main__":
    try:
        process_files("Data/Resumes", ResumeProcessor)
        process_files("Data/JobDescription", JobDescriptionProcessor)
        logging.info('Success! Run `streamlit run streamlit_second.py`')
    except Exception as e:
        logging.error(f'An error occurred: {str(e)}')
