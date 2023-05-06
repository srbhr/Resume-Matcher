import string
import re


class PredefinedExtractor:

    def __init__(self, raw_text: str, keywords: list):
        self.raw_input_text = raw_text
        self.section_extraction_pattern = r"^\s*(Experience|Professional Experience|Education|Skills|Projects|Certificates)\s*$"
        self.phone_number_extraction_pattern = r"^(\+\d{1,3})?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$"
        self.position_year_search_pattern = r"(\b\w+\b\s+\b\w+\b),\s+(\d{4})\s*-\s*(\d{4})"
        self.custom_keywords_list = keywords

    def extract_keywords(self):
        pattern_dict = {keyword: re.compile(r'\b%s\b' % keyword, re.IGNORECASE) for keyword in
                        self.custom_keywords_list}
        matches = {}
        for keyword, pattern in pattern_dict.items():
            match = pattern.findall(self.raw_input_text)
            if match:
                matches[keyword] = match
        return matches

    def extract_sections(self) -> dict:
        sections = {}
        matches = re.finditer(self.section_extraction_pattern, self.raw_input_text, re.MULTILINE)
        start = 0
        for match in matches:
            section_text = self.raw_input_text[start:match.start()].strip()
            if section_text:
                section_name = match.group(1)
                sections[section_name] = section_text
            start = match.end()
            section_text = self.raw_input_text[start:].strip()
            if section_text:
                section_name = match.group(1)
                sections[section_name] = section_text
        return sections

    def custom_keywords_extraction(self, custom_keywords_dict: dict):
        """
        This is an experimental pipe, not to be used for now.
        """
        topics_dict = {'language': ['python', 'c++', 'java'], 'database': ['sql', 'mysql']}
        input_string = "I am proficient in Python, Java, and SQL."
        for topic, keywords in topics_dict.items():
            for keyword in keywords:
                keyword_matches = self.raw_input_text.lower().count(keyword)
                if keyword_matches > 0:
                    print(f"Match found for topic '{topic}': '{keyword}'")

