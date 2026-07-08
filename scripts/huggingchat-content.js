import "./test-seam.js";
import { initSidebar } from "./sidebar-core.js";
import { createInsertText } from "./insert-adapter.js";

// Injected only under huggingface.co/chat (path-scoped in the manifest).
const HUGGINGCHAT_INPUT_SELECTORS = [
  'textarea[placeholder*="Ask" i]',
  'textarea[placeholder*="Message" i]',
  'textarea[aria-label*="chat" i]',
  'textarea',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"]',
];

initSidebar({
  insertText: createInsertText({ host: "huggingchat", selectors: HUGGINGCHAT_INPUT_SELECTORS }),
});
