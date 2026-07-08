import "./test-seam.js";
import { initSidebar } from "./sidebar-core.js";
import { createInsertText } from "./insert-adapter.js";

// Le Chat's composer is a ProseMirror contenteditable.
const LECHAT_INPUT_SELECTORS = [
  'div.ProseMirror[contenteditable="true"]',
  '[contenteditable="true"][aria-label*="chat" i]',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"]',
  'textarea[placeholder*="Le Chat" i]',
  'textarea[placeholder*="Ask" i]',
  'textarea',
];

initSidebar({
  insertText: createInsertText({ host: "lechat", selectors: LECHAT_INPUT_SELECTORS }),
});
