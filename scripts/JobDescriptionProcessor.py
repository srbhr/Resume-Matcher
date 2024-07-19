import json
import pathlib
from .parsers import ParseJobDesc, ParseResume  # Importing classes from .parsers module

SAVE_DIRECTORY = "Data/Processed/JobDescription"

class JobDescriptionProcessor:
    def __init__(self, input_text):
        """
        Initializes an instance of JobDescriptionProcessor with input_text.
        :param input_text: The job description text to process.
        :return: None
        """
        self.input_text = input_text

    def process(self) -> bool:
        """
        Tries to process the job description:
        - Calls _read_job_desc() to parse the job description text.
        - Calls _write_json_file() to save parsed data as JSON.
        Returns True if successful, otherwise catches and prints any exceptions, returning False.
        """
        try:
            job_desc_dict = self._read_job_desc()
            saved_file_name = self._write_json_file(job_desc_dict)
            return saved_file_name
        except Exception as e:
            print(f"An error occurred: {str(e)}")
            return False

    def _read_resumes(self) -> dict:
        """
        Reads the resumes from the input text and parses them using ParseResume, returning the JSON representation.
        """
        output = ParseResume(self.input_text).get_JSON()
        return output

    def _read_job_desc(self) -> dict:
        """
        Parses the job description text using ParseJobDesc, returning the JSON representation.
        """
        output = ParseJobDesc(self.input_text).get_JSON()
        return output

    def _write_json_file(self, data_dictionary: dict):
        """
        Writes the parsed data to a JSON file.
        Constructs the file name using the input text and a unique identifier from data_dictionary.
        Saves the JSON file to SAVE_DIRECTORY.
        """
        file_name = f"JobDescription-{hash(self.input_text)}.json"
        save_directory_name = pathlib.Path(SAVE_DIRECTORY) / file_name
        # Read additional data from processed job description JSON
        jd_annotated_text_content = f"Clean Data: {data_dictionary.get('clean_data', '')}, Extracted Keywords: {data_dictionary.get('extracted_keywords', [])}"
        jd_strings = " ".join(data_dictionary.get("extracted_keywords", []))

        # Add additional fields to data_dictionary
        data_dictionary["jd_annotated_text_content"] = jd_annotated_text_content
        data_dictionary["jd_strings"] = jd_strings

        # Update the json_object with the new data_dictionary
        json_object = json.dumps(data_dictionary, sort_keys=True, indent=4)

        with open(save_directory_name, "w+") as outfile:
            outfile.write(json_object)
        return save_directory_name