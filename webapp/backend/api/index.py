from fastapi import FastAPI, Depends, HTTPException
import json
from os.path import join, exists, abspath, dirname
import yaml
from ..scripts.service_keys import get_similarity_config_keys_values, update_yaml_config

from ..scripts.resume_processor import build_response
from ..schemas.resume_processor import (
    ResumeProcessorResponse,
    Job,
    ResumeProcessorRequest,
)

from ..scripts.files import save_file_upload, save_job_uploads_to_pdfs

app = FastAPI(
    title="Resume Matcher",
    description="APIs for Resume Matcher",
    version="0.1.0",
)


@app.post("/api/resume-processor", tags=["resume-processor"])
async def resume_processor(
    form_data: ResumeProcessorRequest = Depends(ResumeProcessorRequest.as_form),
) -> ResumeProcessorResponse:
    """
    Process a resume file and match it against a list of job descriptions.

    Args:
        form_data (ResumeProcessorRequest): The request data containing the resume file and list of job descriptions.

    Returns:
        ResumeProcessorResponse: The response containing the results (e.g. vector scores, common words, and suggested word edits) against each job description.
    """
    print(f"resume_processor() API request > form_data: {form_data}", "\n")

    # Get the file object
    resume_file = form_data.resume

    # Validate file type as PDF
    if resume_file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="File must be a PDF document")

    # Parse the jobs data as a JSON string
    jobs_data = json.loads(form_data.jobs)

    # Convert the jobs data to a list of Job objects
    jobs_list = [Job(**job) for job in jobs_data]

    # Save the resume file (PDF) to local file system
    save_file_upload(resume_file)

    # Save the job descriptions (PDFs) to local file system
    save_job_uploads_to_pdfs(jobs_list)

    # Build the response
    response = build_response(resume_file, jobs_list)

    return response


@app.get("/api/service-keys", tags=["get-service-keys"])
async def get_service_keys() -> dict[str, dict[str, str]]:
    """
    Returns the configuration keys and secrets required for the similarity script.

    Reads the configuration files and returns the keys and values as a dictionary.
    If saved secrets are available, they are returned for each configuration key, otherwise fallback to default placeholder value defined from master config.

    Returns:
        A flattened dictionary containing the configuration keys and values.
    """

    # Get the absolute path of the project's root directory
    ROOT_DIR = abspath(join(dirname(__file__), "..", "..", ".."))

    print("DEBUG", "ROOT_DIR:", ROOT_DIR)

    # Construct the paths to the config files using the root directory path
    file_path_config_definition = join(
        ROOT_DIR, "scripts", "similarity", "config.yml"
    )  # master config - definition of required keys - config should not be edited
    file_path_saved_secrets = join(
        ROOT_DIR, "scripts", "similarity", "config.local.yml"
    )  # saved secrets - config can be programmatically created / updated with actual secrets. Ignored from version control (.gitignore)

    try:
        # if master config definition file does not exist, raise a 404 not found error
        if not exists(file_path_config_definition):
            raise HTTPException(
                status_code=404,
                detail=f"Config definition file not found at path: {file_path_config_definition}",
            )

        # variable to hold an updated reference of stored (git ignored) secrets
        config_secrets_keys = {}

        # if saved secrets config file exists, read the file and update the config_secrets_keys variable with the saved secrets
        if exists(file_path_saved_secrets):
            with open(file_path_saved_secrets) as file:
                config_secrets = yaml.load(file, Loader=yaml.FullLoader)
                config_secrets_keys = get_similarity_config_keys_values(config_secrets)

        # read the master config file and update the config_keys vaiable with the master config keys
        with open(file_path_config_definition) as file:
            config = yaml.load(file, Loader=yaml.FullLoader)
            config_keys = get_similarity_config_keys_values(config)

            # and update any keys with saved secrets from the config_secrets_keys variable, otherwise fallback to default placeholder value defined from master config
            for key, value in config_secrets_keys.items():
                if key in config_keys:
                    config_keys[key] = value

            print(
                f"get_service_keys() API request > config_keys: {config_keys}",
                "\n",
            )

            # respond with the available required config keys and its saved secrets
            return {"config_keys": config_keys}
    except Exception as e:
        print("DEBUG", "Error retreiving service keys:", e)
        raise HTTPException(
            status_code=500, detail=f"Error retreiving service keys: {e}"
        )


@app.put("/api/service-keys", tags=["update-service-keys"])
async def update_service_keys(keys: dict[str, str]):
    """
    Update the service keys in the secret (git ignored) config file.

    Args:
        keys (dict[str, str]): A dictionary containing the service keys to be updated.

    Returns:
        dict: A dictionary containing a success message and the updated keys.
    """
    try:
        # Get the absolute path of the project's root directory
        ROOT_DIR = abspath(join(dirname(__file__), "..", "..", ".."))
        print("DEBUG", "ROOT_DIR:", ROOT_DIR)

        # define the path to the secret (git ignored) config file, which will hold the saved secrets (or placeholder values)
        file_path_writeable = join(
            ROOT_DIR, "scripts", "similarity", "config.local.yml"
        )

        # build a config file structured as a YAML dictionary, with the updated keys and value (secrets)
        config_local_secrets = update_yaml_config(keys)

        with open(file_path_writeable, "w") as file_write:
            # write the config key with secrets to (git ignored) secret config file
            yaml.dump(config_local_secrets, file_write)

            # respond with a success message and the updated keys
            return {"message": "Config file updated successfully", "keys": keys}
    except Exception as e:
        print("DEBUG", "Error updating service keys:", e)
        raise HTTPException(status_code=500, detail=f"Error updating service keys: {e}")
