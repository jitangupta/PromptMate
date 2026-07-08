import "./test-seam.js";
import { initSidebar } from "./sidebar-core.js";
import { createInsertText } from "./insert-adapter.js";

// Perplexity's composer is a Lexical contenteditable (#ask-input); older
// variants used a plain textarea.
const PERPLEXITY_INPUT_SELECTORS = [
  '#ask-input[contenteditable="true"]',
  '#ask-input',
  '[contenteditable="true"][aria-label*="Ask" i]',
  '[contenteditable="true"][role="textbox"]',
  'textarea[placeholder*="Ask" i]',
  'textarea[placeholder*="follow" i]',
  'textarea',
  '[contenteditable="true"]',
];

initSidebar({
  insertText: createInsertText({ host: "perplexity", selectors: PERPLEXITY_INPUT_SELECTORS }),
});
