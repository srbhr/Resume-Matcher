import json
import os
import os.path
import pathlib

from .parser import ParseDocumentToJson
from .utils import read_single_pdf, find_path

cwd = find_path("Resume-Matcher")

READ_RESUME_FROM = os.path.join(cwd, "Data", "Resumes/")
SAVE_RESUME_TO = os.path.join(cwd, "Data", "Processed", "Resumes/")

READ_JOB_DESCRIPTION_FROM = os.path.join(cwd, "Data", "JobDescription/")
SAVE_JOB_DESCRIPTION_TO = os.path.join(cwd, "Data", "Processed", "JobDescription/")


class Processor:
    def __init__(self, input_file, file_type):
        self.input_file = input_file
        self.file_type = file_type
        if file_type == "resume":
            self.input_file_name = os.path.join(READ_RESUME_FROM + self.input_file)
        elif file_type == "job_description":
            self.input_file_name = os.path.join(
                READ_JOB_DESCRIPTION_FROM + self.input_file
            )

    def process(self) -> bool:
        try:
            data_dict = self._read_data()
            self._write_json_file(data_dict)
            return True
        except Exception as e:
            print(f"An error occurred: {str(e)}")
            return False

    def _read_data(self) -> dict:
        data = read_single_pdf(self.input_file_name)
        output = ParseDocumentToJson(data, self.file_type).get_JSON()
        return output

    def _write_json_file(self, data_dict: dict):
        file_name = str(
            f"{self.file_type}_" + self.input_file + data_dict["unique_id"] + ".json"
        )
        save_directory_name = None
        if self.file_type == "resume":
            save_directory_name = pathlib.Path(SAVE_RESUME_TO) / file_name
        elif self.file_type == "job_description":
            save_directory_name = pathlib.Path(SAVE_JOB_DESCRIPTION_TO) / file_name
        json_object = json.dumps(data_dict, sort_keys=True, indent=14)
        with open(save_directory_name, "w+") as outfile:
            outfile.write(json_object)
