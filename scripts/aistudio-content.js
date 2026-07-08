import "./test-seam.js";
import { initSidebar } from "./sidebar-core.js";
import { createInsertText } from "./insert-adapter.js";

// AI Studio is Angular Material; the prompt box is a textarea inside an
// autosize wrapper.
const AISTUDIO_INPUT_SELECTORS = [
  'ms-autosize-textarea textarea',
  'textarea[aria-label*="prompt" i]',
  'textarea[placeholder*="prompt" i]',
  'textarea[placeholder*="Type something" i]',
  'textarea',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"]',
];

initSidebar({
  insertText: createInsertText({ host: "aistudio", selectors: AISTUDIO_INPUT_SELECTORS }),
});
