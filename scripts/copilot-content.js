import "./test-seam.js";
import { initSidebar } from "./sidebar-core.js";
import { createInsertText } from "./insert-adapter.js";

const COPILOT_INPUT_SELECTORS = [
  'textarea#userInput',
  'textarea[placeholder*="Copilot" i]',
  'textarea[aria-label*="Copilot" i]',
  'textarea[placeholder*="Message" i]',
  'textarea[data-testid*="composer" i]',
  'textarea',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"]',
];

initSidebar({
  insertText: createInsertText({ host: "copilot", selectors: COPILOT_INPUT_SELECTORS }),
});
