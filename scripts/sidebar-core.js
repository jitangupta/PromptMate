import "../styles/pm-v2.css";

import {
  TONE_OPTIONS,
  FORMAT_OPTIONS,
  listPrompts,
  listDeletedPrompts,
  savePrompt,
  softDeletePrompt,
  restorePrompt,
  hardDeletePrompt,
  drainPendingWrites,
  recordAnalytics,
  getComposePrefs,
  setComposePrefs,
  setPromptPinned,
  incrementPromptUsed,
  listPromptHistory,
  restorePromptVersion,
  getPromptRevisionContent,
  getOnboardingState,
  dismissOnboardingGuide,
  getWhatsNewState,
  dismissWhatsNew,
  WHATS_NEW_VERSION,
  getRatingPromptState,
  dismissRatingPrompt,
  isContextInvalidated,
  loadGroups,
  saveGroup,
  deleteGroup,
  extractVariables,
  substituteVariables,
  loadContext,
  saveContext,
  loadContextEnabled,
  saveContextEnabled,
  assembleMessage,
  getDismissedBadges,
  dismissBadge,
} from "./business.js";

import {
  subscribeAuthState,
  refreshAuthState,
  performSignIn,
  performSignOut,
} from "./sidebar-auth.js";

import { showToast } from "./toast.js";
import { copyToClipboard } from "./utility.js";

import {
  trackEvent,
  getAnalyticsEnabled,
  setAnalyticsEnabled,
  bucketCount,
  shouldShowAnalyticsNotice,
  markAnalyticsNoticeShown,
} from "./analytics.js";

/**
 * @param {object} adapter
 * @param {(text: string) => { success: boolean, error?: string }} adapter.insertText
 *   Host-specific function that inserts text into the page's composer.
 * @param {(isOpen: boolean) => void} [adapter.adjustLayout]
 *   Optional hook for hosts that need to push page content aside (e.g. ChatGPT).
 */
