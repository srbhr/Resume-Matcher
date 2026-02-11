---
name: review-ui
description: Review UI changes against Swiss International Style. Scans for anti-patterns like rounded corners, gradients, soft shadows.
model: Claude Opus 4.5 (copilot)
agent: agent
---

<USER_REQUEST_INSTRUCTIONS>
Call #tool:agent/runSubagent - include the following args:

- agentName: "ui-review"
- prompt: $USER_QUERY
</USER_REQUEST_INSTRUCTIONS>

<USER_REQUEST_RULES>

- Use the ui-review subagent to check Swiss International Style compliance.
- The subagent will run automated scans and manual review checks.
- Report all violations clearly with file paths and line numbers.
- Common violations: rounded corners, gradients, soft shadows, blur, off-palette colors.
- You can call the subagent multiple times for thorough review.
- Do not soften or omit violations.

</USER_REQUEST_RULES>

--- USER_REQUEST_START ---
