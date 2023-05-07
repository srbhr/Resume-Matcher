import json
from Extractor import DataExtractor
from Utils import TextCleaner, EntityExtractor, generate_unique_id
from KeytermsExtraction import KeytermExtractor


class ParseResume:

    def __init__(self, resume: str):
        self.resume_data = resume
        self.clean_data = TextCleaner.clean_string(self.resume_data)
        self.entities = EntityExtractor.extract_entities(self.clean_data)
        self.keyterms = KeytermExtractor(
            self.clean_data, 7).get_keyterms_based_on_sgrank()
        self.name = DataExtractor(self.clean_data[:30]).extract_names()
        self.experience = DataExtractor(self.clean_data).extract_experience()
        self.emails = DataExtractor(self.resume_data).extract_emails()
        self.phones = DataExtractor(self.resume_data).extract_phone_numbers()
        self.years = DataExtractor(self.clean_data).extract_position_year()

    def get_JSON(self) -> dict:
        """
        Returns a dictionary of resume_data
        """
        resume_dictionary = {
            "resume_data": self.resume_data,
            "clean_data": self.clean_data,
            "entities": self.entities,
            "keyterms": self.keyterms,
            "name": self.name,
            "experience": self.experience,
            "emails": self.emails,
            "phones": self.phones,
            "years": self.years
        }

        json_object = json.dumps(resume_dictionary, sort_keys=True, indent=9)

        with open("resume.json", "w") as outfile:
            outfile.write(json_object)

        return resume_dictionary
