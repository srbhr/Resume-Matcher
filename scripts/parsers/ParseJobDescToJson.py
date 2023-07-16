import json
import pathlib
from scripts.Extractor import DataExtractor
from scripts.utils.Utils import TextCleaner, CountFrequency, generate_unique_id
from scripts.KeytermsExtraction import KeytermExtractor
import os

SAVE_DIRECTORY = "../../Data/Processed/JobDescription"


class ParseJobDesc:

    def __init__(self, job_desc: str):
        self.job_desc_data = job_desc
        self.clean_data = TextCleaner.clean_text(
            self.job_desc_data)
        self.entities = DataExtractor(self.clean_data).extract_entities()
        self.key_words = DataExtractor(
            self.clean_data).extract_particular_words()
        self.pos_frequencies = CountFrequency(
            self.clean_data).count_frequency()
        self.keyterms = KeytermExtractor(
            self.clean_data).get_keyterms_based_on_sgrank()
        self.bi_grams = KeytermExtractor(self.clean_data).bi_gramchunker()
        self.tri_grams = KeytermExtractor(self.clean_data).tri_gramchunker()

    def get_JSON(self) -> dict:
        """
        Returns a dictionary of job description data.
        """
        job_desc_dictionary = {
            "unique_id": generate_unique_id(),
            "job_desc_data": self.job_desc_data,
            "clean_data": self.clean_data,
            "entities": self.entities,
            "extracted_keywords": self.key_words,
            "keyterms": self.keyterms,
            "bi_grams": str(self.bi_grams),
            "tri_grams": str(self.tri_grams),
            "pos_frequencies": self.pos_frequencies
        }

        return job_desc_dictionary
