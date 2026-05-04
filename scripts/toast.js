/*
 * Lightweight toast for transient failures (pin, save, delete, etc).
 * Mounts a single host element on document.body and stacks toasts inside it.
 * Auto-dismisses after 4s; click to dismiss early.
 */

const HOST_ID = "promptmate-toasts";

function ensureHost() {
  let host = document.getElementById(HOST_ID);
  if (host) return host;
  host = document.createElement("div");
  host.id = HOST_ID;
  host.className = "pm-toast-host";
  document.body.appendChild(host);
  return host;
}

export function showToast(message, kind = "error") {
  if (!message) return;
  const host = ensureHost();

  const toast = document.createElement("div");
  toast.className = `pm-toast pm-toast-${kind}`;
  toast.setAttribute("role", "status");
  toast.textContent = message;

  const dismiss = () => {
    if (!toast.isConnected) return;
    toast.classList.add("pm-toast-leaving");
    setTimeout(() => toast.remove(), 180);
  };
  toast.addEventListener("click", dismiss);

  host.appendChild(toast);
  // Trigger enter transition on the next frame so the initial state paints first.
  requestAnimationFrame(() => toast.classList.add("pm-toast-enter"));
  setTimeout(dismiss, 4000);
}
