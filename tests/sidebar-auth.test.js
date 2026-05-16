/*
 * Tests for sidebar-auth.js — performSignOut and refreshAuthState must
 * handle extension context invalidation gracefully (fix: try/catch around
 * all chrome.storage.local calls in readCachedEmail, writeCachedEmail,
 * clearCachedEmail).
 *
 * auth.js and business.js are fully mocked so no Chrome messaging is needed.
 */

jest.mock("../scripts/auth.js", () => ({
  isSignedIn: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  getToken: jest.fn(),
}));

jest.mock("../scripts/business.js", () => ({
  clearCache: jest.fn(),
}));

let authMock;
let businessMock;
let sidebarAuth;

beforeEach(() => {
  globalThis.__pmStore.clear();
  jest.resetModules();

  authMock = require("../scripts/auth.js");
  businessMock = require("../scripts/business.js");

  authMock.signOut.mockResolvedValue();
  authMock.signIn.mockResolvedValue();
  authMock.isSignedIn.mockResolvedValue({ signedIn: false });
  authMock.getToken.mockResolvedValue({ token: null });
  businessMock.clearCache.mockResolvedValue();

  sidebarAuth = require("../scripts/sidebar-auth.js");
});

describe("performSignOut resilience", () => {
  it("resolves without throwing when chrome.storage.local.remove throws (context invalidated)", async () => {
    const originalRemove = globalThis.chrome.storage.local.remove;
    globalThis.chrome.storage.local.remove = () => {
      throw new Error("Extension context invalidated.");
    };
    try {
      await expect(sidebarAuth.performSignOut()).resolves.toBeUndefined();
    } finally {
      globalThis.chrome.storage.local.remove = originalRemove;
    }
  });

  it("still runs cleanup (clearCache) when signOut() rejects", async () => {
    authMock.signOut.mockRejectedValue(new Error("Extension context invalidated."));

    // try/finally re-throws signOut's error, but the finally block must still run
    await expect(sidebarAuth.performSignOut()).rejects.toThrow(
      "Extension context invalidated."
    );
    expect(businessMock.clearCache).toHaveBeenCalled();
  });

  it("clears the email cache from storage on a normal sign-out", async () => {
    globalThis.__pmStore.set("promptmate.userEmail", "user@example.com");

    await sidebarAuth.performSignOut();

    expect(globalThis.__pmStore.has("promptmate.userEmail")).toBe(false);
  });
});

describe("refreshAuthState resilience", () => {
  it("resolves when chrome.storage.local.get throws during email cache read", async () => {
    authMock.isSignedIn.mockResolvedValue({ signedIn: true });

    const originalGet = globalThis.chrome.storage.local.get;
    globalThis.chrome.storage.local.get = () => {
      throw new Error("Extension context invalidated.");
    };
    try {
      const state = await sidebarAuth.refreshAuthState();
      expect(state.signedIn).toBe(true);
    } finally {
      globalThis.chrome.storage.local.get = originalGet;
    }
  });
});
