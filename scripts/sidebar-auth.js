import { isSignedIn, signIn, signOut, getToken } from "./auth.js";
import { clearCache } from "./business.js";

const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const EMAIL_CACHE_KEY = "promptmate.userEmail";

let state = { signedIn: false, email: null, message: null, loading: true };
const subscribers = new Set();

function notify() {
  subscribers.forEach((fn) => {
    try {
      fn(state);
    } catch (err) {
      console.warn("PromptMate: auth subscriber failed", err);
    }
  });
}

export function getAuthState() {
  return state;
}

export function subscribeAuthState(fn) {
  subscribers.add(fn);
  fn(state);
  return () => subscribers.delete(fn);
}

function readCachedEmail() {
  return new Promise((resolve) => {
    chrome.storage.local.get([EMAIL_CACHE_KEY], (res) =>
      resolve(res?.[EMAIL_CACHE_KEY] || null)
    );
  });
}

function writeCachedEmail(email) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [EMAIL_CACHE_KEY]: email }, () => resolve());
  });
}

function clearCachedEmail() {
  return new Promise((resolve) => {
    chrome.storage.local.remove([EMAIL_CACHE_KEY], () => resolve());
  });
}

async function fetchEmailFromGoogle() {
  try {
    const result = await getToken({ interactive: false });
    const token = result?.token || null;
    if (!token) return null;
    const res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.email || null;
  } catch (err) {
    console.warn("PromptMate: failed to fetch userinfo", err);
    return null;
  }
}

export async function refreshAuthState({ message = null } = {}) {
  state = { ...state, loading: true };
  notify();

  const result = await isSignedIn().catch(() => ({ signedIn: false }));
  const signedIn = !!result?.signedIn;
  let email = null;
  if (signedIn) {
    email = await readCachedEmail();
    if (!email) {
      email = await fetchEmailFromGoogle();
      if (email) await writeCachedEmail(email);
    }
  }
  state = { signedIn, email, message, loading: false };
  notify();
  return state;
}

export async function performSignIn() {
  state = { ...state, loading: true, message: null };
  notify();
  try {
    await signIn();
  } catch (err) {
    state = {
      signedIn: false,
      email: null,
      message: err?.message || "Sign-in failed.",
      loading: false,
    };
    notify();
    return state;
  }
  return refreshAuthState();
}

export async function performSignOut() {
  try {
    await signOut();
  } finally {
    await clearCachedEmail();
    await clearCache().catch((err) =>
      console.warn("PromptMate: failed to clear prompt cache on sign-out", err)
    );
    state = { signedIn: false, email: null, message: null, loading: false };
    notify();
  }
}

export async function notifySessionExpired() {
  await clearCachedEmail();
  state = {
    signedIn: false,
    email: null,
    message: "Session expired, please sign in again.",
    loading: false,
  };
  notify();
}
