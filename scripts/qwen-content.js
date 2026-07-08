import "./test-seam.js";
import { initSidebar } from "./sidebar-core.js";
import { createInsertText } from "./insert-adapter.js";

const QWEN_INPUT_SELECTORS = [
  'textarea#chat-input',
  'textarea[placeholder*="Qwen" i]',
  'textarea[placeholder*="Ask" i]',
  'textarea[placeholder*="Message" i]',
  'textarea',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"]',
];

initSidebar({
  insertText: createInsertText({ host: "qwen", selectors: QWEN_INPUT_SELECTORS }),
});
