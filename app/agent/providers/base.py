from abc import ABC, abstractmethod
from typing import Any


class Provider(ABC):
    """
    Abstract base class for providers.
    """

    @abstractmethod
    async def __call__(self, prompt: str, **generation_args: Any) -> str: ...
