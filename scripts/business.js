/*
 * business.js
 * Source of truth is Drive. chrome.storage.local is a read-through cache + write queue.
 */

import * as drive from "./drive.js";
import { DriveConflictError } from "./drive.js";

export const CACHE_KEY = "promptmate_cache";
// Legacy key from the pre-Drive layout; we wipe it on first load.
const LEGACY_STORAGE_KEY = "promptmate_prompts";

// ---- Tone & Format catalogue ----

export const TONE_OPTIONS = [
    {
        option: 'Professional',
        category: 'Neutral / Pro',
        instruction: 'Use clear, concise, and formal language suitable for business or technical documentation. Avoid contractions and maintain a respectful, polished tone.'
    },
    {
        option: 'Friendly',
        category: 'Conversational',
        instruction: 'Use a warm, approachable tone as if speaking to a colleague. Use contractions, rhetorical questions, and analogies where helpful.'
    },
    {
        option: "Concise",
        category: "Neutral / Pro",
        instruction: "Prioritize brevity and directness. Use bullet points, short sentences, and minimal explanations. Focus only on essential information, key facts, and actionable insights without elaboration or examples unless requested."
    },
    {
        option: "Technical",
        category: "Neutral / Pro",
        instruction: "Use clear, structured explanations with defined terminology, examples, and practical guidance. Include enough technical detail for an informed reader without drifting into unnecessary complexity."
    }
];

export const FORMAT_OPTIONS = [
    {
        option: 'Paragraphs',
        category: 'Plain',
        instruction: 'Return the answer as structured, cohesive paragraphs suitable for reading as an article or blog post.'
    },
    {
        option: 'Bulleted List',
        category: 'Plain',
        instruction: 'Format the answer using concise bullet points. Ideal for quick reference, lists, or summarizing multiple items.'
    },
    {
        option: 'Numbered Steps',
        category: 'Plain',
        instruction: 'Present the answer as step-by-step numbered instructions, useful for guides, tutorials, or procedures.'
    },
    {
        option: 'Markdown Table',
        category: 'Tables / Data',
        instruction: 'Return the answer using a Markdown table with clear headers. Ideal for comparisons, feature lists, or tabular data.'
    }
];

// ---- Cache helpers ----

const emptyCache = () => ({
  prompts: {},
  visibleFolderId: null,
  lastSyncedAt: null,
  pendingWrites: [],
});

const TRASH_RETENTION_DAYS = 30;

export function isContextInvalidated(err) {
  return (
    err?.message?.includes("Extension context invalidated") ||
    chrome.runtime?.id === undefined
  );
}

function readCache() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get({ [CACHE_KEY]: null }, (res) => {
      if (chrome.runtime?.lastError) return reject(chrome.runtime.lastError);
      resolve(res[CACHE_KEY] || emptyCache());
    });
  });
}

function writeCache(cache) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [CACHE_KEY]: cache }, () => {
      if (chrome.runtime?.lastError) return reject(chrome.runtime.lastError);
      resolve();
    });
  });
}

// Serialize cache mutations. Two concurrent saves (e.g. clicking Use while an
// edit-save is in flight) used to read the same cache snapshot and the second
// writeCache would clobber the first. The lock chains every mutation behind
// the previous one so reads and writes can't interleave.
let cacheLock = Promise.resolve();
async function mutateCache(fn) {
  const run = cacheLock.then(async () => {
    const cache = await readCache();
    const next = (await fn(cache)) || cache;
    await writeCache(next);
    return next;
  });
  cacheLock = run.catch(() => {});
  return run;
}

export async function clearCache() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(
      [CACHE_KEY, LEGACY_STORAGE_KEY, "promptmate.visibleFolderId"],
      () => resolve()
    );
  });
}

function generatePromptId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isNetworkError(err) {
  if (!err) return false;
  if (err instanceof TypeError) return true;
  if (err?.status === 0) return true;
  const msg = err?.message || "";
  return /failed to fetch|network|offline|ERR_INTERNET/i.test(msg);
}

