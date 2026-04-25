import "../styles/pm-v2.css";

import {
  TONE_OPTIONS,
  FORMAT_OPTIONS,
  listPrompts,
  savePrompt,
  deletePrompt,
  drainPendingWrites,
  recordAnalytics,
  getComposePrefs,
  setComposePrefs,
  setPromptPinned,
} from "./business.js";

import {
  subscribeAuthState,
  refreshAuthState,
  performSignIn,
  performSignOut,
} from "./sidebar-auth.js";

(function initPromptMateIntegration() {
  const BUTTON_ID = "promptmate-btn";
  const SIDEBAR_ID = "promptmate-sidebar";
  const LAYOUT_SELECTOR = "div.relative.flex.w-full";
  const SIDEBAR_WIDTH = 380;

  // Session-level compose prefs cache so the UI doesn't have to await
  // chrome.storage on every Use click.
  let composePrefs = { tone: null, format: null };
  getComposePrefs().then((p) => {
    composePrefs = p;
  });

  // Cached prompt fetch + search state. Keystrokes paint from the cache so
  // each character doesn't kick off a Drive sync.
  let lastPrompts = [];
  let lastMeta = null;
  let currentQuery = "";

  // ⌘K (Cmd/Ctrl+K) focuses the search input when the sidebar is open.
  document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
    const sb = document.getElementById(SIDEBAR_ID);
    if (!sb || !sb.classList.contains("pm-open")) return;
    const input = sb.querySelector(".pm-search-input");
    if (!input) return;
    e.preventDefault();
    input.focus();
    input.select();
  });

  // ────────────────────────────────────────────────────────────
  // Header button (unchanged from v1 — will coexist with the pill in stage 3)
  // ────────────────────────────────────────────────────────────
  function createPromptMateButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const container = document.getElementById("conversation-header-actions");
    if (!container) return;

    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.className = "btn relative btn-secondary text-token-text-primary";
    btn.setAttribute("aria-label", "PromptMate");
    btn.setAttribute("data-testid", "promptmate-button");
    btn.innerHTML = `
      <div class="flex w-full items-center justify-center gap-1.5">
        <svg height="20" width="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g><path d="M18.18 8.03933L18.6435 7.57589C19.4113 6.80804 20.6563 6.80804 21.4241 7.57589C22.192 8.34374 22.192 9.58868 21.4241 10.3565L20.9607 10.82M18.18 8.03933C18.18 8.03933 18.238 9.02414 19.1069 9.89309C19.9759 10.762 20.9607 10.82 20.9607 10.82M18.18 8.03933L13.9194 12.2999C13.6308 12.5885 13.4865 12.7328 13.3624 12.8919C13.2161 13.0796 13.0906 13.2827 12.9882 13.4975C12.9014 13.6797 12.8368 13.8732 12.7078 14.2604L12.2946 15.5L12.1609 15.901M20.9607 10.82L16.7001 15.0806C16.4115 15.3692 16.2672 15.5135 16.1081 15.6376C15.9204 15.7839 15.7173 15.9094 15.5025 16.0118C15.3203 16.0986 15.1268 16.1632 14.7396 16.2922L13.5 16.7054L13.099 16.8391M13.099 16.8391L12.6979 16.9728C12.5074 17.0363 12.2973 16.9867 12.1553 16.8447C12.0133 16.7027 11.9637 16.4926 12.0272 16.3021L12.1609 15.901M13.099 16.8391L12.1609 15.901" stroke="currentColor" stroke-width="1.5"/><path d="M8 13H10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M8 9H14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M8 17H9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M19.8284 3.17157C18.6569 2 16.7712 2 13 2H11C7.22876 2 5.34315 2 4.17157 3.17157C3 4.34315 3 6.22876 3 10V14C3 17.7712 3 19.6569 4.17157 20.8284C5.34315 22 7.22876 22 11 22H13C16.7712 22 18.6569 22 19.8284 20.8284C20.7715 19.8853 20.9554 18.4796 20.9913 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></g></svg>
        PromptMate
      </div>
    `;
    btn.addEventListener("click", toggleSidebar);
    container.appendChild(btn);
  }

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

    if (isOpen) {
      refreshAuthState();
      drainPendingWrites().catch((err) =>
        console.warn("PromptMate: drain pending writes failed", err)
      );
    }
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
    sb.appendChild(buildComposeDisclosure());

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

  // React-safe re-injection of the header button.
  const obs = new MutationObserver(createPromptMateButton);
  obs.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("load", () => setTimeout(createPromptMateButton, 500));
})();
