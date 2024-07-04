import json
import os
import os.path
import pathlib

from scripts.Extractor import DataExtractor
from scripts.KeytermsExtraction import KeytermExtractor
from scripts.utils.Utils import CountFrequency, TextCleaner, generate_unique_id

SAVE_DIRECTORY = "../../Data/Processed/Resumes"


class ParseResume:

    def __init__(self, resume: str):
        self.resume_data = resume
        self.clean_data = TextCleaner.clean_text(self.resume_data) #clean the resume text using the TextCleaner
        self.entities = DataExtractor(self.clean_data).extract_entities() #extract named entitiess from the cleaned text
        self.name = DataExtractor(self.clean_data[:30]).extract_names() #extract the name from the first 30 characters of the cleaned text
        self.experience = DataExtractor(self.clean_data).extract_experience() #extract the experience section from the original resume text
        self.emails = DataExtractor(self.resume_data).extract_emails() #extract email adress from the original resume text
        self.phones = DataExtractor(self.resume_data).extract_phone_numbers() #extract phone number from the original resume text
        self.years = DataExtractor(self.clean_data).extract_position_year() #extract position and year informations from the cleaned text
        self.key_words = DataExtractor(self.clean_data).extract_particular_words() # extract particular words (noun and proper nouns) from the cleaned text
        self.pos_frequencies = CountFrequency(self.clean_data).count_frequency() #counts the frequency of parts of speech in the cleaned text
        self.keyterms = KeytermExtractor(self.clean_data).get_keyterms_based_on_sgrank() #extraction of key terms from the cleaned text using SGRank algorithm
        self.bi_grams = KeytermExtractor(self.clean_data).bi_gramchunker() #extraction of bograms
        self.tri_grams = KeytermExtractor(self.clean_data).tri_gramchunker() #extraction of trigrams

    def get_JSON(self) -> dict:
        """
        Returns a dictionary of resume data.
        """
        resume_dictionary = {
            "unique_id": generate_unique_id(),
            "resume_data": self.resume_data,
            "clean_data": self.clean_data,
            "entities": self.entities,
            "extracted_keywords": self.key_words,
            "keyterms": self.keyterms,
            "name": self.name,
            "experience": self.experience,
            "emails": self.emails,
            "phones": self.phones,
            "years": self.years,
            "bi_grams": str(self.bi_grams),
            "tri_grams": str(self.tri_grams),
            "pos_frequencies": self.pos_frequencies,
        }

        return resume_dictionary
