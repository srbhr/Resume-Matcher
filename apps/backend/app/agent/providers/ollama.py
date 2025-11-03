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

    def _ensure_model_pulled(self, model_name: str) -> None:
        """
        Ensure model is available locally.
        - If it's already in /api/tags, skip pulling.
        - If pull fails but model is actually present, continue.
        """
        try:
            installed = [m.model for m in self._client.list().models]
            if model_name in installed:
                return  # already present
        except Exception:
            # If listing fails, we'll try pulling below.
            pass

        try:
            self._client.pull(model_name)
            return
        except Exception as e:
            # If pull failed (e.g., offline), check again—maybe it actually exists locally.
            try:
                installed = [m.model for m in self._client.list().models]
                if model_name in installed:
                    return
            except Exception:
                pass
            raise ProviderError(
                f"Ollama Model '{model_name}' could not be pulled. "
                f"Either connect to the internet or install it manually with "
                f"`ollama pull {model_name}`, then retry."
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
            # Handle both shapes: {"embedding":[...]} or {"embeddings":[[...]]}
            if hasattr(response, "embedding") and response.embedding:
                return response.embedding  # type: ignore[return-value]
            if hasattr(response, "embeddings") and response.embeddings:
                return response.embeddings[0]  # type: ignore[index]
            raise ProviderError("Ollama - Empty embedding response")
        except Exception as e:
            logger.error(f"ollama embedding error: {e}")
            raise ProviderError(f"Ollama - Error generating embedding: {e}") from e
