from qdrant_client import QdrantClient, models
from sentence_transformers import SentenceTransformer


class QdrantSearch:
    def __init__(self, api_key, documents, query_string):
        self.api_key = api_key
        self.documents = documents
        self.query_string = query_string
        # This is take from the examples provided at Qdrant
        self.url = "https://4248f066-5345-4bec-b3c3-ca343a34747e.us-east-1-0.aws.cloud.qdrant.io:6333"
        # There is a disk option is also available.
        self.qdrant = QdrantClient(":memory:")
        # This needs to be downloaded.
        self.encoder = SentenceTransformer('all-MiniLM-L6-v2')

    def init_qdrant_client(self):
        self.qdrant = QdrantClient(
            url=self.url,
            api_key=self.api_key,
        )
        self.qdrant.recreate_collection(
            collection_name="resume_matcher",
            vectors_config=models.VectorParams(
                size=self.encoder.get_sentence_embedding_dimension(),
                distance=models.Distance.COSINE
            )
        )
        self.qdrant.upload_records(
            collection_name="resume_matcher",
            records=[
                models.Record(
                    id=idx,
                    vector=self.encoder.encode(doc["resume"]).tolist(),
                    payload=doc
                ) for idx, doc in enumerate(self.documents)
            ]
        )

    def search_documents(self):
        """
        Note the query string provided needs to be a job description.
        """

        if not self.qdrant:
            self.init_qdrant_client()

        hits = self.qdrant.search(
            collection_name="resume_matcher",
            query_vector=self.encoder.encode(self.query_string).tolist(),
            limit=10
        )

        results = []
        for hit in hits:
            result = {
                'text': hit.payload,
                'query': self.query_string,
                'score': hit.score,
            }
            results.append(result)

        return results
