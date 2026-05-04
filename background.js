// Cross-browser OAuth flow using launchWebAuthFlow + PKCE.
// getAuthToken is Chrome-only — Brave/Edge/Vivaldi/Opera reject it. This flow
// works on every Chromium browser that ships chrome.identity.

import { WEB_CLIENT_ID, WEB_CLIENT_SECRET } from "./secrets.local.js";

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

const HANDLERS = {
  [AUTH_MESSAGE.signIn]: handleSignIn,
  [AUTH_MESSAGE.signOut]: handleSignOut,
  [AUTH_MESSAGE.getToken]: handleGetToken,
  [AUTH_MESSAGE.isSignedIn]: handleIsSignedIn,
  [AUTH_MESSAGE.refreshToken]: handleRefreshToken,
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = HANDLERS[message?.type];
  if (!handler) return false;
  handler(message)
    .then((result) => sendResponse({ result }))
    .catch((err) => sendResponse({ error: err?.message || String(err) }));
  return true;
});

chrome.runtime.onInstalled.addListener(() => {});
