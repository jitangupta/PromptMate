/*
 * Tests for auth.js — sendAuthMessage must handle extension context
 * invalidation gracefully (fix: wrap chrome.runtime.sendMessage in try/catch).
 */

beforeEach(() => {
  jest.resetModules();
  globalThis.chrome = {
    ...globalThis.chrome,
    runtime: {
      sendMessage: jest.fn(),
      lastError: null,
    },
  };
});

describe("sendAuthMessage", () => {
  it("rejects when chrome.runtime.sendMessage throws synchronously", async () => {
    globalThis.chrome.runtime.sendMessage.mockImplementation(() => {
      throw new Error("Extension context invalidated.");
    });
    const auth = require("../scripts/auth.js");
    await expect(auth.signOut()).rejects.toThrow("Extension context invalidated.");
  });

  it("rejects with the runtime error message when lastError is set", async () => {
    globalThis.chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
      globalThis.chrome.runtime.lastError = { message: "Could not establish connection." };
      cb(undefined);
      globalThis.chrome.runtime.lastError = null;
    });
    const auth = require("../scripts/auth.js");
    await expect(auth.isSignedIn()).rejects.toThrow("Could not establish connection.");
  });

  it("rejects when the background service worker sends no response", async () => {
    globalThis.chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
      globalThis.chrome.runtime.lastError = null;
      cb(undefined);
    });
    const auth = require("../scripts/auth.js");
    await expect(auth.isSignedIn()).rejects.toThrow("No response from background");
  });

  it("rejects when the background responds with an error field", async () => {
    globalThis.chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
      globalThis.chrome.runtime.lastError = null;
      cb({ error: "token expired" });
    });
    const auth = require("../scripts/auth.js");
    await expect(auth.getToken()).rejects.toThrow("token expired");
  });

  it("resolves with the result from a successful background response", async () => {
    globalThis.chrome.runtime.sendMessage.mockImplementation((msg, cb) => {
      globalThis.chrome.runtime.lastError = null;
      cb({ result: { signedIn: true } });
    });
    const auth = require("../scripts/auth.js");
    await expect(auth.isSignedIn()).resolves.toEqual({ signedIn: true });
  });
});
