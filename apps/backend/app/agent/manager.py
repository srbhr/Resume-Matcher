import os
from typing import Dict, Any

from ..core import settings
from .exceptions import ProviderError
from .strategies.wrapper import JSONWrapper, MDWrapper
from .providers.ollama import OllamaProvider, OllamaEmbeddingProvider
from .providers.openai import OpenAIProvider, OpenAIEmbeddingProvider


class AgentManager:
    def __init__(self,
                 strategy: str | None = None,
                 model: str = settings.LL_MODEL,
                 model_provider: str = settings.MODEL_PROVIDER
                 ) -> None:
        match strategy:
            case "md":
                self.strategy = MDWrapper()
            case "json":
                self.strategy = JSONWrapper()
            case _:
                self.strategy = JSONWrapper()
        self.model = model
        self.model_provider = model_provider

    async def _get_provider(self, **kwargs: Any) -> OllamaProvider | OpenAIProvider:
        match self.model_provider:
            case 'openai':
                api_key = kwargs.get("openai_api_key", settings.OPENAI_API_KEY)
                return OpenAIProvider(api_key=api_key)
            case _: # Default to ollama
                model = kwargs.get("model", self.model)
                installed_ollama_models = await OllamaProvider.get_installed_models()
                if model not in installed_ollama_models:
                    raise ProviderError(
                        f"Ollama Model '{model}' is not found. Run `ollama pull {model} or pick from any available models {installed_ollama_models}"
                    )
                return OllamaProvider(model_name=model)

    async def run(self, prompt: str, **kwargs: Any) -> Dict[str, Any]:
        """
        Run the agent with the given prompt and generation arguments.
        """
        provider = await self._get_provider(**kwargs)
        return await self.strategy(prompt, provider, **kwargs)

class EmbeddingManager:
    def __init__(self,
                 model: str = settings.EMBEDDING_MODEL,
                 model_provider: str = settings.MODEL_PROVIDER) -> None:
        self._model = model
        self._model_provider = model_provider

    async def _get_embedding_provider(
        self, **kwargs: Any
    ) -> OllamaEmbeddingProvider | OpenAIEmbeddingProvider:
        match self._model_provider:
            case 'openai':
                api_key = kwargs.get("openai_api_key", settings.OPENAI_API_KEY)
                return OpenAIEmbeddingProvider(api_key=api_key)
            case _: # Default to ollama
                model = kwargs.get("embedding_model", self._model)
                installed_ollama_models = await OllamaProvider.get_installed_models()
                if model not in installed_ollama_models:
                    raise ProviderError(
                        f"Ollama Model '{model}' is not found. Run `ollama pull {model} or pick from any available models {installed_ollama_models}"
                    )
                return OllamaEmbeddingProvider(embedding_model=model)

    async def embed(self, text: str, **kwargs: Any) -> list[float]:
        """
        Get the embedding for the given text.
        """
        provider = await self._get_embedding_provider(**kwargs)
        return await provider.embed(text)
