import os
import requests

from openai import OpenAI
from typing import Any, Dict
from fastapi.concurrency import run_in_threadpool
from ..exceptions import ProviderError
from .base import Provider, EmbeddingProvider
from sentence_transformers import SentenceTransformer


class HuggingFaceProvider(Provider):  
    def __init__(self, model_name: str = "microsoft/Phi-3-mini-4k-instruct"):
        self._model_name = model_name
        self._api_key = os.getenv("HF_API_KEY")
        if not self._api_key:
            raise ProviderError("Hugging Face API key is missing")
        
 
    async def __call__(self, prompt: str, **generation_args: Any) -> str:
        opts = {
            "temperature": generation_args.get("temperature", 0.7),
            "top_p": generation_args.get("top_p", 0.9),
            "max_tokens": generation_args.get("max_length", 20000),
        }
        return await run_in_threadpool(self._generate_sync, prompt, opts)

    def _generate_sync(self, prompt: str, options: Dict[str, Any]) -> str:
        try:
            # Make a direct HTTP request to the model endpoint
            headers = {"Authorization": f"Bearer {self._api_key}"}
            payload = {
                "inputs": prompt,
                "parameters": {
                    "temperature": options.get("temperature", 0.7),
                    "top_p": options.get("top_p", 0.9),
                    "max_tokens": options.get("max_tokens", 20000),
                }
            }
            response = requests.post(
                f"https://router.huggingface.co/hf-inference/models/{self._model_name}",
                headers=headers,
                json=payload
            )
            response.raise_for_status()  # Raise an exception for 4XX/5XX responses
            response_data = response.json()
            if not response_data or not isinstance(response_data, list) or len(response_data) == 0:
                raise ProviderError("Invalid response format from Hugging Face API")
            if "generated_text" not in response_data[0]:
                raise ProviderError("Missing 'generated_text' in Hugging Face API response")
            return response_data[0]["generated_text"]
        except Exception as e:
            raise ProviderError(f"Hugging Face - error generating response: {e}") from e

class HuggingFaceEmbeddingProvider(EmbeddingProvider):
    def __init__(self, api_key: str | None = None, embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"):
        self._api_key = api_key or os.getenv("HF_API_KEY")
        if not self._api_key:
            raise ProviderError("Hugging Face API key is missing")
        self._model = SentenceTransformer(embedding_model)
    
    async def embed(self, text: str) -> list[float]:
        try:
            embedding = await run_in_threadpool(self._model.encode, text, convert_to_tensor=True)
            return embedding.tolist()
        except Exception as e:
            raise ProviderError(f"Hugging Face - error generating embedding: {e}") from e
