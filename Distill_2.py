import nltk
import spacy
import re

from nltk.tokenize import word_tokenize, sent_tokenize
from nltk.corpus import stopwords


class TextPreProcessing:

    def __int__(self, text):
        self.nlp = spacy.load('en_core_web_sm')
        self.stop_words = stopwords or stopwords.words('english')
        self.text = text

    def remove_stopwords(self, optional_params=False,
                         optional_words=None):
        if optional_words is None:
            optional_words = []
        if optional_params:
            self.stop_words.append([a for a in optional_words])
        return [word for word in self.text if word not in self.stop_words]

    def tokenize(self):
        # Removes any useless punctuations from the text
        text = re.sub(r'[^\w\s]', '', self.text)
        return word_tokenize(self.text)

    def lemmatize(self):
        # the input to this function is a list
        str_text = self.nlp(" ".join(self.text))
        lemmatized_text = []
        for word in str_text:
            lemmatized_text.append(word.lemma_)
        return lemmatized_text
