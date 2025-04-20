import asyncio
import logging
import ollama
from typing import Any, Dict, List, Optional

from .base import Provider
from ..exceptions import ProviderError

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
            return [model["name"] for model in client.list()]

        return await asyncio.to_thread(_list_sync)

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
        return await asyncio.to_thread(self._generate_sync, prompt, opts)
