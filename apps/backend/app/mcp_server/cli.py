"""Run the MCP tools from a shell: ``resume-matcher <tool> [arguments]``.

For agents that run commands rather than connect to an MCP server. Each call
goes through an in-memory MCP client to the same server ``resume-matcher-mcp``
runs, so arguments are validated and results shaped exactly as over MCP. The
result is printed to stdout as JSON. A tool error goes to stderr with exit code
1, a bad command line with exit code 2.
"""

import asyncio
import json
import logging
import re
import sys
from pathlib import Path
from typing import Any, TextIO

from mcp import Client

from app.mcp_server.server import build_server

USAGE = """\
Usage: resume-matcher <tool> [arguments]
       resume-matcher <tool> --help     the tool's description and argument schema

Arguments are one JSON object:
  '{"resume_id": "abc"}'   inline
  @args.json               read from a file
  -                        read from stdin

or any number of fields:
  key=value                a string
  key=@job.md              a string read from a file
  key:=json                any JSON value (number, true, list, object)
  key:=@data.json          any JSON value read from a file

The result is printed as JSON. Exit code 1 means the tool failed (the reason is
on stderr), 2 means the command line was wrong.
"""

# ``key=value`` or ``key:=json``; anything else is a whole JSON object.
_FIELD = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)(:?)=(.*)", re.DOTALL)


class UsageError(Exception):
    """The command line cannot be turned into tool arguments."""


def _read(path: str) -> str:
    try:
        return Path(path).expanduser().read_text(encoding="utf-8")
    except OSError as e:
        raise UsageError(f"Cannot read {path}: {e.strerror or e}") from e


def _load_json(text: str, source: str) -> Any:
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise UsageError(f"{source} is not valid JSON: {e}") from e


def parse_arguments(tokens: list[str], stdin: TextIO) -> dict[str, Any]:
    """Turn the tokens after the tool name into its arguments (see ``USAGE``)."""
    if len(tokens) == 1 and tokens[0].lstrip()[:1] in ("{", "@", "-", "["):
        token = tokens[0]
        if token == "-":
            value = _load_json(stdin.read(), "stdin")
        elif token.startswith("@"):
            value = _load_json(_read(token[1:]), token[1:])
        else:
            value = _load_json(token, "The argument")
        if not isinstance(value, dict):
            raise UsageError("The arguments must be a JSON object.")
        return value

    arguments: dict[str, Any] = {}
    for token in tokens:
        match = _FIELD.fullmatch(token)
        if not match:
            raise UsageError(
                f"Expected key=value, key=@file, key:=json or key:=@file, got {token!r}."
            )
        key, as_json, raw = match.groups()
        if key in arguments:
            raise UsageError(f"{key} is given more than once.")
        text = _read(raw[1:]) if raw.startswith("@") else raw
        arguments[key] = _load_json(text, key) if as_json else text
    return arguments


async def run(args: list[str], stdin: TextIO, stdout: TextIO, stderr: TextIO) -> int:
    """Run one command and return its exit code."""
    if not args or args[0] in ("-h", "--help", "help"):
        async with Client(build_server()) as client:
            listed = (await client.list_tools()).tools
        stdout.write(USAGE + "\nTools:\n")
        width = max(len(tool.name) for tool in listed)
        for tool in sorted(listed, key=lambda t: t.name):
            summary = (tool.description or "").strip().splitlines()[0]
            stdout.write(f"  {tool.name.ljust(width)}  {summary}\n")
        return 0

    name = args[0].replace("-", "_")
    show_help = args[1:] in (["-h"], ["--help"])
    try:
        arguments = {} if show_help else parse_arguments(args[1:], stdin)
    except UsageError as e:
        stderr.write(f"resume-matcher: {e}\n")
        return 2

    async with Client(build_server()) as client:
        tool = next(
            (t for t in (await client.list_tools()).tools if t.name == name), None
        )
        if tool is None:
            stderr.write(
                f"resume-matcher: unknown tool {args[0]!r}. "
                "Run resume-matcher --help for the list.\n"
            )
            return 2
        if show_help:
            stdout.write(f"{tool.description}\n\nArguments (JSON schema):\n")
            stdout.write(json.dumps(tool.input_schema, indent=2) + "\n")
            return 0
        result = await client.call_tool(name, arguments)

    if result.is_error:
        message = " ".join(getattr(block, "text", "") for block in result.content)
        stderr.write(f"{message}\n")
        return 1
    stdout.write(json.dumps(result.structured_content, indent=2) + "\n")
    return 0


def main() -> int:
    # stdout carries only the result; logs go to stderr, warnings and up.
    logging.basicConfig(stream=sys.stderr, level=logging.WARNING, force=True)
    return asyncio.run(run(sys.argv[1:], sys.stdin, sys.stdout, sys.stderr))


if __name__ == "__main__":
    sys.exit(main())
