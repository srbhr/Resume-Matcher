import os
from typing import Dict, Any

from ..core import settings
from .strategies.wrapper import JSONWrapper, MDWrapper
from .providers.base import Provider, EmbeddingProvider

class AgentManager:
    def __init__(self,
                 strategy: str | None = None,
                 model: str = settings.LL_MODEL,
                 model_provider: str = settings.LLM_PROVIDER
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

    async def _get_provider(self, **kwargs: Any) -> Provider:
        # Default options for any LLM. Not all can handle them
        # (e.g. OpenAI doesn't take top_k) but each provider can make
        # best effort.
        opts = {}
        opts.update(kwargs)
        match self.model_provider:
            case 'openai':
                from .providers.openai import OpenAIProvider
                api_key = opts.get("llm_api_key", settings.LLM_API_KEY)
                return OpenAIProvider(model_name=self.model,
                                      api_key=api_key,
                                      opts=opts)
            case 'ollama':
                from .providers.ollama import OllamaProvider
                model = opts.get("model", self.model)
                return OllamaProvider(model_name=model,
                                      opts=opts)
            case _:
                from .providers.llama_index import LlamaIndexProvider
                llm_api_key = opts.get("llm_api_key", settings.LLM_API_KEY)
                llm_api_base_url = opts.get("llm_base_url", settings.LLM_BASE_URL)
                return LlamaIndexProvider(api_key=llm_api_key,
                                          model_name=self.model,
                                          api_base_url=llm_api_base_url,
                                          provider=self.model_provider,
                                          opts=opts)

    async def run(self, prompt: str, **kwargs: Any) -> Dict[str, Any]:
        """
        Run the agent with the given prompt and generation arguments.
        """
        provider = await self._get_provider(**kwargs)
        return await self.strategy(prompt, provider, **kwargs)

class EmbeddingManager:
    def __init__(self,
                 model: str = settings.EMBEDDING_MODEL,
                 model_provider: str = settings.EMBEDDING_PROVIDER) -> None:
        self._model = model
        self._model_provider = model_provider

    async def _get_embedding_provider(
        self, **kwargs: Any
    ) -> EmbeddingProvider:
        match self._model_provider:
            case 'openai':
                from .providers.openai import OpenAIEmbeddingProvider
                api_key = kwargs.get("openai_api_key", settings.EMBEDDING_API_KEY)
                return OpenAIEmbeddingProvider(api_key=api_key, embedding_model=self._model)
            case 'ollama':
                from .providers.ollama import OllamaEmbeddingProvider
                model = kwargs.get("embedding_model", self._model)
                return OllamaEmbeddingProvider(embedding_model=model)
            case _:
                from .providers.llama_index import LlamaIndexEmbeddingProvider
                embed_api_key = kwargs.get("embedding_api_key", settings.EMBEDDING_API_KEY)
                return LlamaIndexEmbeddingProvider(api_key=embed_api_key,
                                                   provider=self._model_provider,
                                                   embedding_model=self._model)

    async def embed(self, text: str, **kwargs: Any) -> list[float]:
        """
        Get the embedding for the given text.
        """
        provider = await self._get_embedding_provider(**kwargs)
        return await provider.embed(text)
