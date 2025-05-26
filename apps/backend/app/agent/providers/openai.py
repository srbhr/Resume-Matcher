import os
import logging

from openai import OpenAI
from typing import Any, Dict
from fastapi.concurrency import run_in_threadpool

from ..exceptions import ProviderError
from .base import Provider, EmbeddingProvider

logger = logging.getLogger(__name__)


class OpenAIProvider(Provider):
    def __init__(self, api_key: str | None = None, model: str = "gpt-4o"):
        api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ProviderError("OpenAI API key is missing")
        self._client = OpenAI(api_key=api_key)
        self.model = model
        self.instructions = ""

    def _generate_sync(self, prompt: str, options: Dict[str, Any]) -> str:
        try:
            response = self._client.responses.create(
                model=self.model,
                instructions=self.instructions,
                input=prompt,
                **options,
            )
            return response.output_text
        except Exception as e:
            raise ProviderError(f"OpenAI - error generating response: {e}") from e

    async def __call__(self, prompt: str, **generation_args: Any) -> str:
        opts = {
            "temperature": generation_args.get("temperature", 0),
            "top_p": generation_args.get("top_p", 0.9),
            "top_k": generation_args.get("top_k", 40),
            "max_tokens": generation_args.get("max_length", 20000),
        }
        return await run_in_threadpool(self._generate_sync, prompt, opts)


class OpenAIEmbeddingProvider(EmbeddingProvider):
    def __init__(
        self,
        api_key: str | None = None,
        embedding_model: str = "text-embedding-ada-002",
    ):
        api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ProviderError("OpenAI API key is missing")
        self._client = OpenAI(api_key=api_key)
        self._model = embedding_model

    async def embed(self, text: str) -> list[float]:
        try:
            response = await run_in_threadpool(
                self._client.embeddings.create, input=text, model=self._model
            )
            return response["data"][0]["embedding"]
        except Exception as e:
            raise ProviderError(f"OpenAI - error generating embedding: {e}") from e
