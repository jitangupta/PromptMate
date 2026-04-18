# PromptMate

Your prompts. One click away.

PromptMate is a Chrome extension that injects a prompt-management sidebar into [ChatGPT](https://chatgpt.com) and [Claude](https://claude.ai). Compose prompts from a reusable body plus selectable **Tone** and **Output Format** presets, then insert them into the host chat with a single click.

## Features

- **Prompt library** — save, edit, and organize prompts in a sidebar alongside the chat
- **Tone + Output Format presets** — compose prompts by combining a body with reusable modifiers (formal, concise, bullet list, JSON, etc.)
- **One-click insert** — sends the composed text straight into the ChatGPT or Claude input field
- **Local-first** — prompts are stored in `chrome.storage.local` on your machine (Drive sync coming soon)
- **No servers, no tracking** — the extension talks only to the host sites you're already using

## Install

### From source (current path while pre-release)

```bash
git clone https://github.com/jitangupta/PromptMate.git
cd PromptMate
npm install
npm run build
```

Then in Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the repo root

The extension appears on `chatgpt.com` and `claude.ai` as a **PromptMate** button in the header.

### From Chrome Web Store

Coming soon.

## Privacy

PromptMate does not run any backend. Your prompts are stored in your browser's local extension storage and (once Drive sync ships) in your own Google Drive. The extension has host permissions only for `chatgpt.com` and `claude.ai` — the two sites it injects the sidebar into.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, build commands, and the kind of bugs most likely to need triage (hint: host-site DOM selectors break when ChatGPT or Claude ships a redesign).

## License

[MIT](LICENSE) © Jitan Gupta
