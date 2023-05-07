from uuid import uuid4
import re
import spacy

# Load the English model
nlp = spacy.load('en_core_web_md')

REGEX_PATTERNS = {
    'email_pattern': r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b',
    'phone_pattern': r"\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}",
    'link_pattern': r'\b(?:https?://|www\.)\S+\b'
}


def generate_unique_id():
    """
    Generate a unique ID and return it as a string.

    Returns:
        str: A string with a unique ID.
    """
    return str(uuid4())


nlp = spacy.load("en_core_web_sm")


class TextCleaner:
    """
    A class for cleaning a text by removing specific patterns.
    """

    def clean_string(text):
        """
        Clean the input text by removing specific patterns.

        Args:
            text (str): The input text to clean.

        Returns:
            str: The cleaned text.
        """
        for pattern in REGEX_PATTERNS:
            text = re.sub(REGEX_PATTERNS[pattern], '', text)
        return text


class NounExtractor:
    """
    A class for extracting nouns from a given text.
    """

    def extract_nouns(self, text):
        """
        Extract nouns and proper nouns from the given text.

        Args:
            text (str): The input text to extract nouns from.

        Returns:
            list: A list of extracted nouns.
        """
        doc = nlp(text)
        pos_tags = ['NOUN', 'PROPN']
        nouns = [token.text for token in doc if token.pos_ in pos_tags]
        return nouns


class EntityExtractor:
    """
    A class for extracting entities from a given text.
    """

    def extract_entities(text):
        """
        Extract named entities of types 'GPE' (geopolitical entity) and 'ORG' (organization) from the given text.

        Args:
            text (str): The input text to extract entities from.

        Returns:
            list: A list of extracted entities.
        """
        doc = nlp(text)
        entity_labels = ['GPE', 'ORG']
        entities = [
            token.text for token in doc.ents if token.label_ in entity_labels]
        return entities
