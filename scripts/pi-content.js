import "./test-seam.js";
import { initSidebar } from "./sidebar-core.js";
import { createInsertText } from "./insert-adapter.js";

const PI_INPUT_SELECTORS = [
  'textarea[placeholder*="Talk with Pi" i]',
  'textarea[placeholder*="Talk" i]',
  'textarea[role="textbox"]',
  'textarea',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"]',
];

initSidebar({
  insertText: createInsertText({ host: "pi", selectors: PI_INPUT_SELECTORS }),
});
