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
} from "./business.js";

import {
  subscribeAuthState,
  refreshAuthState,
  performSignIn,
  performSignOut,
} from "./sidebar-auth.js";

import { showToast } from "./toast.js";
import { copyToClipboard } from "./utility.js";

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
  let currentQuery = "";
  let currentView = "active";
  let insertFailure = null;

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
    pill.classList.toggle("pm-hidden", !!isOpen);
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
            <button class="pm-settings-item" type="button" data-pm-user-guide>
              <span class="pm-settings-item-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
              </span>
              <span>User Guide</span>
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
      settingsMenu.classList.remove("open");
      syncSettingsUi();
      refreshPromptData();
    });
    wrap.querySelector("[data-pm-user-guide]").addEventListener("click", () => {
      settingsMenu.classList.remove("open");
      // TODO: replace with live article URL when published
      window.open("https://jitangupta.com/promptmate-guide", "_blank", "noopener,noreferrer");
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
        <strong class="pm-whats-new-title">DeepSeek support + prompt recovery</strong>
        <p class="pm-whats-new-desc">PromptMate now works on DeepSeek. You can also open the <strong>···</strong> menu and choose <strong>Recently deleted</strong> to restore deleted prompts before they expire.</p>
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
    input.value = currentQuery;
    input.addEventListener("input", () => {
      currentQuery = input.value;
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
      performSignIn().catch((err) => console.warn("PromptMate: sign-in failed", err))
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

    listPrompts((prompts, meta) => {
      lastPrompts = prompts;
      lastMeta = meta;
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
        const GUIDE_URL = "https://jitangupta.com/promptmate-guide";
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

    if (recent.length) {
      const lbl = document.createElement("div");
      lbl.className = "pm-section-label";
      lbl.textContent = "Recent";
      listEl.appendChild(lbl);
      recent.forEach((p) => listEl.appendChild(buildCard(p)));
    }

    updateSyncIndicator(meta);
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

    const del = document.createElement("button");
    del.className = "pm-menu-item pm-danger";
    del.type = "button";
    del.textContent = "Delete";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.remove("open");
      onDelete(prompt);
    });

    menu.append(pin, copy, edit, hist, del);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".pm-menu.open").forEach((m) => {
        if (m !== menu) m.classList.remove("open");
      });
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
  function composePromptText(prompt) {
    // Disclosure is the single source of truth. Legacy prompts can have
    // `prompt.tone` / `prompt.format` stored as full {option, category,
    // instruction} objects from older code; falling back to those would
    // silently append instructions even when the user has cleared the
    // selectors. Don't.
    const tone = TONE_OPTIONS.find((t) => t.option === composePrefs.tone);
    const format = FORMAT_OPTIONS.find((f) => f.option === composePrefs.format);
    const parts = [prompt.body || ""];
    if (tone?.instruction) parts.push("", tone.instruction);
    if (format?.instruction) parts.push(format.instruction);
    return parts.join("\n");
  }

  function onUse(prompt) {
    const text = composePromptText(prompt);
    const result = insertText(text);
    if (!result.success) {
      insertFailure = { promptId: prompt.promptId, prompt, text };
      paintList();
      showToast("PromptMate couldn't insert automatically. Use Copy in the sidebar.");
      return;
    }
    clearInsertFailure();
    recordAnalytics("used");
    incrementPromptUsed(prompt.promptId)
      .then(() => refreshPromptData())
      .catch((err) => {
        console.warn("PromptMate: increment used failed", err);
        showToast("Couldn't update usage count. Your prompt was inserted.");
      });
  }

  function onCopy(prompt) {
    copyToClipboard(composePromptText(prompt)).then((copied) => {
      if (copied) recordAnalytics("copied");
    });
  }

  function clearInsertFailure() {
    if (!insertFailure) return;
    insertFailure = null;
    paintList();
  }

  function onTogglePin(prompt) {
    setPromptPinned(prompt.promptId, !prompt.pinned)
      .then(() => refreshPromptData())
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
    const bodyField = makeField("pm-prompt-body", "Prompt body", "textarea", "Write your prompt here…");
    body.append(titleField.wrap, bodyField.wrap);

    let initialState = { title: "", body: "" };
    let lastActiveField = titleField.input;

    const getCurrentState = () => ({
      title: titleField.input.value,
      body: bodyField.input.value,
    });

    const isDirty = () => {
      const current = getCurrentState();
      return current.title !== initialState.title || current.body !== initialState.body;
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

  function onSavePrompt(existing) {
    const saveBtn = document.querySelector("[data-pm-save-prompt]");
    if (saveBtn?.disabled) return;

    const title = document.getElementById("pm-title").value.trim();
    const body = document.getElementById("pm-prompt-body").value.trim();
    if (!title || !body) {
      showToast("Title and prompt body are required.", "info");
      return;
    }

    setSaveButtonLoading(saveBtn, true);

    if (existing) recordAnalytics("edited");
    else recordAnalytics("created");

    savePrompt({
      promptId: existing?.promptId,
      title,
      body,
      tone: existing?.tone ?? null,
      format: existing?.format ?? null,
      pinned: existing?.pinned === true,
      used: Number.isFinite(existing?.used) ? existing.used : 0,
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
