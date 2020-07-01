import spacy
from spacy.matcher import Matcher, PhraseMatcher
import re

nlp = spacy.load('en_core_web_md')

# Matcher object should share the same vocabulary as the whole document
matcher = Matcher(nlp.vocab)
