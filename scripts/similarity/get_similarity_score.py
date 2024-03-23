import json
import logging
import os

import cohere
import yaml
from qdrant_client import QdrantClient, models
from qdrant_client.http.models import Batch

from scripts.utils.logger import get_handlers, init_logging_config

init_logging_config(basic_log_level=logging.INFO)
# Get the logger
logger = logging.getLogger(__name__)

# Set the logging level
logger.setLevel(logging.INFO)

stderr_handler, file_handler = get_handlers()


def find_path(folder_name):
    """
    Find the path of a folder with the given name in the current directory or its parent directories.

    Args:
        folder_name (str): The name of the folder to search for.

    Returns:
        str: The path of the folder if found.

    Raises:
        ValueError: If the folder with the given name is not found in the current directory or its parent directories.
    """
    curr_dir = os.getcwd()
    while True:
        if folder_name in os.listdir(curr_dir):
            return os.path.join(curr_dir, folder_name)
        else:
            parent_dir = os.path.dirname(curr_dir)
            if parent_dir == "/":
                break
            curr_dir = parent_dir
    raise ValueError(f"Folder '{folder_name}' not found.")


cwd = find_path("Resume-Matcher")
READ_RESUME_FROM = os.path.join(cwd, "Data", "Processed", "Resumes")
READ_JOB_DESCRIPTION_FROM = os.path.join(cwd, "Data", "Processed", "JobDescription")
config_path = os.path.join(cwd, "scripts", "similarity")


def read_config(filepath):
    """
    Reads a configuration file in YAML format and returns the parsed configuration.

    Args:
        filepath (str): The path to the configuration file.

    Returns:
        dict: The parsed configuration as a dictionary.

    Raises:
        FileNotFoundError: If the configuration file is not found.
        yaml.YAMLError: If there is an error parsing the YAML in the configuration file.
        Exception: If there is an error reading the configuration file.

    """
    try:
        with open(filepath) as f:
            config = yaml.safe_load(f)
        return config
    except FileNotFoundError as e:
        logger.error(f"Configuration file {filepath} not found: {e}")
    except yaml.YAMLError as e:
        logger.error(
            f"Error parsing YAML in configuration file {filepath}: {e}", exc_info=True
        )
    except Exception as e:
        logger.error(f"Error reading configuration file {filepath}: {e}")
    return None


def read_doc(path):
    """
    Read a JSON file and return its contents as a dictionary.

    Args:
        path (str): The path to the JSON file.

    Returns:
        dict: The contents of the JSON file as a dictionary.

    Raises:
        Exception: If there is an error reading the JSON file.
    """
    with open(path) as f:
        try:
            data = json.load(f)
        except Exception as e:
            logger.error(f"Error reading JSON file: {e}")
            data = {}
    return data


