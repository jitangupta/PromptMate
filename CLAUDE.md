# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PromptMate is a **Manifest V3 Chrome extension** that injects a prompt-management sidebar into ChatGPT (`chatgpt.com`) and Claude (`claude.ai`). Prompts are composed from a user-written body plus a selectable **Tone** and **Output Format** (defined in `scripts/business.js`), then inserted into the host site's input field.

## Commands

- `npm run build` — Rollup build of the three bundles into `dist/` (gitignored).
- `npm run watch` — Rollup in watch mode.
- `npm run build:package` — Copies `dist/`, `icons/`, `popup/`, and `manifest.json` into `promptmate-dist/` and zips it for Chrome Web Store upload. Run `build` first (or use `npm run release`).
- `npm run release` — `build` then `build:package`.
- `npm test` — Jest is configured in `package.json` but **there are no test files in the repo**; the script currently does nothing useful.

To load the extension locally: `npm run build`, then in Chrome → `chrome://extensions` → "Load unpacked" → select the repo root (the root `manifest.json` points at `dist/*.bundle.js`).

## Architecture

### Build outputs (declared in `manifest.json`, produced by `rollup.config.js`)
Three IIFE bundles — content scripts **cannot be ESM**, so Rollup bundles ES modules into IIFE:
- `dist/background.bundle.js` ← `background.js` (service worker, currently just a stub)
- `dist/gpt-content.bundle.js` ← `scripts/gpt-content.js` (injected into `chatgpt.com`)
- `dist/claude-content.bundle.js` ← `scripts/claude-content.js` (injected into `claude.ai`, plus `styles/claude.css`)

### Shared modules
- `scripts/business.js` — **Single source of truth** for: `STORAGE_KEY`, `TONE_OPTIONS`, `FORMAT_OPTIONS` (each option has `{ option, category, instruction }` — `category` drives `<optgroup>` grouping in the select widgets), and storage/analytics helpers (`loadPrompts`, `savePrompts`, `recordAnalytics`, `shareAnalytics`). Persistence is `chrome.storage.local`. Edit options here and both hosts pick them up.
- `scripts/utility.js` — DOM builders. Note there are **two parallel sets**: `makeInputField`/`makeSelectField` (ChatGPT) and `makeClaudeInputField`/`makeClaudeSelectField` (Claude). They exist separately because each host site uses its own Tailwind design-token classes (`bg-token-*`/`text-token-*` for ChatGPT, `bg-bg-*`/`text-text-*`/`border-border-*` for Claude). When adding a new field, update both.

### Host integrations (`gpt-content.js`, `claude-content.js`)
Each content script:
1. Waits for the host page's DOM and injects a "PromptMate" header button (selectors are specific to each host's current DOM — e.g., ChatGPT uses `#conversation-header-actions`, Claude uses `header .right-3.flex.gap-2 > div`; these **break when the host site ships a redesign** and are the most likely source of regressions).
2. Toggles a sidebar with a prompt list, a create/edit form, and the Tone/Format selectors.
3. On "Use", writes the composed text into the host's input (textarea for ChatGPT, `contenteditable` ProseMirror for Claude) and dispatches the input events the host framework expects.

### Popup (`popup/`)
The toolbar popup (`popup.html` + `popup.js`) is a **minimal/beta UI** — it just injects a prompt into the first `<textarea>` on the active tab. The real feature surface is the in-page sidebar, not the popup.

## Conventions to preserve

- **Keep `business.js` host-agnostic.** Anything DOM- or host-specific belongs in the content script or `utility.js`.
- **Mirror Tone/Format changes across both hosts.** Since ChatGPT and Claude share `business.js`, option changes propagate automatically — but if you add a new form field, remember to add it to both `gpt-content.js` and `claude-content.js` and add matching `makeX`/`makeClaudeX` helpers in `utility.js`.
- **Don't add permissions casually.** `manifest.json` currently requests only `storage` + `scripting` and host permissions for the two target sites. The recent commit history (`4797752`, `63b9094`) shows deliberate permission minimization.
- **Host DOM selectors are fragile.** When either site redesigns, fix selectors rather than broadening them — broad selectors cause injection into the wrong containers.
