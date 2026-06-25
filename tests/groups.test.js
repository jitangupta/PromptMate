/*
 * Tests for prompt groups (Task 30):
 *   1. loadGroups / saveGroup / deleteGroup CRUD against storage.
 *   2. savePrompt round-trips the `group` field (cache + Drive payload).
 *   3. reconcileFromDrive preserves `group` read back from Drive content.
 *   4. deleteGroup moves affected prompts to Ungrouped.
 *
 * Drive is fully mocked. chrome.storage.local is stubbed in tests/setup.js.
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
  DriveConflictError: class DriveConflictError extends Error {
    constructor(fileId) {
      super(`conflict ${fileId}`);
      this.name = "DriveConflictError";
      this.fileId = fileId;
    }
  },
  DriveError: class DriveError extends Error {},
  FILE_SCHEMA_VERSION: 1,
}));

const CACHE_KEY = "promptmate_cache";
const GROUPS_KEY = "promptmate_groups";

let drive;
let business;

function seedCache(cache) {
  globalThis.__pmStore.set(CACHE_KEY, cache);
}

function readStoredCache() {
  return globalThis.__pmStore.get(CACHE_KEY);
}

function listPromptsSettled() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("listPrompts timed out")), 2000);
    business.listPrompts((prompts, meta) => {
      if (!meta.fromCache) {
        clearTimeout(timer);
        resolve({ prompts, meta });
      }
    });
  });
}

beforeEach(() => {
  globalThis.__pmStore.clear();
  jest.resetModules();
  drive = require("../scripts/drive.js");
  business = require("../scripts/business.js");
});

describe("group CRUD", () => {
  it("creates, lists (A–Z), renames, and deletes groups", async () => {
    const idB = await business.saveGroup({ name: "Writing" });
    const idA = await business.saveGroup({ name: "coding" });

    let groups = await business.loadGroups();
    expect(groups.map((g) => g.name)).toEqual(["coding", "Writing"]);
    expect(groups.every((g) => g.id)).toBe(true);

    await business.saveGroup({ ...groups.find((g) => g.id === idA), name: "Aaa Coding" });
    groups = await business.loadGroups();
    expect(groups.map((g) => g.name)).toEqual(["Aaa Coding", "Writing"]);

    await business.deleteGroup(idB);
    groups = await business.loadGroups();
    expect(groups.map((g) => g.name)).toEqual(["Aaa Coding"]);
  });

  it("rejects empty and duplicate (case-insensitive) names", async () => {
    await business.saveGroup({ name: "LinkedIn" });
    await expect(business.saveGroup({ name: "  " })).rejects.toThrow(/empty/);
    await expect(business.saveGroup({ name: "linkedin" })).rejects.toThrow(/already exists/);
  });

  it("preserves instruction fields on rename", async () => {
    const id = await business.saveGroup({
      name: "YouTube",
      instruction: "Hook first.",
      instructionEnabled: true,
    });
    const [group] = await business.loadGroups();
    await business.saveGroup({ ...group, name: "YT" });
    const [renamed] = await business.loadGroups();
    expect(renamed).toMatchObject({
      id,
      name: "YT",
      instruction: "Hook first.",
      instructionEnabled: true,
    });
  });
});

describe("prompt.group persistence", () => {
  it("savePrompt persists group to cache and the Drive payload", async () => {
    drive.createPrivatePrompt.mockImplementation(async () => ({
      fileId: "file-1",
      etag: "etag-1",
    }));

    const promptId = await business.savePrompt({
      title: "T",
      body: "B",
      group: "group-123",
    });

    expect(readStoredCache().prompts[promptId].group).toBe("group-123");
    expect(drive.createPrivatePrompt.mock.calls[0][0].group).toBe("group-123");
  });

  it("savePrompt keeps the existing group when input omits it", async () => {
    drive.updatePrompt.mockResolvedValue({ fileId: "file-1", etag: "etag-2" });
    seedCache({
      prompts: {
        p1: {
          promptId: "p1",
          title: "T",
          body: "B",
          group: "group-123",
          fileId: "file-1",
          etag: "etag-1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
      pendingWrites: [],
    });

    await business.savePrompt({ promptId: "p1", title: "T2", body: "B2" });
    expect(readStoredCache().prompts.p1.group).toBe("group-123");
  });

  it("reconcileFromDrive keeps group from Drive content", async () => {
    drive.listPrivatePrompts.mockResolvedValue([
      { id: "file-1", name: "PromptMate-p1.json", modifiedTime: "2026-02-01T00:00:00.000Z" },
    ]);
    drive.listVisiblePrompts.mockResolvedValue([]);
    drive.readPrompt.mockResolvedValue({
      etag: "etag-1",
      content: {
        promptId: "p1",
        title: "T",
        body: "B",
        group: "group-123",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    });

    const { prompts } = await listPromptsSettled();
    expect(prompts).toHaveLength(1);
    expect(prompts[0].group).toBe("group-123");
  });

  it("normalizes a missing group to null on read", async () => {
    drive.listPrivatePrompts.mockResolvedValue([]);
    drive.listVisiblePrompts.mockResolvedValue([]);
    // pending:true so reconcile doesn't evict this Drive-less entry.
    seedCache({
      prompts: {
        p1: {
          promptId: "p1",
          title: "T",
          body: "B",
          createdAt: "2026-01-01T00:00:00.000Z",
          pending: true,
        },
      },
      pendingWrites: [],
    });

    const { prompts } = await listPromptsSettled();
    expect(prompts[0].group).toBeNull();
  });
});

describe("deleteGroup prompt fan-out", () => {
  it("moves the group's active prompts to Ungrouped", async () => {
    drive.updatePrompt.mockResolvedValue({ fileId: "file-1", etag: "etag-2" });
    globalThis.__pmStore.set(GROUPS_KEY, [
      { id: "g1", name: "LinkedIn", instruction: "", instructionEnabled: false },
    ]);
    seedCache({
      prompts: {
        p1: {
          promptId: "p1",
          title: "In group",
          body: "B",
          group: "g1",
          fileId: "file-1",
          etag: "etag-1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        p2: {
          promptId: "p2",
          title: "Other group",
          body: "B",
          group: "g2",
          fileId: "file-2",
          etag: "etag-1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
      pendingWrites: [],
    });

    await business.deleteGroup("g1");

    expect(await business.loadGroups()).toEqual([]);
    const cache = readStoredCache();
    expect(cache.prompts.p1.group).toBeNull();
    expect(cache.prompts.p2.group).toBe("g2");
  });
});
