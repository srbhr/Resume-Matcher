import json
import logging
import re
from typing import Any, Dict, List, Tuple

from .base import Strategy
from ..providers.base import Provider
from ..exceptions import StrategyError


logger = logging.getLogger(__name__)

# Precompiled for performance; matches ```json ... ``` or ``` ... ``` fenced blocks
FENCE_PATTERN = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


class JSONWrapper(Strategy):
    async def __call__(
        self, prompt: str, provider: Provider, **generation_args: Any
    ) -> Dict[str, Any]:
        """
        Wrapper strategy to format the prompt as JSON with the help of LLM.
        """
        provider_output = await provider(prompt, **generation_args)
        # Expect dict {text, usage}
        if isinstance(provider_output, dict) and "text" in provider_output:
            usage = provider_output.get("usage")
            response = str(provider_output.get("text", "")).strip()
        else:
            usage = None
            response = str(provider_output).strip()
        logger.info(f"provider response: {response}")

        # 1) Try direct parse first
        try:
            parsed = json.loads(response)
            if usage:
                parsed["_usage"] = usage
            return parsed
        except json.JSONDecodeError:
            pass

        # 2) If wrapped in fenced code blocks, try all and return the first valid JSON
        #    Matches ```json\n...``` or ```\n...``` variants
        for fence_match in FENCE_PATTERN.finditer(response):
            fenced = fence_match.group(1).strip()
            try:
                parsed = json.loads(fenced)
                if usage:
                    parsed["_usage"] = usage
                return parsed
            except json.JSONDecodeError:
                continue

        # 3) Fallback: extract the largest JSON-looking object block { ... }
        obj_start, obj_end = response.find("{"), response.rfind("}")

        candidates: List[Tuple[int, str]] = []
        if obj_start != -1 and obj_end != -1 and obj_end > obj_start:
            candidates.append((obj_start, response[obj_start : obj_end + 1]))

        for _, candidate in candidates:
            try:
                parsed = json.loads(candidate)
                if usage:
                    parsed["_usage"] = usage
                return parsed
            except json.JSONDecodeError:
                candidate2 = candidate.replace("```", "").strip()
                try:
                    parsed2 = json.loads(candidate2)
                    if usage:
                        parsed2["_usage"] = usage
                    return parsed2
                except json.JSONDecodeError:
                    continue

        if candidates:
            # If we had candidates but none parsed, log the last error contextfully
            _err_preview = response if len(response) <= 2000 else response[:2000] + "... (truncated)"
            logger.error(
                "provider returned non-JSON. failed to parse candidate blocks - response: %s",
                _err_preview,
            )
            raise StrategyError("JSON parsing error: failed to parse candidate JSON blocks")

        # 4) No braces found: fail clearly
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
        provider_output = await provider(prompt, **generation_args)
        if isinstance(provider_output, dict) and "text" in provider_output:
            usage = provider_output.get("usage")
            response = str(provider_output.get("text", ""))
        else:
            usage = None
            response = str(provider_output)
        logger.info(f"provider response: {response}")
        try:
            wrapped = (
                "```md\n" + response + "```" if "```md" not in response else response
            )
            return {"markdown": wrapped, "_usage": usage} if usage else {"markdown": wrapped}
        except Exception as e:
            logger.error(
                f"provider returned non-md. parsing error: {e} - response: {response}"
            )
            raise StrategyError(f"Markdown parsing error: {e}") from e