export function initSidebar({ insertText, adjustLayout = () => {} }) {
  const SIDEBAR_ID = "promptmate-sidebar";
  const PILL_ID = "promptmate-pill";
  const SIDEBAR_WIDTH = 380;
  const COMPOSE_DISCLOSURE_STATE_KEY = "promptmate.composeDisclosureOpen";
  const BRAND_ICON_URL = chrome.runtime.getURL("icons/icon128.png");

  if (process.env.BUILD !== 'production') {
    (function applyTestStateFromURL() {
      const params = new URLSearchParams(location.search);
      const key = params.get('pm_test_key');
      const raw = params.get('pm_test_value');
      if (!key || !raw) return;
      try {
        chrome.storage.local.set({ [key]: JSON.parse(raw) }, () => location.reload());
      } catch (e) {
        console.warn('[PromptMate test hook] Invalid pm_test_value JSON', e);
      }
    })();
  }
  const REVIEW_URL = `https://chrome.google.com/webstore/detail/${chrome.runtime.id}/reviews`;

  let composePrefs = { tone: null, format: null };
  getComposePrefs().then((p) => {
    composePrefs = p;
    syncComposePrefsUi();
  });

  let onboardingDismissed = false;
  getOnboardingState().then((s) => {
    onboardingDismissed = s.guideDismissed;
  });

  let whatsNewDismissed = false;
  getWhatsNewState().then((s) => {
    whatsNewDismissed = s.historyDismissed;
  });

  let ratingPromptReady = false;
  getRatingPromptState().then((s) => {
    ratingPromptReady = s.eligible;
    if (ratingPromptReady && document.getElementById(SIDEBAR_ID)) refreshAuthState();
  });

  let lastPrompts = [];
  let lastDeletedPrompts = [];
  let lastMeta = null;
  let librarySnapshotSent = false;
  let currentQuery = "";
  let currentView = "active";
  let insertFailure = null;

  const GROUP_COLLAPSE_STATE_KEY = "promptmate.groupCollapse";
  let lastGroups = [];
  let collapsedGroups = new Set();
  try {
    const stored = JSON.parse(sessionStorage.getItem(GROUP_COLLAPSE_STATE_KEY) || "[]");
    if (Array.isArray(stored)) collapsedGroups = new Set(stored);
  } catch {
    /* corrupt session state — start expanded */
  }

  function persistGroupCollapse() {
    try {
      sessionStorage.setItem(GROUP_COLLAPSE_STATE_KEY, JSON.stringify([...collapsedGroups]));
    } catch {
      /* session storage unavailable — collapse state stays in-memory */
    }
  }

  // "New" feature badges (Task 34). Local Set mirrors storage so the sync
  // builders can check it; dismissals update the Set first for instant UI.
  let dismissedBadges = new Set();
  getDismissedBadges()
    .then((s) => {
      dismissedBadges = s;
    })
    .catch(() => {});

  function makeNewBadge(featureKey) {
    if (dismissedBadges.has(featureKey)) return null;
    const el = document.createElement("span");
    el.className = "pm-badge-new";
    el.dataset.pmBadge = featureKey;
    el.textContent = "New";
    return el;
  }

  function dismissFeatureBadge(featureKey) {
    if (dismissedBadges.has(featureKey)) return;
    dismissedBadges.add(featureKey);
    document
      .querySelectorAll(`[data-pm-badge="${featureKey}"]`)
      .forEach((el) => el.remove());
    dismissBadge(featureKey).catch((err) =>
      console.warn("PromptMate: badge dismiss failed", err)
    );
  }

  // ────────────────────────────────────────────────────────────
  // Sidebar shell
  // ────────────────────────────────────────────────────────────
  function toggleSidebar() {
    let sb = document.getElementById(SIDEBAR_ID);
    if (!sb) {
      try {
        sb = createSidebar();
      } catch (err) {
        console.warn("PromptMate: failed to create sidebar", err);
        return;
      }
    }
    if (!sb) return;

    const isOpen = sb.classList.toggle("pm-open");
    sb.style.right = isOpen ? "0" : `-${SIDEBAR_WIDTH}px`;

    adjustLayout(isOpen);
    updatePillVisibility();

    if (isOpen) {
      trackEvent("sidebar_opened");
      shouldShowAnalyticsNotice().then((show) => {
        if (!show) return;
        markAnalyticsNoticeShown();
        showToast(
          "PromptMate collects anonymous usage stats to improve the product — never your prompts or data. Turn off anytime in the ··· menu.",
          "info",
          { duration: 8000 }
        );
      });
      refreshAuthState();
      drainPendingWrites().catch((err) => {
        if (isContextInvalidated(err)) {
          showToast("Extension updated — please refresh the page.", "error");
          return;
        }
        console.warn("PromptMate: drain pending writes failed", err);
      });
    }
  }

  // ────────────────────────────────────────────────────────────
  // Floating trigger pill (coexists with the header button)
  // ────────────────────────────────────────────────────────────
  function createPill() {
    if (document.getElementById(PILL_ID)) return;
    const pill = document.createElement("button");
    pill.id = PILL_ID;
    pill.className = "pm-pill";
    pill.type = "button";
    pill.setAttribute("aria-label", "Open PromptMate");
    pill.innerHTML = `
      <img class="pm-pill-logo" src="${BRAND_ICON_URL}" alt="" aria-hidden="true" />
      <span>PromptMate</span>
    `;
    pill.addEventListener("click", toggleSidebar);
    document.body.appendChild(pill);
    updatePillVisibility();
  }

  function updatePillVisibility() {
    const pill = document.getElementById(PILL_ID);
    if (!pill) return;
    const sb = document.getElementById(SIDEBAR_ID);
    const isOpen = sb && sb.classList.contains("pm-open");
    pill.classList.toggle("pm-active", !!isOpen);
    pill.setAttribute("aria-label", isOpen ? "Close PromptMate" : "Open PromptMate");
  }

  function createSidebar() {
    // Mount on document.body so position:fixed is viewport-relative. Inside
    // a host's React tree, a transformed ancestor would otherwise become the
    // containing block and break the fixed positioning.
    if (!document.body) throw new Error("PromptMate: document.body not ready");
    const sb = document.createElement("aside");
    sb.id = SIDEBAR_ID;
    sb.className = "pm-sidebar";
    sb.style.cssText = `
      position: fixed;
      top: 0;
      right: -${SIDEBAR_WIDTH}px;
      height: 100vh;
      z-index: 9999;
      transition: right 0.3s ease-in-out;
    `;

    document.body.appendChild(sb);

    subscribeAuthState((state) => renderSidebar(sb, state));
    refreshAuthState();

    return sb;
  }

  // ────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────
  function renderSidebar(sb, authState) {
    sb.innerHTML = "";
    sb.appendChild(buildHeader());

    if (authState.loading && !authState.signedIn && !authState.message) {
      const loading = document.createElement("div");
      loading.className = "pm-empty";
      loading.textContent = "Loading…";
      sb.appendChild(loading);
      return;
    }

    if (!authState.signedIn) {
      sb.appendChild(buildSignIn(authState));
      return;
    }

    sb.appendChild(buildSearch());
    const onboardingBanner = buildOnboardingBanner();
    if (onboardingBanner) sb.appendChild(onboardingBanner);
    const whatsNewBanner = buildWhatsNewBanner();
    if (whatsNewBanner) sb.appendChild(whatsNewBanner);
    const ratingBanner = buildRatingBanner();
    if (ratingBanner) sb.appendChild(ratingBanner);
    sb.appendChild(buildComposeDisclosure());

    const insertFallbackHost = document.createElement("div");
    insertFallbackHost.id = "pm-insert-fallback-host";
    insertFallbackHost.className = "pm-insert-fallback-host";
    sb.appendChild(insertFallbackHost);

    const list = document.createElement("div");
    list.className = "pm-list";
    list.id = "pm-list";
    sb.appendChild(list);

    sb.appendChild(buildFooter(authState));
    refreshPromptData();
  }

  function moreMenuIconSvg() {
    return `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="3.5" cy="7.5" r=".8"/><circle cx="7.5" cy="7.5" r=".8"/><circle cx="11.5" cy="7.5" r=".8"/></svg>`;
  }

  function libraryIconSvg() {
    return `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5h9v7.5h-9z"/><path d="M4.5 5.5h5"/><path d="M4.5 7.5h3.5"/></svg>`;
  }

  function trashIconSvg() {
    return `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4h9"/><path d="M5 4V2.5h4V4"/><path d="M4 4.5l.4 7h5.2l.4-7"/></svg>`;
  }

  function viewToggleIconSvg() {
    return currentView === "trash" ? libraryIconSvg() : trashIconSvg();
  }

  function buildHeader() {
    const wrap = document.createElement("header");
    wrap.className = "pm-header";
    wrap.innerHTML = `
      <div class="pm-brand">
        <img class="pm-logo" src="${BRAND_ICON_URL}" alt="" aria-hidden="true" />
        <span class="pm-brand-name">PromptMate</span>
      </div>
      <div class="pm-header-actions">
        <div class="pm-settings-wrap">
          <button class="pm-iconbtn ${currentView === "trash" ? "pm-active" : ""}" type="button" aria-label="PromptMate menu" title="Menu" data-pm-settings>
            ${moreMenuIconSvg()}
          </button>
          <div class="pm-settings-menu" data-pm-settings-menu>
            <button class="pm-settings-item ${currentView === "trash" ? "pm-active" : ""}" type="button" data-pm-recently-deleted>
              <span class="pm-settings-item-icon">
                ${viewToggleIconSvg()}
              </span>
              <span>${currentView === "trash" ? "Prompt library" : "Recently deleted"}</span>
            </button>
            <button class="pm-settings-item" type="button" data-pm-context>
              <span class="pm-settings-item-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
              <span>Your context</span>
            </button>
            <button class="pm-settings-item" type="button" data-pm-user-guide>
              <span class="pm-settings-item-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
              </span>
              <span>User Guide</span>
            </button>
            <button class="pm-settings-item" type="button" data-pm-analytics title="Anonymous feature-usage counts only — never your prompts or data">
              <span class="pm-settings-item-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 3v18h18"/><path d="M7 15v3"/><path d="M12 10v8"/><path d="M17 6v12"/>
                </svg>
              </span>
              <span data-pm-analytics-label>Usage stats</span>
            </button>
          </div>
        </div>
        <button class="pm-iconbtn" type="button" aria-label="Close" data-pm-close>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg>
        </button>
      </div>
    `;
    const settingsWrap = wrap.querySelector(".pm-settings-wrap");
    const settingsMenu = wrap.querySelector("[data-pm-settings-menu]");
    wrap.querySelector("[data-pm-settings]").addEventListener("click", (e) => {
      e.stopPropagation();
      settingsMenu.classList.toggle("open");
    });
    wrap.querySelector("[data-pm-recently-deleted]").addEventListener("click", () => {
      currentView = currentView === "trash" ? "active" : "trash";
      currentQuery = "";
      const search = document.querySelector(".pm-search-input");
      if (search) search.value = "";
      const searchClear = document.querySelector(".pm-search-clear");
      if (searchClear) searchClear.style.display = "none";
      settingsMenu.classList.remove("open");
      syncSettingsUi();
      refreshPromptData();
    });
    const contextItem = wrap.querySelector("[data-pm-context]");
    const contextBadge = makeNewBadge("feature_context");
    if (contextBadge) contextItem.appendChild(contextBadge);
    contextItem.addEventListener("click", () => {
      settingsMenu.classList.remove("open");
      dismissFeatureBadge("feature_context");
      openContextPopup();
    });
    const analyticsLabel = wrap.querySelector("[data-pm-analytics-label]");
    const setAnalyticsLabel = (enabled) => {
      analyticsLabel.textContent = `Usage stats: ${enabled ? "On" : "Off"}`;
    };
    getAnalyticsEnabled().then(setAnalyticsLabel).catch(() => {});
    wrap.querySelector("[data-pm-analytics]").addEventListener("click", (e) => {
      e.stopPropagation();
      getAnalyticsEnabled()
        .then((enabled) => setAnalyticsEnabled(!enabled).then(() => !enabled))
        .then((next) => {
          setAnalyticsLabel(next);
          showToast(
            next
              ? "Anonymous usage stats enabled."
              : "Usage stats off — nothing is sent.",
            "info"
          );
        })
        .catch(() => {});
    });
    wrap.querySelector("[data-pm-user-guide]").addEventListener("click", () => {
      settingsMenu.classList.remove("open");
      // TODO: replace with live article URL when published
      window.open("https://jitangupta.com/promptmate/getting-started/", "_blank", "noopener,noreferrer");
    });
    document.addEventListener("click", (e) => {
      if (!settingsWrap.contains(e.target)) settingsMenu.classList.remove("open");
    });
    wrap.querySelector("[data-pm-close]").addEventListener("click", toggleSidebar);
    return wrap;
  }

  function syncSettingsUi() {
    const btn = document.querySelector("[data-pm-settings]");
    if (!btn) return;
    const showingTrash = currentView === "trash";
    btn.classList.toggle("pm-active", showingTrash);
    const item = document.querySelector("[data-pm-recently-deleted]");
    if (item) {
      item.classList.toggle("pm-active", showingTrash);
      const icon = item.querySelector(".pm-settings-item-icon");
      if (icon) icon.innerHTML = showingTrash ? libraryIconSvg() : trashIconSvg();
      const label = item.querySelector("span:last-child");
      if (label) label.textContent = showingTrash ? "Prompt library" : "Recently deleted";
    }
  }

  function buildOnboardingBanner() {
    if (onboardingDismissed) return null;
    const banner = document.createElement("div");
    banner.className = "pm-onboarding-banner";
    banner.id = "pm-onboarding-banner";
    banner.innerHTML = `
      <div class="pm-onboarding-content">
        <strong class="pm-onboarding-title">Welcome to PromptMate</strong>
        <ol class="pm-onboarding-steps">
          <li>Browse or search your saved prompts below</li>
          <li>Click <strong>Use</strong> on any card to insert it into the chat</li>
          <li>Click <strong>New prompt</strong> to create and save your own</li>
        </ol>
      </div>
      <button class="pm-iconbtn pm-onboarding-dismiss" type="button" aria-label="Dismiss guide">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 2l10 10M12 2l-10 10"/></svg>
      </button>
    `;
    banner.querySelector(".pm-onboarding-dismiss").addEventListener("click", () => {
      onboardingDismissed = true;
      dismissOnboardingGuide().catch(() => {});
      const el = document.getElementById("pm-onboarding-banner");
      if (el) el.remove();
    });
    return banner;
  }

  function buildWhatsNewBanner() {
    if (whatsNewDismissed) return null;
    const banner = document.createElement("div");
    banner.className = "pm-whats-new-banner";
    banner.id = "pm-whats-new-banner";
    banner.innerHTML = `
      <div class="pm-whats-new-content">
        <span class="pm-whats-new-badge">New in v${WHATS_NEW_VERSION}</span>
        <strong class="pm-whats-new-title">Variables, Groups &amp; User Context</strong>
        <p class="pm-whats-new-desc">Add <strong>{{variables}}</strong> to any prompt and fill them in before sending. Organise prompts into <strong>Groups</strong> with shared instructions. Set a <strong>User Context</strong> that travels with every prompt you send.</p>
        <a class="pm-rating-link" href="https://jitangupta.com/promptmate/whats-new" target="_blank" rel="noopener noreferrer">See what's new →</a>
      </div>
      <button class="pm-iconbtn pm-whats-new-dismiss" type="button" aria-label="Dismiss">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 2l10 10M12 2l-10 10"/></svg>
      </button>
    `;
    banner.querySelector(".pm-whats-new-dismiss").addEventListener("click", () => {
      whatsNewDismissed = true;
      dismissWhatsNew().catch(() => {});
      const el = document.getElementById("pm-whats-new-banner");
      if (el) el.remove();
    });
    return banner;
  }

  function buildRatingBanner() {
    if (!ratingPromptReady) return null;
    const banner = document.createElement("div");
    banner.className = "pm-whats-new-banner pm-rating-banner";
    banner.id = "pm-rating-banner";
    banner.innerHTML = `
      <div class="pm-whats-new-content">
        <span class="pm-whats-new-badge">A quick favor</span>
        <strong class="pm-whats-new-title">Enjoying PromptMate?</strong>
        <p class="pm-whats-new-desc">A Chrome Web Store rating helps more people trust the extension.</p>
        <a class="pm-rating-link" href="${REVIEW_URL}" target="_blank" rel="noopener noreferrer">Rate PromptMate</a>
      </div>
      <button class="pm-iconbtn pm-whats-new-dismiss" type="button" aria-label="Dismiss rating prompt">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 2l10 10M12 2l-10 10"/></svg>
      </button>
    `;
    const dismiss = (action) => {
      ratingPromptReady = false;
      trackEvent("rating_prompt", { action });
      dismissRatingPrompt(action).catch(() => {});
      const el = document.getElementById("pm-rating-banner");
      if (el) el.remove();
    };
    banner.querySelector(".pm-rating-link").addEventListener("click", () => dismiss("rated"));
    banner.querySelector(".pm-whats-new-dismiss").addEventListener("click", () => dismiss("dismissed"));
    return banner;
  }

  function buildSearch() {
    const wrap = document.createElement("div");
    wrap.className = "pm-search";
    wrap.innerHTML = `
      <span class="pm-search-icon">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="6" cy="6" r="4"/><path d="M9.5 9.5L12 12"/></svg>
      </span>
      <input class="pm-search-input" type="search" placeholder="Search prompts…" />
    `;
    const input = wrap.querySelector(".pm-search-input");

    const clearBtn = document.createElement("button");
    clearBtn.className = "pm-search-clear";
    clearBtn.setAttribute("aria-label", "Clear search");
    clearBtn.textContent = "×";
    clearBtn.style.display = "none";
    clearBtn.addEventListener("click", () => {
      input.value = "";
      currentQuery = "";
      clearBtn.style.display = "none";
      paintList();
      input.focus();
    });
    wrap.appendChild(clearBtn);

    input.value = currentQuery;
    if (currentQuery) clearBtn.style.display = "inline-flex";
    input.addEventListener("input", () => {
      currentQuery = input.value;
      clearBtn.style.display = input.value ? "inline-flex" : "none";
      paintList();
    });
    return wrap;
  }

  function buildComposeDisclosure() {
    const details = document.createElement("details");
    details.className = "pm-compose";
    details.open = sessionStorage.getItem(COMPOSE_DISCLOSURE_STATE_KEY) === "true";

    const summary = document.createElement("summary");
    const title = document.createElement("span");
    title.textContent = "Tone & Format";
    const selected = document.createElement("span");
    selected.className = "pm-compose-summary-value";
    selected.dataset.pmComposeSummary = "true";
    const updateSummary = () => {
      selected.textContent = getComposeSummaryText();
    };
    updateSummary();
    summary.append(title, selected);
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "pm-compose-body";

    const hint = document.createElement("p");
    hint.className = "pm-compose-hint";
    hint.textContent = "Optional tweaks for how the response should sound and look.";
    body.appendChild(hint);

    const tone = buildSelect("pm-tone-pref", "Tone", TONE_OPTIONS, composePrefs.tone);
    const format = buildSelect("pm-format-pref", "Format", FORMAT_OPTIONS, composePrefs.format);
    body.append(tone.wrap, format.wrap);

    details.appendChild(body);

    tone.select.addEventListener("change", () => {
      composePrefs.tone = tone.select.value || null;
      tone.updateInstruction(TONE_OPTIONS);
      updateSummary();
      clearInsertFailure();
      setComposePrefs(composePrefs).catch(() => {});
    });
    format.select.addEventListener("change", () => {
      composePrefs.format = format.select.value || null;
      format.updateInstruction(FORMAT_OPTIONS);
      updateSummary();
      clearInsertFailure();
      setComposePrefs(composePrefs).catch(() => {});
    });
    details.addEventListener("toggle", () => {
      sessionStorage.setItem(COMPOSE_DISCLOSURE_STATE_KEY, details.open ? "true" : "false");
    });

    return details;
  }

  function getComposeOptionLabel(options, value) {
    if (!value) return "None";
    return options.some((o) => o.option === value) ? value : "None";
  }

  function getComposeSummaryText() {
    return `Tone: ${getComposeOptionLabel(TONE_OPTIONS, composePrefs.tone)} · Format: ${getComposeOptionLabel(FORMAT_OPTIONS, composePrefs.format)}`;
  }

  function syncComposePrefsUi() {
    const toneSelect = document.getElementById("pm-tone-pref");
    const formatSelect = document.getElementById("pm-format-pref");
    if (toneSelect) {
      toneSelect.value = TONE_OPTIONS.some((o) => o.option === composePrefs.tone) ? composePrefs.tone : "";
      updateComposeInstruction(toneSelect, TONE_OPTIONS);
    }
    if (formatSelect) {
      formatSelect.value = FORMAT_OPTIONS.some((o) => o.option === composePrefs.format) ? composePrefs.format : "";
      updateComposeInstruction(formatSelect, FORMAT_OPTIONS);
    }
    const summary = document.querySelector("[data-pm-compose-summary]");
    if (summary) summary.textContent = getComposeSummaryText();
  }

  function updateComposeInstruction(select, options) {
    const wrap = select.closest("label");
    const instructionEl = wrap?.querySelector(".pm-compose-instruction");
    if (!instructionEl) return;
    const match = options.find((o) => o.option === select.value);
    instructionEl.textContent = match?.instruction || "";
  }

  function buildSelect(id, label, options, currentValue) {
    const wrap = document.createElement("label");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "4px";
    wrap.htmlFor = id;

    const lbl = document.createElement("span");
    lbl.className = "pm-field-label pm-mono";
    lbl.textContent = label;

    const select = document.createElement("select");
    select.id = id;
    select.className = "pm-select";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "None";
    select.appendChild(placeholder);

    options.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.option;
      opt.textContent = o.option;
      select.appendChild(opt);
    });

    if (options.some((o) => o.option === currentValue)) select.value = currentValue;

    const instructionEl = document.createElement("p");
    instructionEl.className = "pm-compose-instruction";

    const updateInstruction = (allOptions) => {
      const match = allOptions.find((o) => o.option === select.value);
      instructionEl.textContent = match?.instruction || "";
    };
    updateInstruction(options);

    wrap.append(lbl, select, instructionEl);
    return { wrap, select, updateInstruction };
  }

  function buildFooter(authState) {
    const footer = document.createElement("footer");
    footer.className = "pm-footer";

    const sync = document.createElement("div");
    sync.className = "pm-sync-status";
    sync.id = "pm-sync-status";
    footer.appendChild(sync);

    const newBtn = document.createElement("button");
    newBtn.className = "pm-btn pm-btn-primary pm-btn-block";
    newBtn.type = "button";
    newBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 3v8M3 7h8"/></svg>
      New prompt
    `;
    newBtn.addEventListener("click", () => openPromptModal());
    footer.appendChild(newBtn);

    const row = document.createElement("div");
    row.className = "pm-foot-row";

    const user = document.createElement("div");
    user.className = "pm-user";
    const email = authState.email || "";
    const initial = (email.trim()[0] || "?").toUpperCase();
    user.innerHTML = `
      <span class="pm-avatar">${initial}</span>
      <span class="pm-email" title="${escapeAttr(email)}">${escapeText(email || "Signed in")}</span>
    `;
    row.appendChild(user);

    const signOut = document.createElement("button");
    signOut.className = "pm-link";
    signOut.type = "button";
    signOut.textContent = "Sign out";
    signOut.addEventListener("click", () =>
      performSignOut().catch((err) => console.warn("PromptMate: sign-out failed", err))
    );
    row.appendChild(signOut);

    footer.appendChild(row);

    const links = document.createElement("div");
    links.className = "pm-footer-links";

    const rateLink = document.createElement("a");
    rateLink.className = "pm-footer-link";
    rateLink.href = REVIEW_URL;
    rateLink.target = "_blank";
    rateLink.rel = "noopener noreferrer";
    rateLink.textContent = "Rate PromptMate";
    links.appendChild(rateLink);

    const requestLink = document.createElement("a");
    requestLink.className = "pm-footer-link";
    requestLink.href = "https://forms.gle/ripbRre2nCFcJ4hz6";
    requestLink.target = "_blank";
    requestLink.rel = "noopener noreferrer";
    requestLink.textContent = "Request a feature";
    links.appendChild(requestLink);

    footer.appendChild(links);

    return footer;
  }

  function buildSignIn(authState) {
    const wrap = document.createElement("div");
    wrap.className = "pm-signin";

    const msg = document.createElement("p");
    msg.className = "pm-signin-msg";
    msg.textContent = "Sign in to sync your prompts with Google Drive.";
    wrap.appendChild(msg);

    if (authState.message) {
      const err = document.createElement("p");
      err.className = "pm-signin-error";
      err.textContent = authState.message;
      wrap.appendChild(err);
    }

    const btn = document.createElement("button");
    btn.className = "pm-btn pm-btn-primary";
    btn.type = "button";
    btn.disabled = !!authState.loading;
    btn.textContent = authState.loading ? "Signing in…" : "Sign in with Google";
    btn.addEventListener("click", () =>
      performSignIn()
        .then(() => trackEvent("sign_in_completed"))
        .catch((err) => console.warn("PromptMate: sign-in failed", err))
    );
    wrap.appendChild(btn);
    return wrap;
  }

  // ────────────────────────────────────────────────────────────
  // Prompt list + cards
  // ────────────────────────────────────────────────────────────
  function refreshPromptData() {
    if (currentView === "trash") {
      listDeletedPrompts((prompts, meta) => {
        lastDeletedPrompts = prompts;
        lastMeta = meta;
        paintList();
      });
      return;
    }

    loadGroups()
      .then((groups) => {
        lastGroups = groups;
        paintList();
      })
      .catch((err) => console.warn("PromptMate: load groups failed", err));

    listPrompts((prompts, meta) => {
      lastPrompts = prompts;
      lastMeta = meta;
      // Daily library-shape pulse: coarse buckets only, after the Drive
      // reconcile so counts are real. Background dedupes to once per day.
      if (!meta.fromCache && !librarySnapshotSent) {
        librarySnapshotSent = true;
        trackEvent("library_snapshot", {
          prompt_bucket: bucketCount(prompts.length),
          group_bucket: bucketCount(lastGroups.length),
        });
      }
      paintList();
    });
  }

  function sortByRecency(arr) {
    return arr.slice().sort((a, b) => {
      const ax = a.updatedAt || a.createdAt || "";
      const bx = b.updatedAt || b.createdAt || "";
      return ax < bx ? 1 : ax > bx ? -1 : 0;
    });
  }

  function sortByDeletion(arr) {
    return arr.slice().sort((a, b) => {
      const ax = a.deletedAt || "";
      const bx = b.deletedAt || "";
      return ax < bx ? 1 : ax > bx ? -1 : 0;
    });
  }

  function paintList() {
    const listEl = document.getElementById("pm-list");
    if (!listEl) return;
    listEl.innerHTML = "";
    paintInsertFailure();

    const meta = lastMeta;
    const prompts = currentView === "trash" ? lastDeletedPrompts : lastPrompts;

    if (!prompts.length) {
      const empty = document.createElement("div");
      empty.className = "pm-empty";
      empty.textContent =
        currentView === "trash"
          ? "No deleted prompts."
          : "No prompts yet. Click “New prompt” below to create one.";
      listEl.appendChild(empty);
      if (currentView === "active") {
        // TODO: replace with live article URL when published
        const GUIDE_URL = "https://jitangupta.com/promptmate/getting-started/";
        const card = document.createElement("div");
        card.className = "pm-doc-card";
        card.innerHTML = `
          <span class="pm-doc-card-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </span>
          <div class="pm-doc-card-body">
            <div class="pm-doc-card-title">Getting Started with PromptMate</div>
            <div class="pm-doc-card-desc">Learn how to save, tone-adjust, and insert prompts in seconds.</div>
            <a class="pm-doc-link" href="${GUIDE_URL}" target="_blank" rel="noopener noreferrer">Read the guide →</a>
          </div>
        `;
        listEl.appendChild(card);
      }
      updateSyncIndicator(meta);
      return;
    }

    const q = currentQuery.trim().toLowerCase();
    if (q) {
      const matches = prompts.filter(
        (p) =>
          (p.title || "").toLowerCase().includes(q) ||
          (p.body || "").toLowerCase().includes(q)
      );
      const label = document.createElement("div");
      label.className = "pm-section-label";
      label.textContent = `${matches.length} result${matches.length === 1 ? "" : "s"} for "${currentQuery.trim()}"`;
      listEl.appendChild(label);
      if (!matches.length) {
        const empty = document.createElement("div");
        empty.className = "pm-empty";
        empty.textContent = `No prompts match "${currentQuery.trim()}".`;
        listEl.appendChild(empty);
      } else {
        sortByRecency(matches).forEach((p) =>
          listEl.appendChild(currentView === "trash" ? buildTrashCard(p) : buildCard(p))
        );
      }
      updateSyncIndicator(meta);
      return;
    }

    if (currentView === "trash") {
      const lbl = document.createElement("div");
      lbl.className = "pm-section-label";
      lbl.textContent = "Trash";
      listEl.appendChild(lbl);
      sortByDeletion(prompts).forEach((p) => listEl.appendChild(buildTrashCard(p)));
      updateSyncIndicator(meta);
      return;
    }

    const sorted = sortByRecency(prompts);
    const pinned = sorted.filter((p) => p.pinned);
    const recent = sorted.filter((p) => !p.pinned);

    if (pinned.length) {
      const lbl = document.createElement("div");
      lbl.className = "pm-section-label";
      lbl.textContent = "Pinned";
      listEl.appendChild(lbl);
      pinned.forEach((p) => listEl.appendChild(buildCard(p)));
    }

    if (!lastGroups.length) {
      // No groups defined — keep the original flat Recent list.
      if (recent.length) {
        const lbl = document.createElement("div");
        lbl.className = "pm-section-label";
        lbl.textContent = "Recent";
        listEl.appendChild(lbl);
        recent.forEach((p) => listEl.appendChild(buildCard(p)));
      }
    } else {
      const groupIds = new Set(lastGroups.map((g) => g.id));
      lastGroups.forEach((group, i) => {
        listEl.appendChild(
          buildGroupSection(group, recent.filter((p) => p.group === group.id), {
            showNewBadge: i === 0,
          })
        );
      });
      // Ungrouped catches prompts with no group AND prompts whose group id
      // can't be resolved (deleted group, or group created on another device).
      const ungrouped = recent.filter((p) => !p.group || !groupIds.has(p.group));
      if (ungrouped.length) {
        listEl.appendChild(
          buildGroupSection({ id: "__ungrouped__", name: "Ungrouped" }, ungrouped, {
            isUngrouped: true,
          })
        );
      }
    }

    updateSyncIndicator(meta);
  }

  // ────────────────────────────────────────────────────────────
  // Groups (Task 30)
  // ────────────────────────────────────────────────────────────
  function buildGroupSection(group, prompts, { isUngrouped = false, showNewBadge = false } = {}) {
    const section = document.createElement("section");
    section.className = "pm-group";
    const collapsed = collapsedGroups.has(group.id);

    const header = document.createElement("div");
    header.className = `pm-group-header${collapsed ? " pm-collapsed" : ""}`;
    header.setAttribute("role", "button");
    header.setAttribute("aria-expanded", String(!collapsed));

    const chevron = document.createElement("span");
    chevron.className = "pm-group-chevron";
    chevron.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 2.5L8 6l-3.5 3.5"/></svg>`;

    const name = document.createElement("span");
    name.className = "pm-group-name";
    name.textContent = group.name;

    const count = document.createElement("span");
    count.className = "pm-group-count pm-mono";
    count.textContent = String(prompts.length);

    header.append(chevron, name, count);
    if (showNewBadge) {
      const badge = makeNewBadge("feature_groups");
      if (badge) header.appendChild(badge);
    }
    if (!isUngrouped) header.appendChild(buildGroupMenu(group));

    header.addEventListener("click", () => {
      dismissFeatureBadge("feature_groups");
      if (collapsedGroups.has(group.id)) collapsedGroups.delete(group.id);
      else collapsedGroups.add(group.id);
      persistGroupCollapse();
      paintList();
    });

    section.appendChild(header);

    if (!collapsed) {
      const bodyEl = document.createElement("div");
      bodyEl.className = "pm-group-body";
      if (!prompts.length) {
        const empty = document.createElement("div");
        empty.className = "pm-group-empty";
        empty.textContent = "No prompts in this group yet.";
        bodyEl.appendChild(empty);
      } else {
        prompts.forEach((p) => bodyEl.appendChild(buildCard(p)));
      }
      section.appendChild(bodyEl);
    }

    return section;
  }

  function buildGroupMenu(group) {
    const wrap = document.createElement("div");
    wrap.className = "pm-menu-wrap pm-group-menu-wrap";

    const btn = document.createElement("button");
    btn.className = "pm-iconbtn";
    btn.type = "button";
    btn.setAttribute("aria-label", `Group actions for ${group.name}`);
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="11" cy="7" r="1.2"/></svg>`;

    const menu = document.createElement("div");
    menu.className = "pm-menu";

    const renderItems = () => {
      menu.innerHTML = "";

      const rename = document.createElement("button");
      rename.className = "pm-menu-item";
      rename.type = "button";
      rename.textContent = "Rename";
      rename.addEventListener("click", (e) => {
        e.stopPropagation();
        renderRenameForm();
      });

      const instruction = document.createElement("button");
      instruction.className = "pm-menu-item";
      instruction.type = "button";
      instruction.textContent = "Edit instruction";
      instruction.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.classList.remove("open");
        openGroupInstructionPopup(group);
      });

      const del = document.createElement("button");
      del.className = "pm-menu-item pm-danger";
      del.type = "button";
      del.textContent = "Delete group";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.classList.remove("open");
        if (!confirm(`Delete group "${group.name}"? Its prompts move to Ungrouped.`)) return;
        deleteGroup(group.id)
          .then(() => {
            trackEvent("group_deleted");
            collapsedGroups.delete(group.id);
            persistGroupCollapse();
            refreshPromptData();
            showToast("Group deleted. Prompts moved to Ungrouped.");
          })
          .catch((err) => {
            console.warn("PromptMate: delete group failed", err);
            showToast("Couldn't delete group. Try again.");
          });
      });

      menu.append(rename, instruction, del);
    };

    const renderRenameForm = () => {
      menu.innerHTML = "";
      const form = document.createElement("div");
      form.className = "pm-menu-inline-form";
      form.addEventListener("click", (e) => e.stopPropagation());

      const input = document.createElement("input");
      input.className = "pm-input";
      input.type = "text";
      input.value = group.name;
      input.setAttribute("aria-label", "Group name");

      const saveBtn = document.createElement("button");
      saveBtn.className = "pm-btn pm-btn-primary";
      saveBtn.type = "button";
      saveBtn.textContent = "Save";
      const submit = () => {
        const name = input.value.trim();
        if (!name || name === group.name) {
          menu.classList.remove("open");
          renderItems();
          return;
        }
        saveGroup({ ...group, name })
          .then(() => {
            menu.classList.remove("open");
            refreshPromptData();
          })
          .catch((err) => {
            console.warn("PromptMate: rename group failed", err);
            showToast(err?.message?.includes("already exists")
              ? "A group with that name already exists."
              : "Couldn't rename group. Try again.");
          });
      };
      saveBtn.addEventListener("click", submit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") renderItems();
      });

      form.append(input, saveBtn);
      menu.appendChild(form);
      input.focus();
      input.select();
    };

    renderItems();

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".pm-menu.open").forEach((m) => {
        if (m !== menu) m.classList.remove("open");
      });
      renderItems();
      menu.classList.toggle("open");
    });

    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) menu.classList.remove("open");
    });

    wrap.append(btn, menu);
    return wrap;
  }

  // ────────────────────────────────────────────────────────────
  // Context & group instructions (Task 36)
  // ────────────────────────────────────────────────────────────
  const CONTEXT_EXTRACTION_PROMPT =
    "Based on everything you know about me from our conversations, write a short 'about me' I can reuse as standing context for future prompts: my role, preferences, and communication style. Plain text, first person, under 120 words.";

  function makeSwitch(initial, onChange) {
    const btn = document.createElement("button");
    btn.className = `pm-switch${initial ? " pm-on" : ""}`;
    btn.type = "button";
    btn.setAttribute("role", "switch");
    btn.setAttribute("aria-checked", String(!!initial));
    const knob = document.createElement("span");
    knob.className = "pm-switch-knob";
    btn.appendChild(knob);
    btn.addEventListener("click", () => {
      const next = !btn.classList.contains("pm-on");
      btn.classList.toggle("pm-on", next);
      btn.setAttribute("aria-checked", String(next));
      onChange?.(next);
    });
    return {
      el: btn,
      get value() {
        return btn.classList.contains("pm-on");
      },
    };
  }

  function buildPopupShell(overlayId, title, onClose) {
    const overlay = document.createElement("div");
    overlay.className = "pm-modal-overlay";
    overlay.id = overlayId;
    const close = () => {
      overlay.remove();
      onClose?.();
    };
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    const modal = document.createElement("div");
    modal.className = "pm-modal";
    modal.setAttribute("role", "dialog");

    const head = document.createElement("div");
    head.className = "pm-modal-head";
    head.innerHTML = `
      <h2 class="pm-modal-title">${escapeText(title)}</h2>
      <button class="pm-iconbtn" type="button" aria-label="Close" data-pm-popup-close>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg>
      </button>
    `;
    head.querySelector("[data-pm-popup-close]").addEventListener("click", close);

    const body = document.createElement("div");
    body.className = "pm-modal-body";

    const foot = document.createElement("div");
    foot.className = "pm-modal-foot";

    modal.append(head, body, foot);
    overlay.appendChild(modal);
    return { overlay, head, body, foot, close };
  }

  function openContextPopup() {
    document.getElementById("pm-context-overlay")?.remove();
    const { overlay, body, foot, close } = buildPopupShell("pm-context-overlay", "Your context");

    Promise.all([loadContext(), loadContextEnabled()])
      .then(([context, enabled]) => {
        const toggleCard = document.createElement("div");
        toggleCard.className = "pm-toggle-card";
        const toggleText = document.createElement("div");
        toggleText.className = "pm-toggle-card-text";
        toggleText.innerHTML = `
          <span class="pm-toggle-card-title">Use context</span>
          <span class="pm-toggle-card-desc">Quietly attached to every prompt you insert.</span>
        `;
        const enabledSwitch = makeSwitch(enabled);
        toggleCard.append(toggleText, enabledSwitch.el);
        body.appendChild(toggleCard);

        const field = makeField("pm-context-text", "ABOUT YOU", "textarea",
          "I'm a senior engineer at a fintech startup. I prefer concise, technical answers…");
        field.input.value = context;
        body.appendChild(field.wrap);

        const pull = document.createElement("button");
        pull.className = "pm-link pm-context-pull";
        pull.type = "button";
        pull.textContent = "✦ Pull it from this chat";
        pull.addEventListener("click", () => {
          const result = insertText(CONTEXT_EXTRACTION_PROMPT);
          if (result.success) {
            close();
            showToast("Extraction prompt inserted — copy the answer back into Context.", "info", { duration: 6000 });
          } else {
            showToast("Couldn't insert the extraction prompt here. Copy your bio in manually.");
          }
        });
        body.appendChild(pull);

        const privacy = document.createElement("div");
        privacy.className = "pm-privacy-note";
        privacy.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span>Stored on this device. Never shared.</span>
        `;
        body.appendChild(privacy);

        const cancel = document.createElement("button");
        cancel.className = "pm-btn pm-btn-secondary";
        cancel.type = "button";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", close);

        const save = document.createElement("button");
        save.className = "pm-btn pm-btn-primary";
        save.type = "button";
        save.textContent = context ? "Save" : "Add context";
        save.addEventListener("click", () => {
          const contextText = field.input.value.trim();
          const contextOn = enabledSwitch.value;
          Promise.all([saveContext(contextText), saveContextEnabled(contextOn)])
            .then(() => {
              // Booleans only — the context text itself never leaves the device.
              trackEvent("context_saved", { enabled: contextOn, has_text: !!contextText });
              close();
              showToast("Context saved.", "success");
            })
            .catch((err) => {
              console.warn("PromptMate: save context failed", err);
              showToast("Couldn't save context. Try again.");
            });
        });

        foot.append(cancel, save);
        field.input.focus();
      })
      .catch((err) => {
        console.warn("PromptMate: load context failed", err);
        body.textContent = "Couldn't load your context. Close and try again.";
      });

    const sb = document.getElementById(SIDEBAR_ID);
    (sb || document.body).appendChild(overlay);
  }

  function openGroupInstructionPopup(group) {
    document.getElementById("pm-group-instruction-overlay")?.remove();
    const { overlay, head, body, foot, close } = buildPopupShell(
      "pm-group-instruction-overlay",
      "Group instruction"
    );

    const subtitle = document.createElement("p");
    subtitle.className = "pm-varfill-subtitle";
    subtitle.textContent = group.name;
    head.appendChild(subtitle);

    const toggleCard = document.createElement("div");
    toggleCard.className = "pm-toggle-card";
    const toggleText = document.createElement("div");
    toggleText.className = "pm-toggle-card-text";
    toggleText.innerHTML = `
      <span class="pm-toggle-card-title">Use instruction</span>
      <span class="pm-toggle-card-desc">Applied to every prompt in this group.</span>
    `;
    const enabledSwitch = makeSwitch(group.instructionEnabled === true);
    toggleCard.append(toggleText, enabledSwitch.el);
    body.appendChild(toggleCard);

    const field = makeField("pm-group-instruction-text", "GROUP INSTRUCTION · OPTIONAL", "textarea",
      "E.g. First-person voice, no hashtags, no emoji, end on a question.");
    field.input.value = group.instruction || "";
    body.appendChild(field.wrap);

    const info = document.createElement("div");
    info.className = "pm-info-callout";
    info.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
      <span>Added to every prompt in this group when you insert it — right after your context, before the prompt body.</span>
    `;
    body.appendChild(info);

    const cancel = document.createElement("button");
    cancel.className = "pm-btn pm-btn-secondary";
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", close);

    const save = document.createElement("button");
    save.className = "pm-btn pm-btn-primary";
    save.type = "button";
    save.textContent = "Save";
    save.addEventListener("click", () => {
      const instructionEnabled = enabledSwitch.value;
      saveGroup({
        ...group,
        instruction: field.input.value.trim(),
        instructionEnabled,
      })
        .then(() => {
          trackEvent("group_instruction_saved", { enabled: instructionEnabled });
          close();
          refreshPromptData();
          showToast("Group instruction saved.", "success");
        })
        .catch((err) => {
          console.warn("PromptMate: save group instruction failed", err);
          showToast("Couldn't save instruction. Try again.");
        });
    });

    foot.append(cancel, save);

    const sb = document.getElementById(SIDEBAR_ID);
    (sb || document.body).appendChild(overlay);
    field.input.focus();
  }

  function paintInsertFailure() {
    const host = document.getElementById("pm-insert-fallback-host");
    if (!host) return;
    host.innerHTML = "";
    if (!insertFailure) return;
    host.appendChild(buildInsertFailureBanner(insertFailure.prompt, insertFailure.text));
  }

  function buildCard(prompt) {
    const card = document.createElement("article");
    card.className = "pm-card";

    const head = document.createElement("div");
    head.className = "pm-card-head";

    const titleWrap = document.createElement("div");
    titleWrap.className = "pm-card-title-wrap";
    if (prompt.pinned) {
      const pin = document.createElement("span");
      pin.className = "pm-pin";
      pin.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M5 1h2v4l2 2v1H3V7l2-2V1z"/><path d="M6 8v3" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>`;
      titleWrap.appendChild(pin);
    }
    const title = document.createElement("span");
    title.className = "pm-card-title";
    title.textContent = prompt.title || "(untitled)";
    titleWrap.appendChild(title);
    head.appendChild(titleWrap);

    head.appendChild(buildMoreMenu(prompt));
    card.appendChild(head);

    const desc = document.createElement("p");
    desc.className = "pm-card-desc";
    desc.textContent = prompt.body || "";
    card.appendChild(desc);

    const foot = document.createElement("div");
    foot.className = "pm-card-foot";

    const useBtn = document.createElement("button");
    useBtn.className = "pm-btn pm-btn-primary";
    useBtn.type = "button";
    useBtn.textContent = "Use";
    useBtn.addEventListener("click", () => onUse(prompt));
    foot.appendChild(useBtn);

    const vars = extractVariables(prompt.body || "");
    if (vars.length) {
      const badge = document.createElement("span");
      badge.className = "pm-badge-var pm-mono";
      badge.textContent = `${vars.length} variable${vars.length === 1 ? "" : "s"}`;
      foot.appendChild(badge);
    }

    if (prompt.used > 0) {
      const used = document.createElement("span");
      used.className = "pm-used";
      used.textContent = `${prompt.used}×`;
      foot.appendChild(used);
    }

    card.appendChild(foot);
    return card;
  }

  function buildInsertFailureBanner(prompt, text) {
    const banner = document.createElement("div");
    banner.className = "pm-insert-fallback";

    const message = document.createElement("p");
    message.className = "pm-insert-fallback-message";
    message.textContent =
      "Looks like something has changed — we couldn't insert the prompt automatically. Use the Copy button to paste it manually.";
    banner.appendChild(message);

    const actions = document.createElement("div");
    actions.className = "pm-insert-fallback-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "pm-btn pm-btn-primary";
    copyBtn.type = "button";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async () => {
      const copied = await copyToClipboard(text);
      if (!copied) {
        showToast("Couldn't copy prompt. Try the copy menu again.");
        return;
      }
      recordAnalytics("copied");
      trackEvent("prompt_copied", { after_insert_failure: true });
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.textContent = "Copy";
      }, 2000);
    });

    const dismissBtn = document.createElement("button");
    dismissBtn.className = "pm-iconbtn";
    dismissBtn.type = "button";
    dismissBtn.setAttribute("aria-label", "Dismiss insert warning");
    dismissBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l6 6M10 4l-6 6"/></svg>`;
    dismissBtn.addEventListener("click", () => {
      if (insertFailure?.promptId === prompt.promptId) {
        insertFailure = null;
        paintList();
      }
    });

    actions.append(copyBtn, dismissBtn);
    banner.appendChild(actions);
    return banner;
  }

  function buildTrashCard(prompt) {
    const card = document.createElement("article");
    card.className = "pm-card";

    const head = document.createElement("div");
    head.className = "pm-card-head";

    const titleWrap = document.createElement("div");
    titleWrap.className = "pm-card-title-wrap";
    const title = document.createElement("span");
    title.className = "pm-card-title";
    title.textContent = prompt.title || "(untitled)";
    titleWrap.appendChild(title);
    head.appendChild(titleWrap);
    card.appendChild(head);

    const meta = document.createElement("p");
    meta.className = "pm-trash-meta";
    meta.textContent = formatDeletedMeta(prompt.deletedAt);
    card.appendChild(meta);

    const foot = document.createElement("div");
    foot.className = "pm-card-foot pm-trash-actions";

    const restoreBtn = document.createElement("button");
    restoreBtn.className = "pm-btn pm-btn-primary";
    restoreBtn.type = "button";
    restoreBtn.textContent = "Restore";
    restoreBtn.addEventListener("click", () => onRestoreDeleted(prompt));
    foot.appendChild(restoreBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "pm-btn pm-btn-danger";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete forever";
    deleteBtn.addEventListener("click", () => onHardDelete(prompt));
    foot.appendChild(deleteBtn);

    card.appendChild(foot);
    return card;
  }

  function buildMoreMenu(prompt) {
    const wrap = document.createElement("div");
    wrap.className = "pm-menu-wrap";

    const btn = document.createElement("button");
    btn.className = "pm-iconbtn";
    btn.type = "button";
    btn.setAttribute("aria-label", "More actions");
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="11" cy="7" r="1.2"/></svg>`;

    const menu = document.createElement("div");
    menu.className = "pm-menu";

    const pin = document.createElement("button");
    pin.className = "pm-menu-item";
    pin.type = "button";
    pin.textContent = prompt.pinned ? "Unpin" : "Pin";
    pin.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.remove("open");
      onTogglePin(prompt);
    });

    const copy = document.createElement("button");
    copy.className = "pm-menu-item";
    copy.type = "button";
    copy.textContent = "Copy";
    copy.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.remove("open");
      onCopy(prompt);
    });

    const previewItem = document.createElement("button");
    previewItem.className = "pm-menu-item";
    previewItem.type = "button";
    previewItem.textContent = "Preview";
    const previewBadge = makeNewBadge("feature_assembly");
    if (previewBadge) previewItem.appendChild(previewBadge);
    previewItem.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.remove("open");
      dismissFeatureBadge("feature_assembly");
      const vars = extractVariables(prompt.body || "");
      if (vars.length) {
        // Variables-first: fill, then preview the filled body (decision 4).
        openVarFillPopup(prompt, (filled) =>
          openAssemblyPreview(prompt, substituteVariables(prompt.body || "", filled))
        );
      } else {
        openAssemblyPreview(prompt, null);
      }
    });

    const edit = document.createElement("button");
    edit.className = "pm-menu-item";
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.remove("open");
      openPromptModal(prompt);
    });

    const hist = document.createElement("button");
    hist.className = "pm-menu-item";
    hist.type = "button";
    hist.textContent = "History";
    hist.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.remove("open");
      openHistoryDrawer(prompt);
    });

    const move = document.createElement("button");
    move.className = "pm-menu-item";
    move.type = "button";
    move.textContent = "Move to group";
    move.addEventListener("click", (e) => {
      e.stopPropagation();
      renderMoveToGroup();
    });

    const del = document.createElement("button");
    del.className = "pm-menu-item pm-danger";
    del.type = "button";
    del.textContent = "Delete";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.remove("open");
      onDelete(prompt);
    });

    const renderDefaultItems = () => {
      menu.replaceChildren(pin, copy, previewItem, edit, hist, move, del);
    };

    const movePromptToGroup = (groupId) => {
      menu.classList.remove("open");
      dismissFeatureBadge("feature_groups");
      savePrompt({ ...prompt, group: groupId })
        .then(() => refreshPromptData())
        .catch((err) => {
          console.warn("PromptMate: move to group failed", err);
          showToast("Couldn't move prompt. Try again.");
        });
    };

    // The 380px sidebar has no room for a positioned submenu — swap the
    // menu's contents in place instead.
    const renderMoveToGroup = () => {
      menu.innerHTML = "";

      const back = document.createElement("button");
      back.className = "pm-menu-item pm-menu-back";
      back.type = "button";
      back.textContent = "← Back";
      back.addEventListener("click", (e) => {
        e.stopPropagation();
        renderDefaultItems();
      });
      menu.appendChild(back);

      lastGroups.forEach((g) => {
        const item = document.createElement("button");
        item.className = "pm-menu-item";
        item.type = "button";
        item.textContent = prompt.group === g.id ? `✓ ${g.name}` : g.name;
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          movePromptToGroup(g.id);
        });
        menu.appendChild(item);
      });

      const ungrouped = document.createElement("button");
      ungrouped.className = "pm-menu-item";
      ungrouped.type = "button";
      ungrouped.textContent = !prompt.group ? "✓ Ungrouped" : "Ungrouped";
      ungrouped.addEventListener("click", (e) => {
        e.stopPropagation();
        movePromptToGroup(null);
      });
      menu.appendChild(ungrouped);

      const newGroup = document.createElement("button");
      newGroup.className = "pm-menu-item";
      newGroup.type = "button";
      newGroup.textContent = "New group…";
      newGroup.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.innerHTML = "";
        const form = document.createElement("div");
        form.className = "pm-menu-inline-form";
        form.addEventListener("click", (ev) => ev.stopPropagation());

        const input = document.createElement("input");
        input.className = "pm-input";
        input.type = "text";
        input.placeholder = "Group name";
        input.setAttribute("aria-label", "New group name");

        const saveBtn = document.createElement("button");
        saveBtn.className = "pm-btn pm-btn-primary";
        saveBtn.type = "button";
        saveBtn.textContent = "Save";
        const submit = () => {
          const groupName = input.value.trim();
          if (!groupName) return;
          saveGroup({ name: groupName })
            .then((groupId) => {
              trackEvent("group_created");
              movePromptToGroup(groupId);
            })
            .catch((err) => {
              console.warn("PromptMate: create group failed", err);
              showToast(err?.message?.includes("already exists")
                ? "A group with that name already exists."
                : "Couldn't create group. Try again.");
            });
        };
        saveBtn.addEventListener("click", submit);
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") submit();
          if (ev.key === "Escape") renderMoveToGroup();
        });

        form.append(input, saveBtn);
        menu.appendChild(form);
        input.focus();
      });
      menu.appendChild(newGroup);
    };

    menu.append(pin, copy, previewItem, edit, hist, move, del);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".pm-menu.open").forEach((m) => {
        if (m !== menu) m.classList.remove("open");
      });
      renderDefaultItems();
      menu.classList.toggle("open");
    });

    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) menu.classList.remove("open");
    });

    wrap.append(btn, menu);
    return wrap;
  }

  // ────────────────────────────────────────────────────────────
  // Compose + Use
  // ────────────────────────────────────────────────────────────
  // Canonical assembly: context → group instruction → body → tone → format.
  // Reads context/groups fresh from storage on every call so the Use flow
  // never works from stale closure state.
  async function buildAssembledText(prompt, { bodyOverride = null, toggles = {} } = {}) {
    const [context, contextEnabled, groups] = await Promise.all([
      loadContext(),
      loadContextEnabled(),
      loadGroups(),
    ]);
    const group = groups.find((g) => g.id === prompt.group);
    const groupInstruction =
      group?.instructionEnabled && group.instruction?.trim() ? group.instruction : null;
    // Disclosure is the single source of truth for tone/format. Legacy
    // prompts can have `prompt.tone` / `prompt.format` stored as full
    // {option, category, instruction} objects from older code; falling back
    // to those would silently append instructions even when the user has
    // cleared the selectors. Don't.
    const tone = TONE_OPTIONS.find((t) => t.option === composePrefs.tone);
    const format = FORMAT_OPTIONS.find((f) => f.option === composePrefs.format);
    return assembleMessage({
      context: contextEnabled ? context : "",
      groupInstruction,
      body: bodyOverride ?? prompt.body ?? "",
      tone,
      format,
      toggles,
    });
  }

  function onUse(prompt) {
    const vars = extractVariables(prompt.body || "");
    if (vars.length) {
      openVarFillPopup(prompt, (filled) =>
        doInsert(prompt, substituteVariables(prompt.body || "", filled))
      );
      return;
    }
    doInsert(prompt, null);
  }

  async function doInsert(prompt, bodyOverride, toggles = {}) {
    let text;
    try {
      text = await buildAssembledText(prompt, { bodyOverride, toggles });
    } catch (err) {
      console.warn("PromptMate: assemble failed", err);
      showToast("Couldn't assemble the prompt. Try again.");
      return;
    }
    performInsert(prompt, text);
  }

  // Shared tail of every insert path (Use, assembly preview): host insert,
  // failure banner fallback, analytics, usage counter.
  function performInsert(prompt, text) {
    const result = insertText(text);
    if (!result.success) {
      insertFailure = { promptId: prompt.promptId, prompt, text };
      paintList();
      showToast("PromptMate couldn't insert automatically. Use Copy in the sidebar.");
      // Early warning for host-site selector regressions, per host.
      trackEvent("insert_failed");
      return false;
    }
    clearInsertFailure();
    recordAnalytics("used");
    trackEvent("prompt_used", {
      tone: composePrefs.tone || "none",
      format: composePrefs.format || "none",
      has_variables: extractVariables(prompt.body || "").length > 0,
    });
    incrementPromptUsed(prompt.promptId)
      .then(() => refreshPromptData())
      .catch((err) => {
        console.warn("PromptMate: increment used failed", err);
        showToast("Couldn't update usage count. Your prompt was inserted.");
      });
    return true;
  }

  function onCopy(prompt) {
    buildAssembledText(prompt)
      .then((text) => copyToClipboard(text))
      .then((copied) => {
        if (copied) {
          recordAnalytics("copied");
          trackEvent("prompt_copied");
        }
      })
      .catch((err) => {
        console.warn("PromptMate: copy failed", err);
        showToast("Couldn't copy prompt. Try again.");
      });
  }

  function clearInsertFailure() {
    if (!insertFailure) return;
    insertFailure = null;
    paintList();
  }

  function onTogglePin(prompt) {
    setPromptPinned(prompt.promptId, !prompt.pinned)
      .then(() => {
        trackEvent("pin_toggled", { pinned: !prompt.pinned });
        refreshPromptData();
      })
      .catch((err) => {
        console.warn("PromptMate: pin toggle failed", err);
        showToast(
          prompt.pinned
            ? "Couldn't unpin prompt. Try again."
            : "Couldn't pin prompt. Try again."
        );
        refreshPromptData();
      });
  }

  function onDelete(prompt) {
    recordAnalytics("deleted");
    trackEvent("prompt_deleted");
    softDeletePrompt(prompt.promptId)
      .then(() => {
        refreshPromptData();
        showToast("Prompt deleted", "info", {
          actionLabel: "Undo",
          duration: 5000,
          onAction: () =>
            restorePrompt(prompt.promptId)
              .then(() => refreshPromptData())
              .catch((err) => {
                if (isContextInvalidated(err)) {
                  showToast("Extension updated — refresh the page to continue.", "error");
                  return;
                }
                console.warn("PromptMate: undo delete failed", err);
                showToast("Couldn't restore prompt. Open Trash to try again.");
              }),
        });
      })
      .catch((err) => {
        if (isContextInvalidated(err)) {
          showToast("Extension updated — refresh the page to continue.", "error");
          return;
        }
        console.warn("PromptMate: delete failed", err);
        showToast("Failed to delete prompt. Try again.");
      });
  }

  function onRestoreDeleted(prompt) {
    restorePrompt(prompt.promptId)
      .then(() => {
        trackEvent("prompt_restored");
        refreshPromptData();
        showToast("Prompt restored.", "info");
      })
      .catch((err) => {
        console.warn("PromptMate: restore deleted failed", err);
        showToast("Failed to restore. Try again.");
      });
  }

  function onHardDelete(prompt) {
    if (!confirm(`Permanently delete "${prompt.title}"? This can't be undone.`)) return;
    hardDeletePrompt(prompt.promptId)
      .then(() => refreshPromptData())
      .catch((err) => {
        console.warn("PromptMate: permanent delete failed", err);
        showToast("Failed to delete forever. Try again.");
      });
  }

  function formatDeletedMeta(deletedAt) {
    const deletedTime = new Date(deletedAt).getTime();
    if (!Number.isFinite(deletedTime)) return "Expiration unknown";
    const dayMs = 24 * 60 * 60 * 1000;
    const elapsedDays = Math.max(0, Math.floor((Date.now() - deletedTime) / dayMs));
    const remainingDays = Math.max(0, 30 - elapsedDays);
    const deletedLabel =
      elapsedDays === 0
        ? "Deleted today"
        : `Deleted ${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
    const expiresLabel =
      remainingDays === 1 ? "expires in 1 day" : `expires in ${remainingDays} days`;
    return `${deletedLabel} · ${expiresLabel}`;
  }

  // ────────────────────────────────────────────────────────────
  // Version history drawer
  // ────────────────────────────────────────────────────────────
  function formatRevDate(iso) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  }

  function closeHistoryDrawer() {
    const el = document.getElementById("pm-history-overlay");
    if (el) el.remove();
  }

  // Word-level LCS diff. oldText = revision body, newText = current body.
  // Returns tokens: { type: 'eq'|'del'|'ins', text: string }
  // del = in old but not current (was removed), ins = in current but not old (was added).
  function computeWordDiff(oldText, newText) {
    const re = /\S+|\n|[^\S\n]+/g;
    const a = oldText.match(re) || [];
    const b = newText.match(re) || [];
    const m = a.length, n = b.length;
    if (m * n > 400_000) {
      return [{ type: "del", text: oldText }, { type: "ins", text: newText }];
    }
    const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const tokens = [];
    let i = 0, j = 0;
    while (i < m || j < n) {
      if (i < m && j < n && a[i] === b[j]) {
        tokens.push({ type: "eq", text: a[i] }); i++; j++;
      } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
        tokens.push({ type: "ins", text: b[j] }); j++;
      } else {
        tokens.push({ type: "del", text: a[i] }); i++;
      }
    }
    return tokens;
  }

  function renderTokens(tokens, container) {
    for (const tok of tokens) {
      if (tok.type === "eq") {
        container.appendChild(document.createTextNode(tok.text));
      } else if (tok.type === "del") {
        const el = document.createElement("del");
        el.className = "pm-diff-del";
        el.textContent = tok.text;
        container.appendChild(el);
      } else {
        const el = document.createElement("ins");
        el.className = "pm-diff-ins";
        el.textContent = tok.text;
        container.appendChild(el);
      }
    }
  }

  function buildDiffView(currentPrompt, oldContent) {
    const wrap = document.createElement("div");
    wrap.className = "pm-hist-diff-wrap";
    const titleChanged = (oldContent.title ?? "") !== (currentPrompt.title ?? "");
    const bodyChanged = (oldContent.body ?? "") !== (currentPrompt.body ?? "");
    if (!titleChanged && !bodyChanged) {
      const p = document.createElement("p");
      p.className = "pm-hist-diff-same";
      p.textContent = "No text changes in this revision.";
      wrap.appendChild(p);
      return wrap;
    }
    if (titleChanged) {
      const sec = document.createElement("div");
      sec.className = "pm-hist-diff-section";
      const lbl = document.createElement("span");
      lbl.className = "pm-hist-diff-label";
      lbl.textContent = "Title";
      const body = document.createElement("div");
      body.className = "pm-hist-diff-body";
      renderTokens(computeWordDiff(oldContent.title ?? "", currentPrompt.title ?? ""), body);
      sec.append(lbl, body);
      wrap.appendChild(sec);
    }
    if (bodyChanged) {
      const sec = document.createElement("div");
      sec.className = "pm-hist-diff-section";
      const lbl = document.createElement("span");
      lbl.className = "pm-hist-diff-label";
      lbl.textContent = "Body";
      const body = document.createElement("div");
      body.className = "pm-hist-diff-body";
      renderTokens(computeWordDiff(oldContent.body ?? "", currentPrompt.body ?? ""), body);
      sec.append(lbl, body);
      wrap.appendChild(sec);
    }
    return wrap;
  }

  function openHistoryDrawer(prompt) {
    closeHistoryDrawer();
    trackEvent("history_opened");

    const overlay = document.createElement("div");
    overlay.className = "pm-modal-overlay";
    overlay.id = "pm-history-overlay";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeHistoryDrawer();
    });

    const modal = document.createElement("div");
    modal.className = "pm-modal";
    modal.setAttribute("role", "dialog");

    const head = document.createElement("div");
    head.className = "pm-modal-head pm-hist-head";
    head.innerHTML = `
      <div class="pm-hist-title-row">
        <h2 class="pm-modal-title">Version history</h2>
        <button class="pm-iconbtn" type="button" aria-label="Close" data-pm-hist-close>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg>
        </button>
      </div>
    `;
    head.querySelector("[data-pm-hist-close]").addEventListener("click", closeHistoryDrawer);

    const subtitle = document.createElement("p");
    subtitle.className = "pm-hist-subtitle";
    subtitle.textContent = prompt.title || "(untitled)";
    head.appendChild(subtitle);

    const body = document.createElement("div");
    body.className = "pm-modal-body";

    const loading = document.createElement("div");
    loading.className = "pm-empty";
    loading.textContent = "Loading history…";
    body.appendChild(loading);

    modal.append(head, body);
    overlay.appendChild(modal);

    const sb = document.getElementById(SIDEBAR_ID);
    (sb || document.body).appendChild(overlay);

    const revContentCache = new Map();

    listPromptHistory(prompt.promptId)
      .then((revisions) => {
        body.innerHTML = "";

        if (!revisions.length) {
          const empty = document.createElement("div");
          empty.className = "pm-empty";
          empty.textContent = "No revision history available yet.";
          body.appendChild(empty);
          return;
        }

        const note = document.createElement("p");
        note.className = "pm-hist-note";
        note.textContent = "Showing the 10 most recent revisions. Restoring creates a new revision.";
        body.appendChild(note);

        const list = document.createElement("ul");
        list.className = "pm-hist-list";

        revisions.slice(0, 10).forEach((rev, i) => {
          const item = document.createElement("li");
          item.className = "pm-hist-item";

          const row = document.createElement("div");
          row.className = "pm-hist-item-row";

          const meta = document.createElement("div");
          meta.className = "pm-hist-meta";

          const ts = document.createElement("span");
          ts.className = "pm-hist-ts";
          ts.textContent = formatRevDate(rev.modifiedTime);
          meta.appendChild(ts);

          if (i === 0) {
            const badge = document.createElement("span");
            badge.className = "pm-hist-badge";
            badge.textContent = "Current";
            meta.appendChild(badge);
          }

          row.appendChild(meta);

          if (i > 0) {
            const actions = document.createElement("div");
            actions.className = "pm-hist-actions";

            const diffEl = document.createElement("div");
            diffEl.className = "pm-hist-diff";
            diffEl.hidden = true;

            const toggleBtn = document.createElement("button");
            toggleBtn.className = "pm-hist-toggle";
            toggleBtn.type = "button";
            toggleBtn.textContent = "Show changes";

            toggleBtn.addEventListener("click", async () => {
              if (!diffEl.hidden) {
                diffEl.hidden = true;
                toggleBtn.textContent = "Show changes";
                return;
              }
              diffEl.hidden = false;
              toggleBtn.textContent = "Hide changes";
              if (!revContentCache.has(rev.id)) {
                diffEl.textContent = "Loading…";
                try {
                  const content = await getPromptRevisionContent(prompt.promptId, rev.id);
                  revContentCache.set(rev.id, content);
                } catch (err) {
                  console.warn("PromptMate: fetch revision content failed", err);
                  diffEl.textContent = err?.status === 404
                    ? "This revision was purged by Drive (older than 30 days)."
                    : err?.status === 403
                    ? "This revision cannot be previewed."
                    : "Could not load changes. Check your connection and try again.";
                  return;
                }
              }
              diffEl.innerHTML = "";
              diffEl.appendChild(buildDiffView(prompt, revContentCache.get(rev.id)));
            });

            const restoreBtn = document.createElement("button");
            restoreBtn.className = "pm-btn pm-btn-secondary pm-hist-restore";
            restoreBtn.type = "button";
            restoreBtn.textContent = "Restore";
            restoreBtn.addEventListener("click", () => {
              if (!confirm(`Restore version from ${formatRevDate(rev.modifiedTime)}?`)) return;
              restoreBtn.textContent = "Restoring…";
              restoreBtn.disabled = true;
              restorePromptVersion(prompt.promptId, rev.id)
                .then(() => {
                  trackEvent("version_restored");
                  closeHistoryDrawer();
                  refreshPromptData();
                  showToast("Prompt restored.");
                })
                .catch((err) => {
                  console.warn("PromptMate: restore failed", err);
                  restoreBtn.textContent = "Restore";
                  restoreBtn.disabled = false;
                  showToast("Failed to restore. Try again.");
                });
            });

            actions.append(toggleBtn, restoreBtn);
            row.appendChild(actions);
            item.append(row, diffEl);
          } else {
            item.appendChild(row);
          }

          list.appendChild(item);
        });

        body.appendChild(list);
      })
      .catch((err) => {
        console.warn("PromptMate: listPromptHistory failed", err);
        body.innerHTML = "";
        const errEl = document.createElement("div");
        errEl.className = "pm-empty";
        errEl.textContent = "Could not load history. Try again.";
        body.appendChild(errEl);
      });
  }

  // ────────────────────────────────────────────────────────────
  // Assembly preview (Task 37)
  // ────────────────────────────────────────────────────────────
  async function openAssemblyPreview(prompt, filledBody = null) {
    document.getElementById("pm-assembly-overlay")?.remove();
    trackEvent("preview_opened");

    let context, contextEnabled, groups;
    try {
      [context, contextEnabled, groups] = await Promise.all([
        loadContext(),
        loadContextEnabled(),
        loadGroups(),
      ]);
    } catch (err) {
      console.warn("PromptMate: assembly preview load failed", err);
      showToast("Couldn't load assembly data. Try again.");
      return;
    }

    const group = groups.find((g) => g.id === prompt.group);
    const tone = TONE_OPTIONS.find((t) => t.option === composePrefs.tone);
    const format = FORMAT_OPTIONS.find((f) => f.option === composePrefs.format);
    const body = filledBody ?? prompt.body ?? "";

    // Session-only toggle state; keys match assembleMessage's toggles.
    const layers = [
      {
        key: "context",
        tag: "CONTEXT",
        kind: "personal bio",
        text: (context || "").trim(),
        on: contextEnabled,
        required: false,
      },
      {
        key: "groupInstruction",
        tag: "GROUP",
        kind: group?.name || "",
        text: (group?.instruction || "").trim(),
        on: group?.instructionEnabled === true,
        required: false,
      },
      {
        key: "body",
        tag: "PROMPT",
        kind: filledBody !== null ? "variables filled" : "prompt body",
        text: body,
        on: true,
        required: true,
      },
      {
        key: "tone",
        tag: "TONE",
        kind: tone?.option || "",
        text: tone?.instruction || "",
        on: !!tone,
        required: false,
      },
      {
        key: "format",
        tag: "FORMAT",
        kind: format?.option || "",
        text: format?.instruction || "",
        on: !!format,
        required: false,
      },
    ].filter((l) => l.text);

    const { overlay, head, body: modalBody, foot } = buildPopupShell(
      "pm-assembly-overlay",
      "What gets sent"
    );

    const subtitle = document.createElement("p");
    subtitle.className = "pm-varfill-subtitle";
    subtitle.textContent =
      "Layers are stitched top-to-bottom into one message. Toggle any layer off for this insert.";
    head.appendChild(subtitle);

    const timeline = document.createElement("div");
    timeline.className = "pm-layers";
    layers.forEach((layer, i) => {
      timeline.appendChild(buildLayerCard(layer, i === layers.length - 1));
    });
    modalBody.appendChild(timeline);

    const insertBtn = document.createElement("button");
    insertBtn.className = "pm-btn pm-btn-primary pm-btn-block";
    insertBtn.type = "button";
    insertBtn.textContent = "Insert assembled message";
    insertBtn.addEventListener("click", () => {
      const toggles = {};
      for (const l of layers) {
        if (!l.required) toggles[l.key] = l.on;
      }
      // Same assembleMessage call shape as buildAssembledText, so the
      // inserted text matches the preview by construction.
      const text = assembleMessage({
        context,
        groupInstruction: group?.instruction || null,
        body,
        tone,
        format,
        toggles,
      });
      overlay.remove();
      performInsert(prompt, text);
    });
    foot.appendChild(insertBtn);

    const sb = document.getElementById(SIDEBAR_ID);
    (sb || document.body).appendChild(overlay);
  }

  function buildLayerCard(layer, isLast) {
    const row = document.createElement("div");
    row.className = "pm-layer-row";

    const rail = document.createElement("div");
    rail.className = "pm-layer-rail";
    const dot = document.createElement("span");
    dot.className = `pm-layer-dot${layer.on ? " pm-on" : ""}`;
    rail.appendChild(dot);
    if (!isLast) {
      const connector = document.createElement("span");
      connector.className = "pm-layer-connector";
      rail.appendChild(connector);
    }
    row.appendChild(rail);

    const card = document.createElement("div");
    card.className = `pm-layer-card${layer.on ? "" : " pm-layer-off"}`;

    const headRow = document.createElement("div");
    headRow.className = "pm-layer-head";

    const tag = document.createElement("span");
    tag.className = "pm-layer-tag";
    tag.textContent = layer.tag;
    headRow.appendChild(tag);

    if (layer.kind) {
      const kind = document.createElement("span");
      kind.className = "pm-layer-kind";
      kind.textContent = `· ${layer.kind}`;
      headRow.appendChild(kind);
    }

    const spacer = document.createElement("span");
    spacer.className = "pm-layer-spacer";
    headRow.appendChild(spacer);

    if (layer.required) {
      const required = document.createElement("span");
      required.className = "pm-layer-required pm-mono";
      required.textContent = "REQUIRED";
      headRow.appendChild(required);
    } else {
      const sw = makeSwitch(layer.on, (on) => {
        layer.on = on;
        card.classList.toggle("pm-layer-off", !on);
        dot.classList.toggle("pm-on", on);
      });
      headRow.appendChild(sw.el);
    }

    const text = document.createElement("p");
    text.className = "pm-layer-text";
    text.textContent = layer.text;

    card.append(headRow, text);
    row.appendChild(card);
    return row;
  }

  // ────────────────────────────────────────────────────────────
  // Variables (Task 29)
  // ────────────────────────────────────────────────────────────
  // Renders `text` into `container` with {{tokens}} as chips — violet while
  // unfilled, green once a value exists in `filled`. Distinct from
  // renderTokens(), which renders history diffs.
  function renderVarChips(text, filled, container) {
    container.innerHTML = "";
    const parts = String(text || "").split(/(\{\{[^{}]+\}\})/g);
    for (const part of parts) {
      const m = part.match(/^\{\{([^{}]+)\}\}$/);
      if (!m) {
        if (part) container.appendChild(document.createTextNode(part));
        continue;
      }
      const key = m[1].trim();
      const val = filled[key];
      const chip = document.createElement("span");
      if (val) {
        chip.className = "pm-chip-var pm-chip-var-filled";
        chip.textContent = val;
      } else {
        chip.className = "pm-chip-var pm-mono";
        chip.textContent = `{{${key}}}`;
      }
      container.appendChild(chip);
    }
  }

  function closeVarFillPopup() {
    const el = document.getElementById("pm-varfill-overlay");
    if (el) el.remove();
  }

  function openVarFillPopup(prompt, onComplete) {
    closeVarFillPopup();
    const vars = extractVariables(prompt.body || "");
    if (!vars.length) {
      onComplete({});
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "pm-modal-overlay";
    overlay.id = "pm-varfill-overlay";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeVarFillPopup();
    });

    const modal = document.createElement("div");
    modal.className = "pm-modal";
    modal.setAttribute("role", "dialog");

    const head = document.createElement("div");
    head.className = "pm-modal-head";
    head.innerHTML = `
      <h2 class="pm-modal-title">Fill in variables</h2>
      <button class="pm-iconbtn" type="button" aria-label="Close" data-pm-varfill-close>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg>
      </button>
    `;
    head.querySelector("[data-pm-varfill-close]").addEventListener("click", closeVarFillPopup);

    const subtitle = document.createElement("p");
    subtitle.className = "pm-varfill-subtitle";
    subtitle.textContent = `${prompt.title || "(untitled)"} · ${vars.length} variable${vars.length === 1 ? "" : "s"}`;
    head.appendChild(subtitle);

    const body = document.createElement("div");
    body.className = "pm-modal-body";

    const detectedLabel = document.createElement("div");
    detectedLabel.className = "pm-field-label pm-mono";
    detectedLabel.textContent = `DETECTED VARIABLES · ${vars.length}`;
    body.appendChild(detectedLabel);

    const filled = {};
    const inputs = [];

    const previewLabel = document.createElement("div");
    previewLabel.className = "pm-field-label pm-mono";
    previewLabel.textContent = "✦ LIVE PREVIEW";

    const preview = document.createElement("div");
    preview.className = "pm-varfill-preview";

    const insertBtn = document.createElement("button");
    insertBtn.className = "pm-btn pm-btn-primary";
    insertBtn.type = "button";
    insertBtn.textContent = "Insert";
    insertBtn.disabled = true;

    const syncState = () => {
      for (const { key, input } of inputs) {
        const val = input.value.trim();
        if (val) filled[key] = val;
        else delete filled[key];
      }
      renderVarChips(prompt.body || "", filled, preview);
      insertBtn.disabled = inputs.some(({ input }) => !input.value.trim());
    };

    vars.forEach((v) => {
      const field = makeField(`pm-var-${v.key.replace(/\W+/g, "-")}`, v.key.toUpperCase(), "input", `Value for ${v.key}`);
      inputs.push({ key: v.key, input: field.input });
      field.input.addEventListener("input", syncState);
      body.appendChild(field.wrap);
    });

    body.append(previewLabel, preview);
    syncState();

    const foot = document.createElement("div");
    foot.className = "pm-modal-foot";

    const cancel = document.createElement("button");
    cancel.className = "pm-btn pm-btn-secondary";
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", closeVarFillPopup);

    insertBtn.addEventListener("click", () => {
      if (insertBtn.disabled) return;
      trackEvent("variables_filled", { var_count: vars.length });
      closeVarFillPopup();
      onComplete({ ...filled });
    });

    foot.append(cancel, insertBtn);
    modal.append(head, body, foot);
    overlay.appendChild(modal);

    const sb = document.getElementById(SIDEBAR_ID);
    (sb || document.body).appendChild(overlay);
    inputs[0]?.input.focus();
  }

  // ────────────────────────────────────────────────────────────
  // Modal
  // ────────────────────────────────────────────────────────────
  function openPromptModal(prompt) {
    closePromptModal();

    const overlay = document.createElement("div");
    overlay.className = "pm-modal-overlay";
    overlay.id = "pm-modal-overlay";

    const modal = document.createElement("div");
    modal.className = "pm-modal";
    modal.setAttribute("role", "dialog");

    const isEdit = !!prompt;
    const head = document.createElement("div");
    head.className = "pm-modal-head";
    head.innerHTML = `
      <h2 class="pm-modal-title">${isEdit ? "Edit prompt" : "New prompt"}</h2>
      <button class="pm-iconbtn" type="button" aria-label="Close" data-pm-modal-close>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg>
      </button>
    `;

    const body = document.createElement("div");
    body.className = "pm-modal-body";

    const titleField = makeField("pm-title", "Title", "input", "E.g. Improve tone");
    const groupField = makeGroupSelect(prompt?.group ?? null);
    const bodyField = makeField("pm-prompt-body", "Prompt body", "textarea", "Write your prompt here…");
    body.append(titleField.wrap, groupField.wrap, bodyField.wrap);

    const varsBlock = document.createElement("div");
    varsBlock.className = "pm-detected-vars";
    const varsLabel = document.createElement("div");
    varsLabel.className = "pm-field-label pm-mono";
    const varsChips = document.createElement("div");
    varsChips.className = "pm-detected-vars-chips";
    const varsHint = document.createElement("p");
    varsHint.className = "pm-detected-vars-hint";
    varsHint.textContent = "Wrap any word in {{double braces}} to make it fillable on Use.";
    varsBlock.append(varsLabel, varsChips, varsHint);
    body.appendChild(varsBlock);

    const syncDetectedVars = () => {
      const vars = extractVariables(bodyField.input.value);
      varsBlock.hidden = false;
      varsLabel.textContent = vars.length
        ? `DETECTED VARIABLES · ${vars.length}`
        : "VARIABLES";
      varsChips.innerHTML = "";
      varsChips.hidden = !vars.length;
      vars.forEach((v) => {
        const chip = document.createElement("span");
        chip.className = "pm-chip-var pm-mono";
        chip.textContent = `{{${v.key}}}`;
        varsChips.appendChild(chip);
      });
    };
    bodyField.input.addEventListener("input", syncDetectedVars);

    let initialState = { title: "", body: "", group: prompt?.group ?? null };
    let lastActiveField = titleField.input;

    const getCurrentState = () => ({
      title: titleField.input.value,
      body: bodyField.input.value,
      group: groupField.select.value,
    });

    const isDirty = () => {
      const current = getCurrentState();
      return (
        current.title !== initialState.title ||
        current.body !== initialState.body ||
        current.group !== (initialState.group || "")
      );
    };

    const focusLastActiveField = () => {
      const field = document.contains(lastActiveField) ? lastActiveField : titleField.input;
      field.focus();
    };

    const foot = document.createElement("div");
    foot.className = "pm-modal-foot";

    const cancel = document.createElement("button");
    cancel.className = "pm-btn pm-btn-secondary";
    cancel.type = "button";
    cancel.textContent = "Cancel";

    const save = document.createElement("button");
    save.className = "pm-btn pm-btn-primary";
    save.type = "button";
    save.dataset.pmSavePrompt = "true";
    save.textContent = "Save";
    save.addEventListener("click", () => onSavePrompt(prompt));

    const renderDefaultFooter = () => {
      foot.classList.remove("pm-modal-foot-confirming");
      foot.replaceChildren(cancel, save);
    };

    const showDiscardConfirmation = () => {
      if (foot.classList.contains("pm-modal-foot-confirming")) {
        focusLastActiveField();
        return;
      }

      const message = document.createElement("span");
      message.className = "pm-discard-message";
      message.setAttribute("role", "alert");
      message.textContent = "Discard unsaved changes?";

      const actions = document.createElement("div");
      actions.className = "pm-discard-actions";

      const discard = document.createElement("button");
      discard.className = "pm-btn pm-btn-secondary";
      discard.type = "button";
      discard.textContent = "Discard";
      discard.addEventListener("click", closePromptModal);

      const keep = document.createElement("button");
      keep.className = "pm-btn pm-btn-primary";
      keep.type = "button";
      keep.textContent = "Keep editing";
      keep.addEventListener("click", () => {
        renderDefaultFooter();
        focusLastActiveField();
      });

      actions.append(discard, keep);
      foot.classList.add("pm-modal-foot-confirming");
      foot.replaceChildren(message, actions);
      focusLastActiveField();
    };

    const requestBackdropClosePromptModal = () => {
      if (!isDirty()) {
        closePromptModal();
        return;
      }
      showDiscardConfirmation();
    };

    cancel.addEventListener("click", closePromptModal);
    renderDefaultFooter();

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) requestBackdropClosePromptModal();
    });

    head.querySelector("[data-pm-modal-close]").addEventListener("click", closePromptModal);

    modal.append(head, body, foot);
    overlay.appendChild(modal);

    const sb = document.getElementById(SIDEBAR_ID);
    (sb || document.body).appendChild(overlay);

    if (isEdit) {
      titleField.input.value = prompt.title || "";
      bodyField.input.value = prompt.body || "";
      modal.dataset.editId = prompt.promptId;
    }

    initialState = getCurrentState();
    syncDetectedVars();
    [titleField.input, bodyField.input].forEach((field) => {
      field.addEventListener("focus", () => {
        lastActiveField = field;
      });
      field.addEventListener("input", () => {
        renderDefaultFooter();
        if (field === bodyField.input && insertFailure?.promptId === prompt?.promptId) {
          clearInsertFailure();
        }
      });
    });

    titleField.input.focus();
  }

  function closePromptModal() {
    const overlay = document.getElementById("pm-modal-overlay");
    if (overlay) overlay.remove();
  }

  async function onSavePrompt(existing) {
    const saveBtn = document.querySelector("[data-pm-save-prompt]");
    if (saveBtn?.disabled) return;

    const title = document.getElementById("pm-title").value.trim();
    const body = document.getElementById("pm-prompt-body").value.trim();
    if (!title || !body) {
      showToast("Title and prompt body are required.", "info");
      return;
    }

    setSaveButtonLoading(saveBtn, true);

    let group = document.getElementById("pm-prompt-group")?.value || null;
    if (group === "__new__") {
      const newName = document.getElementById("pm-prompt-group-new")?.value.trim();
      if (!newName) {
        setSaveButtonLoading(saveBtn, false);
        showToast("Enter a name for the new group.", "info");
        return;
      }
      try {
        group = await saveGroup({ name: newName });
        trackEvent("group_created");
        dismissFeatureBadge("feature_groups");
      } catch (err) {
        console.warn("PromptMate: create group failed", err);
        setSaveButtonLoading(saveBtn, false);
        showToast(err?.message?.includes("already exists")
          ? "A group with that name already exists."
          : "Couldn't create group. Try again.");
        return;
      }
    }

    if (existing) recordAnalytics("edited");
    else recordAnalytics("created");
    trackEvent(existing ? "prompt_edited" : "prompt_created", {
      has_variables: extractVariables(body).length > 0,
      has_group: !!group,
    });

    savePrompt({
      promptId: existing?.promptId,
      title,
      body,
      tone: existing?.tone ?? null,
      format: existing?.format ?? null,
      pinned: existing?.pinned === true,
      used: Number.isFinite(existing?.used) ? existing.used : 0,
      group,
    })
      .then(() => {
        closePromptModal();
        refreshPromptData();
        showToast(existing ? "Prompt updated." : "Prompt added.", "success");
      })
      .catch((err) => {
        console.warn("PromptMate: save failed", err);
        setSaveButtonLoading(saveBtn, false);
        showToast("Failed to save prompt. Try again.");
        refreshPromptData();
      });
  }

  function setSaveButtonLoading(button, isLoading) {
    if (!button) return;
    button.disabled = isLoading;
    if (isLoading) {
      button.innerHTML = `<span class="pm-btn-spinner" aria-hidden="true"></span><span>Saving...</span>`;
    } else {
      button.textContent = "Save";
    }
  }

  function makeGroupSelect(currentGroupId) {
    const wrap = document.createElement("label");
    wrap.htmlFor = "pm-prompt-group";
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "6px";

    const lbl = document.createElement("span");
    lbl.className = "pm-field-label pm-mono";
    lbl.textContent = "Group";
    if (!lastGroups.length) {
      const badge = makeNewBadge("feature_groups");
      if (badge) lbl.appendChild(badge);
    }

    const select = document.createElement("select");
    select.id = "pm-prompt-group";
    select.className = "pm-select";

    const none = document.createElement("option");
    none.value = "";
    none.textContent = "Ungrouped";
    select.appendChild(none);

    lastGroups.forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.textContent = g.name;
      select.appendChild(opt);
    });

    const create = document.createElement("option");
    create.value = "__new__";
    create.textContent = "New group…";
    select.appendChild(create);

    if (currentGroupId && lastGroups.some((g) => g.id === currentGroupId)) {
      select.value = currentGroupId;
    }

    const newInput = document.createElement("input");
    newInput.id = "pm-prompt-group-new";
    newInput.className = "pm-input";
    newInput.type = "text";
    newInput.placeholder = "New group name";
    newInput.hidden = true;

    select.addEventListener("change", () => {
      newInput.hidden = select.value !== "__new__";
      if (!newInput.hidden) newInput.focus();
    });

    wrap.append(lbl, select, newInput);
    return { wrap, select, newInput };
  }

  function makeField(id, label, kind, placeholder) {
    const wrap = document.createElement("label");
    wrap.htmlFor = id;
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "6px";

    const lbl = document.createElement("span");
    lbl.className = "pm-field-label pm-mono";
    lbl.textContent = label;

    const input = document.createElement(kind === "textarea" ? "textarea" : "input");
    input.id = id;
    input.placeholder = placeholder;
    input.className = kind === "textarea" ? "pm-textarea" : "pm-input";

    wrap.append(lbl, input);
    return { wrap, input };
  }

  // ────────────────────────────────────────────────────────────
  // Sync indicator
  // ────────────────────────────────────────────────────────────
  function updateSyncIndicator(meta) {
    const indicator = document.getElementById("pm-sync-status");
    if (!indicator) return;
    if (meta?.pendingCount > 0) {
      indicator.textContent = `${meta.pendingCount} change${meta.pendingCount > 1 ? "s" : ""} pending sync…`;
    } else if (meta?.fromCache) {
      indicator.textContent = "Syncing…";
    } else {
      indicator.textContent = "";
    }
  }

  // ────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────
  function escapeText(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function escapeAttr(s) {
    return escapeText(s);
  }

  // ────────────────────────────────────────────────────────────
  // Pill initialisation — unified across all host pages.
  // createPill is idempotent so multiple event sources are safe.
  // ────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", createPill);
  new MutationObserver(createPill).observe(document.body, {
    childList: true,
    subtree: false,
  });
  createPill();
}
