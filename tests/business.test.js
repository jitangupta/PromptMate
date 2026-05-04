/*
 * Targeted tests for the three fixes on this branch:
 *   1. mutateCache is serialized (concurrent writes don't clobber).
 *   2. reconcileFromDrive doesn't evict pending / fileId-less entries.
 *   3. savePrompt rolls back optimistic writes on non-network failures.
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

let drive;
let business;

function seedCache(cache) {
  globalThis.__pmStore.set(CACHE_KEY, cache);
}

function readStoredCache() {
  return globalThis.__pmStore.get(CACHE_KEY);
}

function listPromptsTwice() {
  // listPrompts fires the callback twice: once with cache, once after Drive
  // reconcile. Resolve when the post-reconcile callback fires.
  return new Promise((resolve, reject) => {
    let calls = 0;
    const timer = setTimeout(
      () => reject(new Error("listPrompts timed out")),
      2000
    );
    business.listPrompts((prompts, meta) => {
      calls += 1;
      if (!meta.fromCache) {
        clearTimeout(timer);
        resolve({ prompts, meta, calls });
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

describe("mutateCache concurrency", () => {
  it("serializes interleaved saves so neither write is clobbered", async () => {
    drive.createPrivatePrompt.mockImplementation(async (p) => ({
      fileId: `file-${p.promptId}`,
      etag: "etag-1",
    }));

    const [idA, idB] = await Promise.all([
      business.savePrompt({ title: "A", body: "a" }),
      business.savePrompt({ title: "B", body: "b" }),
    ]);

    const cache = readStoredCache();
    expect(Object.keys(cache.prompts).sort()).toEqual([idA, idB].sort());
    expect(cache.prompts[idA].fileId).toBe(`file-${idA}`);
    expect(cache.prompts[idB].fileId).toBe(`file-${idB}`);
    expect(cache.prompts[idA].pending).toBe(false);
    expect(cache.prompts[idB].pending).toBe(false);
  });
});

describe("reconcileFromDrive eviction guard", () => {
  it("evicts a fully-synced cache entry that no longer exists on Drive", async () => {
    seedCache({
      prompts: {
        gone: {
          promptId: "gone",
          title: "Gone",
          body: "",
          fileId: "file-gone",
          etag: "etag",
          tier: "private",
          driveModifiedTime: "2026-01-01T00:00:00Z",
          pending: false,
        },
      },
      pendingWrites: [],
      lastSyncedAt: null,
      visibleFolderId: null,
    });
    drive.listPrivatePrompts.mockResolvedValue([]);
    drive.listVisiblePrompts.mockResolvedValue([]);

    const { prompts } = await listPromptsTwice();

    expect(prompts).toEqual([]);
    expect(readStoredCache().prompts).toEqual({});
  });

  it("preserves entries with pending: true even when absent from Drive", async () => {
    seedCache({
      prompts: {
        pending: {
          promptId: "pending",
          title: "In flight",
          body: "x",
          fileId: "file-pending",
          etag: null,
          tier: "private",
          driveModifiedTime: null,
          pending: true,
        },
      },
      pendingWrites: [],
      lastSyncedAt: null,
      visibleFolderId: null,
    });
    drive.listPrivatePrompts.mockResolvedValue([]);
    drive.listVisiblePrompts.mockResolvedValue([]);

    const { prompts } = await listPromptsTwice();

    expect(prompts.map((p) => p.promptId)).toEqual(["pending"]);
    expect(readStoredCache().prompts.pending).toBeDefined();
  });

  it("preserves locally-only entries (fileId == null) when absent from Drive", async () => {
    seedCache({
      prompts: {
        local: {
          promptId: "local",
          title: "Offline create",
          body: "y",
          fileId: null,
          etag: null,
          tier: "private",
          driveModifiedTime: null,
          pending: false,
        },
      },
      pendingWrites: [],
      lastSyncedAt: null,
      visibleFolderId: null,
    });
    drive.listPrivatePrompts.mockResolvedValue([]);
    drive.listVisiblePrompts.mockResolvedValue([]);

    const { prompts } = await listPromptsTwice();

    expect(prompts.map((p) => p.promptId)).toEqual(["local"]);
  });
});

describe("savePrompt rollback on hard failure", () => {
  it("removes the optimistic insert when creating a brand-new prompt fails", async () => {
    drive.createPrivatePrompt.mockRejectedValue(
      Object.assign(new Error("Drive 403: forbidden"), { status: 403 })
    );

    await expect(
      business.savePrompt({ title: "Doomed", body: "fail" })
    ).rejects.toThrow();

    expect(readStoredCache().prompts).toEqual({});
  });

  it("restores the prior cache entry when updating an existing prompt fails", async () => {
    const original = {
      promptId: "p1",
      title: "Original",
      body: "before",
      tone: null,
      format: null,
      pinned: false,
      used: 3,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
      fileId: "file-p1",
      etag: "etag-orig",
      tier: "private",
      driveModifiedTime: "2026-01-02T00:00:00Z",
      pending: false,
    };
    seedCache({
      prompts: { p1: original },
      pendingWrites: [],
      lastSyncedAt: null,
      visibleFolderId: null,
    });

    drive.updatePrompt.mockRejectedValue(
      Object.assign(new Error("Drive 404: not found"), { status: 404 })
    );

    await expect(
      business.savePrompt({
        promptId: "p1",
        title: "Edited",
        body: "after",
        pinned: true,
      })
    ).rejects.toThrow();

    const restored = readStoredCache().prompts.p1;
    expect(restored).toEqual(original);
  });
});
