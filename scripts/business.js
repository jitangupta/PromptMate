/*
 * business.js
 * Source of truth is Drive. chrome.storage.local is a read-through cache + write queue.
 */

import * as drive from "./drive.js";
import { DriveConflictError } from "./drive.js";

export const CACHE_KEY = "promptmate_cache";
// Legacy key from the pre-Drive layout; we wipe it on first load.
const LEGACY_STORAGE_KEY = "promptmate_prompts";

// ---- Tone & Format catalogue (unchanged) ----

export const TONE_OPTIONS = [
    {
        option: 'Formal / Professional',
        category: 'Neutral / Pro',
        instruction: 'Use clear, concise, and formal language suitable for business or technical documentation. Avoid contractions and maintain a respectful, polished tone.'
    },
    {
        option: 'Neutral / Informative',
        category: 'Neutral / Pro',
        instruction: 'Use clear, objective language. Focus on clarity and completeness without being too casual or too formal. Ideal for tutorials, explainers, or internal knowledge sharing.'
    },
    {
        option: 'Friendly & Conversational',
        category: 'Conversational',
        instruction: 'Use a warm, approachable tone as if speaking to a colleague. Use contractions, rhetorical questions, and analogies where helpful.'
    },
    {
        option: 'Casual / Relaxed',
        category: 'Conversational',
        instruction: 'Keep it light, informal, and easygoing. Use everyday language, humor (if appropriate), and a laid-back tone as if chatting with a peer.'
    },
    {
        option: 'Playful / Humorous',
        category: 'Creative',
        instruction: 'Make the explanation fun and witty. Use puns, jokes, or quirky analogies to make the topic entertaining while still informative.'
    },
    {
        option: 'Inspirational / Motivational',
        category: 'Creative',
        instruction: 'Inspire the reader. Use uplifting language, motivating phrases, and stories of progress or success to encourage action and growth.'
    },
    {
        option: 'Expert & Analytical',
        category: 'Authority',
        instruction: 'Use precise, technical language. Focus on deep insights, data-backed reasoning, and high-level conceptual clarity. Assume the reader has strong foundational knowledge.'
    },
    {
        option: 'Persuasive / Salesy',
        category: 'Authority',
        instruction: 'Emphasize benefits, outcomes, and urgency. Use persuasive language and calls-to-action as if selling a service or pitching a solution.'
    },
    {
        option: 'Storytelling / Dramatic',
        category: 'Narrative',
        instruction: 'Frame the explanation as a compelling narrative. Use tension, characters (real or metaphorical), and vivid descriptions to engage the reader emotionally.'
    },
    {
        option: "Technical / Educational",
        category: "Neutral / Pro",
        instruction: "Use clear, structured explanations with defined terminology, examples, and step-by-step guidance. Include conceptual foundations followed by practical applications, as if teaching a complex topic to an interested learner."
    },
    {
        option: "Business Persuasive",
        category: "Authority",
        instruction: "Present logical arguments, evidence, and recommendations in a professional manner. Focus on business value, ROI, and strategic implications while maintaining credibility through balanced analysis and acknowledgment of trade-offs."
    },
    {
        option: "Concise / Brief",
        category: "Neutral / Pro",
        instruction: "Prioritize brevity and directness. Use bullet points, short sentences, and minimal explanations. Focus only on essential information, key facts, and actionable insights without elaboration or examples unless requested."
    },
    {
        option: "Executive Summary",
        category: "Authority",
        instruction: "Present high-level insights, strategic implications, and business outcomes first. Minimize technical details while emphasizing impact, risks, and recommendations. Structure content for quick scanning by busy decision-makers with limited time."
    },
    {
        option: 'Custom…',
        category: 'Other',
        instruction: ''
    }
];

