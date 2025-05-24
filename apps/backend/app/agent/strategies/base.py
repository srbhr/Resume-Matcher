from abc import ABC, abstractmethod
from typing import Any, Dict

from ..providers.base import Provider


class Strategy(ABC):
    @abstractmethod
    async def __call__(
        self, prompt: str, provider: Provider, **generation_args: Any
    ) -> Dict[str, Any]:
        """
        Abstract method which should be used to define the strategy for generating a response from LLM.

        Args:
            prompt (str): The input prompt for the provider.
            provider (Provider): The provider instance to use for generation.
            **generation_args (Any): Additional arguments for generation.

        Returns:
            Dict[str, Any]: The generated response and any additional information.
        """
        ...
