def list_to_matrix(list_to_convert, num_columns):
    """Converts a list to a matrix of a suitable size.

    Args:
      list_to_convert: The list to convert.
      num_columns: The number of columns in the matrix.

    Returns:
      A matrix of the specified size, with the contents of the list.
    """

    matrix = []
    for i in range(len(list_to_convert) // num_columns):
        matrix.append(list_to_convert[i * num_columns:(i + 1) * num_columns])

    if len(list_to_convert) % num_columns > 0:
        matrix.append(list_to_convert[-(len(list_to_convert) % num_columns):])

    for i in range(len(matrix)):
        for j in range(len(matrix[i])):
            if matrix[i][j] is None:
                matrix[i][j] = ""

    return matrix


def split_list(list_to_split, chunk_size):
    """Splits a list into 3 equal lists.

    Args:
      list_to_split: The list to split.
      chunk_size: The size of each chunk.

    Returns:
      A list of chunk_size (+1 if over) lists, each of which is a chunk of the original list.
    """

    num_chunks = len(list_to_split) // chunk_size
    remainder = len(list_to_split) % chunk_size

    chunks = []
    for i in range(num_chunks):
        chunks.append(list_to_split[i * chunk_size:(i + 1) * chunk_size])

    if remainder > 0:
        chunks.append(list_to_split[num_chunks * chunk_size:])

    return chunks


def dirty_intersection(list1, list2):
    intersection = list(set(list1) & set(list2))
    remainder_1 = [x for x in list1 if x not in intersection]
    remainder_2 = [x for x in list2 if x not in intersection]

    output = pd.DataFrame({
        'elements': ["Common words", "Words unique to Resume", "Words unique to Job Description"],
        'values': [len(intersection), len(remainder_1), len(remainder_2)]
    }, index=[1, 2, 3])

    return output


def find_intersection_of_lists(list1, list2):
    """Finds the intersection of two lists and returns the result as a Pandas dataframe.

    Args:
      list1: The first list.
      list2: The second list.

    Returns:
      A Pandas dataframe with three columns: `intersection`, `remainder_1`, and `remainder_2`.
    """

    def max_of_three(a, b, c):
        max_value = a
        if b > max_value:
            max_value = b
        if c > max_value:
            max_value = c

        return max_value

    def fill_by_complements(num: int, list_to_fill: list):
        if (num > len(list_to_fill)):
            for i in range(num-len(list_to_fill)):
                list_to_fill.append(" ")

    intersection = list(set(list1) & set(list2))
    remainder_1 = [x for x in list1 if x not in intersection]
    remainder_2 = [x for x in list2 if x not in intersection]

    max_count = max_of_three(
        len(intersection), len(remainder_1), len(remainder_2))

    fill_by_complements(max_count, intersection)
    fill_by_complements(max_count, remainder_1)
    fill_by_complements(max_count, remainder_2)

    df = pd.DataFrame({
        'intersection': intersection,
        'remainder_1': remainder_1,
        'remainder_2': remainder_2
    })

    return df


def preprocess_text(text):
    """Preprocesses text using spacy.

    Args:
      text: The text to preprocess.

    Returns:
      A list of string tokens.
    """

    nlp = spacy.load("en_core_web_sm")
    doc = nlp(text)

    # Lemmatize words.
    tokens = [token.lemma_ for token in doc]

    # Remove stopwords.
    stopwords = spacy.lang.en.stop_words.STOP_WORDS
    tokens = [token for token in tokens if token not in stopwords]

    # Remove punctuation.
    punctuation = set(string.punctuation)
    tokens = [token for token in tokens if token not in punctuation]

    return tokens


# Usage

# resume_list = preprocess_text(resume['clean_data'])

# job_desc_list = preprocess_text(job_desc['clean_data'])

# df_data = find_intersection_of_lists(resume_list, job_desc_list)

# data_length = dirty_intersection(resume_list, job_desc_list)

# # data_length = data_length

# st.write(df_data)

# st.write(data_length)

# # st.write(px.data.tips())

# fig = px.pie(data_length, values='values', names='elements')
# st.write(fig)

# st.text(resume['clean_data'])


# fig = go.Figure(data=[go.Table(
#     header=dict(values=["Extracted Keywords"],
#                 fill_color='#1D267D',
#                 align='center', font=dict(color='white', size=16)),
#     cells=dict(values=[out for out in split_list(resume['extracted_keywords'], 25)],
#                fill_color='#19A7CE',
#                align='left'))])

# fig.update_layout(
#     uniformtext_minsize=13
# )
