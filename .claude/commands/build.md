---
description: Run the Rollup build and report any errors cleanly.
allowed-tools: Bash(npm run build), Read, Grep
---

Run `npm run build` and report the result.

If the build fails, identify the failing file and error, then read the source to propose a fix. Do not apply the fix without user confirmation.

If the build succeeds, confirm the three bundles are present in `dist/`:
- `dist/background.bundle.js`
- `dist/gpt-content.bundle.js`
- `dist/claude-content.bundle.js`
