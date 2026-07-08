const SUPPORTED_HOSTS = new Map([
  ["chatgpt.com", "ChatGPT"],
  ["claude.ai", "Claude"],
  ["chat.deepseek.com", "DeepSeek"],
  ["kimi.com", "Kimi"],
  ["www.kimi.com", "Kimi"],
  ["grok.com", "Grok"],
  ["www.grok.com", "Grok"],
  ["gemini.google.com", "Gemini"],
  ["perplexity.ai", "Perplexity"],
  ["www.perplexity.ai", "Perplexity"],
  ["copilot.microsoft.com", "Microsoft Copilot"],
  ["chat.mistral.ai", "Le Chat"],
  ["meta.ai", "Meta AI"],
  ["www.meta.ai", "Meta AI"],
  ["chat.qwen.ai", "Qwen Chat"],
  ["poe.com", "Poe"],
  ["www.poe.com", "Poe"],
  ["aistudio.google.com", "Google AI Studio"],
  ["pi.ai", "Pi"],
]);

// Hosts where the content script only injects on a specific path.
const PATH_SCOPED_HOSTS = new Map([
  ["x.com", { path: "/i/grok", name: "Grok" }],
  ["huggingface.co", { path: "/chat", name: "HuggingChat" }],
]);

const REVIEW_URL = `https://chrome.google.com/webstore/detail/${chrome.runtime.id}/reviews`;

function getSupportedPlatform(url) {
  try {
    const { hostname, pathname } = new URL(url);
    const scoped = PATH_SCOPED_HOSTS.get(hostname);
    if (scoped) return pathname.startsWith(scoped.path) ? scoped.name : null;
    return SUPPORTED_HOSTS.get(hostname) || null;
  } catch {
    return null;
  }
}

async function updateCurrentSite() {
  const status = document.getElementById("site-status");
  const pill = document.getElementById("site-pill");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const platform = getSupportedPlatform(tab?.url || "");

    if (platform) {
      status.textContent = `PromptMate is available on ${platform}.`;
      pill.textContent = "Supported";
      pill.classList.add("supported");
      return;
    }

    status.textContent = "Open a supported AI chat (ChatGPT, Claude, Gemini, Grok, Perplexity, and more) to use the sidebar.";
    pill.textContent = "Not active";
    pill.classList.remove("supported");
  } catch {
    status.textContent = "Could not read the current tab.";
    pill.textContent = "Unknown";
    pill.classList.remove("supported");
  }
}

document.getElementById("rate-link").href = REVIEW_URL;

updateCurrentSite();
