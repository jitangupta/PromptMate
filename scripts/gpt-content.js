import "../styles/pm-v2.css";

import {
  TONE_OPTIONS,
  FORMAT_OPTIONS,
  listPrompts,
  savePrompt,
  deletePrompt,
  drainPendingWrites,
  recordAnalytics,
  setPromptPinned,
} from "./business.js";

import {
  subscribeAuthState,
  refreshAuthState,
  performSignIn,
  performSignOut,
} from "./sidebar-auth.js";

(function initPromptMateIntegration() {
  const SIDEBAR_ID = "promptmate-sidebar";
  const PILL_ID = "promptmate-pill";
  const LAYOUT_SELECTOR = "div.relative.flex.w-full";
  const SIDEBAR_WIDTH = 380;

  // Cached prompt fetch + search state. Keystrokes paint from the cache so
  // each character doesn't kick off a Drive sync.
  let lastPrompts = [];
  let lastMeta = null;
  let currentQuery = "";

  // ⌘K / Ctrl+K — open the sidebar (if closed) and focus the search input.
  // We always intercept on host pages because PromptMate owns this shortcut
  // for prompt search; the host's own ⌘K is overridden while on chatgpt.com.
  document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
    e.preventDefault();
    const sb = document.getElementById(SIDEBAR_ID);
    const isOpen = sb && sb.classList.contains("pm-open");
    if (!isOpen) toggleSidebar();
    // Auth state subscription renders synchronously on subscribe, so the
    // search input is in the DOM by the next frame. rAF is the right beat.
    requestAnimationFrame(() => {
      const input = document
        .getElementById(SIDEBAR_ID)
        ?.querySelector(".pm-search-input");
      if (!input) return;
      input.focus();
      input.select();
    });
  });

  // ────────────────────────────────────────────────────────────
  // Sidebar shell
  // ────────────────────────────────────────────────────────────
  function toggleSidebar() {
    let sb = document.getElementById(SIDEBAR_ID);
    if (!sb) sb = createSidebar();
    if (!sb) return;

    const layout = document.querySelector(LAYOUT_SELECTOR);
    const isOpen = sb.classList.toggle("pm-open");

    sb.style.right = isOpen ? "0" : `-${SIDEBAR_WIDTH}px`;

    if (layout) {
      layout.style.transition = "margin-right 0.3s ease";
      layout.style.marginRight = isOpen ? `${SIDEBAR_WIDTH}px` : "";
    }

    updatePillVisibility();

    if (isOpen) {
      refreshAuthState();
      drainPendingWrites().catch((err) =>
        console.warn("PromptMate: drain pending writes failed", err)
      );
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
      <span class="pm-pill-logo">P</span>
      <span>PromptMate</span>
      <span class="pm-pill-kbd">⌘K</span>
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
    const layout = document.querySelector(LAYOUT_SELECTOR);
    if (!layout) return null;

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

    layout.appendChild(sb);

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

    const list = document.createElement("div");
    list.className = "pm-list";
    list.id = "pm-list";
    sb.appendChild(list);

    sb.appendChild(buildFooter(authState));

    refreshPromptData();
  }

  function buildHeader() {
    const wrap = document.createElement("header");
    wrap.className = "pm-header";
    wrap.innerHTML = `
      <div class="pm-brand">
        <span class="pm-logo">P</span>
        <span class="pm-brand-name">PromptMate</span>
      </div>
      <button class="pm-iconbtn" type="button" aria-label="Close" data-pm-close>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg>
      </button>
    `;
    wrap.querySelector("[data-pm-close]").addEventListener("click", toggleSidebar);
    return wrap;
  }

  function buildSearch() {
    const wrap = document.createElement("div");
    wrap.className = "pm-search";
    wrap.innerHTML = `
      <span class="pm-search-icon">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="6" cy="6" r="4"/><path d="M9.5 9.5L12 12"/></svg>
      </span>
      <input class="pm-search-input" type="search" placeholder="Search prompts…" />
      <span class="pm-kbd pm-mono">⌘K</span>
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

    const summary = document.createElement("summary");
    summary.textContent = "Compose options";
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "pm-compose-body";

    body.appendChild(buildSelect("pm-tone-pref", "Tone", TONE_OPTIONS, composePrefs.tone));
    body.appendChild(buildSelect("pm-format-pref", "Format", FORMAT_OPTIONS, composePrefs.format));

    details.appendChild(body);

    const toneSel = body.querySelector("#pm-tone-pref");
    const formatSel = body.querySelector("#pm-format-pref");

    toneSel.addEventListener("change", () => {
      composePrefs.tone = toneSel.value || null;
      setComposePrefs(composePrefs).catch(() => {});
    });
    formatSel.addEventListener("change", () => {
      composePrefs.format = formatSel.value || null;
      setComposePrefs(composePrefs).catch(() => {});
    });

    return details;
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
    placeholder.textContent = `— ${label} —`;
    select.appendChild(placeholder);

    const cats = [...new Set(options.map((o) => o.category))];
    cats.forEach((cat) => {
      const og = document.createElement("optgroup");
      og.label = cat;
      options
        .filter((o) => o.category === cat)
        .forEach((o) => {
          const opt = document.createElement("option");
          opt.value = o.option;
          opt.textContent = o.option;
          og.appendChild(opt);
        });
      select.appendChild(og);
    });

    if (currentValue) select.value = currentValue;

    wrap.append(lbl, select);
    return wrap;
  }

  function buildFooter(authState) {
    const footer = document.createElement("footer");
    footer.className = "pm-footer";

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

    const sync = document.createElement("div");
    sync.className = "pm-sync-status";
    sync.id = "pm-sync-status";
    footer.appendChild(sync);

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

  function paintList() {
    const listEl = document.getElementById("pm-list");
    if (!listEl) return;
    listEl.innerHTML = "";

    const meta = lastMeta;
    const prompts = lastPrompts;

    if (!prompts.length) {
      const empty = document.createElement("div");
      empty.className = "pm-empty";
      empty.textContent = "No prompts yet. Click “New prompt” below to create one.";
      listEl.appendChild(empty);
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
      label.textContent = `${matches.length} result${matches.length === 1 ? "" : "s"} for “${currentQuery.trim()}”`;
      listEl.appendChild(label);
      if (!matches.length) {
        const empty = document.createElement("div");
        empty.className = "pm-empty";
        empty.textContent = `No prompts match “${currentQuery.trim()}”.`;
        listEl.appendChild(empty);
      } else {
        sortByRecency(matches).forEach((p) => listEl.appendChild(buildCard(p)));
      }
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

    const del = document.createElement("button");
    del.className = "pm-menu-item pm-danger";
    del.type = "button";
    del.textContent = "Delete";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.remove("open");
      onDelete(prompt);
    });

    menu.append(pin, copy, edit, del);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Close any other open menus first.
      document.querySelectorAll(".pm-menu.open").forEach((m) => {
        if (m !== menu) m.classList.remove("open");
      });
      menu.classList.toggle("open");
    });

    // Outside click closes the menu.
    const closeOnOutside = (e) => {
      if (!wrap.contains(e.target)) menu.classList.remove("open");
    };
    document.addEventListener("click", closeOnOutside);

    wrap.append(btn, menu);
    return wrap;
  }

  // ────────────────────────────────────────────────────────────
  // Actions
  // ────────────────────────────────────────────────────────────
  function composeText(prompt) {
    const tone = TONE_OPTIONS.find((t) => t.option === composePrefs.tone) || prompt.tone;
    const format = FORMAT_OPTIONS.find((f) => f.option === composePrefs.format) || prompt.format;
    let html = `<p>${escapeText(prompt.body || "")}</p>`;
    if (tone?.instruction) html += `<p></p><p>${escapeText(tone.instruction)}</p>`;
    if (format?.instruction) html += `<p></p><p>${escapeText(format.instruction)}</p>`;
    return html;
  }

  function composePlainText(prompt) {
    const tone = TONE_OPTIONS.find((t) => t.option === composePrefs.tone) || prompt.tone;
    const format = FORMAT_OPTIONS.find((f) => f.option === composePrefs.format) || prompt.format;
    let text = prompt.body || "";
    if (tone) text += `\nTone (${tone.option}): ${tone.instruction}`;
    if (format) text += `\nFormat (${format.option}): ${format.instruction}`;
    return text;
  }

  function onUse(prompt) {
    recordAnalytics("used");
    const textarea = document.getElementById("prompt-textarea");
    if (!textarea) return;
    textarea.innerHTML = composeText(prompt);
    textarea.focus();
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(textarea);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function onCopy(prompt) {
    recordAnalytics("copied");
    navigator.clipboard.writeText(composePlainText(prompt)).catch(() => {});
  }

  function onTogglePin(prompt) {
    setPromptPinned(prompt.promptId, !prompt.pinned)
      .then(() => refreshPromptData())
      .catch((err) => console.warn("PromptMate: pin toggle failed", err));
  }

  function onDelete(prompt) {
    if (!confirm(`Delete "${prompt.title}"?`)) return;
    recordAnalytics("deleted");
    deletePrompt(prompt.promptId)
      .then(() => refreshPromptData())
      .catch((err) => {
        console.warn("PromptMate: delete failed", err);
        alert("Failed to delete prompt. See console.");
      });
  }

  // ────────────────────────────────────────────────────────────
  // Modal (title + body only — Tone/Format moved to the disclosure)
  // ────────────────────────────────────────────────────────────
  function openPromptModal(prompt) {
    closePromptModal();

    const overlay = document.createElement("div");
    overlay.className = "pm-modal-overlay";
    overlay.id = "pm-modal-overlay";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closePromptModal();
    });

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
    head.querySelector("[data-pm-modal-close]").addEventListener("click", closePromptModal);

    const body = document.createElement("div");
    body.className = "pm-modal-body";

    const titleField = makeField("pm-title", "Title", "input", "E.g. Summarize discussion");
    const bodyField = makeField("pm-prompt-body", "Prompt body", "textarea", "Write your prompt here…");
    body.append(titleField.wrap, bodyField.wrap);

    const foot = document.createElement("div");
    foot.className = "pm-modal-foot";

    const cancel = document.createElement("button");
    cancel.className = "pm-btn pm-btn-secondary";
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", closePromptModal);

    const save = document.createElement("button");
    save.className = "pm-btn pm-btn-primary";
    save.type = "button";
    save.textContent = "Save";
    save.addEventListener("click", () => onSavePrompt(prompt));

    foot.append(cancel, save);
    modal.append(head, body, foot);
    overlay.appendChild(modal);

    // Mount inside the sidebar so the v2 token scope applies.
    const sb = document.getElementById(SIDEBAR_ID);
    (sb || document.body).appendChild(overlay);

    if (isEdit) {
      titleField.input.value = prompt.title || "";
      bodyField.input.value = prompt.body || "";
      modal.dataset.editId = prompt.promptId;
    }

    titleField.input.focus();
  }

  function closePromptModal() {
    const overlay = document.getElementById("pm-modal-overlay");
    if (overlay) overlay.remove();
  }

  function onSavePrompt(existing) {
    const titleEl = document.getElementById("pm-title");
    const bodyEl = document.getElementById("pm-prompt-body");
    const title = titleEl.value.trim();
    const body = bodyEl.value.trim();
    if (!title || !body) {
      alert("Title and prompt body are required.");
      return;
    }

    if (existing) recordAnalytics("edited");
    else recordAnalytics("created");

    savePrompt({
      promptId: existing?.promptId,
      title,
      body,
      // Preserve any legacy tone/format already on the prompt.
      tone: existing?.tone ?? null,
      format: existing?.format ?? null,
      pinned: existing?.pinned === true,
      used: Number.isFinite(existing?.used) ? existing.used : 0,
    })
      .then(() => {
        closePromptModal();
        refreshPromptData();
      })
      .catch((err) => {
        console.warn("PromptMate: save failed", err);
        alert("Failed to save prompt. See console.");
      });
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

  // The pill is body-appended, but a few host frameworks occasionally clear
  // body children during heavy re-renders. createPill is idempotent — early
  // returns if the pill is already there — so observing body is cheap insurance.
  const obs = new MutationObserver(createPill);
  obs.observe(document.body, { childList: true, subtree: false });
  window.addEventListener("load", () => setTimeout(createPill, 500));
  createPill();
})();
