import os
import logging

from google.genai import Client, types
from typing import Any, Dict
from fastapi.concurrency import run_in_threadpool

from ..exceptions import ProviderError
from .base import Provider, EmbeddingProvider
from ...core import settings

logger = logging.getLogger(__name__)


class GeminiProvider(Provider):
    def __init__(
        self,
        api_key: str | None = None,
        model_name: str = settings.LL_MODEL,
        opts: Dict[str, Any] = None,
    ):
        if opts is None:
            opts = {}
        api_key = api_key or settings.LLM_API_KEY or os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ProviderError("Gemini API key is missing")
        self._client = Client(api_key=api_key)
        self.model = model_name
        self.opts = opts
        self.instructions = ""

    def _generate_sync(self, prompt: str, options: Dict[str, Any]) -> str:
        try:
            response = self._client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=self.instructions,
                    thinking_config=types.ThinkingConfig(thinking_budget=8000),
                    **options,
                ),
            )
            return response.text
        except Exception as e:
            raise ProviderError(f"Gemini - error generating response: {e}")

    async def __call__(self, prompt: str, **generation_args: Any) -> str:
        if generation_args:
            logger.warning(
                f"GeminiProvider - generation_args not used {generation_args}"
            )
        myopts = {
            "temperature": self.opts.get("temperature", 0),
            "top_p": self.opts.get("top_p", 0.9),
            "top_k": self.opts.get("top_k", 40),
            "max_output_tokens": self.opts.get("num_ctx", 20000),
        }
        return await run_in_threadpool(self._generate_sync, prompt, myopts)


class GeminiEmbeddingProvider(EmbeddingProvider):
    def __init__(
        self,
        api_key: str | None = None,
        embedding_model: str = settings.EMBEDDING_MODEL,
    ):
        api_key = api_key or settings.EMBEDDING_API_KEY or os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ProviderError("Gemini API key is missing")
        self._client = Client(api_key=api_key)
        self._model = embedding_model

    async def embed(self, text: str) -> list[float]:
        try:
            response = await run_in_threadpool(
                self._client.models.embed_content, contents=text, model=self._model
            )
            return response.embeddings[0].values

        except Exception as e:
            raise ProviderError(f"Gemini - error generating embedding: {e}") from e
