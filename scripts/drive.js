import { getToken, refreshToken } from "./auth.js";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FILE_SCHEMA_VERSION = 1;
const VISIBLE_FOLDER_NAME = "PromptMate";
const VISIBLE_FOLDER_CACHE_KEY = "promptmate.visibleFolderId";
const APP_DATA_SPACE = "appDataFolder";
const FILE_MIME = "application/json";
const FOLDER_MIME = "application/vnd.google-apps.folder";

function fileNameFor(promptId) {
  return `PromptMate-${promptId}.json`;
}

function buildFileBody(prompt) {
  const now = new Date().toISOString();
  return {
    version: FILE_SCHEMA_VERSION,
    promptId: prompt.promptId,
    title: prompt.title ?? "",
    body: prompt.body ?? "",
    tone: prompt.tone ?? "",
    format: prompt.format ?? "",
    createdAt: prompt.createdAt ?? now,
    updatedAt: now,
  };
}

class DriveConflictError extends Error {
  constructor(fileId) {
    super(`Drive precondition failed for file ${fileId}`);
    this.name = "DriveConflictError";
    this.fileId = fileId;
  }
}

class DriveError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "DriveError";
    this.status = status;
  }
}

async function fetchAccessToken() {
  const result = await getToken({ interactive: false });
  const token = result?.token || null;
  if (!token) throw new DriveError(401, "Not signed in");
  return token;
}

async function driveFetch(url, options = {}, { retried = false } = {}) {
  const token = await fetchAccessToken();
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };
  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 && !retried) {
    // Drop the stale token from chrome.identity's cache and fetch a fresh one,
    // then retry once. Without removing the cached copy, getToken would just
    // hand back the same expired token.
    await refreshToken(token);
    return driveFetch(url, options, { retried: true });
  }

  if (response.status === 412) {
    throw new DriveConflictError(options._fileId || "");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new DriveError(response.status, `Drive ${response.status}: ${text}`);
  }

  return response;
}

function buildMultipartBody(metadata, content) {
  const boundary = `pm_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${FILE_MIME}; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(content)}\r\n` +
    `--${boundary}--`;
  return {
    body,
    contentType: `multipart/related; boundary=${boundary}`,
  };
}

async function readFileWithEtag(fileId) {
  const response = await driveFetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
    { method: "GET" }
  );
  const etag = response.headers.get("ETag") || null;
  const content = await response.json();
  return { content, etag };
}

// ---- Private-tier operations ----

export async function createPrivatePrompt(prompt) {
  const fileBody = buildFileBody(prompt);
  const metadata = {
    name: fileNameFor(prompt.promptId),
    mimeType: FILE_MIME,
    parents: [APP_DATA_SPACE],
  };
  const { body, contentType } = buildMultipartBody(metadata, fileBody);
  const response = await driveFetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`,
    {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    }
  );
  const json = await response.json();
  const etag = response.headers.get("ETag") || null;
  return { fileId: json.id, etag };
}

export async function updatePrompt(fileId, prompt, { ifMatch } = {}) {
  const fileBody = buildFileBody(prompt);
  const headers = { "Content-Type": FILE_MIME };
  if (ifMatch) headers["If-Match"] = ifMatch;
  const response = await driveFetch(
    `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify(fileBody),
      _fileId: fileId,
    }
  );
  const json = await response.json();
  const etag = response.headers.get("ETag") || null;
  return { fileId: json.id, etag };
}

export async function deletePrompt(fileId) {
  await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
  });
  return { fileId };
}

export async function readPrompt(fileId) {
  const { content, etag } = await readFileWithEtag(fileId);
  return { fileId, content, etag };
}

async function listAllFiles(query, { spaces } = {}) {
  const items = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({
      q: query,
      fields: "nextPageToken, files(id, name, modifiedTime, parents)",
      pageSize: "100",
    });
    if (spaces) params.set("spaces", spaces);
    if (pageToken) params.set("pageToken", pageToken);
    const response = await driveFetch(`${DRIVE_API}/files?${params}`, {
      method: "GET",
    });
    const json = await response.json();
    items.push(...(json.files || []));
    pageToken = json.nextPageToken || null;
  } while (pageToken);
  return items;
}

export async function listPrivatePrompts() {
  return listAllFiles(
    `name contains 'PromptMate-' and trashed = false and mimeType = '${FILE_MIME}'`,
    { spaces: APP_DATA_SPACE }
  );
}

