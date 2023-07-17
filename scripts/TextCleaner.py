import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
from nltk.stem import WordNetLemmatizer
import string


class TextCleaner:

    def __init__(self, raw_text):
        self.stopwords_set = set(stopwords.words(
            'english') + list(string.punctuation))
        self.lemmatizer = WordNetLemmatizer()
        self.raw_input_text = raw_text

    def clean_text(self) -> str:
        tokens = word_tokenize(self.raw_input_text.lower())
        tokens = [token for token in tokens if token not in self.stopwords_set]
        tokens = [self.lemmatizer.lemmatize(token) for token in tokens]
        cleaned_text = ' '.join(tokens)
        return cleaned_text