# This class likely performs searches based on quadrants.
class QdrantSearch:
    def __init__(self, resumes, jd):
        """
        The function initializes various parameters and clients for processing resumes and job
        descriptions.

        Args:
          resumes: The `resumes` parameter in the `__init__` method seems to be a list of resumes that
        is passed to the class constructor. It is likely used within the class for some processing or
        analysis related to resumes. If you have any specific questions or need further assistance with
        this parameter or any
          jd: The `jd` parameter in the `__init__` method seems to represent a job description. It is
        likely used as input to compare against the resumes provided in the `resumes` parameter. The job
        description is probably used for matching and analyzing against the resumes in the system.
        """
        config = read_config(config_path + "/config.yml")
        self.cohere_key = config["cohere"]["api_key"]
        self.qdrant_key = config["qdrant"]["api_key"]
        self.qdrant_url = config["qdrant"]["url"]
        self.resumes = resumes
        self.jd = jd
        self.cohere = cohere.Client(self.cohere_key)
        self.collection_name = "resume_collection_name"
        self.qdrant = QdrantClient(
            url=self.qdrant_url,
            api_key=self.qdrant_key,
        )

        vector_size = 4096
        print(f"collection name={self.collection_name}")
        self.qdrant.recreate_collection(
            collection_name=self.collection_name,
            vectors_config=models.VectorParams(
                size=vector_size, distance=models.Distance.COSINE
            ),
        )

        self.logger = logging.getLogger(self.__class__.__name__)

        self.logger.addHandler(stderr_handler)
        self.logger.addHandler(file_handler)

    def get_embedding(self, text):
        """
        The function `get_embedding` takes a text input, generates embeddings using the Cohere API, and
        returns the embeddings as a list of floats along with the length of the embeddings.

        Args:
          text: The `text` parameter in the `get_embedding` function is a string that represents the
        text for which you want to generate embeddings. This text will be passed to the Cohere API to
        retrieve the embeddings for further processing.

        Returns:
          The `get_embedding` function returns a tuple containing two elements:
        1. A list of floating-point numbers representing the embeddings of the input text.
        2. The length of the embeddings list.
        """
        try:
            embeddings = self.cohere.embed([text], "large").embeddings
            return list(map(float, embeddings[0])), len(embeddings[0])
        except Exception as e:
            self.logger.error(f"Error getting embeddings: {e}", exc_info=True)

    def update_qdrant(self):
        """
        This Python function updates vectors and corresponding metadata in a Qdrant collection based on
        resumes.
        """
        vectors = []
        ids = []
        for i, resume in enumerate(self.resumes):
            vector, size = self.get_embedding(resume)
            vectors.append(vector)
            ids.append(i)
        try:
            self.qdrant.upsert(
                collection_name=self.collection_name,
                points=Batch(
                    ids=ids,
                    vectors=vectors,
                    payloads=[{"text": resume} for resume in self.resumes],
                ),
            )
        except Exception as e:
            self.logger.error(
                f"Error upserting the vectors to the qdrant collection: {e}",
                exc_info=True,
            )

    def search(self):
        """
        The `search` function retrieves search results based on a query vector using a specified
        collection in a search engine.

        Returns:
          A list of dictionaries containing the text and score of the search results.
        """
        vector, _ = self.get_embedding(self.jd)

        hits = self.qdrant.search(
            collection_name=self.collection_name, query_vector=vector, limit=30
        )
        results = []
        for hit in hits:
            result = {"text": str(hit.payload)[:30], "score": hit.score}
            results.append(result)

        return results


def get_similarity_score(resume_string, job_description_string):
    """
    This Python function `get_similarity_score` calculates the similarity score between a resume and a
    job description using QdrantSearch.

    Args:
      resume_string: The `get_similarity_score` function seems to be using a `QdrantSearch` class to
    calculate the similarity score between a resume and a job description. The `resume_string` parameter
    likely contains the text content of a resume, while the `job_description_string` parameter contains
    the text content of
      job_description_string: The `job_description_string` parameter is a string containing the job
    description for which you want to calculate the similarity score with a given resume. This
    description typically includes details about the job requirements, responsibilities, qualifications,
    and skills needed for the position. The function `get_similarity_score` takes this job description

    Returns:
      The function `get_similarity_score` returns the search result obtained from comparing a resume
    string with a job description string using a QdrantSearch object.
    """
    logger.info("Started getting similarity score")
    qdrant_search = QdrantSearch([resume_string], job_description_string)
    qdrant_search.update_qdrant()
    search_result = qdrant_search.search()
    logger.info("Finished getting similarity score")
    return search_result


if __name__ == "__main__":
    # To give your custom resume use this code
    resume_dict = read_config(
        READ_RESUME_FROM
        + "/Resume-bruce_wayne_fullstack.pdf4783d115-e6fc-462e-ae4d-479152884b28.json"
    )
    job_dict = read_config(
        READ_JOB_DESCRIPTION_FROM
        + "/JobDescription-job_desc_full_stack_engineer_pdf4de00846-a4fe-4fe5-a4d7"
        "-2a8a1b9ad020.json"
    )
    resume_keywords = resume_dict["extracted_keywords"]
    job_description_keywords = job_dict["extracted_keywords"]

    resume_string = " ".join(resume_keywords)
    jd_string = " ".join(job_description_keywords)
    final_result = get_similarity_score(resume_string, jd_string)
    for r in final_result:
        print(r)
