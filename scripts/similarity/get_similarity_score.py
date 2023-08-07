import json
import os

import cohere
import yaml
from qdrant_client import QdrantClient, models
from qdrant_client.http.models import Batch


def find_path(folder_name):
    curr_dir = os.getcwd()
    while True:
        if folder_name in os.listdir(curr_dir):
            return os.path.join(curr_dir, folder_name)
        else:
            parent_dir = os.path.dirname(curr_dir)
            if parent_dir == '/':
                break
            curr_dir = parent_dir
    raise ValueError(f"Folder '{folder_name}' not found.")


cwd = find_path('Resume-Matcher')
READ_RESUME_FROM = os.path.join(cwd, 'Data', 'Processed', 'Resumes')
READ_JOB_DESCRIPTION_FROM = os.path.join(cwd, 'Data', 'Processed', 'JobDescription')
config_path = os.path.join(cwd, "scripts", "similarity")


def read_config(filepath):
    with open(filepath) as f:
        config = yaml.safe_load(f)
    return config


def read_doc(path):
    with open(path) as f:
        try:
            data = json.load(f)
        except Exception as e:
            print(f'Error reading JSON file: {e}')
            data = {}
    return data


class QdrantSearch:
    def __init__(self, resumes, jd):
        config = read_config(config_path + "/config.yml")
        self.cohere_key = config['cohere']['api_key']
        self.qdrant_key = config['qdrant']['api_key']
        self.qdrant_url = config['qdrant']['url']
        self.resumes = resumes
        self.jd = jd

        self.cohere = cohere.Client(self.cohere_key)

        self.qdrant = QdrantClient(
            url=self.qdrant_url,
            api_key=self.qdrant_key,
        )

        vector_size = 4096
        self.qdrant.recreate_collection(
            collection_name="collection_resume_matcher",
            vectors_config=models.VectorParams(
                size=vector_size,
                distance=models.Distance.COSINE
            )
        )

    def get_embedding(self, text):
        embeddings = self.cohere.embed([text], "large").embeddings
        return list(map(float, embeddings[0])), len(embeddings[0])

    def update_qdrant(self):
        vectors = []
        ids = []
        for i, resume in enumerate(self.resumes):
            vector, size = self.get_embedding(resume)
            vectors.append(vector)
            ids.append(i)

        self.qdrant.upsert(
            collection_name="collection_resume_matcher",
            points=Batch(
                ids=ids,
                vectors=vectors,
                payloads=[{"text": resume} for resume in self.resumes]

            )
        )

    def search(self):
        vector, _ = self.get_embedding(self.jd)

        hits = self.qdrant.search(
            collection_name="collection_resume_matcher",
            query_vector=vector,
            limit=30
        )
        results = []
        for hit in hits:
            result = {
                'text': str(hit.payload)[:30],
                'score': hit.score
            }
            results.append(result)

        return results


def get_similarity_score(resume_string, jd_string):
    qdrant_search = QdrantSearch([resume_string], jd_string)
    qdrant_search.update_qdrant()
    results = qdrant_search.search()
    return results


