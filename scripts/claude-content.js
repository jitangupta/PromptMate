import { initSidebar } from "./sidebar-core.js";

const CLAUDE_INPUT_SELECTORS = [
  '[data-testid="chat-input"]',
  '[aria-label="Write your prompt to Claude"]',
  '[contenteditable="true"][role="textbox"]',
  'div.ProseMirror[contenteditable="true"]',
];

function findClaudeInput() {
  for (const selector of CLAUDE_INPUT_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) return { el, selector };
  }
  return { el: null, selector: CLAUDE_INPUT_SELECTORS.join(", ") };
}

function selectAllContent(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function insertIntoClaudeInput(text) {
  let attemptedSelector = CLAUDE_INPUT_SELECTORS.join(", ");
  try {
    const { el, selector } = findClaudeInput();
    attemptedSelector = selector;
    if (!el) throw new Error("Input selector not found");

    el.focus();
    selectAllContent(el);

    // dispatchEvent returns false when a handler calls preventDefault(); for a
    // paste this means ProseMirror read the clipboardData and inserted the
    // text itself. Treating that as a failure (the previous logic) caused us
    // to also run execCommand("insertText") and double-insert the prompt.
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
      host: "claude",
      selector: attemptedSelector,
      error: err,
    });
    return { success: false, error: err?.message || String(err) };
  }
}

initSidebar({ insertText: insertIntoClaudeInput });
