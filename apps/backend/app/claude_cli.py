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


class ClaudeCliNotFoundError(RuntimeError):
    """The ``claude`` executable is not installed or not on PATH."""


# Used when the caller passes no ``timeout``. Every subprocess call is bounded.
DEFAULT_TIMEOUT_SECONDS = 120.0

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


def _split_messages(messages: list[dict]) -> tuple[str, str]:
    """Split chat messages into (system prompt text, user prompt text).

    System-role messages (the app's instructions, e.g. ``complete_json``'s
    "respond with valid JSON only") go to ``--system-prompt`` so they keep their
    priority; everything else is sent on stdin.
    """
    system_parts: list[str] = []
    prompt_parts: list[str] = []
    for m in messages:
        text = _flatten_content(m.get("content"))
        if not text:
            continue
        is_system = m.get("role") in ("system", "developer")
        (system_parts if is_system else prompt_parts).append(text)
    return "\n\n".join(system_parts).strip(), "\n\n".join(prompt_parts).strip()


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

    Ignores provider/model/api_key/response_format kwargs — the only things
    that matter are ``messages`` and ``timeout``. Runs ``claude -p`` and returns
    its result. Raises ``TimeoutError`` (after killing the process) when the CLI
    does not finish within ``timeout`` seconds.
    """
    messages = kwargs.get("messages") or []
    system_text, prompt = _split_messages(messages)
    system_prompt = f"{RAW_SYSTEM}\n\n{system_text}" if system_text else RAW_SYSTEM

    args = [
        CLAUDE_BIN,
        "-p",
        "--output-format",
        "json",
        "--system-prompt",
        system_prompt,
        # Empty list = no tools at all. This is a text-completion provider: a
        # resume or job description that tells the model to run Bash or edit
        # files must not be able to, whatever RAW_SYSTEM says.
        "--tools",
        "",
        # Resumes and job descriptions must not be written to Claude Code's
        # session history on disk.
        "--no-session-persistence",
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        raise ClaudeCliNotFoundError(
            f"Claude Code CLI ('{CLAUDE_BIN}') was not found on PATH. Install "
            "Claude Code and sign in with `claude auth login`."
        ) from exc
    try:
        out, err = await asyncio.wait_for(
            proc.communicate(prompt.encode("utf-8")),
            timeout=kwargs.get("timeout") or DEFAULT_TIMEOUT_SECONDS,
        )
    except BaseException:
        # Timeout or task cancellation: do not leave the CLI running.
        if proc.returncode is None:
            proc.kill()
            await proc.wait()
        raise
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