function sortPromptsByCreation(entries) {
  return entries.slice().sort((a, b) => {
    const aTime = a.createdAt || "";
    const bTime = b.createdAt || "";
    if (aTime === bTime) return 0;
    return aTime < bTime ? -1 : 1;
  });
}

export function purgeExpiredDeleted(prompts, retentionDays = TRASH_RETENTION_DAYS) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  return prompts.filter((p) => {
    if (!p?.deletedAt) return true;
    const deletedAt = new Date(p.deletedAt).getTime();
    return Number.isFinite(deletedAt) && deletedAt > cutoff;
  });
}

// Backfill v2 fields on read so the UI never has to defend against undefined.
// Persisted values win; missing values become safe defaults.
function normalizePrompt(p) {
  if (!p) return p;
  return {
    ...p,
    pinned: typeof p.pinned === "boolean" ? p.pinned : false,
    used: Number.isFinite(p.used) ? p.used : 0,
    deletedAt: p.deletedAt || null,
  };
}

function promptsArray(cache) {
  return sortPromptsByCreation(Object.values(cache.prompts || {})).map(normalizePrompt);
}

function activePromptsArray(cache) {
  return promptsArray(cache).filter((p) => !p.deletedAt);
}

function deletedPromptsArray(cache) {
  return promptsArray(cache).filter((p) => !!p.deletedAt);
}

function metaFromCache(cache) {
  return {
    pendingCount: (cache.pendingWrites || []).length,
    lastSyncedAt: cache.lastSyncedAt || null,
  };
}

// ---- Listing + reconcile ----

let purgePromise = null;
let reconcilePromise = null;

async function purgeExpiredDeletedFromCache() {
  const removed = [];
  await mutateCache((c) => {
    const prompts = c.prompts || {};
    const kept = purgeExpiredDeleted(Object.values(prompts));
    if (kept.length === Object.keys(prompts).length) return c;

    const keepIds = new Set(kept.map((p) => p.promptId));
    for (const [promptId, prompt] of Object.entries(prompts)) {
      if (keepIds.has(promptId)) continue;
      removed.push({ promptId, fileId: prompt.fileId || null });
      delete prompts[promptId];
    }
    c.pendingWrites = (c.pendingWrites || []).filter(
      (item) => !removed.some((removedItem) => removedItem.promptId === item.promptId)
    );
    return c;
  });

  for (const item of removed) {
    if (!item.fileId) continue;
    try {
      await drive.deletePrompt(item.fileId);
    } catch (err) {
      if (isNetworkError(err)) {
        await queuePendingWrite({ op: "delete", promptId: item.promptId, payload: { fileId: item.fileId } });
      } else {
        console.warn("PromptMate: failed to purge expired deleted prompt", item.promptId, err);
      }
    }
  }
}

function purgeExpiredDeletedOnce() {
  if (!purgePromise) {
    purgePromise = purgeExpiredDeletedFromCache().finally(() => {
      purgePromise = null;
    });
  }
  return purgePromise;
}

function reconcileFromDriveOnce() {
  if (!reconcilePromise) {
    reconcilePromise = reconcileFromDrive()
      .then(() => purgeExpiredDeletedOnce())
      .then(() => readCache())
      .finally(() => {
        reconcilePromise = null;
      });
  }
  return reconcilePromise;
}

export function listPrompts(callback) {
  if (typeof callback !== "function") callback = () => {};

  purgeExpiredDeletedOnce().then(() => readCache()).then((cache) => {
    callback(activePromptsArray(cache), { ...metaFromCache(cache), fromCache: true });
  });

  reconcileFromDriveOnce()
    .then((cache) => {
      callback(activePromptsArray(cache), { ...metaFromCache(cache), fromCache: false });
    })
    .catch((err) => {
      console.warn("PromptMate: background Drive sync failed", err);
    });
}

