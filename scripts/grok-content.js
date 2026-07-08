import "./test-seam.js";
import { initSidebar } from "./sidebar-core.js";
import { createInsertText } from "./insert-adapter.js";

// Covers both grok.com and x.com/i/grok (path-scoped in the manifest).
// grok.com's composer is a Tiptap/ProseMirror contenteditable
// (aria-label "Ask Grok anything"), not a textarea; the textarea
// selectors remain as fallbacks for x.com/i/grok.
const GROK_INPUT_SELECTORS = [
  '[contenteditable="true"][aria-label*="Ask Grok" i]',
  '[contenteditable="true"][aria-label*="Grok" i]',
  '.tiptap.ProseMirror[contenteditable="true"]',
  'textarea[aria-label*="Grok" i]',
  'textarea[placeholder*="Grok" i]',
  'textarea[placeholder*="What do you want to know" i]',
  'textarea[placeholder*="Ask anything" i]',
  '[contenteditable="true"][role="textbox"]',
  'textarea',
  '[contenteditable="true"]',
];

initSidebar({
  insertText: createInsertText({ host: "grok", selectors: GROK_INPUT_SELECTORS }),
});
