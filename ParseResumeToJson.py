import json
from Extractor import DataExtractor
from Utils import TextCleaner, CountFrequency, generate_unique_id
from KeytermsExtraction import KeytermExtractor


class ParseResume:

    def __init__(self, resume: str):
        self.resume_data = resume
        self.clean_data = TextCleaner.clean_text(
            self.resume_data)
        self.entities = DataExtractor(self.clean_data).extract_entities()
        self.name = DataExtractor(self.clean_data[:30]).extract_names()
        self.experience = DataExtractor(self.clean_data).extract_experience()
        self.emails = DataExtractor(self.resume_data).extract_emails()
        self.phones = DataExtractor(self.resume_data).extract_phone_numbers()
        self.years = DataExtractor(self.clean_data).extract_position_year()
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
            "pos_frequencies": self.pos_frequencies
        }

        json_object = json.dumps(resume_dictionary, sort_keys=True, indent=14)

        with open("resume2.json", "w") as outfile:
            outfile.write(json_object)

        return resume_dictionary
