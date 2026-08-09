"""Claude Code CLI backend — Multica-style local ``claude -p`` invocations.

Uses the signed-in Claude Code CLI on PATH (or ``CLAUDE_CLI_PATH``) instead of
an Anthropic API key. Tools are disabled so Claude answers as a plain LLM
(resume JSON, keywords, etc.) rather than acting as a coding agent.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import shutil
from typing import Any

logger = logging.getLogger(__name__)

# Default model alias understood by Claude Code (``--model``).
DEFAULT_CLAUDE_CLI_MODEL = "sonnet"

# Hard ceiling for a single CLI process; callers pass their own timeout too.
_MAX_CLI_TIMEOUT_SECONDS = 1800


class ClaudeCLIError(RuntimeError):
    """Raised when the local Claude Code CLI cannot complete a request."""


def resolve_claude_binary() -> str:
    """Return the Claude Code binary path or raise ``ClaudeCLIError``."""
    override = (os.environ.get("CLAUDE_CLI_PATH") or "").strip()
    if override:
        if os.path.isfile(override) and os.access(override, os.X_OK):
            return override
        raise ClaudeCLIError(
            f"CLAUDE_CLI_PATH is set but not an executable file: {override}"
        )
    binary = shutil.which("claude")
    if not binary:
        raise ClaudeCLIError(
            "Claude Code CLI not found on PATH. Install it "
            "(https://docs.anthropic.com/en/docs/claude-code) and run "
            "`claude auth login`, or set CLAUDE_CLI_PATH."
        )
    return binary


# Keep --system-prompt on argv only when short; large resume/JD payloads go
# through stdin so we stay under OS ARG_MAX limits.
_MAX_SYSTEM_PROMPT_ARGV_CHARS = 4000


def build_claude_cli_args(
    *,
    system_prompt: str | None,
    model: str,
) -> tuple[list[str], str | None]:
    """Build ``claude -p`` argv and the optional system prompt for argv.

    Returns ``(args, system_prompt_for_argv)``. When the system prompt is too
    large for argv, ``system_prompt_for_argv`` is ``None`` and the caller must
    fold it into the stdin payload.
    """
    # NOTE: Do NOT pass ``--bare``. That mode refuses OAuth/keychain auth and
    # only accepts ANTHROPIC_API_KEY — which defeats the whole point of this
    # provider (use the signed-in Claude Code subscription).
    # ``--safe-mode`` skips project CLAUDE.md/hooks/plugins but keeps auth.
    args: list[str] = [
        "-p",
        "--safe-mode",
        "--tools",
        "",
        "--output-format",
        "text",
        "--permission-mode",
        "dontAsk",
        "--model",
        model or DEFAULT_CLAUDE_CLI_MODEL,
    ]
    system_for_argv: str | None = None
    if system_prompt:
        if len(system_prompt) <= _MAX_SYSTEM_PROMPT_ARGV_CHARS:
            system_for_argv = system_prompt
            args.extend(["--system-prompt", system_prompt])
    # User prompt is always sent on stdin (not argv) — see complete_claude_cli.
    return args, system_for_argv


def _stdin_payload(prompt: str, system_prompt: str | None, system_on_argv: bool) -> str:
    """Build the stdin body. Fold system text in when it did not fit on argv."""
    if system_prompt and not system_on_argv:
        return f"[System]\n{system_prompt}\n\n[User]\n{prompt}"
    return prompt


async def complete_claude_cli(
    prompt: str,
    system_prompt: str | None = None,
    *,
    model: str = DEFAULT_CLAUDE_CLI_MODEL,
    timeout: float = 180,
) -> str:
    """Run a single non-interactive Claude Code completion.

    Equivalent in spirit to Multica's daemon path: spawn ``claude -p``, use the
    local login, return stdout text. Does not use the Anthropic HTTP API.

    The user prompt is written to stdin (not argv) so large resume/JD payloads
    do not hit OS argument-length limits.
    """
    binary = resolve_claude_binary()
    args, system_on_argv = build_claude_cli_args(
        system_prompt=system_prompt, model=model
    )
    stdin_text = _stdin_payload(
        prompt, system_prompt, system_on_argv=system_on_argv is not None
    )
    timeout = max(1.0, min(float(timeout), float(_MAX_CLI_TIMEOUT_SECONDS)))

    logger.debug(
        "Invoking Claude CLI",
        extra={"binary": binary, "model": model, "timeout": timeout},
    )

    try:
        proc = await asyncio.create_subprocess_exec(
            binary,
            *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            # Avoid inheriting a cwd that loads project CLAUDE.md unexpectedly;
            # --bare already skips CLAUDE.md discovery, but keep cwd stable.
            cwd=os.path.expanduser("~"),
            env=os.environ.copy(),
        )
    except FileNotFoundError as e:
        raise ClaudeCLIError(
            "Failed to start Claude Code CLI. Is `claude` installed?"
        ) from e

    try:
        stdout_b, stderr_b = await asyncio.wait_for(
            proc.communicate(input=stdin_text.encode("utf-8")),
            timeout=timeout,
        )
    except TimeoutError as e:
        with contextlib.suppress(ProcessLookupError):
            proc.kill()
        with contextlib.suppress(Exception):
            await proc.communicate()
        raise ClaudeCLIError(
            f"Claude CLI timed out after {int(timeout)}s. "
            "Try a faster model alias (haiku) or raise REQUEST_TIMEOUT_SECONDS."
        ) from e

    stdout = stdout_b.decode("utf-8", errors="replace").strip()
    stderr = stderr_b.decode("utf-8", errors="replace").strip()

    if proc.returncode != 0:
        detail = stderr or stdout or f"exit code {proc.returncode}"
        # Keep client messages short; full detail is logged.
        logger.error("Claude CLI failed (code %s): %s", proc.returncode, detail[:2000])
        raise ClaudeCLIError(
            "Claude CLI request failed. Ensure `claude auth login` succeeded "
            f"and the CLI can run (`claude -p \"hi\"`). Detail: {_short(detail)}"
        )

    if not stdout:
        logger.error("Claude CLI returned empty stdout; stderr=%s", stderr[:1000])
        raise ClaudeCLIError("Claude CLI returned an empty response.")

    return stdout


async def check_claude_cli_health(
    *,
    model: str = DEFAULT_CLAUDE_CLI_MODEL,
    test_prompt: str | None = None,
    timeout: float = 30,
) -> dict[str, Any]:
    """Minimal smoke test: binary present + one tiny completion."""
    prompt = test_prompt or "Reply with exactly: OK"
    try:
        # Cheap existence check first so missing binary is a clear error_code.
        resolve_claude_binary()
        content = await complete_claude_cli(
            prompt,
            system_prompt="You are a health-check probe. Reply with a short OK.",
            model=model,
            timeout=timeout,
        )
    except ClaudeCLIError as e:
        message = str(e)
        error_code = "cli_missing" if "not found" in message.lower() else "cli_error"
        return {
            "healthy": False,
            "provider": "claude_cli",
            "model": model,
            "error_code": error_code,
            "message": message,
        }
    except Exception as e:
        logger.exception("Unexpected Claude CLI health failure")
        return {
            "healthy": False,
            "provider": "claude_cli",
            "model": model,
            "error_code": "cli_error",
            "message": f"Claude CLI health check failed: {e}",
        }

    if not content.strip():
        return {
            "healthy": False,
            "provider": "claude_cli",
            "model": model,
            "error_code": "empty_content",
            "message": "Claude CLI returned empty response",
        }

    return {
        "healthy": True,
        "provider": "claude_cli",
        "model": model,
        "response_model": model,
        "content": content,
    }


def _short(text: str, limit: int = 240) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"
