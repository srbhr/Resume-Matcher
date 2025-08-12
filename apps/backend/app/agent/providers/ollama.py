import logging
import ollama

from typing import Any, Dict, List, Optional
from fastapi.concurrency import run_in_threadpool

from ..exceptions import ProviderError
from .base import Provider, EmbeddingProvider
from ...core import settings

logger = logging.getLogger(__name__)

class OllamaBaseProvider:
    @staticmethod
    async def _get_installed_models(host: Optional[str] = None) -> List[str]:
        """
        List all installed models.
        """

        def _list_sync() -> List[str]:
            client = ollama.Client(host=host) if host else ollama.Client()
            return [model_class.model for model_class in client.list().models]

        return await run_in_threadpool(_list_sync)

    def _ensure_model_pulled(self, model_name):
        installed_ollama_models = [model_class.model for model_class in self._client.list().models]
        if model_name not in installed_ollama_models:
            try:
                self._client.pull(model_name)
            except Exception as e:
                raise ProviderError(
                    f"Ollama Model '{model_name}' could not be pulled. Please update your apps/backend/.env file or select from the installed models."
                ) from e

class OllamaProvider(Provider, OllamaBaseProvider):
    def __init__(self,
                 model_name: str = settings.LL_MODEL,
                 api_base_url: Optional[str] = settings.LLM_BASE_URL,
                 opts: Dict[str, Any] = None):
        if opts is None:
            opts = {}
        self.opts = opts
        self.model = model_name
        self._client = ollama.Client(host=api_base_url) if api_base_url else ollama.Client()
        self._ensure_model_pulled(model_name)

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
            raise ProviderError(f"Ollama - Error generating response: {e}") from e

    async def __call__(self, prompt: str, **generation_args: Any) -> str:
        if generation_args:
            logger.warning(f"OllamaProvider ignoring generation_args {generation_args}")
        myopts = self.opts # Ollama can handle all the options manager.py passes in.
        return await run_in_threadpool(self._generate_sync, prompt, myopts)

class OllamaEmbeddingProvider(EmbeddingProvider, OllamaBaseProvider):
    def __init__(
        self,
        embedding_model: str = settings.EMBEDDING_MODEL,
        api_base_url: Optional[str] = settings.EMBEDDING_BASE_URL,
    ):
        self._model = embedding_model
        self._client = ollama.Client(host=api_base_url) if api_base_url else ollama.Client()
        self._ensure_model_pulled(embedding_model)

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
            raise ProviderError(f"Ollama - Error generating embedding: {e}") from e
