import "./test-seam.js";
import { initSidebar } from "./sidebar-core.js";

const LAYOUT_SELECTOR = "div.relative.flex.w-full";
const SIDEBAR_WIDTH = 380;

const CHATGPT_INPUT_SELECTORS = [
  'div.ProseMirror[contenteditable="true"]',
  '[contenteditable="true"]#prompt-textarea',
  "#prompt-textarea",
  'textarea[name="prompt-textarea"]',
];

function findChatGPTInput() {
  for (const selector of CHATGPT_INPUT_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) return { el, selector };
  }
  return { el: null, selector: CHATGPT_INPUT_SELECTORS.join(", ") };
}

function selectAllContent(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function insertIntoChatGPTInput(text) {
  let attemptedSelector = CHATGPT_INPUT_SELECTORS.join(", ");
  try {
    const { el, selector } = findChatGPTInput();
    attemptedSelector = selector;
    if (!el) throw new Error("Input selector not found");

    el.focus();

    // Real <textarea> fallback — set value and fire input so React's
    // onChange handlers see it. Modern ChatGPT doesn't render this, but
    // a future revert wouldn't break us.
    if (el.tagName === "TEXTAREA") {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      ).set;
      setter.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return { success: true };
    }

    // contenteditable / ProseMirror — paste-event pattern.
    // dispatchEvent returns false when a handler calls preventDefault(); for a
    // paste this means ProseMirror read the clipboardData and inserted the
    // text itself. Treating that as a failure (the previous logic) caused us
    // to also run execCommand("insertText") and double-insert the prompt.
    selectAllContent(el);
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      const evt = new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(evt);
      if (evt.defaultPrevented) return { success: true };
    } catch (err) {
      console.warn("PromptMate: paste event failed, falling back to execCommand", err);
    }

    if (document.execCommand("insertText", false, text)) {
      return { success: true };
    }
    throw new Error("execCommand insertText returned false");
  } catch (err) {
    console.warn("[PromptMate] Insert failed:", {
      host: "chatgpt",
      selector: attemptedSelector,
      error: err,
    });
    return { success: false, error: err?.message || String(err) };
  }
}

function adjustLayout(isOpen) {
  const layout = document.querySelector(LAYOUT_SELECTOR);
  if (!layout) return;
  layout.style.transition = "margin-right 0.3s ease";
  layout.style.marginRight = isOpen ? `${SIDEBAR_WIDTH}px` : "";
}

initSidebar({ insertText: insertIntoChatGPTInput, adjustLayout });
