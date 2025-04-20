import os
from typing import Dict, Any

from .providers.ollama import OllamaProvider
from .providers.openai import OpenAIProvider
from .strategies.base import Strategy
from .strategies.wrapper import JSONWrapper
from .exceptions import ProviderError


class AgentManager:
    def __init__(
        self, strategy: Strategy | None = None, model: str = "gemma3:4b"
    ) -> None:
        self.strategy = strategy or JSONWrapper()
        self.model = model

    async def _get_provider(self, **kwargs: Any) -> OllamaProvider | OpenAIProvider:
        api_key = kwargs.get("openai_api_key", os.getenv("OPENAI_API_KEY"))
        if api_key:
            return OpenAIProvider(api_key=api_key)

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
