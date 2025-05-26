import json
import os
import pathlib
import re
from collections import defaultdict

from scripts.Extractor import DataExtractor
from scripts.KeytermsExtraction import KeytermExtractor
from scripts.utils.Utils import CountFrequency, TextCleaner, generate_unique_id

SAVE_DIRECTORY = "../../Data/Processed/JobDescription"


class ParseJobDesc:

    def __init__(self, job_desc: str):
        self.job_desc_data = job_desc
        self.clean_data = TextCleaner.clean_text(self.job_desc_data)
        self.entities = DataExtractor(self.clean_data).extract_entities()
        self.key_words = DataExtractor(self.clean_data).extract_particular_words()
        self.pos_frequencies = CountFrequency(self.clean_data).count_frequency()
        self.keyterms = KeytermExtractor(self.clean_data).get_keyterms_based_on_sgrank()
        self.bi_grams = KeytermExtractor(self.clean_data).bi_gramchunker()
        self.tri_grams = KeytermExtractor(self.clean_data).tri_gramchunker()
        self.experience_sections = self.group_experience_sections()

    def group_experience_sections(self):
        """
        Group the job description text based on experience segments like company names and responsibilities.
        """
        experience_dict = defaultdict(list)

        # Regex pattern to detect work experience sections
        experience_patterns = [
            r"Worked at ([A-Za-z\s]+)",
            r"Experience at ([A-Za-z\s]+)",
            r"Previous role at ([A-Za-z\s]+)",
        ]

        lines = self.clean_data.split("\n")
        current_company = None

        for line in lines:
            for pattern in experience_patterns:
                match = re.search(pattern, line)
                if match:
                    current_company = match.group(1).strip()
                    experience_dict[current_company] = []
            if current_company:
                experience_dict[current_company].append(line)

        return {company: " ".join(details) for company, details in experience_dict.items()}

    def get_JSON(self) -> dict:
        """
        Returns a dictionary of job description data with grouped experience sections.
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
            "pos_frequencies": self.pos_frequencies,
            "experience_sections": self.experience_sections,
        }

        return job_desc_dictionary