import re
def clean_string(text):
    # Remove emails
    text = re.sub(r'\S+@\S+', '', text)
    # Remove links
    text = re.sub(r'http\S+', '', text)
    # Remove new lines
    text = text.replace('\n', ' ')
    # remote phone numbers
    text = re.sub(
        r'^(\+\d{1,3})?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$', '', text)
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


def parse_string(text, keywords):
    data = {}
    for keyword in keywords:
        start_index = text.find(keyword)
        if start_index != -1:
            end_index = len(text)
            for next_keyword in keywords:
                next_index = text.find(
                    next_keyword, start_index + len(keyword))
                if next_index != -1 and next_index < end_index:
                    end_index = next_index
            data[keyword] = text[start_index + len(keyword):end_index].strip()
    return data
