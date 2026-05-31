---
name: sensitive-info-scan
description: Scan the PromptMate repo for secrets, credentials, personal data, and other content that should not be published. Use before making the repo public, before a release, or when the user asks to audit the codebase for sensitive information.
---

# Sensitive-information scan

Audit the PromptMate repo for anything that should not be published to a public OSS repository. Use the Grep tool (not shell `grep`) for all pattern searches.

## What to scan

1. **All source files** under `scripts/`, `popup/`, `styles/`, plus `background.js`, `manifest.json`, `rollup.config.js`, root-level JS/JSON/HTML/MD.
2. **`package.json`** and **`package-lock.json`** — dependency manifests occasionally pick up private registry URLs or tokens.
3. **Git history** — run `git log --all -p -S "<pattern>"` for each high-signal pattern. Current-tree cleanliness does not imply history cleanliness.

## What to look for

### Blockers (must fix before publishing)

Grep for these patterns across source files:

- `API_KEY`, `SECRET`, `TOKEN`, `Bearer`, `client_secret`
- `sk-` (OpenAI / Anthropic keys — 40+ chars)
- `ghp_`, `gho_`, `ghs_` (GitHub tokens)
- `xox[abp]-` (Slack tokens)
- `AIza` (Google API keys — 39 chars)
- Sentry DSNs (`https://[a-f0-9]+@.*sentry\.io`)
- AWS: `AKIA[0-9A-Z]{16}`

### Review (confirm intentional)

- **Chrome extension OAuth client IDs** — not secrets by design (they ship in the unpacked extension), but flag them so the maintainer confirms they're the intended production values.
- **Personal email addresses in source code** — OK in `package.json` author field, not OK hardcoded in `scripts/` or `popup/`.
- **Internal URLs** — staging domains, company hostnames, localhost committed by accident.
- **`notes/` and `tasks/` folders** — should be gitignored per project convention. If they appear tracked, flag it.

### Cleanup (non-blocking)

- `console.log` / `console.warn` / `console.debug` left from development — list each occurrence with file:line.
- `TODO` / `FIXME` / `XXX` comments — list so the maintainer can triage.
- Hardcoded absolute paths: `C:\Users\`, `/Users/`, `/home/`.

## How to report

Output three sections: **BLOCKER**, **REVIEW**, **CLEANUP**. Under each, list findings as `path:line — description`. If a section is empty, write "None found."

End with a one-line verdict: **Safe to publish** or **Must scrub before publish**.

## Git history check

Run these commands and scan the output:

```bash
git log --all --pretty=format:"%h %s" | head -50
git log --all -p -S "API_KEY" -S "SECRET" -S "Bearer " -S "client_secret" -S "sk-"
git log --all --diff-filter=D --name-only
```

If any real secret surfaces in history, the fix is `git filter-repo --replace-text` (or `--path --invert-paths` for whole files) followed by a coordinated force-push. Warn the user that once the repo is public, scrubbing becomes unreliable due to GitHub's caches and forks — so this must happen **before** the first public push.
