---
name: navigate-code
description: Search and explore the codebase using the navigator agent. Find functions, components, endpoints, trace flows.
model: Claude Opus 4.5 (copilot)
agent: agent
---

<USER_REQUEST_INSTRUCTIONS>
Call #tool:agent/runSubagent - include the following args:

- agentName: "codebase-navigator"
- prompt: $USER_QUERY
</USER_REQUEST_INSTRUCTIONS>

<USER_REQUEST_RULES>

- Use the codebase-navigator subagent for all code search and exploration tasks.
- The subagent has access to ripgrep search scripts and full project knowledge.
- You can call the subagent multiple times to drill deeper into the codebase.
- Always include file paths and line numbers in results.
- Do not summarize - pass through the full subagent response.

</USER_REQUEST_RULES>

--- USER_REQUEST_START ---