export const FORMAT_OPTIONS = [
    {
        option: 'Structured Explanation with Examples',
        category: 'Informational',
        instruction: 'Return the answer using structured headings (H2 or H3), bullet points where applicable, and include real-world examples to contextualize the learning.'
    },
    {
        option: 'Checklist + Scenario-Based Hints',
        category: 'Exam-Focused',
        instruction: 'Use a checklist format for factual recall, and include 1–2 scenario-style tips or mini case studies that demonstrate how these facts apply in real-world or exam-style situations.'
    },
    {
        option: 'Paragraph(s)',
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
    },
    {
        option: 'Comparison Table',
        category: 'Tables / Data',
        instruction: 'Provide a Markdown table comparing multiple items across key attributes. Include columns like Pros, Cons, and Use Cases.'
    },
    {
        option: 'JSON Object',
        category: 'Tables / Data',
        instruction: 'Respond only with valid JSON. Ideal for APIs, structured data, or input to another system.'
    },
    {
        option: 'YAML',
        category: 'Tables / Data',
        instruction: 'Respond with a valid YAML block. Great for config files, Kubernetes manifests, or structured text.'
    },
    {
        option: 'Code Block',
        category: 'Code / Tech',
        instruction: 'Return the content as plain code inside triple backtick (```) fenced code blocks. No extra explanation.'
    },
    {
        option: 'Shell Commands',
        category: 'Code / Tech',
        instruction: 'List terminal commands line by line. Ideal for CLI walkthroughs or automation snippets.'
    },
    {
        option: 'Slide Deck Format',
        category: 'Presentations',
        instruction: 'Break the content into slide-style bullet points or sectioned headers, ready to be turned into a presentation.'
    },
    {
        option: 'Flowchart Description',
        category: 'Visual / Logic',
        instruction: 'Describe the logic or steps in a flowchart-friendly format using indents or arrows (→). Great for decision-making or process flows.'
    },
    {
        option: 'TL;DR (≤ 50 words)',
        category: 'Summaries',
        instruction: 'Summarize the entire response in one clear sentence under 50 words.'
    },
    {
        option: 'Bullet + Paragraph Hybrid',
        category: 'Plain',
        instruction: 'Use a heading or topic followed by a short paragraph. Useful when you want clarity without full narrative depth.'
    },
    {
        option: "FAQ Style",
        category: "Informational",
        instruction: "Structure the answer as a series of anticipated questions and their answers. Ideal for troubleshooting guides, product information, or complex concepts broken into discrete chunks."
    },
    {
        option: "Decision Matrix",
        category: "Visual / Logic",
        instruction: "Present options against weighted criteria in a table format, with scores or ratings for each combination. Include a summary recommendation based on the highest-scoring option(s)."
    },
    {
        option: "Executive Brief",
        category: "Summaries",
        instruction: "Structure as: 1) Key takeaway (1-2 sentences), 2) Context (2-3 sentences), 3) 3-5 bullet points of implications or recommendations, 4) Next steps if applicable. Keep entire response under 250 words."
    },
    {
        option: "Canvas Framework",
        category: "Visual / Logic",
        instruction: "Structure the information as sections of a business or planning canvas (like Business Model Canvas, Value Proposition Canvas, etc.). Label each section clearly with headings and use bullets for individual elements."
    },
    {
        option: 'Custom…',
        category: 'Other',
        instruction: ''
    }
];

// ---- Cache helpers ----

const emptyCache = () => ({
  prompts: {},
  visibleFolderId: null,
  lastSyncedAt: null,
  pendingWrites: [],
});

function readCache() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [CACHE_KEY]: null }, (res) => {
      resolve(res[CACHE_KEY] || emptyCache());
    });
  });
}

function writeCache(cache) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CACHE_KEY]: cache }, () => resolve());
  });
}

async function mutateCache(fn) {
  const cache = await readCache();
  const next = (await fn(cache)) || cache;
  await writeCache(next);
  return next;
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

function promptsArray(cache) {
  return sortPromptsByCreation(Object.values(cache.prompts || {}));
}

function metaFromCache(cache) {
  return {
    pendingCount: (cache.pendingWrites || []).length,
    lastSyncedAt: cache.lastSyncedAt || null,
  };
}

// ---- Listing + reconcile ----

export function listPrompts(callback) {
  if (typeof callback !== "function") callback = () => {};

  readCache().then((cache) => {
    callback(promptsArray(cache), { ...metaFromCache(cache), fromCache: true });
  });

  reconcileFromDrive()
    .then((cache) => {
      callback(promptsArray(cache), { ...metaFromCache(cache), fromCache: false });
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

  // Evict cache entries whose Drive file is gone.
  for (const promptId of Object.keys(nextPrompts)) {
    if (!seen[promptId]) delete nextPrompts[promptId];
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
        createdAt: content.createdAt ?? new Date().toISOString(),
        updatedAt: content.updatedAt ?? meta.modifiedTime ?? new Date().toISOString(),
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
    createdAt: prompt.createdAt,
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
    createdAt: existing?.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
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
    // Hard failure — roll back optimistic insert if it was a brand-new prompt.
    if (!existing) {
      await mutateCache((c) => {
        delete c.prompts[promptId];
        return c;
      });
    }
    throw err;
  }
}

export async function deletePrompt(promptId) {
  const cache = await readCache();
  const entry = cache.prompts[promptId];
  if (!entry) return;

  await mutateCache((c) => {
    delete c.prompts[promptId];
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
      createdAt: content.createdAt ?? new Date().toISOString(),
      updatedAt: content.updatedAt ?? new Date().toISOString(),
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

// ---- Analytics (device-local, unchanged) ----

export function recordAnalytics(action) {
  chrome.storage.local.get(['analytics'], result => {
    const analytics = result.analytics || { created: 0, used: 0, copied: 0, edited: 0, deleted: 0 };
    analytics[action] = (analytics[action] || 0) + 1;
    chrome.storage.local.set({ analytics });
  });
}

export function shareAnalytics() {
  chrome.storage.local.get(['analytics'], (result) => {
    const analytics = result.analytics || {
      created: 0, used: 0, copied: 0, edited: 0, deleted: 0
    };
    const summary = `${analytics.created} prompts created, ${analytics.used} times used, ${analytics.edited} times edited, ${analytics.copied} times copied and ${analytics.deleted} times deleted`;
    navigator.clipboard.writeText(summary).then(() => {
      alert('Analytics copied to clipboard! \n' + summary);
    });
  });
}
