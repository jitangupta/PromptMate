// Imports from business.js are now handled by ui-manager.js or passed via config if needed directly.
import { recordAnalytics, shareAnalytics, TONE_OPTIONS, FORMAT_OPTIONS, loadPrompts, savePrompts } from './business.js';
import { makeInputField, makeSelectField } from './utility.js'; // These are generic, used by GPT
import { toggleSidebar, openPromptModal, openEditModal, createSidebar, renderPromptList, onSavePrompt, createPromptItem } from './ui-manager.js';

(function initPromptMateIntegration() {
  const BUTTON_ID = "promptmate-btn-gpt"; // Specific ID for GPT button

  // Configuration for UI Manager, specific to ChatGPT
  const gptUiConfig = {
    SITE_NAME: 'GPT',
    SIDEBAR_ID: 'promptmate-sidebar-gpt',
    MODAL_ID: 'promptmate-modal-gpt',
    LAYOUT_SELECTOR: "div.relative.flex.h-full.w-full.flex-row", // Main layout element for margin adjustment
    MAIN_CONTENT_SELECTOR: "div.relative.flex.h-full.w-full.flex-row", // Sidebar will be appended here
    sidebarWidth: "260px", // Used for margin adjustment and initial hide
    // Classes for sidebar (can be more granular if needed)
    // sidebarClasses are now primarily for structural or JS-hook purposes if not covered by gpt.css
    sidebarClasses: ['promptmate-sidebar'], // General class, specific styling in gpt.css
    // sidebarInnerDivClasses are also for structure or JS-hooks. Styling in gpt.css
    sidebarInnerDivClasses: ['pm-sidebar-inner'],
    // sidebarStyles removed, styles are now in styles/gpt.css
    promptListClasses: ['flex-1', 'overflow-y-auto', 'p-[0.75rem]'], // Classes for the prompt list container
    promptItemClasses: ['prompt-item', 'flex', 'flex-col', 'p-2', 'border-b', 'bg-[#2c2c2c]', 'mb-[0.5rem]', 'rounded-[6px]', 'cursor-pointer', 'hover:bg-[#3a3a3a]'],
    // Specific handler for using a prompt in ChatGPT
    usePromptHandler: (prompt) => {
      const textarea = document.getElementById('prompt-textarea');
      if (textarea) {
        let content = '';
        content += `${prompt.promptBody}`; // GPT usually handles paragraphs better without <p> tags from script
        if (prompt.tone && prompt.tone.instruction) {
          content += `\n\n${prompt.tone.instruction}`;
        }
        if (prompt.format && prompt.format.instruction) {
          content += `\n\n${prompt.format.instruction}`;
        }
        textarea.value = content; // Use .value for textarea
        textarea.dispatchEvent(new Event('input', { bubbles: true })); // Trigger input event
        textarea.focus();
        // Move cursor to end (standard way for textareas)
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      }
    },
    // SVG Icons (passed as strings) - Using same icons as Claude for now
    copyIconSvg: `<svg fill="#ffffff" height="20" width="20" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64" enable-background="new 0 0 64 64" xml:space="preserve"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g id="Text-files"><path d="M53.9791489,9.1429005H50.010849c-0.0826988,0-0.1562004,0.0283995-0.2331009,0.0469999V5.0228 C49.7777481,2.253,47.4731483,0,44.6398468,0h-34.422596C7.3839517,0,5.0793519,2.253,5.0793519,5.0228v46.8432999 c0,2.7697983,2.3045998,5.0228004,5.1378999,5.0228004h6.0367002v2.2678986C16.253952,61.8274002,18.4702511,64,21.1954517,64 h32.783699c2.7252007,0,4.9414978-2.1725998,4.9414978-4.8432007V13.9861002 C58.9206467,11.3155003,56.7043495,9.1429005,53.9791489,9.1429005z M7.1110516,51.8661003V5.0228 c0-1.6487999,1.3938999-2.9909999,3.1062002-2.9909999h34.422596c1.7123032,0,3.1062012,1.3422,3.1062012,2.9909999v46.8432999 c0,1.6487999-1.393898,2.9911003-3.1062012,2.9911003h-34.422596C8.5049515,54.8572006,7.1110516,53.5149002,7.1110516,51.8661003z M56.8888474,59.1567993c0,1.550602-1.3055,2.8115005-2.9096985,2.8115005h-32.783699 c-1.6042004,0-2.9097996-1.2608986-2.9097996-2.8115005v-2.2678986h26.3541946 c2.8333015,0,5.1379013-2.2530022,5.1379013-5.0228004V11.1275997c0.0769005,0.0186005,0.1504021,0.0469999,0.2331009,0.0469999 h3.9682999c1.6041985,0,2.9096985,1.2609005,2.9096985,2.8115005V59.1567993z"></path> <path d="M38.6031494,13.2063999H16.253952c-0.5615005,0-1.0159006,0.4542999-1.0159006,1.0158005 c0,0.5615997,0.4544001,1.0158997,1.0159006,1.0158997h22.3491974c0.5615005,0,1.0158997-0.4542999,1.0158997-1.0158997 C39.6190491,13.6606998,39.16465,13.2063999,38.6031494,13.2063999z"></path> <path d="M38.6031494,21.3334007H16.253952c-0.5615005,0-1.0159006,0.4542999-1.0159006,1.0157986 c0,0.5615005,0.4544001,1.0159016,1.0159006,1.0159016h22.3491974c0.5615005,0,1.0158997-0.454401,1.0158997-1.0159016 C39.6190491,21.7877007,39.16465,21.3334007,38.6031494,21.3334007z"></path> <path d="M38.6031494,29.4603004H16.253952c-0.5615005,0-1.0159006,0.4543991-1.0159006,1.0158997 s0.4544001,1.0158997,1.0159006,1.0158997h22.3491974c0.5615005,0,1.0158997-0.4543991,1.0158997-1.0158997 S39.16465,29.4603004,38.6031494,29.4603004z"></path> <path d="M28.4444485,37.5872993H16.253952c-0.5615005,0-1.0159006,0.4543991-1.0159006,1.0158997 s0.4544001,1.0158997,1.0159006,1.0158997h12.1904964c0.5615025,0,1.0158005-0.4543991,1.0158005-1.0158997 S29.0059509,37.5872993,28.4444485,37.5872993z"></path> </g></g></svg>`,
    editIconSvg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-xl-heavy"><path d="M15.6729 3.91287C16.8918 2.69392 18.8682 2.69392 20.0871 3.91287C21.3061 5.13182 21.3061 7.10813 20.0871 8.32708L14.1499 14.2643C13.3849 15.0293 12.3925 15.5255 11.3215 15.6785L9.14142 15.9899C8.82983 16.0344 8.51546 15.9297 8.29289 15.7071C8.07033 15.4845 7.96554 15.1701 8.01005 14.8586L8.32149 12.6785C8.47449 11.6075 8.97072 10.615 9.7357 9.85006L15.6729 3.91287ZM18.6729 5.32708C18.235 4.88918 17.525 4.88918 17.0871 5.32708L11.1499 11.2643C10.6909 11.7233 10.3932 12.3187 10.3014 12.9613L10.1785 13.8215L11.0386 13.6986C11.6812 13.6068 12.2767 13.3091 12.7357 12.8501L18.6729 6.91287C19.1108 6.47497 19.1108 5.76499 18.6729 5.32708ZM11 3.99929C11.0004 4.55157 10.5531 4.99963 10.0008 5.00007C9.00227 5.00084 8.29769 5.00827 7.74651 5.06064C7.20685 5.11191 6.88488 5.20117 6.63803 5.32695C6.07354 5.61457 5.6146 6.07351 5.32698 6.63799C5.19279 6.90135 5.10062 7.24904 5.05118 7.8542C5.00078 8.47105 5 9.26336 5 10.4V13.6C5 14.7366 5.00078 15.5289 5.05118 16.1457C5.10062 16.7509 5.19279 17.0986 5.32698 17.3619C5.6146 17.9264 6.07354 18.3854 6.63803 18.673C6.90138 18.8072 7.24907 18.8993 7.85424 18.9488C8.47108 18.9992 9.26339 19 10.4 19H13.6C14.7366 19 15.5289 18.9992 16.1458 18.9488C16.7509 18.8993 17.0986 18.8072 17.362 18.673C17.9265 18.3854 18.3854 17.9264 18.673 17.3619C18.7988 17.1151 18.8881 16.7931 18.9393 16.2535C18.9917 15.7023 18.9991 14.9977 18.9999 13.9992C19.0003 13.4469 19.4484 12.9995 20.0007 13C20.553 13.0004 21.0003 13.4485 20.9999 14.0007C20.9991 14.9789 20.9932 15.7808 20.9304 16.4426C20.8664 17.116 20.7385 17.7136 20.455 18.2699C19.9757 19.2107 19.2108 19.9756 18.27 20.455C17.6777 20.7568 17.0375 20.8826 16.3086 20.9421C15.6008 21 14.7266 21 13.6428 21H10.3572C9.27339 21 8.39925 21 7.69138 20.9421C6.96253 20.8826 6.32234 20.7568 5.73005 20.455C4.78924 19.9756 4.02433 19.2107 3.54497 18.2699C3.24318 17.6776 3.11737 17.0374 3.05782 16.3086C2.99998 15.6007 2.99999 14.7266 3 13.6428V10.3572C2.99999 9.27337 2.99998 8.39922 3.05782 7.69134C3.11737 6.96249 3.24318 6.3223 3.54497 5.73001C4.02433 4.7892 4.78924 4.0243 5.73005 3.54493C6.28633 3.26149 6.88399 3.13358 7.55735 3.06961C8.21919 3.00673 9.02103 3.00083 9.99922 3.00007C10.5515 2.99964 10.9996 3.447 11 3.99929Z" fill="currentColor"></path></svg>`,
    deleteIconSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-md" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.5555 4C10.099 4 9.70052 4.30906 9.58693 4.75114L9.29382 5.8919H14.715L14.4219 4.75114C14.3083 4.30906 13.9098 4 13.4533 4H10.5555ZM16.7799 5.8919L16.3589 4.25342C16.0182 2.92719 14.8226 2 13.4533 2H10.5555C9.18616 2 7.99062 2.92719 7.64985 4.25342L7.22886 5.8919H4C3.44772 5.8919 3 6.33961 3 6.8919C3 7.44418 3.44772 7.8919 4 7.8919H4.10069L5.31544 19.3172C5.47763 20.8427 6.76455 22 8.29863 22H15.7014C17.2354 22 18.5224 20.8427 18.6846 19.3172L19.8993 7.8919H20C20.5523 7.8919 21 7.44418 21 6.8919C21 6.33961 20.5523 5.8919 20 5.8919H16.7799ZM17.888 7.8919H6.11196L7.30423 19.1057C7.3583 19.6142 7.78727 20 8.29863 20H15.7014C16.2127 20 16.6417 19.6142 16.6958 19.1057L17.888 7.8919ZM10 10C10.5523 10 11 10.4477 11 11V16C11 16.5523 10.5523 17 10 17C9.44772 17 9 16.5523 9 16V11C9 10.4477 9.44772 10 10 10ZM14 10C14.5523 10 15 10.4477 15 11V16C15 16.5523 14.5523 17 14 17C13.4477 17 13 16.5523 13 16V11C13 10.4477 13.4477 10 14 10Z" fill="currentColor"></path></svg>`,
    closeIconSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5.636 5.636a1 1 0 0 1 1.414 0L12 10.586l4.95-4.95a1 1 0 1 1 1.414 1.414L13.414 12l4.95 4.95a1 1 0 0 1-1.414 1.414L12 13.414l-4.95 4.95a1 1 0 0 1-1.414-1.414L10.586 12 5.636 7.05a1 1 0 0 1 0-1.414z" fill="currentColor"/></svg>`,
    // Utility functions from utility.js (generic versions)
    utility: {
      makeInputField: makeInputField,
      makeSelectField: makeSelectField,
      createSvgImage: (svgString) => { // Basic SVG creator if needed, or rely on direct innerHTML
          const div = document.createElement('div');
          div.innerHTML = svgString.trim();
          return div.firstChild;
      }
    },
    // Modal specific classes (using GPT's existing styles where possible)
    modalContainerClasses: ["fixed", "inset-0", "z-50", "bg-black/50", "dark:bg-black/80", "flex", "items-center", "justify-center"],
    modalDialogClasses: ["popover", "bg-token-main-surface-primary", "relative", "rounded-2xl", "shadow-xl", "flex", "flex-col", "overflow-hidden", "max-w-[550px]", "mx-auto", "my-16", "w-full"],
    modalHeaderClasses: ["px-4", "py-3", "border-b", "border-black/10", "dark:border-white/10", "flex", "justify-between", "items-center"],
    modalTitleClasses: ["text-lg", "font-semibold", "text-token-text-primary"],
    modalCloseBtnClasses: ["hover:bg-token-main-surface-secondary", "p-1", "rounded-full"],
    modalBodyClasses: ["grow", "overflow-y-auto", "p-6"],
    modalFooterClasses: ["px-4", "py-3", "border-t", "border-black/10", "dark:border-white/10", "flex", "justify-end", "gap-3"],
    modalCancelBtnClasses: ["btn", "btn-tertiary"],
    modalSaveBtnClasses: ["btn", "btn-primary"],
  };

  // Create or re-create the header button
  function createPromptMateButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const container = document.getElementById("conversation-header-actions");
    if (!container) return;

    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.className = "btn relative btn-secondary text-token-text-primary"; // GPT specific classes
    btn.setAttribute("aria-label", "PromptMate");
    btn.setAttribute("data-testid", "promptmate-button"); // GPT specific test ID
    // SVG icon for the button (this could also be part of gptUiConfig if it varies more)
    btn.innerHTML = `
      <div class="flex w-full items-center justify-center gap-1.5">
        <svg hight="20" width="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M18.18 8.03933L18.6435 7.57589C19.4113 6.80804 20.6563 6.80804 21.4241 7.57589C22.192 8.34374 22.192 9.58868 21.4241 10.3565L20.9607 10.82M18.18 8.03933C18.18 8.03933 18.238 9.02414 19.1069 9.89309C19.9759 10.762 20.9607 10.82 20.9607 10.82M18.18 8.03933L13.9194 12.2999C13.6308 12.5885 13.4865 12.7328 13.3624 12.8919C13.2161 13.0796 13.0906 13.2827 12.9882 13.4975C12.9014 13.6797 12.8368 13.8732 12.7078 14.2604L12.2946 15.5L12.1609 15.901M20.9607 10.82L16.7001 15.0806C16.4115 15.3692 16.2672 15.5135 16.1081 15.6376C15.9204 15.7839 15.7173 15.9094 15.5025 16.0118C15.3203 16.0986 15.1268 16.1632 14.7396 16.2922L13.5 16.7054L13.099 16.8391M13.099 16.8391L12.6979 16.9728C12.5074 17.0363 12.2973 16.9867 12.1553 16.8447C12.0133 16.7027 11.9637 16.4926 12.0272 16.3021L12.1609 15.901M13.099 16.8391L12.1609 15.901" stroke="#ffffff" stroke-width="1.5"></path> <path d="M8 13H10.5" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"></path> <path d="M8 9H14.5" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"></path> <path d="M8 17H9.5" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"></path> <path d="M19.8284 3.17157C18.6569 2 16.7712 2 13 2H11C7.22876 2 5.34315 2 4.17157 3.17157C3 4.34315 3 6.22876 3 10V14C3 17.7712 3 19.6569 4.17157 20.8284C5.34315 22 7.22876 22 11 22H13C16.7712 22 18.6569 22 19.8284 20.8284C20.7715 19.8853 20.9554 18.4796 20.9913 16" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"></path> </g></svg>
        PromptMate
      </div>
    `;
    btn.addEventListener("click", () => toggleSidebar(gptUiConfig));
    container.appendChild(btn);
  }

  // React-safe re-injection of the button
  const obs = new MutationObserver(createPromptMateButton);
  obs.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("load", () => setTimeout(createPromptMateButton, 500));
})();
