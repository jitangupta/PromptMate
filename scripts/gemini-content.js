import "./test-seam.js";
import { initSidebar } from "./sidebar-core.js";
import { createInsertText } from "./insert-adapter.js";

// Gemini's composer is a Quill rich editor, not a textarea.
const GEMINI_INPUT_SELECTORS = [
  'rich-textarea .ql-editor[contenteditable="true"]',
  'div.ql-editor[contenteditable="true"]',
  '[contenteditable="true"][aria-label*="prompt" i]',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"]',
  'textarea[aria-label*="prompt" i]',
  'textarea',
];

initSidebar({
  insertText: createInsertText({ host: "gemini", selectors: GEMINI_INPUT_SELECTORS }),
});
