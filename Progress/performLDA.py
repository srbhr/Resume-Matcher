import gensim
import gensim.corpora as corpora


def get_list_of_words(document):
    Document = []
    for a in document:
        raw = a.split(" ")
        Document.append(raw)
    return Document


def LDA(document):
    id2word = corpora.Dictionary(document)
    corpus = [id2word.doc2bow(text) for text in document]
    lda_model = gensim.models.ldamodel.LdaModel(corpus=corpus, id2word=id2word, num_topics=5, random_state=100,
                                                update_every=1, chunksize=100, passes=50, alpha='auto', per_word_topics=True)
    return lda_model[corpus]


def format_topics_sentences(ldamodel=None, corpus=corpus, texts=Document):
    sent_topics_df = []
    for i, row_list in enumerate(ldamodel[corpus]):
        row = row_list[0] if ldamodel.per_word_topics else row_list
        row = sorted(row, key=lambda x: (x[1]), reverse=True)
        for j, (topic_num, prop_topic) in enumerate(row):
            if j == 0:
                wp = ldamodel.show_topic(topic_num)
                topic_keywords = ", ".join([word for word, prop in wp])
                sent_topics_df.append(
                    [i, int(topic_num), round(prop_topic, 4)*100, topic_keywords])
            else:
                break

    return(sent_topics_df)
