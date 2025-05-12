document.getElementById("inject").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const prompt = document.getElementById("prompt").value;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (userPrompt) => {
      const textarea = document.querySelector("textarea");
      if (textarea) {
        textarea.value = userPrompt;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    args: [prompt]
  });
});