export function listDeletedPrompts(callback) {
  if (typeof callback !== "function") callback = () => {};

  purgeExpiredDeletedOnce().then(() => readCache()).then((cache) => {
    callback(deletedPromptsArray(cache), { ...metaFromCache(cache), fromCache: true });
  });

  reconcileFromDriveOnce()
    .then((cache) => {
      callback(deletedPromptsArray(cache), { ...metaFromCache(cache), fromCache: false });
    })
    .catch((err) => {
      console.warn("PromptMate: background Drive sync failed", err);
    });
}

async function reconcileFromDrive() {
  const [privateFiles, sharedFiles] = await Promise.all([
    drive.listPrivatePrompts().catch((err) => {
      throw err;
    }),
    drive.listVisiblePrompts().catch(() => []),
  ]);

  const seen = {};
  const tag = (file, tier) => {
    const m = file.name.match(/^PromptMate-(.+)\.json$/);
    if (!m) return;
    seen[m[1]] = { fileId: file.id, tier, modifiedTime: file.modifiedTime };
  };
  privateFiles.forEach((f) => tag(f, "private"));
  // If a prompt has files in both tiers we favour the shared one — shared
  // files overwrite private in `seen` because they come last.
  sharedFiles.forEach((f) => tag(f, "shared"));

  const cache = await readCache();
  const nextPrompts = { ...(cache.prompts || {}) };

  // Evict cache entries whose Drive file is gone — but never evict a prompt
  // that has an in-flight optimistic write (`pending: true`). Real offline
  // creates always go through savePrompt which sets pending:true, so that flag
  // is the correct guard. The old fileId==null guard was too broad and kept
  // cache-only orphans (e.g. seeded prompts) that have no pending write queued
  // and will never reach Drive.
  for (const promptId of Object.keys(nextPrompts)) {
    if (seen[promptId]) continue;
    const entry = nextPrompts[promptId];
    if (entry?.pending) continue;
    delete nextPrompts[promptId];
  }

  // Fetch content for new or changed entries.
  for (const [promptId, meta] of Object.entries(seen)) {
    const existing = nextPrompts[promptId];
    const unchanged =
      existing &&
      existing.fileId === meta.fileId &&
      existing.tier === meta.tier &&
      existing.driveModifiedTime === meta.modifiedTime;
    if (unchanged) continue;
    try {
      const { content, etag } = await drive.readPrompt(meta.fileId);
      nextPrompts[promptId] = {
        promptId,
        title: content.title ?? "",
        body: content.body ?? "",
        tone: content.tone ?? null,
        format: content.format ?? null,
        pinned: typeof content.pinned === "boolean" ? content.pinned : false,
        // Prefer the higher of local vs Drive so cache-only increments
        // (from incrementPromptUsed) are not lost on reconcile.
        used: Math.max(
          Number.isFinite(content.used) ? content.used : 0,
          Number.isFinite(nextPrompts[promptId]?.used) ? nextPrompts[promptId].used : 0
        ),
        createdAt: content.createdAt ?? new Date().toISOString(),
        updatedAt: content.updatedAt ?? meta.modifiedTime ?? new Date().toISOString(),
        deletedAt: content.deletedAt || null,
        fileId: meta.fileId,
        etag,
        tier: meta.tier,
        driveModifiedTime: meta.modifiedTime || null,
      };
    } catch (err) {
      console.warn("PromptMate: reconcile read failed", promptId, err);
    }
  }

  const next = {
    ...cache,
    prompts: nextPrompts,
    lastSyncedAt: new Date().toISOString(),
  };
  await writeCache(next);
  return next;
}

// ---- Save / delete ----

function toDrivePayload(prompt) {
  return {
    promptId: prompt.promptId,
    title: prompt.title ?? "",
    body: prompt.body ?? "",
    tone: prompt.tone ?? "",
    format: prompt.format ?? "",
    pinned: prompt.pinned === true,
    used: Number.isFinite(prompt.used) ? prompt.used : 0,
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
    deletedAt: prompt.deletedAt || null,
  };
}

async function performCreate(prompt) {
  return drive.createPrivatePrompt(toDrivePayload(prompt));
}

