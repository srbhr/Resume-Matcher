---
name: frontend-dev
description: Develop frontend features using the frontend development agent. Creates Next.js pages, React components with Swiss International Style.
model: Claude Opus 4.6 (copilot)
agent: agent
---

<USER_REQUEST_INSTRUCTIONS>
Call #tool:agent/runSubagent - include the following args:

- agentName: "frontend-dev"
- prompt: $USER_QUERY
</USER_REQUEST_INSTRUCTIONS>

<USER_REQUEST_RULES>

- Use the frontend-dev subagent for all frontend development tasks.
- The subagent enforces Swiss International Style (rounded-none, hard shadows, Swiss palette).
- Ensure all UI code passes `npm run lint` and `npm run format`.
- You can call the subagent multiple times to iterate on components.
- Do not modify the subagent's code output.

</USER_REQUEST_RULES>

--- USER_REQUEST_START ---
