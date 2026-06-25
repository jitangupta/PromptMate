# Changelog

All notable changes to PromptMate are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions correspond to `manifest.json` / `package.json`.

---

## [Unreleased]

---

## [0.8.0] — Variables, Prompt Groups & User Context

### Added
- **Variables in Prompts** — embed `{{variable}}` placeholders in any prompt; a fill-in dialog appears before the prompt is sent so values are substituted on the fly
- **Prompt Groups** — organise prompts into named groups; the sidebar shows prompts grouped for faster browsing and less clutter
- **Group Instructions** — attach a shared instruction to a group that automatically prepends to every prompt inside it, removing the need to repeat context per prompt
- **User Context** — set a persistent personal context (role, background, preferences) that is appended to every outgoing prompt across all platforms

---

## [0.7.1] — UI & Branding, DeepSeek support, Restore Prompts

### Added
- **DeepSeek support** — PromptMate now injects into `chat.deepseek.com` alongside ChatGPT and Claude
- **Restore deleted prompts** — soft-delete with a trash/restore flow so accidental deletions can be undone
- Extension icon used as in-page PromptMate branding (replaces text logo)
- Insert failure fallback copy — graceful message when prompt injection into the host input fails

### Changed
- Tone and format controls collapsed and trimmed for a cleaner compose view
- Prompt library menu icons fixed
- Release messaging and rating prompts polished

### Fixed
- Backdrop clicks no longer discard unsaved prompt edits

---

## [0.6.0] — Prompt History

### Added
- **Prompt version history** — every edit is versioned; view a word-level diff between any two versions
- First-run onboarding guide with sample prompts so new users aren't dropped into an empty state
- What's New banner announcing the history feature on upgrade
- Feature request link surfaced in the UI

### Fixed
- Tone/format selector visibility and double-insert bug on compose
- Silent prompt loss on sync stopped — IDs now stable across save/load cycles
- `⌘K` global shortcut removed (was conflicting with host-site shortcuts)
- Sync status moved above the New Prompt button for clearer layout

---

## [0.5.0] — v2 Redesign & Cross-Browser Auth

### Added
- **Cross-browser OAuth** via `launchWebAuthFlow` + PKCE — works on Brave, Edge, Vivaldi, and Opera in addition to Chrome
- v2 sidebar redesign — floating pill trigger, search bar, Pinned/Recent grouping, used counter
- Google Drive as the source of truth for prompt storage with local cache fallback
- Google Sign-In gate — prompts sync to your account across devices

### Fixed
- Sidebar locked to 380 px width and mounted on `document.body` to survive host-site DOM changes
- ChatGPT ProseMirror input insertion made reliable
- Claude selector fixed after host-site redesign; unnecessary permissions removed

---

## [0.4.5] — Initial Release

### Added
- Prompt library sidebar injected into ChatGPT (`chatgpt.com`) and Claude (`claude.ai`)
- Create, edit, delete, and pin prompts
- Tone and Output Format selectors that compose with the prompt body before insertion
- Analytics (usage tracking, prompt share)
- Rollup build pipeline with three IIFE bundles (background, GPT content, Claude content)
- Chrome Web Store release
