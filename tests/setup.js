/*
 * Jest setup — installs a tiny in-memory chrome.storage.local stub so
 * business.js can run unmodified under Node. Tests reach into __pmStore
 * to seed or assert state.
 */

const store = new Map();

globalThis.__pmStore = store;

globalThis.chrome = {
  storage: {
    local: {
      get(keys, cb) {
        const result = {};
        if (typeof keys === "string") {
          result[keys] = store.has(keys) ? store.get(keys) : undefined;
        } else if (Array.isArray(keys)) {
          for (const k of keys) {
            result[k] = store.has(k) ? store.get(k) : undefined;
          }
        } else if (keys && typeof keys === "object") {
          for (const [k, def] of Object.entries(keys)) {
            result[k] = store.has(k) ? store.get(k) : def;
          }
        }
        cb(result);
      },
      set(obj, cb) {
        for (const [k, v] of Object.entries(obj)) store.set(k, v);
        if (typeof cb === "function") cb();
      },
      remove(keys, cb) {
        if (typeof keys === "string") keys = [keys];
        for (const k of keys) store.delete(k);
        if (typeof cb === "function") cb();
      },
    },
  },
};
