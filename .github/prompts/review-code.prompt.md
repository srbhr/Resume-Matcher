---
name: review-code
description: Review code for correctness, security, performance, and project conventions. Checks both backend and frontend patterns.
model: Claude Opus 4.5 (copilot)
agent: agent
---

<USER_REQUEST_INSTRUCTIONS>
Call #tool:agent/runSubagent - include the following args:

- agentName: "code-review"
- prompt: $USER_QUERY
</USER_REQUEST_INSTRUCTIONS>

<USER_REQUEST_RULES>

- Use the code-review subagent for all code review tasks.
- The subagent checks: type hints, error handling, security, performance, Swiss style, YAGNI.
- Report issues in severity format: [CRITICAL], [ERROR], [WARNING], [INFO].
- You can call the subagent multiple times for thorough review.
- Do not soften or omit findings.

</USER_REQUEST_RULES>

--- USER_REQUEST_START ---
