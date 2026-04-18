# Contributing to PromptMate

Thanks for your interest in contributing. PromptMate is a small Manifest V3 Chrome extension, so the codebase is approachable — but there are a few conventions worth knowing before you dive in.

## Dev setup

```bash
git clone https://github.com/jitangupta/PromptMate.git
cd PromptMate
npm install
npm run build    # one-off build
npm run watch    # rebuild on change
```

Load the extension in Chrome:

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select the repo root
3. Open `chatgpt.com` or `claude.ai` and look for the **PromptMate** header button

### Build commands

| Command | What it does |
|---|---|
| `npm run build` | Rollup build of the three content/background bundles into `dist/` |
| `npm run watch` | Rollup in watch mode for dev |
| `npm run release` | `build` + `build:package` — produces the CWS upload zip in `promptmate-dist/` |

## Code conventions

- **Functional style over classes.** Prefer pure functions and small modules.
- **`scripts/business.js` is host-agnostic.** Anything DOM- or host-specific belongs in the content script or `scripts/utility.js`.
- **Mirror host changes.** ChatGPT and Claude have parallel helpers (`makeInputField` / `makeClaudeInputField`, etc.) because each site uses its own Tailwind design tokens. If you add a form field, add it in both places.
- **Don't broaden DOM selectors.** When ChatGPT or Claude ships a redesign and selectors break, fix the selector to target the new structure — don't fall back to generic `.flex`-style selectors that inject into the wrong container.
- **Don't add permissions casually.** `manifest.json` currently requests only `storage` + `scripting` + two host permissions. The commit history shows deliberate minimization; keep it that way.
- **No secrets in source.** Chrome extension OAuth client IDs are public by design (they ship in the unpacked extension), but any other keys, tokens, or private URLs stay out of the repo.

## The most common kind of bug

> "The PromptMate button disappeared from ChatGPT / Claude."

This is almost always because the host site redesigned their header and the selector we inject into (`#conversation-header-actions` on ChatGPT, `header .right-3.flex.gap-2 > div` on Claude) no longer exists. When filing this bug:

1. Include the date and a screenshot of the host site's current header DOM (DevTools → Elements).
2. Note the exact selector that would now match the "right place" for our button.
3. If you're patching it yourself, update the selector in the relevant content script (`scripts/gpt-content.js` or `scripts/claude-content.js`) and verify on a fresh tab.

## Pull requests

- Small, focused PRs. Bundled refactors are fine when they genuinely belong together; unrelated changes should be separate PRs.
- Run `npm run build` before submitting — the build must be clean.
- Manual sanity check on both `chatgpt.com` and `claude.ai` before marking ready. There are no automated tests for the host integrations; human verification is the only signal.
- Describe **why** in the PR body, not just **what** — the diff already shows what.

## Release checklist (maintainers)

- [ ] Sensitive-info scan on `HEAD`
- [ ] `npm run build` clean
- [ ] Load unpacked, sanity-test on `chatgpt.com` and `claude.ai`
- [ ] Bump `manifest.json` version
- [ ] Bump `package.json` version (keep in sync with manifest)
- [ ] Tag the release: `git tag v0.5.0 && git push --tags`
- [ ] `npm run release` → upload zip from `promptmate-dist/` to the Chrome Web Store dashboard

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
