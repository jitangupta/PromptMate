// Cross-browser OAuth flow using launchWebAuthFlow + PKCE.
// getAuthToken is Chrome-only — Brave/Edge/Vivaldi/Opera reject it. This flow
// works on every Chromium browser that ships chrome.identity.

import { WEB_CLIENT_ID, WEB_CLIENT_SECRET } from "./secrets.local.js";
// Namespace import so builds keep working before GA4_* exports are added to
// an older secrets.local.js (Rollup only warns on missing namespace members).
import * as secrets from "./secrets.local.js";
import { ANALYTICS_MSG_TYPE, ANALYTICS_DISABLED_KEY } from "./scripts/analytics.js";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.appdata",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

const REFRESH_TOKEN_KEY = "auth.refreshToken";
const ACCESS_TOKEN_SKEW_MS = 60_000; // refresh a minute before expiry

const AUTH_MESSAGE = {
  signIn: "auth.signIn",
  signOut: "auth.signOut",
  getToken: "auth.getToken",
  isSignedIn: "auth.isSignedIn",
  refreshToken: "auth.refreshToken",
};

// In-memory cache — service workers can be torn down, but while alive we
// avoid hitting the token endpoint on every Drive call.
let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

// ---- PKCE helpers ----

function base64UrlEncode(bytes) {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateCodeVerifier() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function deriveCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

// ---- Storage helpers for refresh token ----

function readRefreshToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get([REFRESH_TOKEN_KEY], (res) => {
      resolve(res?.[REFRESH_TOKEN_KEY] || null);
    });
  });
}

function writeRefreshToken(refreshToken) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [REFRESH_TOKEN_KEY]: refreshToken }, () =>
      resolve()
    );
  });
}

function clearRefreshToken() {
  return new Promise((resolve) => {
    chrome.storage.local.remove([REFRESH_TOKEN_KEY], () => resolve());
  });
}

function clearCachedAccessToken() {
  cachedAccessToken = null;
  cachedAccessTokenExpiresAt = 0;
}

// ---- OAuth primitives ----

function getRedirectUri() {
  // Stable across machines because manifest.json pins the extension key.
  return chrome.identity.getRedirectURL();
}

function launchWebAuthFlow(url, interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url, interactive: !!interactive },
      (redirectUrl) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        if (!redirectUrl) {
          reject(new Error("Auth flow did not return a redirect URL"));
          return;
        }
        resolve(redirectUrl);
      }
    );
  });
}

function parseAuthCode(redirectUrl) {
  const url = new URL(redirectUrl);
  const error = url.searchParams.get("error");
  if (error) {
    throw new Error(`OAuth error: ${error}`);
  }
  const code = url.searchParams.get("code");
  if (!code) throw new Error("OAuth redirect missing authorization code");
  return code;
}

async function exchangeCodeForTokens(code, codeVerifier) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    client_id: WEB_CLIENT_ID,
    redirect_uri: getRedirectUri(),
  });
  if (WEB_CLIENT_SECRET) params.set("client_secret", WEB_CLIENT_SECRET);

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }
  return response.json();
}

async function exchangeRefreshToken(refreshToken) {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: WEB_CLIENT_ID,
  });
  if (WEB_CLIENT_SECRET) params.set("client_secret", WEB_CLIENT_SECRET);

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const err = new Error(`Refresh failed (${response.status}): ${text}`);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

async function revokeToken(token) {
  try {
    await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, {
      method: "POST",
    });
  } catch (err) {
    console.warn("PromptMate: token revoke request failed", err);
  }
}

function cacheAccessToken(tokenResponse) {
  if (!tokenResponse?.access_token) return null;
  cachedAccessToken = tokenResponse.access_token;
  const expiresInMs =
    Number.isFinite(tokenResponse.expires_in) && tokenResponse.expires_in > 0
      ? tokenResponse.expires_in * 1000
      : 3600_000;
  cachedAccessTokenExpiresAt = Date.now() + expiresInMs - ACCESS_TOKEN_SKEW_MS;
  return cachedAccessToken;
}

function readCachedAccessToken() {
  if (!cachedAccessToken) return null;
  if (Date.now() >= cachedAccessTokenExpiresAt) {
    clearCachedAccessToken();
    return null;
  }
  return cachedAccessToken;
}

// ---- Flows ----

async function runInteractiveSignIn() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await deriveCodeChallenge(codeVerifier);

  const authUrl =
    `${AUTH_ENDPOINT}?` +
    new URLSearchParams({
      response_type: "code",
      client_id: WEB_CLIENT_ID,
      redirect_uri: getRedirectUri(),
      scope: SCOPES.join(" "),
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    }).toString();

  const redirectUrl = await launchWebAuthFlow(authUrl, true);
  const code = parseAuthCode(redirectUrl);
  const tokenResponse = await exchangeCodeForTokens(code, codeVerifier);

  if (tokenResponse.refresh_token) {
    await writeRefreshToken(tokenResponse.refresh_token);
  }
  cacheAccessToken(tokenResponse);
  return cachedAccessToken;
}

