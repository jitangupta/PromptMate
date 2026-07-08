<p align="center">
  <img src="assets/logo.png" alt="PromptMate" width="280" />
</p>

<h1 align="center">PromptMate</h1>

<p align="center">Your prompts. One click away.</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/oknglgpcglngpaobpjndcaaljdchmgai">
    <img src="https://img.shields.io/badge/Chrome%20Web%20Store-Install-4285F4?logo=googlechrome&logoColor=white" alt="Install from Chrome Web Store" />
  </a>
  &nbsp;
  <a href="https://github.com/jitangupta/PromptMate">
    <img src="https://img.shields.io/github/stars/jitangupta/PromptMate?style=social" alt="Star on GitHub" />
  </a>
</p>

PromptMate is a Chrome extension that injects a prompt-management sidebar into 15 AI chat platforms: [ChatGPT](https://chatgpt.com), [Claude](https://claude.ai), [Gemini](https://gemini.google.com), [Grok](https://grok.com), [Perplexity](https://www.perplexity.ai), [Microsoft Copilot](https://copilot.microsoft.com), [DeepSeek](https://chat.deepseek.com), [Mistral Le Chat](https://chat.mistral.ai), [Meta AI](https://www.meta.ai), [Qwen Chat](https://chat.qwen.ai), [Kimi](https://kimi.com), [Poe](https://poe.com), [HuggingChat](https://huggingface.co/chat), [Google AI Studio](https://aistudio.google.com), and [Pi](https://pi.ai). Compose prompts from a reusable body plus selectable **Tone** and **Output Format** presets, then insert them into the host chat with a single click.

## Features

- **Prompt library** — save, edit, and organize prompts in a sidebar alongside the chat
- **Tone + Output Format presets** — compose prompts by combining a body with reusable modifiers (formal, concise, bullet list, JSON, etc.)
- **One-click insert** — sends the composed text straight into the host chat's input field
- **Google Drive sync** — prompts sync across devices via your own Google Drive; local storage acts as a cache so the extension works offline
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

The extension appears on each supported chat site as a **PromptMate** floating button. Note: on `x.com` and `huggingface.co` the extension is path-scoped (`/i/grok`, `/chat`) — load or refresh those pages directly for the button to appear.

### From Chrome Web Store

Install from the [Chrome Web Store listing](https://chromewebstore.google.com/detail/oknglgpcglngpaobpjndcaaljdchmgai).

## Privacy

PromptMate does not run any backend. Your prompts are stored in your own Google Drive (local storage is used as a cache). No PromptMate server ever sees your data. The extension has host permissions only for the chat sites it injects the sidebar into — and where a site hosts more than the chat (x.com, huggingface.co), the extension only injects on the chat pages (`/i/grok`, `/chat`). Note that Chrome grants host permissions per origin, so the browser will still list access to the whole site even though the extension never runs outside those paths.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, build commands, and the kind of bugs most likely to need triage (hint: host-site DOM selectors break when ChatGPT, Claude, or DeepSeek ships a redesign).

## Agent QA

PromptMate is tested using a dedicated **[PromptMate Agent QA Harness](https://github.com/jitangupta/promptmate-agent-qa-harness)** — 86 test cases across 18 categories, executed by AI agents in real browser sessions on Claude, ChatGPT, DeepSeek, and Kimi.

The harness covers prompt search, tone and format modifiers, group libraries, variable placeholders, version history, trash/restore flows, cloud sync, and platform-specific injection behavior. Test results, development handoff notes, and reports from live QA runs are published there.

This is a worked example of the generalized **[Agent QA Harness](https://github.com/jitangupta/agent-qa-harness)** pattern — a reusable, file-based template for using AI agents as browser QA operators on any product.

## License

[MIT](LICENSE) © Jitan Gupta
