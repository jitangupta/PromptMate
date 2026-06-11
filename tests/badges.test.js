/*
 * Tests for new-feature badges (Task 34):
 *   getDismissedBadges / dismissBadge round-trip and idempotency.
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

const BADGES_KEY = "promptmate_badges";

let business;

beforeEach(() => {
  globalThis.__pmStore.clear();
  jest.resetModules();
  business = require("../scripts/business.js");
});

describe("feature badges", () => {
  it("starts with nothing dismissed (all badges visible)", async () => {
    const dismissed = await business.getDismissedBadges();
    expect(dismissed.size).toBe(0);
  });

  it("dismissBadge persists the key and round-trips", async () => {
    await business.dismissBadge("feature_context");
    const dismissed = await business.getDismissedBadges();
    expect(dismissed.has("feature_context")).toBe(true);
    expect(dismissed.has("feature_groups")).toBe(false);
    expect(globalThis.__pmStore.get(BADGES_KEY)).toEqual(["feature_context"]);
  });

  it("is idempotent — repeated dismissals don't duplicate keys", async () => {
    await business.dismissBadge("feature_assembly");
    await business.dismissBadge("feature_assembly");
    await business.dismissBadge("feature_assembly");
    expect(globalThis.__pmStore.get(BADGES_KEY)).toEqual(["feature_assembly"]);
  });

  it("ignores falsy keys and tolerates corrupt stored state", async () => {
    await business.dismissBadge("");
    expect(globalThis.__pmStore.get(BADGES_KEY)).toBeUndefined();

    globalThis.__pmStore.set(BADGES_KEY, "not-an-array");
    const dismissed = await business.getDismissedBadges();
    expect(dismissed.size).toBe(0);
  });
});
