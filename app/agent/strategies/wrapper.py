import json
import logging
from typing import Any, Dict

from .base import Strategy
from ..providers.base import Provider
from ..exceptions import StrategyError


logger = logging.getLogger(__name__)


class JSONWrapper(Strategy):
    async def __call__(
        self, prompt: str, provider: Provider, **generation_args: Any
    ) -> Dict[str, Any]:
        """
        Wrapper strategy to format the prompt as JSON with the help of LLM.
        """
        response = await provider(prompt, **generation_args)
        response = response.replace("```", "").replace("json", "").strip()
        logger.info(f"provider response: {response}")
        try:
            return json.loads(response)
        except json.JSONDecodeError as e:
            logger.error(
                f"provider returned non-JSON. parsing error: {e} - response: {response}"
            )
            raise StrategyError(f"JSON parsing error: {e}") from e


class MDWrapper(Strategy):
    async def __call__(
        self, prompt: str, provider: Provider, **generation_args: Any
    ) -> Dict[str, Any]:
        """
        Wrapper strategy to format the prompt as Markdown with the help of LLM.
        """
        logger.info(f"prompt given to provider: \n{prompt}")
        response = await provider(prompt, **generation_args)
        logger.info(f"provider response: {response}")
        try:
            response = (
                "```md\n" + response + "```" if "```md" not in response else response
            )
            return response
        except Exception as e:
            logger.error(
                f"provider returned non-md. parsing error: {e} - response: {response}"
            )
            raise StrategyError(f"Markdown parsing error: {e}") from e