async function performUpdate(fileId, prompt, ifMatch) {
  try {
    return await drive.updatePrompt(fileId, toDrivePayload(prompt), { ifMatch });
  } catch (err) {
    if (err instanceof DriveConflictError) {
      const { etag } = await drive.readPrompt(fileId);
      return drive.updatePrompt(fileId, toDrivePayload(prompt), { ifMatch: etag });
    }
    throw err;
  }
}

export async function savePrompt(input) {
  const now = new Date().toISOString();
  const cache = await readCache();
  const existingId = input.promptId;
  const existing = existingId ? cache.prompts[existingId] : null;
  const promptId = existingId || generatePromptId();

  const prompt = {
    promptId,
    title: input.title ?? "",
    body: input.body ?? "",
    tone: input.tone ?? null,
    format: input.format ?? null,
    pinned:
      typeof input.pinned === "boolean"
        ? input.pinned
        : existing?.pinned === true,
    used: Number.isFinite(input.used)
      ? input.used
      : Number.isFinite(existing?.used)
      ? existing.used
      : 0,
    createdAt: existing?.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
    deletedAt: input.deletedAt || null,
  };

  // Optimistic cache write.
  const optimistic = {
    ...prompt,
    fileId: existing?.fileId ?? null,
    etag: existing?.etag ?? null,
    tier: existing?.tier ?? "private",
    driveModifiedTime: existing?.driveModifiedTime ?? null,
    pending: true,
  };
  await mutateCache((c) => {
    c.prompts[promptId] = optimistic;
    return c;
  });

  try {
    let result;
    if (existing?.fileId) {
      result = await performUpdate(existing.fileId, prompt, existing.etag);
    } else {
      result = await performCreate(prompt);
    }
    await mutateCache((c) => {
      c.prompts[promptId] = {
        ...optimistic,
        fileId: result.fileId,
        etag: result.etag,
        pending: false,
      };
      return c;
    });
    return promptId;
  } catch (err) {
    if (isNetworkError(err)) {
      await queuePendingWrite({
        op: existing?.fileId ? "update" : "create",
        promptId,
        payload: prompt,
      });
      return promptId;
    }
    // Hard failure — fully roll back the optimistic write. For a brand-new
    // prompt that means deleting it; for an update, restore the prior entry
    // so the cache doesn't keep `pending: true` with the user's intended
    // (but unsaved) edits and silently diverge from Drive forever.
    await mutateCache((c) => {
      if (!existing) {
        delete c.prompts[promptId];
      } else {
        c.prompts[promptId] = existing;
      }
      return c;
    });
    throw err;
  }
}

async function updatePromptDeletionState(promptId, deletedAt) {
  const cache = await readCache();
  const existing = cache.prompts[promptId];
  if (!existing) return;

  const previous = { ...existing };
  const prompt = {
    ...existing,
    deletedAt: deletedAt || null,
    updatedAt: new Date().toISOString(),
  };

  const optimistic = {
    ...prompt,
    pending: true,
  };
  await mutateCache((c) => {
    c.prompts[promptId] = optimistic;
    return c;
  });

  if (!existing.fileId) {
    await mutateCache((c) => {
      if (c.prompts[promptId]) c.prompts[promptId].pending = false;
      return c;
    });
    return;
  }

  try {
    const result = await performUpdate(existing.fileId, prompt, existing.etag);
    await mutateCache((c) => {
      if (c.prompts[promptId]) {
        c.prompts[promptId] = {
          ...optimistic,
          fileId: result.fileId,
          etag: result.etag,
          pending: false,
        };
      }
      return c;
    });
  } catch (err) {
    if (isNetworkError(err)) {
      await queuePendingWrite({ op: "update", promptId, payload: prompt });
      return;
    }
    await mutateCache((c) => {
      c.prompts[promptId] = previous;
      return c;
    });
    throw err;
  }
}

export function softDeletePrompt(promptId) {
  return updatePromptDeletionState(promptId, new Date().toISOString());
}

export function restorePrompt(promptId) {
  return updatePromptDeletionState(promptId, null);
}

