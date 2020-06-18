# Making a script for spacy's Rule based Matching

import spacy
import re

nlp = spacy.load('en_core_web_sm')

# Creating a Callback Pattern to return a string buffer is a pattern matches

def match_pattern(pattern, text):
	""" 
	This takes in spacy.matcher.Matcher patterns and 
	"""

	matches = matcher.add('',None,text)
	if len(matches) == 0:
		return False
	else:
		return True
