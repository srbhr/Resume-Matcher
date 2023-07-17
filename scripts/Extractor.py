import re
import urllib.request
import spacy
from scripts.utils.Utils import TextCleaner


# Load the English model
nlp = spacy.load('en_core_web_sm')


RESUME_SECTIONS = [
    'Contact Information',
    'Objective',
    'Summary',
    'Education',
    'Experience',
    'Skills',
    'Projects',
    'Certifications',
    'Licenses',
    'Awards',
    'Honors',
    'Publications',
    'References',
    'Technical Skills',
    'Computer Skills',
    'Programming Languages',
    'Software Skills',
    'Soft Skills',
    'Language Skills',
    'Professional Skills',
    'Transferable Skills',
    'Work Experience',
    'Professional Experience',
    'Employment History',
    'Internship Experience',
    'Volunteer Experience',
    'Leadership Experience',
    'Research Experience',
    'Teaching Experience'
]


class DataExtractor:
    """
    A class for extracting various types of data from text.
    """

    def __init__(self, raw_text: str):
        """
        Initialize the DataExtractor object.

        Args:
            raw_text (str): The raw input text.
        """

        self.text = raw_text
        self.clean_text = TextCleaner.clean_text(self.text)
        self.doc = nlp(self.clean_text)

    def extract_links(self):
        """
        Find links of any type in a given string.

        Args:
            text (str): The string to search for links.

        Returns:
            list: A list containing all the found links.
        """
        link_pattern = r'\b(?:https?://|www\.)\S+\b'
        links = re.findall(link_pattern, self.text)
        return links

    def extract_links_extended(self):
        """
        Extract links of all kinds (HTTP, HTTPS, FTP, email, www.linkedin.com,
          and github.com/user_name) from a webpage.

        Args:
            url (str): The URL of the webpage.

        Returns:
            list: A list containing all the extracted links.
        """
        links = []
        try:
            response = urllib.request.urlopen(self.text)
            html_content = response.read().decode('utf-8')
            pattern = r'href=[\'"]?([^\'" >]+)'
            raw_links = re.findall(pattern, html_content)
            for link in raw_links:
                if link.startswith(('http://', 'https://', 'ftp://', 'mailto:',
                                    'www.linkedin.com', 'github.com/', 'twitter.com')):
                    links.append(link)
        except Exception as e:
            print(f"Error extracting links: {str(e)}")
        return links

    def extract_names(self):
        """Extracts and returns a list of names from the given 
        text using spaCy's named entity recognition.

        Args:
            text (str): The text to extract names from.

        Returns:
            list: A list of strings representing the names extracted from the text.
        """
        names = [ent.text for ent in self.doc.ents if ent.label_ == 'PERSON']
        return names

    def extract_emails(self):
        """
        Extract email addresses from a given string.

        Args:
            text (str): The string from which to extract email addresses.

        Returns:
            list: A list containing all the extracted email addresses.
        """
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'
        emails = re.findall(email_pattern, self.text)
        return emails

    def extract_phone_numbers(self):
        """
        Extract phone numbers from a given string.

        Args:
            text (str): The string from which to extract phone numbers.

        Returns:
            list: A list containing all the extracted phone numbers.
        """
        phone_number_pattern = r'^(\+\d{1,3})?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$'
        phone_numbers = re.findall(phone_number_pattern, self.text)
        return phone_numbers

    def extract_experience(self):
        """
        Extract experience from a given string. It does so by using the Spacy module.

        Args:
            text (str): The string from which to extract experience.

        Returns:
            str: A string containing all the extracted experience.
        """
        experience_section = []
        in_experience_section = False

        for token in self.doc:
            if token.text in RESUME_SECTIONS:
                if token.text == 'Experience' or 'EXPERIENCE' or 'experience':
                    in_experience_section = True
                else:
                    in_experience_section = False

            if in_experience_section:
                experience_section.append(token.text)

        return ' '.join(experience_section)

    def extract_position_year(self):
        """
            Extract position and year from a given string.

            Args:
                text (str): The string from which to extract position and year.

            Returns:
                list: A list containing the extracted position and year.
        """
        position_year_search_pattern = r"(\b\w+\b\s+\b\w+\b),\s+(\d{4})\s*-\s*(\d{4}|\bpresent\b)"
        position_year = re.findall(
            position_year_search_pattern, self.text)
        return position_year

    def extract_particular_words(self):
        """
        Extract nouns and proper nouns from the given text.

        Args:
            text (str): The input text to extract nouns from.

        Returns:
            list: A list of extracted nouns.
        """
        pos_tags = ['NOUN', 'PROPN']
        nouns = [token.text for token in self.doc if token.pos_ in pos_tags]
        return nouns

    def extract_entities(self):
        """
        Extract named entities of types 'GPE' (geopolitical entity) and 'ORG' (organization) from the given text.

        Args:
            text (str): The input text to extract entities from.

        Returns:
            list: A list of extracted entities.
        """
        entity_labels = ['GPE', 'ORG']
        entities = [
            token.text for token in self.doc.ents if token.label_ in entity_labels]
        return list(set(entities))
