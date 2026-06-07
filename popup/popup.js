const SUPPORTED_HOSTS = new Map([
  ["chatgpt.com", "ChatGPT"],
  ["claude.ai", "Claude"],
  ["chat.deepseek.com", "DeepSeek"],
  ["kimi.com", "Kimi"],
  ["www.kimi.com", "Kimi"],
]);

const REVIEW_URL = `https://chrome.google.com/webstore/detail/${chrome.runtime.id}/reviews`;

function getSupportedPlatform(url) {
  try {
    const { hostname } = new URL(url);
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

    status.textContent = "Open ChatGPT, Claude, DeepSeek, or Kimi to use the sidebar.";
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
