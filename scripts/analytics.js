/*
 * analytics.js
 * Client side of GA4 usage analytics. Content scripts and the popup call
 * trackEvent(); the background service worker owns the actual Measurement
 * Protocol request (see background.js) so there is exactly one place where
 * data leaves the device.
 *
 * Privacy contract — enforced here and in background.js:
 *   - Only event names, booleans, small numbers, and names of predefined
 *     catalogue options (Tone/Format) are ever sent.
 *   - Never prompt titles/bodies, variable values, personal context, group
 *     names, page URLs, or anything tied to the user's Google account.
 *   - Library size is sent as a coarse bucket, not an exact count.
 *   - Users can opt out at any time (ANALYTICS_DISABLED_KEY); default is on.
 */

export const ANALYTICS_MSG_TYPE = "analytics.track";
export const ANALYTICS_DISABLED_KEY = "promptmate_analytics_disabled";
export const ANALYTICS_NOTICE_KEY = "promptmate_analytics_notice_shown";

// Supported host pages, reported as a fixed enum — never the raw URL.
const HOST_LABELS = new Map([
  ["chatgpt.com", "chatgpt"],
  ["claude.ai", "claude"],
  ["chat.deepseek.com", "deepseek"],
  ["kimi.com", "kimi"],
  ["www.kimi.com", "kimi"],
]);

export function getHostLabel() {
  try {
    if (location.protocol === "chrome-extension:") return "popup";
    return HOST_LABELS.get(location.hostname) || "other";
  } catch {
    return "other";
  }
}

// Coarse buckets so library size can't act as a fingerprint and we never
// learn exact library contents — "are people building libraries" is enough.
export function bucketCount(n) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n <= 5) return "1-5";
  if (n <= 20) return "6-20";
  if (n <= 50) return "21-50";
  return "50+";
}

export function getAnalyticsEnabled() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get({ [ANALYTICS_DISABLED_KEY]: false }, (res) => {
        if (chrome.runtime?.lastError) return resolve(true);
        resolve(res[ANALYTICS_DISABLED_KEY] !== true);
      });
    } catch {
      resolve(true);
    }
  });
}

export function setAnalyticsEnabled(enabled) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [ANALYTICS_DISABLED_KEY]: enabled !== true }, () => resolve());
    } catch {
      resolve();
    }
  });
}

// One-time transparency notice ("we collect anonymous usage stats").
export function shouldShowAnalyticsNotice() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get({ [ANALYTICS_NOTICE_KEY]: false }, (res) => {
        if (chrome.runtime?.lastError) return resolve(false);
        resolve(res[ANALYTICS_NOTICE_KEY] !== true);
      });
    } catch {
      resolve(false);
    }
  });
}

export function markAnalyticsNoticeShown() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [ANALYTICS_NOTICE_KEY]: true }, () => resolve());
    } catch {
      resolve();
    }
  });
}

// Fire-and-forget. Analytics must never block or break the UX — every
// failure path (opted out, extension reloaded, no service worker) is a
// silent no-op.
export function trackEvent(name, params = {}) {
  getAnalyticsEnabled()
    .then((enabled) => {
      if (!enabled) return;
      try {
        const maybePromise = chrome.runtime.sendMessage({
          type: ANALYTICS_MSG_TYPE,
          name,
          params: { ...params, host: getHostLabel() },
        });
        // MV3 returns a promise when no callback is given; swallow rejections
        // (e.g. service worker asleep during page unload).
        maybePromise?.catch?.(() => {});
      } catch {
        /* extension context invalidated — drop the event */
      }
    })
    .catch(() => {});
}
