import logging
import ollama

from typing import Any, Dict, List, Optional
from fastapi.concurrency import run_in_threadpool

from ..exceptions import ProviderError
from .base import Provider, EmbeddingProvider

logger = logging.getLogger(__name__)


class OllamaProvider(Provider):
    def __init__(self, model_name: str = "gemma3:4b", host: Optional[str] = None):
        self.model = model_name
        self._client = ollama.Client(host=host) if host else ollama.Client()

    @staticmethod
    async def get_installed_models(host: Optional[str] = None) -> List[str]:
        """
        List all installed models.
        """

        def _list_sync() -> List[str]:
            client = ollama.Client(host=host) if host else ollama.Client()
            return [model_class.model for model_class in client.list().models]

        return await run_in_threadpool(_list_sync)

    def _generate_sync(self, prompt: str, options: Dict[str, Any]) -> str:
        """
        Generate a response from the model.
        """
        try:
            response = self._client.generate(
                prompt=prompt,
                model=self.model,
                options=options,
            )
            return response["response"].strip()
        except Exception as e:
            logger.error(f"ollama sync error: {e}")
            raise ProviderError(f"Ollama - Error generating response: {e}")

    async def __call__(self, prompt: str, **generation_args: Any) -> str:
        opts = {
            "temperature": generation_args.get("temperature", 0),
            "top_p": generation_args.get("top_p", 0.9),
            "top_k": generation_args.get("top_k", 40),
            "num_ctx": generation_args.get("max_length", 20000),
        }
        return await run_in_threadpool(self._generate_sync, prompt, opts)


class OllamaEmbeddingProvider(EmbeddingProvider):
    def __init__(
        self,
        embedding_model: str = "nomic-embed-text:137m-v1.5-fp16",
        host: Optional[str] = None,
    ):
        self._model = embedding_model
        self._client = ollama.Client(host=host) if host else ollama.Client()

    async def embed(self, text: str) -> List[float]:
        """
        Generate an embedding for the given text.
        """
        try:
            response = await run_in_threadpool(
                self._client.embed,
                input=text,
                model=self._model,
            )
            return response.embeddings
        except Exception as e:
            logger.error(f"ollama embedding error: {e}")
            raise ProviderError(f"Ollama - Error generating embedding: {e}")
