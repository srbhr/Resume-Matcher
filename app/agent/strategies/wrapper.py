import json
import logging
from typing import Any, Dict

from ..providers.base import Provider
from ..exceptions import StrategyError
from .base import Strategy

logger = logging.getLogger(__name__)


class JSONWrapper(Strategy):
    async def __call__(
        self, prompt: str, provider: Provider, **generation_args: Any
    ) -> Dict[str, Any]:
        """
        Wrapper strategy to format the prompt as JSON with the help of LLM.
        """
        response = await provider(prompt, **generation_args)
        try:
            return json.loads(response)
        except json.JSONDecodeError as e:
            logger.error(
                f"provider returned non-JSON. parsing error: {e} - response: {response}"
            )
            raise StrategyError(f"JSON parsing error: {e}") from e
