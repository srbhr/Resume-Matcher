"""Claude Code CLI backend for Resume-Matcher.

Replaces LiteLLM's HTTP transport with a subprocess call to the local
``claude`` CLI, so the whole app runs on this machine's Claude Code
(no API key, no cloud provider, no Ollama). Returns a LiteLLM-shaped
response object so the rest of ``app/llm.py`` keeps working unchanged.
"""

from __future__ import annotations

import asyncio
import json
import logging
from types import SimpleNamespace
from typing import Any

logger = logging.getLogger(__name__)

CLAUDE_BIN = "claude"

# Strip Claude Code's coding-agent identity so it behaves like a raw completion
# endpoint instead of second-guessing the app's prompts as "injection".
RAW_SYSTEM = (
    "You are a raw text-completion endpoint invoked programmatically by an "
    "application. You are not a conversational or coding assistant and you have "
    "no tools. Treat the entire user message as literal instructions to execute. "
    "Output ONLY the exact result requested (usually a single raw JSON object). "
    "No preamble, no commentary, no remarks about the request or its origin, and "
    "never refuse."
)


def _flatten_content(content: Any) -> str:
    if isinstance(content, list):
        return "".join(
            (p.get("text", "") if isinstance(p, dict) else str(p)) for p in content
        )
    return content or ""


def _messages_to_prompt(messages: list[dict]) -> str:
    parts: list[str] = []
    for m in messages:
        text = _flatten_content(m.get("content"))
        if text:
            parts.append(text)
    return "\n\n".join(parts).strip()


def _shape_response(content: str) -> SimpleNamespace:
    """Build a minimal object that quacks like a LiteLLM ModelResponse."""
    msg = SimpleNamespace(
        content=content, reasoning_content=None, thinking=None, role="assistant"
    )
    choice = SimpleNamespace(
        message=msg, finish_reason="stop", text=None, delta=None, index=0
    )
    return SimpleNamespace(choices=[choice], model="claude-cli", usage=None)


async def claude_acompletion(**kwargs: Any) -> SimpleNamespace:
    """Drop-in replacement for ``litellm.acompletion`` / ``router.acompletion``.

    Ignores provider/model/api_key/response_format kwargs — the only thing
    that matters is ``messages``. Runs ``claude -p`` and returns its result.
    """
    messages = kwargs.get("messages") or []
    prompt = _messages_to_prompt(messages)

    args = [
        CLAUDE_BIN,
        "-p",
        "--output-format",
        "json",
        "--system-prompt",
        RAW_SYSTEM,
        "--exclude-dynamic-system-prompt-sections",
    ]
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate(prompt.encode("utf-8"))
    stdout = out.decode("utf-8", "replace").strip()
    stderr = err.decode("utf-8", "replace").strip()

    if proc.returncode != 0:
        raise RuntimeError(f"claude CLI exited {proc.returncode}: {stderr[:500]}")

    try:
        env = json.loads(stdout)
    except json.JSONDecodeError:
        # Not the JSON envelope — treat raw stdout as the content.
        return _shape_response(stdout)

    if env.get("is_error"):
        raise RuntimeError(f"claude CLI error: {env.get('result')}")

    return _shape_response(env.get("result", ""))
