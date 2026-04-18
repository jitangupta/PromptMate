import {
    TONE_OPTIONS,
    FORMAT_OPTIONS,
    listPrompts,
    savePrompt,
    deletePrompt,
    drainPendingWrites,
    recordAnalytics,
    shareAnalytics
} from './business.js';

import {
    makeClaudeInputField,
    makeClaudeSelectField,
    createSvgImage,
    makeClaudeSignInButton,
    makeClaudeAuthFooter,
} from './utility.js';

import {
    subscribeAuthState,
    refreshAuthState,
    performSignIn,
    performSignOut,
} from './sidebar-auth.js';

(function initClaudePromptMate() {
    const BUTTON_ID = 'promptmate-btn';
    const SIDEBAR_ID = 'promptmate-sidebar';
    const MAIN_CONTENT_SELECTOR = 'div.flex.flex-1.h-screen.w-full.overflow-hidden.relative';

    function injectHeaderButton() {
        const container = document.querySelector('header .right-3.flex.gap-2 > div');
        if (!container || document.getElementById(BUTTON_ID)) return;

        const btn = document.createElement('button');
        btn.id = BUTTON_ID;
        let updatedBtn = setButtonProperties(btn);
        container.appendChild(updatedBtn);
    }

    function injectAbsoluteButton() {
        const main = document.querySelector('main');
        if (!main || main.querySelector('#promptmate-btn-abs')) return;

        const btn = document.createElement('button');
        btn.id = 'promptmate-btn-abs';
        let updatedBtn = setButtonProperties(btn);
        main.appendChild(updatedBtn);
    }

    function setButtonProperties(btn) {
        btn.type = 'button';
        const icon = createSvgImage(`
            <svg hight="20" width="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M18.18 8.03933L18.6435 7.57589C19.4113 6.80804 20.6563 6.80804 21.4241 7.57589C22.192 8.34374 22.192 9.58868 21.4241 10.3565L20.9607 10.82M18.18 8.03933C18.18 8.03933 18.238 9.02414 19.1069 9.89309C19.9759 10.762 20.9607 10.82 20.9607 10.82M18.18 8.03933L13.9194 12.2999C13.6308 12.5885 13.4865 12.7328 13.3624 12.8919C13.2161 13.0796 13.0906 13.2827 12.9882 13.4975C12.9014 13.6797 12.8368 13.8732 12.7078 14.2604L12.2946 15.5L12.1609 15.901M20.9607 10.82L16.7001 15.0806C16.4115 15.3692 16.2672 15.5135 16.1081 15.6376C15.9204 15.7839 15.7173 15.9094 15.5025 16.0118C15.3203 16.0986 15.1268 16.1632 14.7396 16.2922L13.5 16.7054L13.099 16.8391M13.099 16.8391L12.6979 16.9728C12.5074 17.0363 12.2973 16.9867 12.1553 16.8447C12.0133 16.7027 11.9637 16.4926 12.0272 16.3021L12.1609 15.901M13.099 16.8391L12.1609 15.901" stroke="#ffffff" stroke-width="1.5"></path> <path d="M8 13H10.5" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"></path> <path d="M8 9H14.5" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"></path> <path d="M8 17H9.5" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"></path> <path d="M19.8284 3.17157C18.6569 2 16.7712 2 13 2H11C7.22876 2 5.34315 2 4.17157 3.17157C3 4.34315 3 6.22876 3 10V14C3 17.7712 3 19.6569 4.17157 20.8284C5.34315 22 7.22876 22 11 22H13C16.7712 22 18.6569 22 19.8284 20.8284C20.7715 19.8853 20.9554 18.4796 20.9913 16" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"></path> </g></svg>           
        `);
        icon.className = 'pr-1';
        btn.appendChild(icon);
        btn.appendChild(document.createTextNode('PromptMate'));
        btn.className = 'inline-flex items-center justify-center text-sm px-4 py-2 rounded-lg bg-accent-main-000 text-white';
        btn.addEventListener('click', toggleSidebar);
        return btn;
    }

    function toggleSidebar() {
        let sidebar = document.getElementById(SIDEBAR_ID);
        if (!sidebar) sidebar = createSidebar();

        const isOpen = sidebar.classList.toggle('show');
        let firstChild = sidebar.querySelector('div');
        if (isOpen) {
            firstChild.style.width = '17rem';
            firstChild.classList.add('shadow-lg', '!bg-bg-200', 'lg:shadow-[inset_-4px_0px_6px_-4px_hsl(var(--always-black)/4%)]')
            firstChild.style.transition = 'width 0.3s ease';
            sidebar.style.width = '17rem';
            refreshAuthState();
            drainPendingWrites().catch((err) =>
                console.warn('PromptMate: drain pending writes failed', err)
            );
        } else {
            firstChild.style.width = 0;
            firstChild.classList.remove('shadow-lg', '!bg-bg-200', 'lg:shadow-[inset_-4px_0px_6px_-4px_hsl(var(--always-black)/4%)]')
            firstChild.style.transition = 'width 0.3s ease';
            sidebar.style.width = 0;
        }
    }

    function createSidebar() {
        const container = document.querySelector("div#root>div>div>div");
        if (!container) return;

        const sb = document.createElement('div');
        sb.id = SIDEBAR_ID;
        sb.className = 'sidebar fixed z-sidebar';
        // setTimeout(() => sb.style.right = '0', 0);

        sb.innerHTML = `
            <div class="h-screen flex flex-col gap-3 px-0 fixed top-0 right-0 transition duration-100 border-border-300 border-l shadow-lg !bg-bg-200 lg:shadow-[inset_-4px_0px_6px_-4px_hsl(var(--always-black)/4%)]">
            <div id="promptmate-header" class="pm-heading">
                PromptMate
                <button class="close-btn" style="background:none;border:none;font-size:18px;cursor:pointer;">×</button>
            </div>
            <div id="promptmate-body" style="flex:1;display:flex;flex-direction:column;overflow:hidden;"></div>                                                                                   
              <div id="promptmate-footer"></div>                                                                                                                                                    
       </div>
            </div>
            `;

        sb.querySelector('.close-btn').addEventListener('click', toggleSidebar);
        

        container.appendChild(sb);

        subscribeAuthState((state) => renderSidebarBody(sb, state));
        refreshAuthState();

        return sb;
    }

    function renderSidebarBody(sb, state) {
        const body = sb.querySelector('#promptmate-body');
        const footer = sb.querySelector('#promptmate-footer');
        if (!body || !footer) return;

        body.innerHTML = '';
        footer.innerHTML = '';

        if (state.loading && !state.signedIn && !state.message) {
            const loading = document.createElement('p');
            loading.className = 'text-text-200 text-sm p-4 text-center';
            loading.textContent = 'Loading…';
            body.appendChild(loading);
            return;
        }

        if (!state.signedIn) {
            body.appendChild(
                makeClaudeSignInButton({
                    onClick: () =>
                        performSignIn().catch((err) =>
                            console.warn('PromptMate: sign-in failed', err)
                        ),
                    message: state.message,
                    loading: state.loading,
                })
            );
            return;
        }

        const list = document.createElement('div');
        list.id = 'promptmate-list';
        list.className = 'pm-list';
        body.appendChild(list);

        const addBtn = document.createElement('button');
        addBtn.id = 'add-prompt-btn';
        addBtn.className = 'btn-pm';
        addBtn.textContent = '+ Add Prompt';
        addBtn.addEventListener('click', openPromptModal);
        body.appendChild(addBtn);

        const shareBtn = document.createElement('button');
        shareBtn.id = 'pm-share-analytics';
        shareBtn.className = 'btn-analytics';
        shareBtn.textContent = 'Share Analytics';
        shareBtn.addEventListener('click', shareAnalytics);
        body.appendChild(shareBtn);

        renderPromptList();

        footer.appendChild(
            makeClaudeAuthFooter({
                email: state.email,
                onSignOut: () =>
                    performSignOut().catch((err) =>
                        console.warn('PromptMate: sign-out failed', err)
                    ),
            })
        );
    }

    function renderPromptList() {
        const listEl = document.getElementById('promptmate-list');
        if (!listEl) return;

        listPrompts((prompts, meta) => {
            listEl.innerHTML = '';
            prompts.forEach(p => listEl.appendChild(createPromptItem(p)));
            updateSyncIndicator(meta);
        });
    }

    function updateSyncIndicator(meta) {
        const footer = document.getElementById('promptmate-footer');
        if (!footer) return;
        let indicator = footer.querySelector('#promptmate-sync-status');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'promptmate-sync-status';
            indicator.className = 'text-text-300';
            indicator.style.cssText = 'font-size:11px;padding:0 1rem 0.5rem;';
            footer.prepend(indicator);
        }
        if (meta?.pendingCount > 0) {
            indicator.textContent = `${meta.pendingCount} change${meta.pendingCount > 1 ? 's' : ''} pending sync…`;
        } else if (meta?.fromCache) {
            indicator.textContent = 'Syncing…';
        } else {
            indicator.textContent = '';
        }
    }

    function createPromptItem(prompt) {
        const item = document.createElement('div');
        item.className = 'prompt-item bg-bg-000';

        const titleEl = document.createElement('h3');
        titleEl.textContent = prompt.title;
        titleEl.style = 'font-size:16px;';
        item.appendChild(titleEl);

        const preview = document.createElement('p');
        const body = prompt.body || '';
        preview.textContent = body.length > 40 ? body.slice(0, 40) + '…' : body;
        preview.style = 'font-size:14px;color:#555;';
        item.appendChild(preview);

        const actions = document.createElement('div');
        actions.style = 'margin-top:0.5rem;display:flex;gap:0.5rem;';

        const useBtn = document.createElement('button');
        useBtn.textContent = 'Use';
        useBtn.className = 'bg-accent-main-000 btn-xs use';
        useBtn.style = 'color:white;';
        useBtn.onclick = () => {
            recordAnalytics('used');
            const targetDiv = document.querySelector('div[aria-label="Write your prompt to Claude"]');
            if (targetDiv) {
                const placeholderP = targetDiv.querySelector(
                    'p[data-placeholder="How can I help you today?"], p[data-placeholder="Reply to Claude..."]'
                );
                if (placeholderP) {
                    placeholderP.remove();
                }

                var promptContainer = targetDiv.firstChild;
                promptContainer.innerHTML = '';
                var p = document.createElement('p');
                p.textContent = `${prompt.body || ''}\n\n${prompt.tone?.instruction ?? ''}\n${prompt.format?.instruction ?? ''}`;
                p.setAttribute('data-inserted', 'true'); 
                promptContainer.appendChild(p);
            }
        };

        const copyBtn = document.createElement('button');
        copyBtn.appendChild(createSvgImage(`
            <svg fill="currentColor" height="20" width="20" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64" enable-background="new 0 0 64 64" xml:space="preserve">
            <g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g id="Text-files"> 
                <path d="M53.9791489,9.1429005H50.010849c-0.0826988,0-0.1562004,0.0283995-0.2331009,0.0469999V5.0228 C49.7777481,2.253,47.4731483,0,44.6398468,0h-34.422596C7.3839517,0,5.0793519,2.253,5.0793519,5.0228v46.8432999 c0,2.7697983,2.3045998,5.0228004,5.1378999,5.0228004h6.0367002v2.2678986C16.253952,61.8274002,18.4702511,64,21.1954517,64 h32.783699c2.7252007,0,4.9414978-2.1725998,4.9414978-4.8432007V13.9861002 C58.9206467,11.3155003,56.7043495,9.1429005,53.9791489,9.1429005z M7.1110516,51.8661003V5.0228 c0-1.6487999,1.3938999-2.9909999,3.1062002-2.9909999h34.422596c1.7123032,0,3.1062012,1.3422,3.1062012,2.9909999v46.8432999 c0,1.6487999-1.393898,2.9911003-3.1062012,2.9911003h-34.422596C8.5049515,54.8572006,7.1110516,53.5149002,7.1110516,51.8661003z M56.8888474,59.1567993c0,1.550602-1.3055,2.8115005-2.9096985,2.8115005h-32.783699 c-1.6042004,0-2.9097996-1.2608986-2.9097996-2.8115005v-2.2678986h26.3541946 c2.8333015,0,5.1379013-2.2530022,5.1379013-5.0228004V11.1275997c0.0769005,0.0186005,0.1504021,0.0469999,0.2331009,0.0469999 h3.9682999c1.6041985,0,2.9096985,1.2609005,2.9096985,2.8115005V59.1567993z"></path> <path d="M38.6031494,13.2063999H16.253952c-0.5615005,0-1.0159006,0.4542999-1.0159006,1.0158005 c0,0.5615997,0.4544001,1.0158997,1.0159006,1.0158997h22.3491974c0.5615005,0,1.0158997-0.4542999,1.0158997-1.0158997 C39.6190491,13.6606998,39.16465,13.2063999,38.6031494,13.2063999z"></path> <path d="M38.6031494,21.3334007H16.253952c-0.5615005,0-1.0159006,0.4542999-1.0159006,1.0157986 c0,0.5615005,0.4544001,1.0159016,1.0159006,1.0159016h22.3491974c0.5615005,0,1.0158997-0.454401,1.0158997-1.0159016 C39.6190491,21.7877007,39.16465,21.3334007,38.6031494,21.3334007z"></path> <path d="M38.6031494,29.4603004H16.253952c-0.5615005,0-1.0159006,0.4543991-1.0159006,1.0158997 s0.4544001,1.0158997,1.0159006,1.0158997h22.3491974c0.5615005,0,1.0158997-0.4543991,1.0158997-1.0158997 S39.16465,29.4603004,38.6031494,29.4603004z"></path> <path d="M28.4444485,37.5872993H16.253952c-0.5615005,0-1.0159006,0.4543991-1.0159006,1.0158997 s0.4544001,1.0158997,1.0159006,1.0158997h12.1904964c0.5615025,0,1.0158005-0.4543991,1.0158005-1.0158997 S29.0059509,37.5872993,28.4444485,37.5872993z"></path> 
            </g> </g>
            </svg>
        `));
        copyBtn.className = 'btn-xs';
        copyBtn.onclick =() => {
            recordAnalytics('copied');
            let text = prompt.body || '';
            if (prompt.tone) {
                text += `\nTone (${prompt.tone.option}): ${prompt.tone.instruction}`;
            }
            if (prompt.format) {
                text += `\nFormat (${prompt.format.option}): ${prompt.format.instruction}`;
            }
            navigator.clipboard.writeText(text);
        };

        const editBtn = document.createElement('button');
        editBtn.className = 'btn-xs';
        editBtn.appendChild(createSvgImage(`<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-xl-heavy">
                                                <path d="M15.6729 3.91287C16.8918 2.69392 18.8682 2.69392 20.0871 3.91287C21.3061 5.13182 21.3061 7.10813 20.0871 8.32708L14.1499 14.2643C13.3849 15.0293 12.3925 15.5255 11.3215 15.6785L9.14142 15.9899C8.82983 16.0344 8.51546 15.9297 8.29289 15.7071C8.07033 15.4845 7.96554 15.1701 8.01005 14.8586L8.32149 12.6785C8.47449 11.6075 8.97072 10.615 9.7357 9.85006L15.6729 3.91287ZM18.6729 5.32708C18.235 4.88918 17.525 4.88918 17.0871 5.32708L11.1499 11.2643C10.6909 11.7233 10.3932 12.3187 10.3014 12.9613L10.1785 13.8215L11.0386 13.6986C11.6812 13.6068 12.2767 13.3091 12.7357 12.8501L18.6729 6.91287C19.1108 6.47497 19.1108 5.76499 18.6729 5.32708ZM11 3.99929C11.0004 4.55157 10.5531 4.99963 10.0008 5.00007C9.00227 5.00084 8.29769 5.00827 7.74651 5.06064C7.20685 5.11191 6.88488 5.20117 6.63803 5.32695C6.07354 5.61457 5.6146 6.07351 5.32698 6.63799C5.19279 6.90135 5.10062 7.24904 5.05118 7.8542C5.00078 8.47105 5 9.26336 5 10.4V13.6C5 14.7366 5.00078 15.5289 5.05118 16.1457C5.10062 16.7509 5.19279 17.0986 5.32698 17.3619C5.6146 17.9264 6.07354 18.3854 6.63803 18.673C6.90138 18.8072 7.24907 18.8993 7.85424 18.9488C8.47108 18.9992 9.26339 19 10.4 19H13.6C14.7366 19 15.5289 18.9992 16.1458 18.9488C16.7509 18.8993 17.0986 18.8072 17.362 18.673C17.9265 18.3854 18.3854 17.9264 18.673 17.3619C18.7988 17.1151 18.8881 16.7931 18.9393 16.2535C18.9917 15.7023 18.9991 14.9977 18.9999 13.9992C19.0003 13.4469 19.4484 12.9995 20.0007 13C20.553 13.0004 21.0003 13.4485 20.9999 14.0007C20.9991 14.9789 20.9932 15.7808 20.9304 16.4426C20.8664 17.116 20.7385 17.7136 20.455 18.2699C19.9757 19.2107 19.2108 19.9756 18.27 20.455C17.6777 20.7568 17.0375 20.8826 16.3086 20.9421C15.6008 21 14.7266 21 13.6428 21H10.3572C9.27339 21 8.39925 21 7.69138 20.9421C6.96253 20.8826 6.32234 20.7568 5.73005 20.455C4.78924 19.9756 4.02433 19.2107 3.54497 18.2699C3.24318 17.6776 3.11737 17.0374 3.05782 16.3086C2.99998 15.6007 2.99999 14.7266 3 13.6428V10.3572C2.99999 9.27337 2.99998 8.39922 3.05782 7.69134C3.11737 6.96249 3.24318 6.3223 3.54497 5.73001C4.02433 4.7892 4.78924 4.0243 5.73005 3.54493C6.28633 3.26149 6.88399 3.13358 7.55735 3.06961C8.21919 3.00673 9.02103 3.00083 9.99922 3.00007C10.5515 2.99964 10.9996 3.447 11 3.99929Z" fill="currentColor"></path>
                                            </svg>`));
        editBtn.onclick = () => {
            recordAnalytics('edited');
            openEditModal(prompt);
        };

        const delBtn = document.createElement('button');
        delBtn.appendChild(createSvgImage(`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-md" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.5555 4C10.099 4 9.70052 4.30906 9.58693 4.75114L9.29382 5.8919H14.715L14.4219 4.75114C14.3083 4.30906 13.9098 4 13.4533 4H10.5555ZM16.7799 5.8919L16.3589 4.25342C16.0182 2.92719 14.8226 2 13.4533 2H10.5555C9.18616 2 7.99062 2.92719 7.64985 4.25342L7.22886 5.8919H4C3.44772 5.8919 3 6.33961 3 6.8919C3 7.44418 3.44772 7.8919 4 7.8919H4.10069L5.31544 19.3172C5.47763 20.8427 6.76455 22 8.29863 22H15.7014C17.2354 22 18.5224 20.8427 18.6846 19.3172L19.8993 7.8919H20C20.5523 7.8919 21 7.44418 21 6.8919C21 6.33961 20.5523 5.8919 20 5.8919H16.7799ZM17.888 7.8919H6.11196L7.30423 19.1057C7.3583 19.6142 7.78727 20 8.29863 20H15.7014C16.2127 20 16.6417 19.6142 16.6958 19.1057L17.888 7.8919ZM10 10C10.5523 10 11 10.4477 11 11V16C11 16.5523 10.5523 17 10 17C9.44772 17 9 16.5523 9 16V11C9 10.4477 9.44772 10 10 10ZM14 10C14.5523 10 15 10.4477 15 11V16C15 16.5523 14.5523 17 14 17C13.4477 17 13 16.5523 13 16V11C13 10.4477 13.4477 10 14 10Z" fill="currentColor"></path></svg>`));
        delBtn.className = 'btn-xs delete';
        delBtn.onclick = () => {
            if (confirm(`Delete prompt "${prompt.title}"?`)) {
                recordAnalytics('deleted');
                deletePrompt(prompt.promptId)
                    .then(() => renderPromptList())
                    .catch((err) => {
                        console.warn('PromptMate: delete failed', err);
                        alert('Failed to delete prompt. See console.');
                    });
            }
        };

        actions.append(useBtn, copyBtn, editBtn, delBtn);
        item.appendChild(actions);
        return item;
    }

    function createPromptModal(isEdit) {
        if (document.getElementById('promptmate-modal')) return;
        let title = isEdit == true ? 'Edit Prompt' : 'New Prompt';
        
        const modal = document.createElement('div');
        modal.id = 'promptmate-modal';
        modal.className = 'fixed  z-modal  inset-0  grid  items-center  justify-items-center  bg-black  bg-opacity-50  backdrop-brightness-75  overflow-y-auto  md:p-10  p-4  data-[state=&quot;open&quot;]:animate-[fade_250ms_ease-in_forwards]  data-[state=&quot;closed&quot;]:animate-[fade_125ms_ease-out_reverse_forwards]';
        modal.innerHTML = `
                            <div class="flex  flex-col  focus:outline-none  relative  text-text-100  text-left  shadow-xl  border-0.5  border-border-300  rounded-2xl  md:p-6  p-4  align-middle  data-[state=&quot;open&quot;]:animate-[zoom_250ms_ease-in_forwards]  data-[state=&quot;closed&quot;]:animate-[zoom_125ms_ease-out_reverse_forwards] min-w-0 w-full max-w-lg bg-bg-200">
                                <div class="flex flex-col min-h-full">
                                    <div class="flex items-center gap-4 justify-between">
                                        <h2 id="radix-:rb8:" class="font-styrene-display text-text-100 flex w-full min-w-0 items-center text-lg font-medium leading-6 break-words">
                                            <div class="text-text-200 font-copernicus text-xl font-medium tracking-tight">${title}</div>
                                        </h2>
                                        <div class="flex items-center gap-2">
                                            <button id="btn-close" class="text-text-500 hover:text-text-400 hover:bg-bg-300 -ml-2 rounded-full px-2 py-2 transition-colors">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
                                                    <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"></path>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div class="flex flex-col gap-3">
                                        <div id="modal-fields"></div>
                                        <div class="flex justify-end gap-3 mt-4">
                                        <button id="cancel-btn" class="btn rounded bg-bg-400 px-2 hover:bg-bg-300">Cancel</button>
                                        <button id="save-btn" class="btn bg-accent-main-000 text-white px-3 py-1 rounded">Save</button>
                                    </div>
                                </div>   
                            `;

        const fields = modal.querySelector('#modal-fields');
        fields.append(
            makeClaudeInputField({ id: 'pm-title', label: 'Title', placeholder: 'E.g. Improve tone' }),
            makeClaudeSelectField({ id: 'pm-tone', label: 'Tone', options: TONE_OPTIONS }),
            makeClaudeSelectField({ id: 'pm-format', label: 'Format', options: FORMAT_OPTIONS }),
            makeClaudeInputField({ id: 'pm-prompt-body', label: 'Prompt', type: 'textarea', placeholder: 'Write your prompt here…' })
        );

        modal.querySelector('#cancel-btn').onclick = () => modal.remove();
        modal.querySelector('#btn-close').onclick = () => modal.remove();
        modal.querySelector('#save-btn').onclick = () => onSavePrompt(modal);

        document.body.appendChild(modal);
    }

    function openPromptModal(isEdit) {
        createPromptModal(isEdit);
    }

    function openEditModal(prompt) {
        openPromptModal(true);
        const modal = document.getElementById('promptmate-modal');
        modal.dataset.editId = prompt.promptId;
        document.getElementById('pm-title').value = prompt.title;
        document.getElementById('pm-prompt-body').value = prompt.body || '';
        document.getElementById('pm-tone').value = prompt.tone?.option || '';
        document.getElementById('pm-format').value = prompt.format?.option || '';
    }

    function onSavePrompt(modal) {
        const id = modal.dataset.editId;
        const title = document.getElementById('pm-title').value.trim();
        const bodyText = document.getElementById('pm-prompt-body').value.trim();
        const toneOpt = TONE_OPTIONS.find(t => t.option === document.getElementById('pm-tone').value);
        const formatOpt = FORMAT_OPTIONS.find(f => f.option === document.getElementById('pm-format').value);

        if (!title || !bodyText) {
            alert('Please fill in all fields.');
            return;
        }

        if (id) recordAnalytics('edited');
        else recordAnalytics('created');

        savePrompt({
            promptId: id || undefined,
            title,
            body: bodyText,
            tone: toneOpt,
            format: formatOpt,
        })
            .then(() => {
                renderPromptList();
                modal.remove();
            })
            .catch((err) => {
                console.warn('PromptMate: save failed', err);
                alert('Failed to save prompt. See console.');
            });
    }

    function bootstrap() {
        const header = document.querySelector('header');
        if (header) injectHeaderButton();
        else injectAbsoluteButton();
    }

    document.addEventListener('DOMContentLoaded', bootstrap);
    new MutationObserver(bootstrap).observe(document.body, { childList: true, subtree: true });
})();
