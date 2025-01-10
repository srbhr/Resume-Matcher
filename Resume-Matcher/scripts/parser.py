from resume_matcher.dataextractor.DataExtractor import DataExtractor
from resume_matcher.dataextractor.KeyTermExtractor import KeytermExtractor
from resume_matcher.dataextractor.TextCleaner import TextCleaner, CountFrequency
from resume_matcher.scripts.utils import generate_unique_id


class ParseDocumentToJson:
    def __init__(self, doc: str, doc_type: str):
        self.years = None
        self.phones = None
        self.emails = None
        self.experience = None
        self.name = None
        self.doc_data = doc
        self.doc_type = doc_type
        self.clean_data = TextCleaner.clean_text(self.doc_data)
        self.entities = DataExtractor(self.clean_data).extract_entities()
        self.key_words = DataExtractor(self.clean_data).extract_particular_words()
        self.pos_frequencies = CountFrequency(self.clean_data).count_frequency()
        self.keyterms = KeytermExtractor(self.clean_data).get_keyterms_based_on_sgrank()
        self.bi_grams = KeytermExtractor(self.clean_data).bi_gramchunker()
        self.tri_grams = KeytermExtractor(self.clean_data).tri_gramchunker()
        if self.doc_type == "resume":
            self.get_additional_data()

    def get_additional_data(self):
        self.name = DataExtractor(self.clean_data[:30]).extract_names()
        self.experience = DataExtractor(self.clean_data).extract_experience()
        self.emails = DataExtractor(self.doc_data).extract_emails()
        self.phones = DataExtractor(self.doc_data).extract_phone_numbers()
        self.years = DataExtractor(self.clean_data).extract_position_year()

    def get_JSON(self) -> dict:
        doc_dictionary = {
            "unique_id": generate_unique_id(),
            "doc_data": self.doc_data,
            "clean_data": self.clean_data,
            "entities": self.entities,
            "extracted_keywords": self.key_words,
            "keyterms": self.keyterms,
            "bi_grams": str(self.bi_grams),
            "tri_grams": str(self.tri_grams),
            "pos_frequencies": self.pos_frequencies,
        }
        if self.doc_type == "resume":
            doc_dictionary.update(
                {
                    "name": self.name,
                    "experience": self.experience,
                    "emails": self.emails,
                    "phones": self.phones,
                    "years": self.years,
                }
            )
        return doc_dictionary
