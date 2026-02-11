---
name: backend-dev
description: Develop backend features using the backend development agent. Creates FastAPI endpoints, schemas, services.
model: Claude Opus 4.6 (copilot)
agent: agent
---

<USER_REQUEST_INSTRUCTIONS>
Call #tool:agent/runSubagent - include the following args:

- agentName: "backend-dev"
- prompt: $USER_QUERY
</USER_REQUEST_INSTRUCTIONS>

<USER_REQUEST_RULES>

- Use the backend-dev subagent for all backend development tasks.
- The subagent knows FastAPI, Pydantic, TinyDB, and LiteLLM patterns for this project.
- Ensure all code follows project conventions: type hints, error handling, deepcopy for mutables.
- You can call the subagent multiple times to iterate on the implementation.
- Do not modify the subagent's code output.

</USER_REQUEST_RULES>

--- USER_REQUEST_START ---
