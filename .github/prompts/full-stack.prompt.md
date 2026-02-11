---
name: full-stack
description: Develop features spanning both backend and frontend. Coordinates API design, backend implementation, and frontend UI together.
model: Claude Opus 4.5 (copilot)
agent: agent
---

<USER_REQUEST_INSTRUCTIONS>
Call #tool:agent/runSubagent - include the following args:

- agentName: "full-stack"
- prompt: $USER_QUERY
</USER_REQUEST_INSTRUCTIONS>

<USER_REQUEST_RULES>

- Use the full-stack subagent for tasks that span both backend and frontend.
- The subagent will design the API contract first, then implement both layers.
- Ensure backend follows type hints and error handling patterns.
- Ensure frontend follows Swiss International Style.
- You can call the subagent multiple times to iterate.
- Do not modify the subagent's output.

</USER_REQUEST_RULES>

--- USER_REQUEST_START ---