export async function listVisiblePrompts() {
  const folderId = await ensureVisibleFolder();
  return listAllFiles(
    `'${folderId}' in parents and trashed = false and mimeType = '${FILE_MIME}'`
  );
}

// ---- Tier-transition operations ----

async function readCachedFolderId() {
  return new Promise((resolve) => {
    chrome.storage.local.get([VISIBLE_FOLDER_CACHE_KEY], (res) => {
      resolve(res?.[VISIBLE_FOLDER_CACHE_KEY] || null);
    });
  });
}

async function writeCachedFolderId(folderId) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [VISIBLE_FOLDER_CACHE_KEY]: folderId }, () =>
      resolve()
    );
  });
}

async function findVisibleFolder() {
  const query =
    `name = '${VISIBLE_FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' ` +
    `and trashed = false and 'root' in parents`;
  const items = await listAllFiles(query);
  return items[0]?.id || null;
}

async function createVisibleFolder() {
  const response = await driveFetch(`${DRIVE_API}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: VISIBLE_FOLDER_NAME,
      mimeType: FOLDER_MIME,
      parents: ["root"],
    }),
  });
  const json = await response.json();
  return json.id;
}

export async function ensureVisibleFolder() {
  const cached = await readCachedFolderId();
  if (cached) {
    // Verify it still exists; recover if user deleted it.
    try {
      await driveFetch(
        `${DRIVE_API}/files/${encodeURIComponent(cached)}?fields=id,trashed`,
        { method: "GET" }
      );
      return cached;
    } catch (err) {
      if (!(err instanceof DriveError) || err.status !== 404) throw err;
    }
  }
  const existing = await findVisibleFolder();
  const folderId = existing || (await createVisibleFolder());
  await writeCachedFolderId(folderId);
  return folderId;
}

async function createVisiblePromptFile(prompt, content) {
  const folderId = await ensureVisibleFolder();
  const metadata = {
    name: fileNameFor(prompt.promptId),
    mimeType: FILE_MIME,
    parents: [folderId],
  };
  const { body, contentType } = buildMultipartBody(metadata, content);
  const response = await driveFetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`,
    {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    }
  );
  const json = await response.json();
  return { fileId: json.id, webViewLink: json.webViewLink || null };
}

async function applyAnyonePermission(fileId) {
  await driveFetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?fields=id`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "anyone", role: "reader" }),
    }
  );
}

async function getWebViewLink(fileId) {
  const response = await driveFetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=webViewLink`,
    { method: "GET" }
  );
  const json = await response.json();
  return json.webViewLink || null;
}

export async function publishPrompt(fileId) {
  const { content } = await readFileWithEtag(fileId);
  const { fileId: newFileId } = await createVisiblePromptFile(
    { promptId: content.promptId },
    content
  );
  await applyAnyonePermission(newFileId);
  await deletePrompt(fileId);
  const shareUrl = await getWebViewLink(newFileId);
  return { newFileId, shareUrl };
}

export async function unpublishPrompt(fileId) {
  // Find the "anyone" permission and remove it; keep the file in the visible folder.
  const response = await driveFetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?fields=permissions(id,type)`,
    { method: "GET" }
  );
  const json = await response.json();
  const anyonePerm = (json.permissions || []).find((p) => p.type === "anyone");
  if (!anyonePerm) return { fileId };
  await driveFetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(anyonePerm.id)}`,
    { method: "DELETE" }
  );
  return { fileId };
}

export async function makePrivateAgain(fileId) {
  // Drive doesn't allow moving files into appDataFolder — create-new + delete-old.
  const { content } = await readFileWithEtag(fileId);
  const { fileId: newFileId, etag } = await createPrivatePrompt(content);
  await deletePrompt(fileId);
  return { fileId: newFileId, etag };
}

export async function importSharedPrompt(externalFileId) {
  const { content } = await readFileWithEtag(externalFileId);
  const localPromptId =
    (crypto?.randomUUID && crypto.randomUUID()) ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const localPrompt = {
    ...content,
    promptId: localPromptId,
    createdAt: new Date().toISOString(),
  };
  return createPrivatePrompt(localPrompt);
}

export { DriveConflictError, DriveError, FILE_SCHEMA_VERSION };
