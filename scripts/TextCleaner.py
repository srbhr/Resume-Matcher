import string

import nltk #import the NLTK (Natural Language Toolkit) library
from nltk.corpus import stopwords #import NLTK's stopwords corpus
from nltk.stem import WordNetLemmatizer #import NLTK's WordNet lemmatizer
from nltk.tokenize import word_tokenize #import MLTK's word tokenizer


class TextCleaner:

    def __init__(self, raw_text):
        self.stopwords_set = set(stopwords.words("english") + list(string.punctuation))
        #initialization for the stopwords_set with english stopwords and punctuation
        self.lemmatizer = WordNetLemmatizer() #initiamize WordNetLemmatizer from NLTK
        """
            what's a Lemmatize?
            Lemmatization is the process of grouping together the different inflected forms of a word so they
            can be analyzed as a single item. For example, running, runs, ran, and run
            
            it is very important in NLP because it helps normallize words so that different forms of the same wrod are treated as identical,
            symplifying the analysis and interpretation of text.

            In the NLTK library (Natural Language Toolkit) in Python, the WordNetLemmatizer class is commonly used for lemmatization.
            It uses WordNet, a lexical database of English, to map words to their lemmas based on their part of speech.
        """
        self.raw_input_text = raw_text # store the raw input text in an instance variable

    def clean_text(self) -> str:
        tokens = word_tokenize(self.raw_input_text.lower()) #Tokenize and convert text to lowercase
        tokens = [token for token in tokens if token not in self.stopwords_set] #removes stopwords and puntuation from tokens
        tokens = [self.lemmatizer.lemmatize(token) for token in tokens] #lemmatize tokens to their base form
        cleaned_text = " ".join(tokens) # Join tokens back into a cleaned text string
        return cleaned_text
