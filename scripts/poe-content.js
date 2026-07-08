import "./test-seam.js";
import { initSidebar } from "./sidebar-core.js";
import { createInsertText } from "./insert-adapter.js";

const POE_INPUT_SELECTORS = [
  'textarea[class*="GrowingTextArea"]',
  'textarea[placeholder*="Talk" i]',
  'textarea[placeholder*="Ask" i]',
  'textarea[placeholder*="Message" i]',
  'textarea',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"]',
];

initSidebar({
  insertText: createInsertText({ host: "poe", selectors: POE_INPUT_SELECTORS }),
});
