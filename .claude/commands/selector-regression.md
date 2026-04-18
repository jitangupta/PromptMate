---
description: Triage a host-site selector regression (ChatGPT / Claude redesign broke injection).
allowed-tools: Read, Grep, Edit
argument-hint: "<chatgpt | claude> [new-selector]"
---

Triage a host-site selector regression. The first argument is the host (`chatgpt` or `claude`); the optional second argument is a replacement selector the user has already identified.

## Steps

1. Identify the relevant content script:
   - `chatgpt` → `scripts/gpt-content.js`
   - `claude` → `scripts/claude-content.js`

2. Find the current injection selector in that file. Common anchors:
   - ChatGPT: `#conversation-header-actions`
   - Claude: `header .right-3.flex.gap-2 > div`

3. Report to the user:
   - The file and line number of the current selector
   - What the selector currently targets
   - If a replacement selector was passed as argument 2, propose the exact edit (old string → new string) but **do not apply it without user confirmation** — selector fixes need a manual browser verification step.

4. Remind the user of the verification step:
   > Load unpacked → open the host site → confirm the PromptMate button appears in the expected location.

## Don't do

- Don't broaden the selector (e.g. fallback to generic `.flex` matches) — that causes injection into the wrong container.
- Don't change the selector in only one host file if the issue affects both.
