---
description: Pre-push safety check — scan staged changes for secrets and build artifacts, run build.
allowed-tools: Bash(git status), Bash(git diff:*), Bash(git ls-files:*), Bash(npm run build), Grep, Read
---

Run a pre-push safety check on the current branch. Report findings as a checklist.

## 1. Sensitive-pattern scan on staged + unstaged changes

Use `git diff --cached` and `git diff` to see changes, then grep the diff output for:

- `API_KEY`, `SECRET`, `TOKEN`, `Bearer`
- `sk-` (OpenAI / Anthropic keys)
- `ghp_` (GitHub personal tokens)
- `xox` (Slack tokens)
- `AIza` (Google API keys)
- `client_secret`
- Hardcoded email addresses in source files (not package.json)
- Hardcoded absolute paths (`C:\Users\`, `/Users/`, `/home/`)

## 2. Build artifact / private file staging

Confirm none of these are in `git diff --cached`:
- Anything under `dist/`
- Anything under `promptmate-dist/`
- Anything under `tasks/` or `notes/` (gitignored, should never appear)
- `promptmate-key.pem`
- Any `.env*` file

## 3. Build verification

Run `npm run build` and confirm it completes without errors.

## Report format

Output a checklist with `[x]` for pass and `[!]` for blocker. If anything is a blocker, stop and tell the user — do not proceed.
