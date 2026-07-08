import "./test-seam.js";
import { initSidebar } from "./sidebar-core.js";
import { createInsertText } from "./insert-adapter.js";

const DEEPSEEK_INPUT_SELECTORS = [
  'textarea[placeholder*="Message DeepSeek"]',
  'textarea[placeholder*="message DeepSeek" i]',
  'textarea[placeholder*="DeepSeek" i]',
  'textarea[aria-label*="DeepSeek" i]',
  'textarea[placeholder*="Message" i]',
  'textarea',
  '[data-testid*="chat-input" i]',
  '[contenteditable="true"][aria-label*="DeepSeek" i]',
  '[contenteditable="true"][role="textbox"]',
  'div.ProseMirror[contenteditable="true"]',
  '[contenteditable="true"]',
];

initSidebar({
  insertText: createInsertText({ host: "deepseek", selectors: DEEPSEEK_INPUT_SELECTORS }),
});
