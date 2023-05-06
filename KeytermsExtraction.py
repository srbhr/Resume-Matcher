import textacy
from textacy import extract


class KeytermsExtraction:

    def __init__ (self, raw_text:str):
        self.raw_input_text = raw_text
        self.textacy_nlp_doc = textacy.make_spacy_doc(self.raw_input_text, lang="en_core_web_sm")

    #  TextRank: Bringing order into texts. Association for Computational Linguistics.
    def get_keyterms_based_on_textrank(self, top_values=15):
        return list(extract.keyterms.textrank(self.textacy_nlp_doc, normalize="lemma", topn=top_values))

    # “SGRank: Combining Statistical and Graphical Methods to Improve the State of the Art
    # in Unsupervised Keyphrase Extraction.” Lexical and Computational Semantics (* SEM 2015) (2015): 117.
    def get_keyterms_based_on_sgrank(self, top_values=15):
        return list(extract.keyterms.sgrank(self.textacy_nlp_doc, normalize="lemma", topn=top_values))

    # sCAKE: Semantic Connectivity Aware Keyword Extraction. Information Sciences. 477.
    # https://arxiv.org/abs/1811.10831v1
    def get_keyterms_based_on_scake(self, top_values=15):
        return list(extract.keyterms.scake(self.textacy_nlp_doc, normalize="lemma", topn=top_values))

    # A Text Feature Based Automatic Keyword Extraction Method for Single Documents.
    # Advances in Information Retrieval. ECIR 2018. Lecture Notes in Computer Science, vol 10772, pp. 684-691.
    def get_keyterms_based_on_yake(self, top_values=15):
        return list(extract.keyterms.yake(self.textacy_nlp_doc, normalize="lemma", topn=top_values))
