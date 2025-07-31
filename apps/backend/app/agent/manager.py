import os
from typing import Dict, Any

from .exceptions import ProviderError
from .strategies.wrapper import JSONWrapper, MDWrapper
from .providers.ollama import OllamaProvider, OllamaEmbeddingProvider
from .providers.openai import OpenAIProvider, OpenAIEmbeddingProvider
from .providers.huggingface import HuggingFaceProvider, HuggingFaceEmbeddingProvider


class AgentManager:
    def __init__(self, strategy: str | None = None, model: str = "gemma3:4b") -> None:
        match strategy:
            case "md":
                self.strategy = MDWrapper()
            case "json":
                self.strategy = JSONWrapper()
            case _:
                self.strategy = JSONWrapper()
        self.model = model

    async def _get_provider(self, **kwargs: Any) -> OllamaProvider | OpenAIProvider | HuggingFaceProvider:
        # Check for OpenAI API key
        api_key = kwargs.get("openai_api_key", os.getenv("OPENAI_API_KEY"))
        if api_key:
            return OpenAIProvider(api_key=api_key)
            
        # Check for HuggingFace provider usage
        use_hf = kwargs.get("use_huggingface", os.getenv("USE_HUGGINGFACE") == "true")
        if use_hf:
            model = kwargs.get("model", "microsoft/Phi-3-mini-4k-instruct")
            return HuggingFaceProvider(model_name=model)

        # Default to Ollama
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
    def __init__(self, model: str = "nomic-embed-text:137m-v1.5-fp16") -> None:
        self._model = model

    async def _get_embedding_provider(
        self, **kwargs: Any
    ) -> OllamaEmbeddingProvider | OpenAIEmbeddingProvider | HuggingFaceEmbeddingProvider:
        # Check for OpenAI API key
        api_key = kwargs.get("openai_api_key", os.getenv("OPENAI_API_KEY"))
        if api_key:
            return OpenAIEmbeddingProvider(api_key=api_key)
            
        # Check for HuggingFace provider usage
        use_hf = kwargs.get("use_huggingface", os.getenv("USE_HUGGINGFACE") == "true")
        if use_hf:
            model = kwargs.get("embedding_model", "sentence-transformers/all-MiniLM-L6-v2")
            return HuggingFaceEmbeddingProvider(embedding_model=model)
            
        # Default to Ollama
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
