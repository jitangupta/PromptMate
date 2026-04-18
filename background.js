const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

const AUTH_MESSAGE = {
  signIn: "auth.signIn",
  signOut: "auth.signOut",
  getToken: "auth.getToken",
  isSignedIn: "auth.isSignedIn",
};

function getAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: !!interactive }, (token) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      resolve(token || null);
    });
  });
}

function removeCachedAuthToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
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

async function handleSignIn() {
  const token = await getAuthToken(true);
  if (!token) throw new Error("Sign-in did not return a token");
  return { signedIn: true };
}

async function handleSignOut() {
  const token = await getAuthToken(false).catch(() => null);
  if (!token) return { signedIn: false };
  await removeCachedAuthToken(token);
  await revokeToken(token);
  return { signedIn: false };
}

async function handleGetToken({ interactive }) {
  const token = await getAuthToken(interactive);
  return { token };
}

async function handleIsSignedIn() {
  const token = await getAuthToken(false).catch(() => null);
  return { signedIn: !!token };
}

const HANDLERS = {
  [AUTH_MESSAGE.signIn]: handleSignIn,
  [AUTH_MESSAGE.signOut]: handleSignOut,
  [AUTH_MESSAGE.getToken]: handleGetToken,
  [AUTH_MESSAGE.isSignedIn]: handleIsSignedIn,
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
