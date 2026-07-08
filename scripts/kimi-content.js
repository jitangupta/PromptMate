import "./test-seam.js";
import { initSidebar } from "./sidebar-core.js";
import { createInsertText } from "./insert-adapter.js";

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

initSidebar({
  insertText: createInsertText({ host: "kimi", selectors: KIMI_INPUT_SELECTORS }),
});
