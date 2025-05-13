(function initPromptMateIntegration() {
  const STORAGE_KEY = "promptmate_prompts";
  const BUTTON_ID = "promptmate-btn";
  const SIDEBAR_ID = "promptmate-sidebar";
  const LAYOUT_SELECTOR = "div.relative.flex.h-full.w-full.flex-row";

  // JSON definitions for Tone and Output Format
  const TONE_OPTIONS = [
    { option: 'Formal / Professional', category: 'Neutral / Pro', instruction: 'Respond in a Formal / Professional style.' },
    { option: 'Neutral / Informative', category: 'Neutral / Pro', instruction: 'Respond in a Neutral / Informative style.' },
    { option: 'Friendly & Conversational', category: 'Conversational', instruction: 'Respond in a Friendly & Conversational style.' },
    { option: 'Casual / Relaxed', category: 'Conversational', instruction: 'Respond in a Casual / Relaxed style.' },
    { option: 'Playful / Humorous', category: 'Creative', instruction: 'Respond in a Playful / Humorous style.' },
    { option: 'Inspirational / Motivational', category: 'Creative', instruction: 'Respond in an Inspirational / Motivational style.' },
    { option: 'Expert & Analytical', category: 'Authority', instruction: 'Respond in an Expert & Analytical style.' },
    { option: 'Persuasive / Salesy', category: 'Authority', instruction: 'Respond in a Persuasive / Salesy style.' },
    { option: 'Storytelling / Dramatic', category: 'Narrative', instruction: 'Respond in a Storytelling / Dramatic style.' },
    { option: 'Custom…', category: 'Other', instruction: '' }
  ];

  const FORMAT_OPTIONS = [
    { option: 'Paragraph(s)', category: 'Plain', instruction: 'Return the answer as cohesive paragraphs.' },
    { option: 'Bulleted List', category: 'Plain', instruction: 'Format the answer as concise bullet points.' },
    { option: 'Numbered Steps', category: 'Plain', instruction: 'Provide numbered step-by-step instructions.' },
    { option: 'Markdown Table', category: 'Tables / Data', instruction: 'Output in a Markdown table with header row.' },
    { option: 'JSON Object', category: 'Tables / Data', instruction: 'Respond only with valid JSON matching this schema.' },
    { option: 'YAML', category: 'Tables / Data', instruction: 'Respond with a YAML block.' },
    { option: 'Code Block', category: 'Code / Tech', instruction: 'Return just the code inside fenced code blocks.' },
    { option: 'Shell Commands', category: 'Code / Tech', instruction: 'Output bash commands, one per line.' },
    { option: 'TL;DR (≤ 50 words)', category: 'Summaries', instruction: 'Give a one-sentence TL;DR no longer than 50 words.' },
    { option: 'Custom…', category: 'Other', instruction: '' }
  ];

  // 1️⃣ Create or re-create the header button
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
        <svg hight="20" width="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M18.18 8.03933L18.6435 7.57589C19.4113 6.80804 20.6563 6.80804 21.4241 7.57589C22.192 8.34374 22.192 9.58868 21.4241 10.3565L20.9607 10.82M18.18 8.03933C18.18 8.03933 18.238 9.02414 19.1069 9.89309C19.9759 10.762 20.9607 10.82 20.9607 10.82M18.18 8.03933L13.9194 12.2999C13.6308 12.5885 13.4865 12.7328 13.3624 12.8919C13.2161 13.0796 13.0906 13.2827 12.9882 13.4975C12.9014 13.6797 12.8368 13.8732 12.7078 14.2604L12.2946 15.5L12.1609 15.901M20.9607 10.82L16.7001 15.0806C16.4115 15.3692 16.2672 15.5135 16.1081 15.6376C15.9204 15.7839 15.7173 15.9094 15.5025 16.0118C15.3203 16.0986 15.1268 16.1632 14.7396 16.2922L13.5 16.7054L13.099 16.8391M13.099 16.8391L12.6979 16.9728C12.5074 17.0363 12.2973 16.9867 12.1553 16.8447C12.0133 16.7027 11.9637 16.4926 12.0272 16.3021L12.1609 15.901M13.099 16.8391L12.1609 15.901" stroke="#ffffff" stroke-width="1.5"></path> <path d="M8 13H10.5" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"></path> <path d="M8 9H14.5" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"></path> <path d="M8 17H9.5" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"></path> <path d="M19.8284 3.17157C18.6569 2 16.7712 2 13 2H11C7.22876 2 5.34315 2 4.17157 3.17157C3 4.34315 3 6.22876 3 10V14C3 17.7712 3 19.6569 4.17157 20.8284C5.34315 22 7.22876 22 11 22H13C16.7712 22 18.6569 22 19.8284 20.8284C20.7715 19.8853 20.9554 18.4796 20.9913 16" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"></path> </g></svg>
        PromptMate
      </div>
    `;
    btn.addEventListener("click", toggleSidebar);
    container.appendChild(btn);
  }

  // 2️⃣ Toggle sidebar visibility & layout shift
  function toggleSidebar() {
    let sb = document.getElementById(SIDEBAR_ID);
    if (!sb) sb = createSidebar();

    const layout = document.querySelector(LAYOUT_SELECTOR);
    const isOpen = sb.classList.toggle("show");

    if (layout) {
      layout.style.transition = "margin-right 0.3s ease";
      layout.style.marginRight = isOpen ? "260px" : "";
    }
  }

  // 3️⃣ Create the sidebar (only once)
  function createSidebar() {
    const layout = document.querySelector(LAYOUT_SELECTOR);
    if (!layout) return;

    const sb = document.createElement("div");
    sb.id = SIDEBAR_ID;
    sb.innerHTML = `
          <style>
            /* Sidebar container */
            #${SIDEBAR_ID} {
              width: 260px;
              height: 100%;
              position: fixed;
              top: 0;
              right: -260px;
              background: var(--token-sidebar-surface-primary, #1e1e1e);
              z-index: 9999;
              transition: right 0.3s ease-in-out;
              box-shadow: -2px 0 5px rgba(0,0,0,0.3);
              display: flex;
              flex-direction: column;
              color: #fff;
            }
            /* When open */
            #${SIDEBAR_ID}.show {
              right: 0;
            }
            /* Header with close button */
            #promptmate-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 1rem;
              font-weight: bold;
              font-size: 16px;
              border-bottom: 1px solid rgba(255,255,255,0.1);
            }
            #promptmate-header .close-btn {
              background: none;
              border: none;
              font-size: 18px;
              color: #bbb;
              cursor: pointer;
            }
            #promptmate-header .close-btn:hover {
              color: #fff;
            }
            /* Prompt list */
            #promptmate-list {
              flex: 1;
              overflow-y: auto;
              padding: 0.75rem;
            }
            .prompt-item {
              background: #2c2c2c;
              margin-bottom: 0.5rem;
              padding: 0.5rem;
              border-radius: 6px;
              cursor: pointer;
            }
            .prompt-item:hover {
              background: #3a3a3a;
            }
            /* Add button */
            #add-prompt-btn {
              margin: 0.75rem;
              padding: 0.5rem;
              background: #4caf50;
              color: white;
              border: none;
              border-radius: 5px;
              cursor: pointer;
            }
            #add-prompt-btn:hover {
              background: #45a045;
            }
          </style>
          <div id="promptmate-header">
            PromptMate
            <button class="close-btn" aria-label="Close">&times;</button>
          </div>
          <div id="promptmate-list"></div>
          <button id="add-prompt-btn">+ Add Prompt</button>
        `;

    // Bind open/close and prompt actions
    sb.querySelector(".close-btn").addEventListener("click", toggleSidebar);

    const listEl = sb.querySelector("#promptmate-list");
    renderPromptList(listEl);

    sb.querySelectorAll(".prompt-item").forEach(item => {
      item.addEventListener("click", () => {
        const t = document.querySelector("textarea");
        if (t) {
          t.value = item.textContent;
          t.dispatchEvent(new Event("input", { bubbles: true }));
          t.focus();
        }
      });
    });
    sb.querySelector("#add-prompt-btn").addEventListener("click", openPromptModal);
    // If click button won't work, use
    // document.getElementById("add-prompt-btn").addEventListener("click", openPromptModal);

    layout.appendChild(sb);
    return sb;
  }

  // 4️⃣ STORAGE HELPERS
  function loadPrompts(callback) {
    chrome.storage.local.get({ [STORAGE_KEY]: [] }, ({ [STORAGE_KEY]: prompts }) => {
      callback(prompts);
    });
  }

  // 5️⃣ Save Prompts
  function savePrompts(prompts) {
    chrome.storage.local.set({ [STORAGE_KEY]: prompts });
  }

  // 6️⃣ Create a single prompt-item element wired up to insert text
function createPromptItem(prompt) {
    // Container for the prompt item (stacked layout)
    const item = document.createElement('div');
    item.className = 'prompt-item flex flex-col p-2 border-b';

    // Title (16px)
    const titleEl = document.createElement('h3');
    titleEl.textContent = prompt.title;
    titleEl.className = 'font-semibold text-base'; // text-base = 16px
    item.appendChild(titleEl);

    // PromptBody preview (14px)
    const bodyPreview = document.createElement('p');
    const preview = prompt.promptBody.length > 30
      ? prompt.promptBody.slice(0, 30) + '…'
      : prompt.promptBody;
    bodyPreview.textContent = preview;
    bodyPreview.className = 'text-sm text-gray-600'; // text-sm = 14px
    item.appendChild(bodyPreview);

    // Actions row: Use button, Copy icon, Edit icon
    const actions = document.createElement('div');
    actions.className = 'prompt-actions flex items-center space-x-2 mt-2';

    // Use button (small)
    const useBtn = document.createElement('button');
    useBtn.textContent = 'Use';
    useBtn.className = 'btn btn-xs btn-primary';
    useBtn.addEventListener('click', () => {
      const textarea = document.getElementById('prompt-textarea');
      if (textarea) {
        // Build the full prompt content
        let content = '';
        // Main prompt body
        content += `<p>${prompt.promptBody}</p>`;
        // Tone instruction
        if (prompt.tone) {
          content += `<p><strong>Tone (${prompt.tone.option}):</strong> ${prompt.tone.instruction}</p>`;
        }
        // Format instruction
        if (prompt.format) {
          content += `<p><strong>Format (${prompt.format.option}):</strong> ${prompt.format.instruction}</p>`;
        }
        // Insert into the ChatGPT prompt textarea
        textarea.innerHTML = content;
        textarea.focus();
        // Move cursor to end
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(textarea);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });

    // Copy icon button
    const copyBtn = document.createElement('button');
    copyBtn.innerHTML = `
    <svg fill="#ffffff" height="20" width="20" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64" enable-background="new 0 0 64 64" xml:space="preserve">
      <g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g id="Text-files"> 
        <path d="M53.9791489,9.1429005H50.010849c-0.0826988,0-0.1562004,0.0283995-0.2331009,0.0469999V5.0228 C49.7777481,2.253,47.4731483,0,44.6398468,0h-34.422596C7.3839517,0,5.0793519,2.253,5.0793519,5.0228v46.8432999 c0,2.7697983,2.3045998,5.0228004,5.1378999,5.0228004h6.0367002v2.2678986C16.253952,61.8274002,18.4702511,64,21.1954517,64 h32.783699c2.7252007,0,4.9414978-2.1725998,4.9414978-4.8432007V13.9861002 C58.9206467,11.3155003,56.7043495,9.1429005,53.9791489,9.1429005z M7.1110516,51.8661003V5.0228 c0-1.6487999,1.3938999-2.9909999,3.1062002-2.9909999h34.422596c1.7123032,0,3.1062012,1.3422,3.1062012,2.9909999v46.8432999 c0,1.6487999-1.393898,2.9911003-3.1062012,2.9911003h-34.422596C8.5049515,54.8572006,7.1110516,53.5149002,7.1110516,51.8661003z M56.8888474,59.1567993c0,1.550602-1.3055,2.8115005-2.9096985,2.8115005h-32.783699 c-1.6042004,0-2.9097996-1.2608986-2.9097996-2.8115005v-2.2678986h26.3541946 c2.8333015,0,5.1379013-2.2530022,5.1379013-5.0228004V11.1275997c0.0769005,0.0186005,0.1504021,0.0469999,0.2331009,0.0469999 h3.9682999c1.6041985,0,2.9096985,1.2609005,2.9096985,2.8115005V59.1567993z"></path> <path d="M38.6031494,13.2063999H16.253952c-0.5615005,0-1.0159006,0.4542999-1.0159006,1.0158005 c0,0.5615997,0.4544001,1.0158997,1.0159006,1.0158997h22.3491974c0.5615005,0,1.0158997-0.4542999,1.0158997-1.0158997 C39.6190491,13.6606998,39.16465,13.2063999,38.6031494,13.2063999z"></path> <path d="M38.6031494,21.3334007H16.253952c-0.5615005,0-1.0159006,0.4542999-1.0159006,1.0157986 c0,0.5615005,0.4544001,1.0159016,1.0159006,1.0159016h22.3491974c0.5615005,0,1.0158997-0.454401,1.0158997-1.0159016 C39.6190491,21.7877007,39.16465,21.3334007,38.6031494,21.3334007z"></path> <path d="M38.6031494,29.4603004H16.253952c-0.5615005,0-1.0159006,0.4543991-1.0159006,1.0158997 s0.4544001,1.0158997,1.0159006,1.0158997h22.3491974c0.5615005,0,1.0158997-0.4543991,1.0158997-1.0158997 S39.16465,29.4603004,38.6031494,29.4603004z"></path> <path d="M28.4444485,37.5872993H16.253952c-0.5615005,0-1.0159006,0.4543991-1.0159006,1.0158997 s0.4544001,1.0158997,1.0159006,1.0158997h12.1904964c0.5615025,0,1.0158005-0.4543991,1.0158005-1.0158997 S29.0059509,37.5872993,28.4444485,37.5872993z"></path> 
      </g> </g>
    </svg>
  `;
    copyBtn.title = 'Copy prompt';
    copyBtn.className = 'btn-icon';
    copyBtn.addEventListener('click', () => {
      // Build the clipboard text
      let text = prompt.promptBody;
      if (prompt.tone) {
        text += `\nTone (${prompt.tone.option}): ${prompt.tone.instruction}`;
      }
      if (prompt.format) {
        text += `\nFormat (${prompt.format.option}): ${prompt.format.instruction}`;
      }
      navigator.clipboard.writeText(text);
    });

    // Edit icon button (pencil)
    const editBtn = document.createElement('button');
    editBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-xl-heavy">
      <path d="M15.6729 3.91287C16.8918 2.69392 18.8682 2.69392 20.0871 3.91287C21.3061 5.13182 21.3061 7.10813 20.0871 8.32708L14.1499 14.2643C13.3849 15.0293 12.3925 15.5255 11.3215 15.6785L9.14142 15.9899C8.82983 16.0344 8.51546 15.9297 8.29289 15.7071C8.07033 15.4845 7.96554 15.1701 8.01005 14.8586L8.32149 12.6785C8.47449 11.6075 8.97072 10.615 9.7357 9.85006L15.6729 3.91287ZM18.6729 5.32708C18.235 4.88918 17.525 4.88918 17.0871 5.32708L11.1499 11.2643C10.6909 11.7233 10.3932 12.3187 10.3014 12.9613L10.1785 13.8215L11.0386 13.6986C11.6812 13.6068 12.2767 13.3091 12.7357 12.8501L18.6729 6.91287C19.1108 6.47497 19.1108 5.76499 18.6729 5.32708ZM11 3.99929C11.0004 4.55157 10.5531 4.99963 10.0008 5.00007C9.00227 5.00084 8.29769 5.00827 7.74651 5.06064C7.20685 5.11191 6.88488 5.20117 6.63803 5.32695C6.07354 5.61457 5.6146 6.07351 5.32698 6.63799C5.19279 6.90135 5.10062 7.24904 5.05118 7.8542C5.00078 8.47105 5 9.26336 5 10.4V13.6C5 14.7366 5.00078 15.5289 5.05118 16.1457C5.10062 16.7509 5.19279 17.0986 5.32698 17.3619C5.6146 17.9264 6.07354 18.3854 6.63803 18.673C6.90138 18.8072 7.24907 18.8993 7.85424 18.9488C8.47108 18.9992 9.26339 19 10.4 19H13.6C14.7366 19 15.5289 18.9992 16.1458 18.9488C16.7509 18.8993 17.0986 18.8072 17.362 18.673C17.9265 18.3854 18.3854 17.9264 18.673 17.3619C18.7988 17.1151 18.8881 16.7931 18.9393 16.2535C18.9917 15.7023 18.9991 14.9977 18.9999 13.9992C19.0003 13.4469 19.4484 12.9995 20.0007 13C20.553 13.0004 21.0003 13.4485 20.9999 14.0007C20.9991 14.9789 20.9932 15.7808 20.9304 16.4426C20.8664 17.116 20.7385 17.7136 20.455 18.2699C19.9757 19.2107 19.2108 19.9756 18.27 20.455C17.6777 20.7568 17.0375 20.8826 16.3086 20.9421C15.6008 21 14.7266 21 13.6428 21H10.3572C9.27339 21 8.39925 21 7.69138 20.9421C6.96253 20.8826 6.32234 20.7568 5.73005 20.455C4.78924 19.9756 4.02433 19.2107 3.54497 18.2699C3.24318 17.6776 3.11737 17.0374 3.05782 16.3086C2.99998 15.6007 2.99999 14.7266 3 13.6428V10.3572C2.99999 9.27337 2.99998 8.39922 3.05782 7.69134C3.11737 6.96249 3.24318 6.3223 3.54497 5.73001C4.02433 4.7892 4.78924 4.0243 5.73005 3.54493C6.28633 3.26149 6.88399 3.13358 7.55735 3.06961C8.21919 3.00673 9.02103 3.00083 9.99922 3.00007C10.5515 2.99964 10.9996 3.447 11 3.99929Z" fill="currentColor"></path>
    </svg>
  `;
    editBtn.title = 'Edit prompt';
    editBtn.className = 'btn-icon';
    editBtn.addEventListener('click', () => openEditModal(prompt));

    actions.appendChild(useBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(editBtn);
    item.appendChild(actions);

    return item;
  }

  // 7️⃣ Create Input fields
  function makeInputField({ id, label, type = "text", placeholder = "" }) {
    const wrapper = document.createElement("label");
    wrapper.className = "flex flex-col gap-1 mb-3";
    wrapper.htmlFor = id;

    const lbl = document.createElement("span");
    lbl.textContent = label;
    lbl.className = "text-sm font-medium text-token-text-primary";

    const input = document.createElement(type === "textarea" ? "textarea" : "input");
    input.id = id;
    input.placeholder = placeholder;
    input.className = `
          bg-token-main-surface-secondary
          border border-token-border-secondary
          rounded px-2 py-1 text-token-text-primary
          focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-token-accent
        `;
    if (type !== "textarea") input.type = type;
    else input.rows = 3;

    wrapper.append(lbl, input);
    return wrapper;
  }

  // 8️⃣ Create the prompt modal
  function createPromptModal() {
    if (document.querySelector('[data-testid="promptmate-modal"]')) return;

    // Overlay & wrapper
    const overlay = document.createElement("div");
    overlay.dataset.testid = "promptmate-modal";
    overlay.className = "fixed inset-0 z-50 bg-black/50 dark:bg-black/80 hidden";
    overlay.style.pointerEvents = "auto";

    // Modal shell (reusing ChatGPT’s popover classes)
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.className = `
          popover bg-token-main-surface-primary relative col-start-2 row-start-2
          rounded-2xl shadow-xl flex flex-col overflow-hidden max-w-[550px] mx-auto my-16
        `;

    // Header
    const header = document.createElement("div");
    header.className = "px-4 py-3 border-b border-black/10 dark:border-white/10 flex justify-between items-center";
    header.innerHTML = `
          <h2 class="text-lg font-semibold text-token-text-primary">New Prompt</h2>
        `;
    const closeBtn = document.createElement("button");
    closeBtn.dataset.testid = "promptmate-close";
    closeBtn.type = "button";
    closeBtn.className = "hover:bg-token-main-surface-secondary p-1 rounded-full";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M5.636 5.636a1 1 0 0 1 1.414 0L12 10.586l4.95-4.95a1 1 0 1 1 1.414 1.414L13.414 12l4.95 4.95a1 1 0 0 1-1.414 1.414L12 13.414l-4.95 4.95a1 1 0 0 1-1.414-1.414L10.586 12 5.636 7.05a1 1 0 0 1 0-1.414z" fill="currentColor"/>
          </svg>
        `;
    closeBtn.addEventListener("click", closePromptModal);
    header.appendChild(closeBtn);

    // Body / form container
    const body = document.createElement("div");
    body.className = "grow overflow-y-auto p-6";
    // build fields
    body.append(
      makeInputField({ id: 'pm-title', label: 'Title', placeholder: 'E.g. Summarize Discussion' }),
      makeSelectField({ id: 'pm-tone', label: 'Tone', options: TONE_OPTIONS }),
      makeSelectField({ id: 'pm-format', label: 'Output Format', options: FORMAT_OPTIONS }),
      makeInputField({ id: 'pm-prompt-body', label: 'Prompt Body', type: 'textarea', placeholder: 'Write your prompt here…' })
    );

    // Footer / actions
    const footer = document.createElement("div");
    footer.className = "px-4 py-3 border-t border-black/10 dark:border-white/10 flex justify-end gap-3";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "btn btn-tertiary";
    cancelBtn.addEventListener("click", closePromptModal);

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.className = "btn btn-primary";
    saveBtn.addEventListener("click", onSaveNewPrompt);

    footer.append(cancelBtn, saveBtn);

    // assemble
    modal.append(header, body, footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  // 9️⃣ Open/Close the prompt modal
  function openPromptModal() {
    createPromptModal();
    document.querySelector('[data-testid="promptmate-modal"]').classList.remove("hidden");
  }
  function closePromptModal() {
    document.querySelector('[data-testid="promptmate-modal"]').classList.add("hidden");
  }

  // 1️⃣0️⃣ Save the new prompt
  function onSaveNewPrompt() {
  const modal      = document.querySelector('[data-testid="promptmate-modal"]');
  const editId     = modal.dataset.editPromptId;
  const title      = document.getElementById('pm-title').value.trim();
  const bodyText   = document.getElementById('pm-prompt-body').value.trim();
  const toneOpt    = document.getElementById('pm-tone').value;
  const formatOpt  = document.getElementById('pm-format').value;
  if (!title || !bodyText || !toneOpt || !formatOpt) {
    return alert('Title, Tone, Output Format, and Prompt Body are required.');
  }
  const toneOption   = TONE_OPTIONS.find(o => o.option === toneOpt);
  const formatOption = FORMAT_OPTIONS.find(o => o.option === formatOpt);

  document.getElementById('pm-title').value       = '';
  document.getElementById('pm-prompt-body').value = '';
  document.getElementById('pm-tone').value        = '';
  document.getElementById('pm-format').value      = '';

  loadPrompts(list => {
    if (editId) {
      const idx = list.findIndex(p => p.id === editId);
      list[idx] = { ...list[idx], title, promptBody: bodyText, tone: toneOption, format: formatOption };
      delete modal.dataset.editPromptId;
    } else {
      const newPrompt = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        title,
        promptBody: bodyText,
        tone: toneOption,
        format: formatOption
      };
      list.push(newPrompt);
    }
    savePrompts(list);
    closePromptModal();
    renderPromptList();
  });

 
}

  // Render list with Title & PromptBody; clicking injects full prompt (body + tone + format)
  

function openEditModal(prompt) {
  // Ensure the modal setup is initialized (in case new prompt creation ran earlier)
  createPromptModal();

  const modal = document.querySelector('[data-testid="promptmate-modal"]');
  document.getElementById('pm-title').value       = prompt.title;
  document.getElementById('pm-prompt-body').value = prompt.promptBody;
  document.getElementById('pm-tone').value        = prompt.tone.option;
  document.getElementById('pm-format').value      = prompt.format.option;
  modal.dataset.editPromptId = prompt.id;
  modal.classList.remove('hidden');
}


  function renderPromptList(listEl) {
    if (!listEl) listEl = document.getElementById('promptmate-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    loadPrompts(prompts => {
      prompts.forEach(p => listEl.appendChild(createPromptItem(p)));
    });
  }

  // Utility: create a select dropdown with optgroups
  function makeSelectField({ id, label, options }) {
    const wrapper = document.createElement('label');
    wrapper.className = 'flex flex-col gap-1 mb-3';
    wrapper.htmlFor = id;

    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.className = 'text-sm font-medium text-token-text-primary';

    const select = document.createElement('select');
    select.id = id;
    select.className = `
          bg-token-main-surface-secondary
          border border-token-border-secondary
          rounded px-2 py-1 text-token-text-primary
          focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-token-accent
        `;

    // group options by category
    const categories = [...new Set(options.map(o => o.category))];
    categories.forEach(cat => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = cat;
      options.filter(o => o.category === cat).forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.option;
        opt.textContent = o.option;
        opt.dataset.instruction = o.instruction;
        optgroup.appendChild(opt);
      });
      select.appendChild(optgroup);
    });

    wrapper.append(lbl, select);
    return wrapper;
  }

  // React-safe re-injection
  const obs = new MutationObserver(createPromptMateButton);
  obs.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("load", () => setTimeout(createPromptMateButton, 500));
})();