async function getAccessTokenFromRefresh() {
  const refreshToken = await readRefreshToken();
  if (!refreshToken) return null;
  try {
    const tokenResponse = await exchangeRefreshToken(refreshToken);
    return cacheAccessToken(tokenResponse);
  } catch (err) {
    // 4xx from Google means the refresh token is invalid/revoked — clear it
    // so the next interactive call starts a fresh sign-in.
    if (err?.status >= 400 && err?.status < 500) {
      await clearRefreshToken();
      clearCachedAccessToken();
    }
    throw err;
  }
}

async function getAccessToken({ interactive }) {
  const cached = readCachedAccessToken();
  if (cached) return cached;

  const refreshed = await getAccessTokenFromRefresh().catch((err) => {
    console.warn("PromptMate: refresh-token exchange failed", err);
    return null;
  });
  if (refreshed) return refreshed;

  if (!interactive) return null;
  return runInteractiveSignIn();
}

// ---- Message handlers ----

async function handleSignIn() {
  const token = await runInteractiveSignIn();
  if (!token) throw new Error("Sign-in did not return a token");
  return { signedIn: true };
}

async function handleSignOut() {
  const refreshToken = await readRefreshToken();
  clearCachedAccessToken();
  await clearRefreshToken();
  if (refreshToken) await revokeToken(refreshToken);
  return { signedIn: false };
}

async function handleGetToken({ interactive }) {
  const token = await getAccessToken({ interactive });
  return { token };
}

async function handleIsSignedIn() {
  const refreshToken = await readRefreshToken();
  return { signedIn: !!refreshToken };
}

async function handleRefreshToken() {
  // Drop the in-memory access token and fetch a new one via the refresh token.
  // The badToken argument is no longer needed — refresh-token exchange always
  // mints a fresh access token, regardless of what the caller had.
  clearCachedAccessToken();
  const token = await getAccessTokenFromRefresh().catch(() => null);
  return { token };
}

// ---- GA4 usage analytics (Measurement Protocol) ----
// Single egress point for analytics: content scripts/popup message events
// here, and only event names + sanitized scalar params are forwarded to GA.
// The api_secret ships in the bundle — that's Google's documented model for
// extensions; the only risk is event spam, not user-data exposure.

const GA_ENDPOINT = "https://www.google-analytics.com/mp/collect";
const GA_MEASUREMENT_ID = secrets.GA4_MEASUREMENT_ID || "";
const GA_API_SECRET = secrets.GA4_API_SECRET || "";

const GA_CLIENT_ID_KEY = "promptmate_ga_client_id";
const GA_SESSION_KEY = "promptmate_ga_session";
const GA_SNAPSHOT_DATE_KEY = "promptmate_ga_last_snapshot";
const GA_SESSION_EXPIRATION_MIN = 30;

function gaConfigured() {
  return (
    GA_MEASUREMENT_ID.startsWith("G-") &&
    !!GA_API_SECRET &&
    !GA_API_SECRET.startsWith("REPLACE_")
  );
}

// Random UUID with no connection to the user's Google account, email, or
// Drive identity — that separation is the core privacy guarantee.
async function getOrCreateGaClientId() {
  const stored = await chrome.storage.local.get(GA_CLIENT_ID_KEY);
  let clientId = stored[GA_CLIENT_ID_KEY];
  if (!clientId) {
    clientId = crypto.randomUUID();
    await chrome.storage.local.set({ [GA_CLIENT_ID_KEY]: clientId });
  }
  return clientId;
}

// GA4 session handling per Google's extension guidance: session id lives in
// storage.session and rolls over after 30 minutes of inactivity.
async function getOrCreateGaSessionId() {
  let { [GA_SESSION_KEY]: session } = await chrome.storage.session.get(GA_SESSION_KEY);
  const now = Date.now();
  if (session?.timestamp && (now - session.timestamp) / 60000 <= GA_SESSION_EXPIRATION_MIN) {
    session.timestamp = now;
  } else {
    session = { session_id: String(now), timestamp: now };
  }
  await chrome.storage.session.set({ [GA_SESSION_KEY]: session });
  return session.session_id;
}

// Last line of defense: regardless of what a caller passes, only short
// scalar values leave the device. Free text can't slip through by accident.
function sanitizeGaParams(params) {
  const clean = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) continue;
    if (typeof value === "boolean" || typeof value === "number") {
      clean[key] = value;
    } else if (typeof value === "string") {
      clean[key] = value.slice(0, 50);
    }
  }
  return clean;
}

