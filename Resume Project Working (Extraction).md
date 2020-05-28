# Resume Project Working (Extraction)

## Date and Relevant Keywords Extraction

- Extraction Of College Names (Based on Wildcards)
- Extraction Of School Names (Based on Wildcards)
- Extraction of Degree, And the Term Associated with it
- Some Extraction Based on Spacy's NER
- Some Extraction Based on Phrase Matching

## Cleaning of Text

- First Do extraction without Breaking the sentences

- Second remove the extracted words from the corpus

- Remove any cardinals, numbers, etc.

- Remove any non - useful word, and reduce the word to it's base form.

## Text Similarity

- Train a Tagger Model based on Stack Overflow's QnA Data, and use it to tag the subject.
- Train a model on Quora's Question Similarity Dataset and Use it on resumes.(Experimental)
- Try other Similarity Measures for accuracy

  