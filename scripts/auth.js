const AUTH_MESSAGE = {
  signIn: "auth.signIn",
  signOut: "auth.signOut",
  getToken: "auth.getToken",
  isSignedIn: "auth.isSignedIn",
};

function sendAuthMessage(type, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      if (!response) {
        reject(new Error("No response from background service worker"));
        return;
      }
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.result);
    });
  });
}

export function signIn() {
  return sendAuthMessage(AUTH_MESSAGE.signIn);
}

export function signOut() {
  return sendAuthMessage(AUTH_MESSAGE.signOut);
}

export function getToken({ interactive = false } = {}) {
  return sendAuthMessage(AUTH_MESSAGE.getToken, { interactive });
}

export function isSignedIn() {
  return sendAuthMessage(AUTH_MESSAGE.isSignedIn);
}

export const AUTH_MESSAGE_TYPES = AUTH_MESSAGE;
