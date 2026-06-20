/*
 * Tests for context & assembly (Task 36):
 *   assembleMessage canonical ordering + toggle suppression, and the
 *   personal-context storage helpers.
 */

jest.mock("../scripts/drive.js", () => ({
  __esModule: true,
  listPrivatePrompts: jest.fn(),
  listVisiblePrompts: jest.fn(),
  readPrompt: jest.fn(),
  createPrivatePrompt: jest.fn(),
  updatePrompt: jest.fn(),
  deletePrompt: jest.fn(),
  publishPrompt: jest.fn(),
  unpublishPrompt: jest.fn(),
  makePrivateAgain: jest.fn(),
  importSharedPrompt: jest.fn(),
  ensureVisibleFolder: jest.fn(),
  listRevisions: jest.fn(),
  readRevision: jest.fn(),
  DriveConflictError: class DriveConflictError extends Error {},
  DriveError: class DriveError extends Error {},
  FILE_SCHEMA_VERSION: 1,
}));

let business;

beforeEach(() => {
  globalThis.__pmStore.clear();
  jest.resetModules();
  business = require("../scripts/business.js");
});

const tone = { option: "Direct", instruction: "Be blunt." };
const format = { option: "Short", instruction: "Under 200 words." };

describe("assembleMessage", () => {
  it("joins layers in canonical order with blank lines", () => {
    const out = business.assembleMessage({
      context: "I'm a platform engineer.",
      groupInstruction: "First-person voice.",
      body: "Write a post about Kubernetes.",
      tone,
      format,
    });
    expect(out).toBe(
      "I'm a platform engineer.\n\nFirst-person voice.\n\nWrite a post about Kubernetes.\n\nBe blunt.\n\nUnder 200 words."
    );
  });

  it("omits empty or whitespace-only layers", () => {
    const out = business.assembleMessage({
      context: "   ",
      groupInstruction: "",
      body: "Body only.",
      tone: null,
      format: undefined,
    });
    expect(out).toBe("Body only.");
  });

  it("suppresses individual layers via toggles", () => {
    const out = business.assembleMessage({
      context: "CTX",
      groupInstruction: "GI",
      body: "BODY",
      tone,
      format,
      toggles: { context: false, tone: false },
    });
    expect(out).toBe("GI\n\nBODY\n\nUnder 200 words.");
  });

  it("always includes the body even when toggles try to disable it", () => {
    const out = business.assembleMessage({
      context: "",
      body: "BODY",
      toggles: { body: false },
    });
    expect(out).toBe("BODY");
  });

  it("trims context and group instruction", () => {
    const out = business.assembleMessage({
      context: "  CTX  ",
      groupInstruction: "  GI  ",
      body: "BODY",
    });
    expect(out).toBe("CTX\n\nGI\n\nBODY");
  });
});

describe("context storage", () => {
  it("round-trips context text", async () => {
    expect(await business.loadContext()).toBe("");
    await business.saveContext("I'm a designer.");
    expect(await business.loadContext()).toBe("I'm a designer.");
  });

  it("defaults enabled to true and persists changes", async () => {
    expect(await business.loadContextEnabled()).toBe(true);
    await business.saveContextEnabled(false);
    expect(await business.loadContextEnabled()).toBe(false);
    await business.saveContextEnabled(true);
    expect(await business.loadContextEnabled()).toBe(true);
  });
});
