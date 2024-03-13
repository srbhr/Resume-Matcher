import json
import logging
import os
from typing import List

import yaml
from qdrant_client import QdrantClient

logging.basicConfig(
    filename='app_similarity_score.log',
    filemode='w',
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

console_handler = logging.StreamHandler()
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
console_handler.setFormatter(formatter)
console_handler.setLevel(logging.DEBUG)

file_handler = logging.FileHandler("app_similarity_score.log")
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(formatter)

logger.addHandler(file_handler)
logger.addHandler(console_handler)


def find_path(folder_name):
    curr_dir = os.getcwd()
    while True:
        if folder_name in os.listdir(curr_dir):
            return os.path.join(curr_dir, folder_name)
        else:
            parent_dir = os.path.dirname(curr_dir)
            if parent_dir == '/':
                break
            curr_dir = parent_dir
    raise ValueError(f"Folder '{folder_name}' not found.")


cwd = find_path('Resume-Matcher')
READ_RESUME_FROM = os.path.join(cwd, 'Data', 'Processed', 'Resumes')
READ_JOB_DESCRIPTION_FROM = os.path.join(cwd, 'Data', 'Processed', 'JobDescription')
config_path = os.path.join(cwd, "scripts", "similarity")


def read_config(filepath):
    try:
        with open(filepath) as f:
            config = yaml.safe_load(f)
        return config
    except FileNotFoundError as e:
        logger.error(f"Configuration file {filepath} not found: {e}")
    except yaml.YAMLError as e:
        logger.error(f"Error parsing YAML in configuration file {filepath}: {e}", exc_info=True)
    except Exception as e:
        logger.error(f"Error reading configuration file {filepath}: {e}")
    return None


def read_doc(path):
    with open(path) as f:
        try:
            data = json.load(f)
        except Exception as e:
            logger.error(f'Error reading JSON file: {e}')
            data = {}
    return data


def get_score(resume_string, job_description_string):
    logger.info("Started getting similarity score")

    documents: List[str] = [resume_string]
    client = QdrantClient(":memory:")
    client.set_model("BAAI/bge-base-en")

    client.add(
        collection_name="demo_collection",
        documents=documents,
    )

    search_result = client.query(
        collection_name="demo_collection",
        query_text=job_description_string
    )
    logger.info("Finished getting similarity score")
    return search_result


if __name__ == "__main__":
    # To give your custom resume use this code
    resume_dict = read_config(
        READ_RESUME_FROM + "/Resume-alfred_pennyworth_pm.pdf83632b66-5cce-4322-a3c6-895ff7e3dd96.json")
    job_dict = read_config(
        READ_JOB_DESCRIPTION_FROM + "/JobDescription-job_desc_product_manager.pdf6763dc68-12ff-4b32-b652-ccee195de071.json")
    resume_keywords = resume_dict["extracted_keywords"]
    job_description_keywords = job_dict["extracted_keywords"]

    resume_string = ' '.join(resume_keywords)
    jd_string = ' '.join(job_description_keywords)
    final_result = get_score(resume_string, jd_string)
    for r in final_result:
        print(r.score)
