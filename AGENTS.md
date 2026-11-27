# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, GitHub Copilot, Antigravity and others) opened in this repository.

## Using Resume Matcher

If the user wants to **use** Resume Matcher (set it up, create a master resume, tailor it to job descriptions, write a cover letter or outreach message, export a PDF), read and follow [`.claude/skills/resume-matcher/SKILL.md`](.claude/skills/resume-matcher/SKILL.md).

You do the AI work, so no API key is needed. The `resume-matcher` command stores, checks and renders what you write, and the user edits the result in the web app at <http://localhost:3000>. In Claude Code the same instructions are the `/resume-matcher` skill.

Job descriptions the user saves for you go in [`jobs/`](jobs/README.md). That folder and the app's `apps/backend/data/` hold personal data and are gitignored: never commit them.

## Changing Resume Matcher's code

If the user wants to **change** Resume Matcher itself, follow [`.claude/CLAUDE.md`](.claude/CLAUDE.md) and [CONTRIBUTING.md](.github/CONTRIBUTING.md). Setup for development is in [SETUP.md](SETUP.md).

### ui-sdk (frontend components)

The frontend (`apps/frontend`) has [ui-sdk](https://github.com/vercel-labs/ui) installed (`@ui-sdk/react`, `@ui-sdk/core`). Before using it, follow the `ui-sdk` skill if it's installed, and read `apps/frontend/node_modules/@ui-sdk/react/docs/llms.txt`. To build a new component, also search `apps/frontend/node_modules/@ui-sdk/react/docs/core.md` by heading, and read `rendering.md` next to it. Its styles load in `app/(default)/css/globals.css`, in Tailwind's components layer, and the Swiss design rules in [`.claude/CLAUDE.md`](.claude/CLAUDE.md) still apply to anything built with it.
