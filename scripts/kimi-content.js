import "./test-seam.js";
import { initSidebar } from "./sidebar-core.js";

const KIMI_INPUT_SELECTORS = [
  'textarea[placeholder*="Kimi" i]',
  'textarea[placeholder*="message" i]',
  'textarea[aria-label*="chat" i]',
  'textarea',
  '[contenteditable="true"][aria-label*="Kimi" i]',
  '[contenteditable="true"][role="textbox"]',
  'div.ProseMirror[contenteditable="true"]',
  '[contenteditable="true"]',
];

function isUsableComposer(el) {
  if (!el) return false;
  if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
  if (el.matches?.('[contenteditable="false"]')) return false;
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

function findKimiInput() {
  for (const selector of KIMI_INPUT_SELECTORS) {
    const el = Array.from(document.querySelectorAll(selector)).find(isUsableComposer);
    if (el) return { el, selector };
  }
  return { el: null, selector: KIMI_INPUT_SELECTORS.join(", ") };
}

function selectAllContent(el) {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    el.select();
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function insertIntoKimiInput(text) {
  let attemptedSelector = KIMI_INPUT_SELECTORS.join(", ");
  try {
    const { el, selector } = findKimiInput();
    attemptedSelector = selector;
    if (!el) throw new Error("Input selector not found");

    el.focus();
    selectAllContent(el);

    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const valueSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (valueSetter) valueSetter.call(el, text);
      else el.value = text;
      el.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text,
      }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { success: true };
    }

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
      host: "kimi",
      selector: attemptedSelector,
      error: err,
    });
    return { success: false, error: err?.message || String(err) };
  }
}

initSidebar({ insertText: insertIntoKimiInput });
