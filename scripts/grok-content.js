import "./test-seam.js";
import { initSidebar } from "./sidebar-core.js";
import { createInsertText } from "./insert-adapter.js";

// Covers both grok.com and x.com/i/grok (path-scoped in the manifest).
const GROK_INPUT_SELECTORS = [
  'textarea[aria-label*="Grok" i]',
  'textarea[placeholder*="Grok" i]',
  'textarea[placeholder*="What do you want to know" i]',
  'textarea[placeholder*="Ask anything" i]',
  'textarea[placeholder*="Ask" i]',
  'textarea',
  '[contenteditable="true"][aria-label*="Grok" i]',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"]',
];

initSidebar({
  insertText: createInsertText({ host: "grok", selectors: GROK_INPUT_SELECTORS }),
});
