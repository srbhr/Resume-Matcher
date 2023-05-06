def clean_string(text):
    # Remove emails
    text = re.sub(r'\S+@\S+', '', text)
    # Remove links
    text = re.sub(r'http\S+', '', text)
    # Remove new lines
    text = text.replace('\n', ' ')
    # remote phone numbers
    text = re.sub(r'^(\+\d{1,3})?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$', '', text)
    phone_pattern = r"\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}"
    text = re.sub(phone_pattern, '', text)
    return text


def clean_string_nltk(text):
    # Remove emails
    text = re.sub(r'\S+@\S+', '', text)
    # Remove links
    text = re.sub(r'http\S+', '', text)
    # Remove new lines
    text = text.replace('\n', ' ')

    # Tokenize the text
    words = word_tokenize(text)

    # Remove stop words
    stop_words = set(stopwords.words('english'))
    words = [word for word in words if word.lower() not in stop_words]

    # Join the words back into a string
    text = ' '.join(words)

    return text