export async function hardDeletePrompt(promptId) {
  const cache = await readCache();
  const entry = cache.prompts[promptId];
  if (!entry) return;

  await mutateCache((c) => {
    delete c.prompts[promptId];
    c.pendingWrites = (c.pendingWrites || []).filter((item) => item.promptId !== promptId);
    return c;
  });

  if (!entry.fileId) return;

  try {
    await drive.deletePrompt(entry.fileId);
  } catch (err) {
    if (isNetworkError(err)) {
      await queuePendingWrite({ op: "delete", promptId, payload: { fileId: entry.fileId } });
      return;
    }
    throw err;
  }
}

export const deletePrompt = softDeletePrompt;

// ---- Tier transitions (Task 07) ----

async function requireCachedEntry(promptId) {
  const cache = await readCache();
  const entry = cache.prompts[promptId];
  if (!entry || !entry.fileId) {
    throw new Error(`PromptMate: no Drive file for prompt ${promptId}`);
  }
  return entry;
}

export async function publishPrompt(promptId) {
  const entry = await requireCachedEntry(promptId);
  const { newFileId, shareUrl } = await drive.publishPrompt(entry.fileId);
  const { content, etag } = await drive.readPrompt(newFileId);
  await mutateCache((c) => {
    c.prompts[promptId] = {
      ...c.prompts[promptId],
      ...content,
      promptId,
      fileId: newFileId,
      etag,
      tier: "shared",
      shareUrl,
    };
    return c;
  });
  return { shareUrl };
}

export async function unpublishPrompt(promptId) {
  const entry = await requireCachedEntry(promptId);
  await drive.unpublishPrompt(entry.fileId);
  await mutateCache((c) => {
    if (c.prompts[promptId]) delete c.prompts[promptId].shareUrl;
    return c;
  });
  return { promptId };
}

export async function makePrivateAgain(promptId) {
  const entry = await requireCachedEntry(promptId);
  const { fileId, etag } = await drive.makePrivateAgain(entry.fileId);
  await mutateCache((c) => {
    c.prompts[promptId] = {
      ...c.prompts[promptId],
      fileId,
      etag,
      tier: "private",
    };
    delete c.prompts[promptId].shareUrl;
    return c;
  });
  return { fileId };
}

export async function importSharedPrompt(externalFileId) {
  const { fileId, etag } = await drive.importSharedPrompt(externalFileId);
  const { content } = await drive.readPrompt(fileId);
  const promptId = content.promptId || generatePromptId();
  await mutateCache((c) => {
    c.prompts[promptId] = {
      promptId,
      title: content.title ?? "",
      body: content.body ?? "",
      tone: content.tone ?? null,
      format: content.format ?? null,
      pinned: typeof content.pinned === "boolean" ? content.pinned : false,
      used: Number.isFinite(content.used) ? content.used : 0,
      createdAt: content.createdAt ?? new Date().toISOString(),
      updatedAt: content.updatedAt ?? new Date().toISOString(),
      deletedAt: content.deletedAt || null,
      fileId,
      etag,
      tier: "private",
      driveModifiedTime: null,
    };
    return c;
  });
  return { promptId };
}

// ---- Write queue ----

async function queuePendingWrite(entry) {
  await mutateCache((c) => {
    c.pendingWrites = c.pendingWrites || [];
    c.pendingWrites.push({ ...entry, queuedAt: new Date().toISOString() });
    return c;
  });
}

export async function getPendingCount() {
  const cache = await readCache();
  return (cache.pendingWrites || []).length;
}