async function analyticsOptedOut() {
  const res = await chrome.storage.local.get({ [ANALYTICS_DISABLED_KEY]: false });
  return res[ANALYTICS_DISABLED_KEY] === true;
}

async function sendGaEvent(name, params = {}) {
  if (!gaConfigured()) return { sent: false, reason: "unconfigured" };
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(String(name))) {
    return { sent: false, reason: "bad-name" };
  }
  if (await analyticsOptedOut()) return { sent: false, reason: "opted-out" };

  // library_snapshot is throttled to once per day so library-shape data is
  // a daily pulse, not an activity trace.
  if (name === "library_snapshot") {
    const today = new Date().toISOString().slice(0, 10);
    const stored = await chrome.storage.local.get(GA_SNAPSHOT_DATE_KEY);
    if (stored[GA_SNAPSHOT_DATE_KEY] === today) return { sent: false, reason: "throttled" };
    await chrome.storage.local.set({ [GA_SNAPSHOT_DATE_KEY]: today });
  }

  const [clientId, sessionId] = await Promise.all([
    getOrCreateGaClientId(),
    getOrCreateGaSessionId(),
  ]);

  const url =
    `${GA_ENDPOINT}?measurement_id=${encodeURIComponent(GA_MEASUREMENT_ID)}` +
    `&api_secret=${encodeURIComponent(GA_API_SECRET)}`;
  await fetch(url, {
    method: "POST",
    body: JSON.stringify({
      client_id: clientId,
      events: [
        {
          name,
          params: {
            ...sanitizeGaParams(params),
            session_id: sessionId,
            engagement_time_msec: 100,
            app_version: chrome.runtime.getManifest().version,
          },
        },
      ],
    }),
  });
  return { sent: true };
}

async function handleAnalyticsTrack(message) {
  try {
    return await sendGaEvent(message?.name, message?.params);
  } catch (err) {
    // Analytics must never surface errors to the caller's UX.
    console.warn("PromptMate: analytics send failed", err);
    return { sent: false, reason: "error" };
  }
}

const HANDLERS = {
  [AUTH_MESSAGE.signIn]: handleSignIn,
  [AUTH_MESSAGE.signOut]: handleSignOut,
  [AUTH_MESSAGE.getToken]: handleGetToken,
  [AUTH_MESSAGE.isSignedIn]: handleIsSignedIn,
  [AUTH_MESSAGE.refreshToken]: handleRefreshToken,
  [ANALYTICS_MSG_TYPE]: handleAnalyticsTrack,
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = HANDLERS[message?.type];
  if (!handler) return false;
  handler(message)
    .then((result) => sendResponse({ result }))
    .catch((err) => sendResponse({ error: err?.message || String(err) }));
  return true;
});

// Keep in sync with ONBOARDING_KEY in scripts/business.js
const _ONBOARDING_KEY = "promptmate.onboarding";

async function seedOnboarding() {
  const existing = await new Promise((resolve) =>
    chrome.storage.local.get([_ONBOARDING_KEY], (r) => resolve(r[_ONBOARDING_KEY] || null))
  );
  if (existing?.seeded) return;

  // Starter prompts were previously seeded here as cache-only entries with no
  // Drive backing. They survived Drive reconcile and appeared as phantom prompts
  // for new users. Seeding has been removed — new users start with an empty
  // library and create their own prompts.
  await new Promise((resolve) =>
    chrome.storage.local.set({ [_ONBOARDING_KEY]: { seeded: true, guideDismissed: false } }, resolve)
  );
}

// ---- Uninstall feedback ----
// Opened by Chrome in a new tab when the user uninstalls the extension.
// Only the extension version is passed — no client id, so an uninstall
// can't be tied back to any analytics identity.

const UNINSTALL_FEEDBACK_URL = "https://jitangupta.com/promptmate/sorry-to-see-you";

function setUninstallFeedbackUrl() {
  const url = `${UNINSTALL_FEEDBACK_URL}?v=${encodeURIComponent(
    chrome.runtime.getManifest().version
  )}`;
  chrome.runtime.setUninstallURL(url, () => {
    if (chrome.runtime.lastError) {
      console.warn(
        "PromptMate: setUninstallURL failed",
        chrome.runtime.lastError.message
      );
    }
  });
}

// Top level so it re-runs on every service-worker start — keeps the version
// param current after extension updates.
setUninstallFeedbackUrl();

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install" || details.reason === "update") {
    sendGaEvent(
      details.reason === "install" ? "extension_installed" : "extension_updated"
    ).catch((err) => console.warn("PromptMate: lifecycle analytics failed", err));
  }
  if (details.reason !== "install") return;
  seedOnboarding();
});
