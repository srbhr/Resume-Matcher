import json
import os.path
import pathlib

from .parsers import ParseJobDesc, ParseResume #import ParsejobDEsc and ParseResume clzsses from .parsers module
from .ReadPdf import read_single_pdf #import read_singme_pdf function from .ReadPdf module

#READ_RESUME_FROM = "Data/Resumes/" #define a constant for the directory path to read resume from
SAVE_DIRECTORY = "Data/Processed/Resumes" #define a constant for the directory path to save processed resumes


class ResumeProcessor:
    def __init__(self, input_file):
        self.input_file = input_file #initialize instance variable input_file with the input parametre
        #self.input_file_name = os.path.join(READ_RESUME_FROM + self.input_file) #construct full path to input file using os.path.join
        self.input_file_name=self.input_file


    def process(self):
        try:
            resume_dict = self._read_resumes()
            saved_file_name = self._write_json_file(resume_dict)
            return saved_file_name
        except Exception as e:
            print(f"An error occurred: {str(e)}")
            return None, None

    def _read_resumes(self) -> dict:
        data = read_single_pdf(self.input_file_name) #read Pdf file specificated by input _file_name
        output = ParseResume(data).get_JSON() #parse data using ParseResume class and get JSON representation
        return output

    def _read_job_desc(self) -> dict:
        data = read_single_pdf(self.input_file_name) # read pdf file specified by input_file_name
        output = ParseJobDesc(data).get_JSON() #parse data using ParseJobDesc class and get JSON representation
        return output

    def _write_json_file(self, resume_dictionary: dict):
        file_name = str(
            "Resume-" #prefix for the JSON file
            + pathlib.Path(self.input_file).stem #add input file name to the file nmae
            + resume_dictionary["unique_id"] #add unique_id from resume_dictonnary
            + ".json" #file extention
        )
        save_directory_name = pathlib.Path(SAVE_DIRECTORY) / file_name #contruct full path to save directory and file name
        json_object = json.dumps(resume_dictionary, sort_keys=True, indent=14) #convert resume_dictionary to JSON format with sortingand indentation 
        with open(save_directory_name, "w+") as outfile: #open file for writing
            outfile.write(json_object) #write JSON data to the file
        return save_directory_name  # Return the file path as a string