export async function drainPendingWrites() {
  const cache = await readCache();
  const queue = cache.pendingWrites || [];
  if (!queue.length) return { drained: 0, remaining: 0 };

  const remaining = [];
  let drained = 0;

  for (const item of queue) {
    try {
      if (item.op === "create") {
        const result = await performCreate(item.payload);
        await mutateCache((c) => {
          const ex = c.prompts[item.promptId];
          if (ex) {
            c.prompts[item.promptId] = {
              ...ex,
              fileId: result.fileId,
              etag: result.etag,
              pending: false,
            };
          }
          return c;
        });
      } else if (item.op === "update") {
        const ex = (await readCache()).prompts[item.promptId];
        if (!ex?.fileId) {
          // Nothing to update against — recreate.
          const result = await performCreate(item.payload);
          await mutateCache((c) => {
            if (c.prompts[item.promptId]) {
              c.prompts[item.promptId].fileId = result.fileId;
              c.prompts[item.promptId].etag = result.etag;
              c.prompts[item.promptId].pending = false;
            }
            return c;
          });
        } else {
          const result = await performUpdate(ex.fileId, item.payload, ex.etag);
          await mutateCache((c) => {
            if (c.prompts[item.promptId]) {
              c.prompts[item.promptId].fileId = result.fileId;
              c.prompts[item.promptId].etag = result.etag;
              c.prompts[item.promptId].pending = false;
            }
            return c;
          });
        }
      } else if (item.op === "delete") {
        if (item.payload?.fileId) await drive.deletePrompt(item.payload.fileId);
      }
      drained += 1;
    } catch (err) {
      if (isNetworkError(err)) {
        remaining.push(item);
      } else {
        console.warn("PromptMate: dropping non-retryable pending write", item, err);
      }
    }
  }

  await mutateCache((c) => {
    c.pendingWrites = remaining;
    return c;
  });
  return { drained, remaining: remaining.length };
}

// ---- Compose prefs (session-level Tone/Format selection) ----

const COMPOSE_PREFS_KEY = "promptmate.composePrefs";

function validOptionValue(options, value) {
  if (!value) return null;
  return options.some((o) => o.option === value) ? value : null;
}

export function getComposePrefs() {
  return new Promise((resolve) => {
    chrome.storage.local.get([COMPOSE_PREFS_KEY], (res) => {
      const stored = res?.[COMPOSE_PREFS_KEY] || {};
      resolve({
        tone: validOptionValue(TONE_OPTIONS, stored.tone),
        format: validOptionValue(FORMAT_OPTIONS, stored.format),
      });
    });
  });
}

export function setComposePrefs(prefs) {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      { [COMPOSE_PREFS_KEY]: { tone: prefs?.tone ?? null, format: prefs?.format ?? null } },
      () => resolve()
    );
  });
}

// ---- Pin / used helpers (used by stages 2 and 4) ----

export async function setPromptPinned(promptId, pinned) {
  const cache = await readCache();
  const existing = cache.prompts?.[promptId];
  if (!existing) return;
  return savePrompt({ ...existing, pinned: !!pinned });
}

export async function incrementPromptUsed(promptId) {
  // Update the local cache only — `used` is a UI counter, not a content
  // revision. Writing to Drive here would create a spurious revision entry
  // in version history for every "Use" click.
  await mutateCache((c) => {
    const existing = c.prompts?.[promptId];
    if (!existing) return c;
    c.prompts[promptId] = {
      ...existing,
      used: (Number.isFinite(existing.used) ? existing.used : 0) + 1,
    };
    return c;
  });
}

// ---- Version history (Task 06) ----

export async function listPromptHistory(promptId) {
  const cache = await readCache();
  const entry = cache.prompts?.[promptId];
  if (!entry?.fileId) throw new Error(`PromptMate: no Drive file for prompt ${promptId}`);
  return drive.listRevisions(entry.fileId);
}

export async function getPromptRevisionContent(promptId, revisionId) {
  const cache = await readCache();
  const entry = cache.prompts?.[promptId];
  if (!entry?.fileId) throw new Error(`PromptMate: no Drive file for prompt ${promptId}`);
  const { content } = await drive.readRevision(entry.fileId, revisionId);
  return content;
}

export async function restorePromptVersion(promptId, revisionId) {
  const cache = await readCache();
  const entry = cache.prompts?.[promptId];
  if (!entry?.fileId) throw new Error(`PromptMate: no Drive file for prompt ${promptId}`);
  const { content } = await drive.readRevision(entry.fileId, revisionId);
  return savePrompt({
    promptId,
    title: content.title ?? entry.title,
    body: content.body ?? entry.body,
    tone: content.tone ?? entry.tone ?? null,
    format: content.format ?? entry.format ?? null,
    pinned: entry.pinned,
    used: entry.used,
    createdAt: entry.createdAt,
  });
}

