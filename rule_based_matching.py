# Making a script for spacy's Rule based Matching

import spacy
import re
from spacy.matcher import Matcher, PhraseMatcher

nlp = spacy.load('en_core_web_sm')

# Creating a Callback Pattern to return a string buffer is a pattern matches

def is_pattern(pattern, text):
	""" 
	This takes in spacy.matcher.Matcher patterns and if a pattern is found 
    it returns true.
	"""

	matches = matcher.add('',None,text)
	if len(matches) == 0:
		return False
	else:
		return True 
