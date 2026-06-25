/*
 * Tests for variables & placeholders (Task 29):
 *   extractVariables / substituteVariables pure helpers, and the `vars`
 *   field persisting through savePrompt.
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

const CACHE_KEY = "promptmate_cache";

let drive;
let business;

beforeEach(() => {
  globalThis.__pmStore.clear();
  jest.resetModules();
  drive = require("../scripts/drive.js");
  business = require("../scripts/business.js");
});

describe("extractVariables", () => {
  it("extracts unique variables in order of appearance", () => {
    const vars = business.extractVariables("Hello {{name}}, talk about {{topic}} for {{name}}");
    expect(vars).toEqual([
      { key: "name", label: "name", val: "" },
      { key: "topic", label: "topic", val: "" },
    ]);
  });

  it("trims whitespace inside braces and dedupes against trimmed keys", () => {
    const vars = business.extractVariables("{{ topic }} and {{topic}}");
    expect(vars).toEqual([{ key: "topic", label: "topic", val: "" }]);
  });

  it("supports multi-word keys", () => {
    expect(business.extractVariables("{{target audience}}")).toEqual([
      { key: "target audience", label: "target audience", val: "" },
    ]);
  });

  it("skips blank keys and handles empty/non-string input", () => {
    expect(business.extractVariables("{{  }} plain")).toEqual([]);
    expect(business.extractVariables("")).toEqual([]);
    expect(business.extractVariables(null)).toEqual([]);
    expect(business.extractVariables("no variables here")).toEqual([]);
  });
});

describe("substituteVariables", () => {
  it("replaces all occurrences of filled keys", () => {
    const out = business.substituteVariables("Hi {{name}}, bye {{name}}", { name: "Ada" });
    expect(out).toBe("Hi Ada, bye Ada");
  });

  it("matches tokens with internal whitespace against trimmed keys", () => {
    const out = business.substituteVariables("About {{ topic }}", { topic: "Rust" });
    expect(out).toBe("About Rust");
  });

  it("leaves unfilled and unknown tokens intact", () => {
    const out = business.substituteVariables("A {{x}} and {{y}}", { x: "1" });
    expect(out).toBe("A 1 and {{y}}");
  });

  it("is safe with regex-special characters in values", () => {
    const out = business.substituteVariables("Price: {{amount}}", { amount: "$1.00 (50% off)" });
    expect(out).toBe("Price: $1.00 (50% off)");
  });

  it("does not treat $& style replacement patterns in values", () => {
    const out = business.substituteVariables("V: {{v}}", { v: "$&$'" });
    expect(out).toBe("V: $&$'");
  });
});

describe("vars persistence", () => {
  it("savePrompt derives vars from the body and sends them to Drive", async () => {
    drive.createPrivatePrompt.mockResolvedValue({ fileId: "f1", etag: "e1" });

    const promptId = await business.savePrompt({
      title: "T",
      body: "Write about {{topic}} for {{audience}}",
      vars: [{ key: "bogus", label: "bogus", val: "should be ignored" }],
    });

    const cached = globalThis.__pmStore.get(CACHE_KEY).prompts[promptId];
    expect(cached.vars).toEqual([
      { key: "topic", label: "topic", val: "" },
      { key: "audience", label: "audience", val: "" },
    ]);
    expect(drive.createPrivatePrompt.mock.calls[0][0].vars).toEqual(cached.vars);
  });

  it("normalizes legacy prompts by deriving vars from body on read", async () => {
    drive.listPrivatePrompts.mockResolvedValue([]);
    drive.listVisiblePrompts.mockResolvedValue([]);
    globalThis.__pmStore.set(CACHE_KEY, {
      prompts: {
        p1: {
          promptId: "p1",
          title: "Legacy",
          body: "Hello {{name}}",
          createdAt: "2026-01-01T00:00:00.000Z",
          pending: true,
        },
      },
      pendingWrites: [],
    });

    const prompts = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 2000);
      business.listPrompts((ps, meta) => {
        if (!meta.fromCache) {
          clearTimeout(timer);
          resolve(ps);
        }
      });
    });

    expect(prompts[0].vars).toEqual([{ key: "name", label: "name", val: "" }]);
  });
});
