import json
from Utils import extract_text_from_pdf
from Utils import generate_unique_id
from Utils import clean_string
import os
import re


class DataReader:

    def __init__(self, path_to_folder):
        self.path = path_to_folder
        self.data = extract_text_from_pdf(self.path)

    def create_json(self):
        self.parsed_data = {}
        self.parsed_data['name'] = self.path
        self.parsed_data['uuid'] = generate_unique_id()
        self.parsed_data['raw_text'] = self.data
        self.parsed_data['clean_text'] = clean_string(self.data)

        return self.parsed_data
