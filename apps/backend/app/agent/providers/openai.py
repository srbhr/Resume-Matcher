import os
import logging

from openai import OpenAI
from typing import Any, Dict
from fastapi.concurrency import run_in_threadpool

from ..exceptions import ProviderError
from .base import Provider, EmbeddingProvider
from ...core import settings

logger = logging.getLogger(__name__)


class OpenAIProvider(Provider):
    def __init__(self, api_key: str | None = None, model_name: str = settings.LL_MODEL,
                 opts: Dict[str, Any] = None):
        if opts is None:
            opts = {}
        api_key = api_key or settings.LLM_API_KEY or os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ProviderError("OpenAI API key is missing")
        self._client = OpenAI(api_key=api_key)
        self.model = model_name
        self.opts = opts
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
        if generation_args:
            logger.warning(f"OpenAIProvider - generation_args not used {generation_args}")
        allowed = {
            "temperature",
            "top_p",
            "max_output_tokens",
            "verbosity",
            "reasoning_effort",
            "grammar",
            "extra_headers",
        }
        myopts = {}
        for key in allowed:
            value = self.opts.get(key)
            if value is not None:
                myopts[key] = value
        myopts.update({k: v for k, v in generation_args.items() if k in allowed and v is not None})
        return await run_in_threadpool(self._generate_sync, prompt, myopts)


class OpenAIEmbeddingProvider(EmbeddingProvider):
    def __init__(
        self,
        api_key: str | None = None,
        embedding_model: str = settings.EMBEDDING_MODEL,
    ):
        api_key = api_key or settings.EMBEDDING_API_KEY or os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ProviderError("OpenAI API key is missing")
        self._client = OpenAI(api_key=api_key)
        self._model = embedding_model

    async def embed(self, text: str) -> list[float]:
        try:
            response = await run_in_threadpool(
                self._client.embeddings.create, input=text, model=self._model
            )
            return response.data[0].embedding
        except Exception as e:
            raise ProviderError(f"OpenAI - error generating embedding: {e}") from e
