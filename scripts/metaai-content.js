import "./test-seam.js";
import { initSidebar } from "./sidebar-core.js";
import { createInsertText } from "./insert-adapter.js";

// Meta AI's composer is a Lexical contenteditable.
const METAAI_INPUT_SELECTORS = [
  '[contenteditable="true"][data-lexical-editor="true"]',
  '[contenteditable="true"][aria-label*="Message" i]',
  '[contenteditable="true"][aria-label*="Ask" i]',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"]',
  'textarea[placeholder*="Ask Meta AI" i]',
  'textarea[placeholder*="Ask" i]',
  'textarea',
];

initSidebar({
  insertText: createInsertText({ host: "metaai", selectors: METAAI_INPUT_SELECTORS }),
});
