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
        response = response.strip()
        logger.info(f"provider response: {response}")

        # First attempt: direct JSON load after removing common wrappers
        cleaned = response.replace("```", "").replace("json", "").strip()
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass

        # Fallback: extract the largest JSON-looking block between first '{' and last '}'
        start = response.find("{")
        end = response.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidate = response[start : end + 1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                # Try again after stripping backticks/newlines around the candidate
                candidate2 = candidate.replace("```", "").strip()
                try:
                    return json.loads(candidate2)
                except json.JSONDecodeError as e:
                    logger.error(
                        "provider returned non-JSON. parsing error after fallback: %s - response: %s",
                        e,
                        response,
                    )
                    raise StrategyError(f"JSON parsing error: {e}") from e

        # If no braces found, fail clearly
        logger.error(
            "provider response contained no JSON object braces: %s", response
        )
        raise StrategyError("JSON parsing error: no JSON object detected in provider response")


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
