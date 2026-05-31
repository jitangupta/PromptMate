export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (clipboardErr) {
    let textarea = null;
    try {
      textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      return document.execCommand("copy");
    } catch (execErr) {
      console.warn("PromptMate: clipboard copy failed", clipboardErr, execErr);
      return false;
    } finally {
      textarea?.remove();
    }
  }
}