// ---- Analytics (device-local, unchanged) ----

export function recordAnalytics(action) {
  try {
    chrome.storage.local.get(["analytics"], (result) => {
      if (chrome.runtime?.lastError) {
        console.warn("PromptMate: analytics read skipped", chrome.runtime.lastError);
        return;
      }
      const analytics = result.analytics || { created: 0, used: 0, copied: 0, edited: 0, deleted: 0 };
      analytics[action] = (analytics[action] || 0) + 1;
      chrome.storage.local.set({ analytics }, () => {
        if (chrome.runtime?.lastError) {
          console.warn("PromptMate: analytics write skipped", chrome.runtime.lastError);
        }
      });
    });
  } catch (err) {
    console.warn("PromptMate: analytics skipped", err);
  }
}

// ---- Onboarding state ----

export const ONBOARDING_KEY = "promptmate.onboarding";

export function getOnboardingState() {
  return new Promise((resolve) =>
    chrome.storage.local.get([ONBOARDING_KEY], (r) =>
      resolve(r?.[ONBOARDING_KEY] || { seeded: false, guideDismissed: false })
    )
  );
}

export function dismissOnboardingGuide() {
  return new Promise((resolve) =>
    chrome.storage.local.get([ONBOARDING_KEY], (r) => {
      const current = r?.[ONBOARDING_KEY] || {};
      chrome.storage.local.set({ [ONBOARDING_KEY]: { ...current, guideDismissed: true } }, resolve);
    })
  );
}

// ---- What's New state ----

export const WHATS_NEW_KEY = "promptmate.whatsNew";
export const WHATS_NEW_VERSION = "0.7.1";
export const RATING_PROMPT_KEY = "promptmate.ratingPrompt";
const RATING_PROMPT_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

export function getWhatsNewState() {
  return new Promise((resolve) =>
    chrome.storage.local.get([WHATS_NEW_KEY], (r) => {
      const state = r?.[WHATS_NEW_KEY] || {};
      resolve({
        ...state,
        historyDismissed: state.dismissedVersion === WHATS_NEW_VERSION,
      });
    })
  );
}

export function dismissWhatsNew() {
  return new Promise((resolve) =>
    chrome.storage.local.set(
      { [WHATS_NEW_KEY]: { dismissedVersion: WHATS_NEW_VERSION } },
      resolve
    )
  );
}

export function getRatingPromptState() {
  return new Promise((resolve) =>
    chrome.storage.local.get([RATING_PROMPT_KEY], (r) => {
      const stored = r?.[RATING_PROMPT_KEY] || {};
      const now = Date.now();
      const firstSeenTime = new Date(stored.firstSeenAt).getTime();

      if (stored.version !== WHATS_NEW_VERSION || !Number.isFinite(firstSeenTime)) {
        const next = {
          version: WHATS_NEW_VERSION,
          firstSeenAt: new Date(now).toISOString(),
          dismissedAt: null,
          action: null,
        };
        chrome.storage.local.set({ [RATING_PROMPT_KEY]: next }, () =>
          resolve({ ...next, eligible: false })
        );
        return;
      }

      const dismissed = !!stored.dismissedAt || stored.action === "rated";
      resolve({
        ...stored,
        eligible: !dismissed && now - firstSeenTime >= RATING_PROMPT_DELAY_MS,
      });
    })
  );
}

export function dismissRatingPrompt(action = "dismissed") {
  return new Promise((resolve) =>
    chrome.storage.local.get([RATING_PROMPT_KEY], (r) => {
      const current = r?.[RATING_PROMPT_KEY] || {};
      chrome.storage.local.set(
        {
          [RATING_PROMPT_KEY]: {
            ...current,
            version: WHATS_NEW_VERSION,
            firstSeenAt: current.firstSeenAt || new Date().toISOString(),
            dismissedAt: new Date().toISOString(),
            action,
          },
        },
        resolve
      );
    })
  );
}
