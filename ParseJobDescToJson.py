import json
from Extractor import DataExtractor
from Utils import TextCleaner, CountFrequency, generate_unique_id
from KeytermsExtraction import KeytermExtractor


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

        file_name = str(
            "Job-Desc-" + job_desc_dictionary["unique_id"] + ".json")

        json_object = json.dumps(
            job_desc_dictionary, sort_keys=True, indent=14)

        with open(file_name, "w") as outfile:
            outfile.write(json_object)

        return job_desc_dictionary
