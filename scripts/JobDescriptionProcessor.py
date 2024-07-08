import json
import os.path
import pathlib #this module works with filesystem paths

from .parsers import ParseJobDesc, ParseResume #importing classes from the .parsers module
from .ReadPdf import read_single_pdf #importing the read_single_pdf function from the .ReadPdf module


READ_JOB_DESCRIPTION_FROM = "Data/JobDescription/" #define a constant for the directory path to read job descriptions from
SAVE_DIRECTORY = "Data/Processed/JobDescription" #define a constant for the directory path to save processed files


class JobDescriptionProcessor:
    def __init__(self, input_file):
        """

            Initializes ann instance of JobDescrptionProcessor with input_file
            :param input_file: the path to the file containing the job descriptions
            Constructs inut_file_name by joining READ_JOB_DECRIPTION_FROM and input_file
            :return: None

        """
        self.input_file = input_file #initialize instance variable input_file with the input parameter
        #self.input_file_name = os.path.join(READ_JOB_DESCRIPTION_FROM + self.input_file) #construct full path to input file using os.path.join
        self.input_file_name=self.input_file

    def process(self) -> bool:
        """
            Tries to process the job description:
            calls _read_resumes() to read and parse resume data
            calls _write_jason_file() to save parsed resume data as JSON
            Returns True if successful, otherwise catches and prints any exceptions, returning False
        """
        try:
            resume_dict = self._read_resumes() #call _read_resumes() method to read and parse resume data
            saved_file_name =self._write_json_file(resume_dict) #call _write_json_file() method to save parsed resume data as JSON
            return saved_file_name
        except Exception as e:
            print(f"An error occurred: {str(e)}")
            return False

    def _read_resumes(self) -> dict:
        """
        Reads the resumes from the input file and parses them using ParseResume returning the JSON representation
        """
        data = read_single_pdf(self.input_file_name) #Read the pdf file specified by input_file_name
        output = ParseResume(data).get_JSON() #Parse data using ParseResume class and get JSON representation
        return output

    def _read_job_desc(self) -> dict:
        """
           Reads the job descriptions from the input file and parses them using ParseJobDesc returning the JSON representation
        """
        data = read_single_pdf(self.input_file_name)  #Read the pdf file specified by input_file_name
        output = ParseJobDesc(data).get_JSON() #Parse data using ParseJobDesc class and get JSON reoresentaion
        return output

    def _write_json_file(self, resume_dictionary: dict):
        """
            Writes the parsed resume data to a JSON file

            Constructs file_name using the input file name anf unique_id from resume_dictionary
            Constructs save_directory_name using pathlib.Path to specify the full path to save the JSON file.
            Converts resume_dictionnary to JSON format (json.dumps()) with sorted keys and indention.
            Opens save_directory_name for writing ("w+"mose),writes the JSON data jason_object to the file.
        """
        file_name = str(
            "JobDescription-" #prefix for the JSON file name
            + pathlib.Path(self.input_file).stem #add input file name to the file name
            + resume_dictionary["unique_id"] #add unique_id from resume_dictionnary to the file name
            + ".json" #file extension for JSON file
        )
        save_directory_name = pathlib.Path(SAVE_DIRECTORY) / file_name #construct full path to save directory and file name
        json_object = json.dumps(resume_dictionary, sort_keys=True, indent=14) #convert resume_dictionnary to JSON with sorting and indentation
        with open(save_directory_name, "w+") as outfile: #open file for writing
            outfile.write(json_object) #Write JSON data to the file
        return save_directory_name
