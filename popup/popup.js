document.getElementById("inject").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const promptValue = document.getElementById("prompt").value;
  const errorMessageDiv = document.getElementById("error-message");

  // Clear previous error messages
  if (errorMessageDiv) {
    errorMessageDiv.textContent = "";
    errorMessageDiv.style.display = "none";
  }

  try {
    if (!tab || tab.id === undefined) {
        throw new Error("Could not get active tab. Please try again.");
    }
    if (!tab.url || (!tab.url.startsWith("https://chatgpt.com/") && !tab.url.startsWith("https://claude.ai/"))) {
        throw new Error("This extension only works on chatgpt.com or claude.ai pages.");
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (userPrompt) => {
        // This function runs in the content script context
        const supportedSelectors = [
          'textarea', // Generic for many sites, including chatgpt.com
          'div[aria-label="Write your prompt to Claude"] p', // Claude's prompt input (target the <p>)
          'div[contenteditable="true"][data-placeholder*="Message"]', // Another common contenteditable pattern
        ];
        let injected = false;
        for (const selector of supportedSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
                    element.value = userPrompt;
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    injected = true;
                    break;
                } else if (element.tagName === 'DIV' || element.tagName === 'P') { // For contenteditable or <p> in Claude
                    element.textContent = userPrompt;
                    // Dispatching an input event on contenteditable might need more specific handling
                    // if the site relies on it, but textContent change is often enough.
                    // For Claude, the existing content script handles the actual injection better.
                    // This popup injection is more of a generic fallback.
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    injected = true;
                    break;
                }
            }
        }
        if (!injected) {
            // This error will be caught by the .then/.catch in the popup if func throws it,
            // or can be returned as a result.
            return { success: false, error: "Could not find a suitable text area or input field on the page." };
        }
        return { success: true };
      },
      args: [promptValue]
    });

    // Check results from executeScript
    if (chrome.runtime.lastError) {
      // This catches manifest issues, page access errors etc.
      throw new Error(chrome.runtime.lastError.message);
    }

    if (results && results[0] && results[0].result && !results[0].result.success) {
        throw new Error(results[0].result.error || "Failed to inject prompt. Textarea not found or script error.");
    }

    // Optionally, provide success feedback or close popup
    // window.close(); 

  } catch (error) {
    if (errorMessageDiv) {
      errorMessageDiv.textContent = "Error: " + error.message;
      errorMessageDiv.style.display = "block";
    } else {
      // Fallback if the error div isn't in popup.html for some reason
      console.error("Popup error message div not found. Error:", error.message);
      alert("Error: " + error.message); // Fallback to alert if div is missing
    }
  }
});

// Ensure there's an element with id="error-message" in popup.html, e.g.:
// <div id="error-message" style="color: red; margin-top: 10px; display: none;"></div>
