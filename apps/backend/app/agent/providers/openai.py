import os
import logging

from openai import OpenAI
from typing import Any, Dict
from fastapi.concurrency import run_in_threadpool

from ..exceptions import ProviderError
from .base import Provider, EmbeddingProvider
from ...core import settings
from ...metrics import counters

logger = logging.getLogger(__name__)


class OpenAIProvider(Provider):
    def __init__(self, api_key: str | None = None, model_name: str = settings.LL_MODEL,
                 opts: Dict[str, Any] = None):
        if opts is None:
            opts = {}
        api_key = api_key or settings.LLM_API_KEY or os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ProviderError("OpenAI API key is missing")
        self._client = OpenAI(api_key=api_key)
        self.model = model_name
        self.opts = opts
        self.instructions = ""

    def _generate_sync(self, prompt: str, options: Dict[str, Any]) -> Dict[str, Any]:
        # Map generic options to OpenAI Responses API fields where possible
        def build_params(opts: Dict[str, Any]) -> Dict[str, Any]:
            p: Dict[str, Any] = {}
            if opts.get("temperature") is not None:
                p["temperature"] = float(opts["temperature"])  # may be unsupported by some models
            max_tokens = opts.get("max_output_tokens") or opts.get("max_tokens")
            if max_tokens is not None:
                p["max_output_tokens"] = int(max_tokens)
            return p

        attempt = 0
        allowed = dict(options) if options else {}
        last_err: Exception | None = None
        while attempt < 2:
            try:
                params = build_params(allowed)
                response = self._client.responses.create(
                    model=self.model,
                    instructions=self.instructions,
                    input=prompt,
                    **params,
                )
                usage = getattr(response, "usage", None)
                prompt_tokens = getattr(usage, "input_tokens", None) if usage else None
                completion_tokens = getattr(usage, "output_tokens", None) if usage else None
                return {
                    "text": response.output_text,
                    "usage": {
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                    },
                }
            except Exception as e:
                # If the model rejects a parameter, strip it and retry once
                msg = str(e)
                if (
                    attempt == 0
                    and ("Unsupported parameter" in msg or "invalid_request_error" in msg)
                ):
                    if "temperature" in msg and "temperature" in allowed:
                        allowed.pop("temperature", None)
                        attempt += 1
                        continue
                    if "max_output_tokens" in msg and "max_output_tokens" in allowed:
                        allowed.pop("max_output_tokens", None)
                        attempt += 1
                        continue
                last_err = e
                break
        raise ProviderError(f"OpenAI - error generating response: {last_err}") from last_err

    async def __call__(self, prompt: str, **generation_args: Any) -> Dict[str, Any]:
        # Forward supported generation args to the sync generator
        options: Dict[str, Any] = {}
        for key in ("temperature", "max_output_tokens", "max_tokens"):
            if key in generation_args and generation_args[key] is not None:
                options[key] = generation_args[key]
        return await run_in_threadpool(self._generate_sync, prompt, options)


class OpenAIEmbeddingProvider(EmbeddingProvider):
    def __init__(self, api_key: str | None = None, embedding_model: str = settings.EMBEDDING_MODEL):
        api_key = api_key or settings.EMBEDDING_API_KEY or os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ProviderError("OpenAI API key is missing")
        self._client = OpenAI(api_key=api_key)
        self._model = embedding_model

    async def embed(self, text: str) -> list[float]:
        try:
            response = await run_in_threadpool(
                self._client.embeddings.create, input=text, model=self._model
            )
            # Instrument embedding usage
            try:
                usage = getattr(response, "usage", None)
                tokens = getattr(usage, "prompt_tokens", None) if usage else None
                counters.EMBEDDING_CALLS += 1
                if isinstance(tokens, int):
                    counters.EMBEDDING_PROMPT_TOKENS += int(tokens)
                else:
                    # Rough estimate: ~4 chars per token
                    est = max(1, len(text) // 4)
                    counters.EMBEDDING_PROMPT_TOKENS_ESTIMATED += int(est)
            except Exception:
                pass
            return response.data[0].embedding
        except Exception as e:
            raise ProviderError(f"OpenAI - error generating embedding: {e}") from e
