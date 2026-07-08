// Shared insert logic for host adapters. Each host content script supplies a
// fallback-ordered selector list; everything else (find, textarea vs
// contenteditable insertion, failure telemetry) is identical across hosts.

// PromptMate mounts its own inputs (sidebar form, context modal textarea) into
// the page; generic fallbacks like `textarea` must never match them, or the
// prompt gets inserted into our own UI and reported as success.
const PROMPTMATE_OWN_UI = "#promptmate-sidebar, #promptmate-pill, .pm-modal-overlay";

function isUsableComposer(el) {
  if (!el) return false;
  if (el.closest?.(PROMPTMATE_OWN_UI)) return false;
  if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
  if (el.matches?.('[contenteditable="false"]')) return false;
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

function findInput(selectors) {
  for (const selector of selectors) {
    const el = Array.from(document.querySelectorAll(selector)).find(isUsableComposer);
    if (el) return { el, selector };
  }
  return { el: null, selector: selectors.join(", ") };
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

export function createInsertText({ host, selectors }) {
  return function insertText(text) {
    let attemptedSelector = selectors.join(", ");
    try {
      const { el, selector } = findInput(selectors);
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

      // dispatchEvent returns false when a handler calls preventDefault(); for a
      // paste this means the rich editor read the clipboardData and inserted the
      // text itself. Treating that as a failure would make us also run
      // execCommand("insertText") and double-insert the prompt.
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
        host,
        selector: attemptedSelector,
        error: err,
      });
      return { success: false, error: err?.message || String(err) };
    }
  };
}
