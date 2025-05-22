// This file will contain common UI logic for the extension.
import { loadPrompts, savePrompts, recordAnalytics, shareAnalytics, TONE_OPTIONS, FORMAT_OPTIONS } from './business.js';
// Utility functions will be imported as needed, or passed via config.

export function createSidebar(config) {
    const sb = document.createElement('div');
    sb.id = config.SIDEBAR_ID;
    sb.className = config.sidebarClasses?.join(' ') || 'sidebar fixed z-sidebar'; // Default classes

    // Inner HTML will be mostly the same, but some parts might need config
    sb.innerHTML = `
        <div class="${config.sidebarInnerDivClasses?.join(' ') || 'h-screen flex flex-col gap-3 px-0 fixed top-0 right-0 transition duration-100 border-border-300 border-l shadow-lg !bg-bg-200 lg:shadow-[inset_-4px_0px_6px_-4px_hsl(var(--always-black)/4%)]'}">
            <div id="promptmate-header" class="pm-heading">
                PromptMate
                <button class="close-btn" style="background:none;border:none;font-size:18px;cursor:pointer;">×</button>
            </div>
            <div id="promptmate-list" class="pm-list"></div>
            <button id="add-prompt-btn" class="btn-pm">+ Add Prompt</button>
            <button id="pm-share-analytics" class="btn-analytics">Share Analytics</button>
        </div>
    `;

    const closeBtn = sb.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => toggleSidebar(config));
    } else {
        console.error(`[PromptMate] ui-manager.js: Close button not found in sidebar for ID '${config.SIDEBAR_ID}'.`);
    }
    
    const addPromptBtn = sb.querySelector('#add-prompt-btn');
    if (addPromptBtn) {
        addPromptBtn.addEventListener('click', () => openPromptModal(config));
    } else {
        console.error(`[PromptMate] ui-manager.js: Add prompt button not found in sidebar for ID '${config.SIDEBAR_ID}'.`);
    }

    const shareAnalyticsBtn = sb.querySelector('#pm-share-analytics');
    if (shareAnalyticsBtn) {
        shareAnalyticsBtn.addEventListener('click', () => {
            shareAnalytics((summary, error) => {
                if (chrome.runtime.lastError) { // Handles errors from chrome.storage.local.get itself
                    console.error("[PromptMate] ui-manager.js: Error fetching analytics for sharing:", chrome.runtime.lastError.message);
                    showNotification(config, `Error fetching analytics: ${chrome.runtime.lastError.message}`, 'error');
                    return;
                }
                if (summary) {
                    if (error) { // Error during clipboard write
                        showNotification(config, `Analytics summary: ${summary} (Failed to copy to clipboard: ${error.message})`, 'info', 5000);
                    } else {
                        showNotification(config, `Analytics copied to clipboard! ${summary}`, 'success', 4000);
                    }
                } else if (error) { // Only error, no summary (e.g. storage.local.get failed and passed error to callback)
                     showNotification(config, `Failed to retrieve analytics: ${error.message}`, 'error');
                } else { // Should not happen if business.js callback logic is correct
                     showNotification(config, `An unexpected issue occurred while sharing analytics.`, 'error');
                }
            });
        });
    } else {
        console.error(`[PromptMate] ui-manager.js: Share analytics button not found in sidebar for ID '${config.SIDEBAR_ID}'.`);
    }
    
    const container = document.querySelector(config.MAIN_CONTENT_SELECTOR);
    if (container) {
        container.appendChild(sb);
    } else {
        console.warn(`[PromptMate] ui-manager.js: Main content selector '${config.MAIN_CONTENT_SELECTOR}' not found. Appending sidebar to body as fallback.`);
        document.body.appendChild(sb); 
    }
    
    renderPromptList(config);
    return sb;
}

export function toggleSidebar(config) {
    let sidebar = document.getElementById(config.SIDEBAR_ID);
    if (!sidebar) {
        // Attempt to create sidebar if it doesn't exist.
        console.warn(`[PromptMate] ui-manager.js: Sidebar element with ID '${config.SIDEBAR_ID}' not found, attempting to create.`);
        sidebar = createSidebar(config); // createSidebar should return the sidebar element or null/undefined if it fails
        if (!sidebar) { // If createSidebar failed
            console.error(`[PromptMate] ui-manager.js: Sidebar element with ID '${config.SIDEBAR_ID}' could not be created or found in toggleSidebar.`);
            return; // Exit if sidebar cannot be obtained
        }
    }

    const isOpen = sidebar.classList.toggle('show');
    // Ensure firstChild is queried only if sidebar itself is valid.
    const firstChild = sidebar ? sidebar.querySelector('div:first-child') : null; 

    if (!firstChild && sidebar) { // Only log error if sidebar exists but inner div doesn't
        console.error(`[PromptMate] ui-manager.js: Sidebar inner container (first div child) not found for ID '${config.SIDEBAR_ID}'. Styling might be incorrect.`);
        // Depending on how critical this firstChild is, you might return or allow partial functionality.
        // For Claude, firstChild is essential for width animation.
    }

    if (config.siteName === 'Claude') { 
        if (firstChild) { // Only proceed if firstChild is found for Claude
            if (isOpen) {
                firstChild.style.width = '17rem';
                firstChild.classList.add('shadow-lg', '!bg-bg-200', 'lg:shadow-[inset_-4px_0px_6px_-4px_hsl(var(--always-black)/4%)]');
                firstChild.style.transition = 'width 0.3s ease';
                sidebar.style.width = '17rem'; 
            } else {
                firstChild.style.width = '0';
                firstChild.classList.remove('shadow-lg', '!bg-bg-200', 'lg:shadow-[inset_-4px_0px_6px_-4px_hsl(var(--always-black)/4%)]');
                firstChild.style.transition = 'width 0.3s ease';
                sidebar.style.width = '0'; 
            }
        } else if (sidebar) { // If sidebar exists but not firstChild, log specific error for Claude
             console.error(`[PromptMate] ui-manager.js: Critical inner div for Claude sidebar animations missing for ID '${config.SIDEBAR_ID}'.`);
        }
    } else if (config.siteName === 'GPT') { 
        const layout = document.querySelector(config.LAYOUT_SELECTOR);
        if (layout) {
            layout.style.transition = "margin-right 0.3s ease";
            layout.style.marginRight = isOpen ? (config.sidebarWidth || "260px") : "";
        } else {
            console.error(`[PromptMate] ui-manager.js: GPT layout selector '${config.LAYOUT_SELECTOR}' not found. Sidebar may not integrate correctly.`);
        }
    }
}

// renderPromptList - populates the list of prompts
export function renderPromptList(config) {
    const listEl = document.getElementById('promptmate-list'); 
    if (!listEl) {
        console.error("[PromptMate] ui-manager.js: Prompt list element ('promptmate-list') not found.");
        return;
    }

    listEl.innerHTML = '';
    loadPrompts(prompts => {
        prompts.forEach(p => {
            const promptItem = createPromptItem(p, config);
            if (promptItem) { 
                listEl.appendChild(promptItem);
            }
        });
    });
}

// createPromptItem - creates a single prompt item element
export function createPromptItem(prompt, config) {
    // Check for essential parts of the config needed by this function
    if (!config || typeof config.usePromptHandler !== 'function' || !config.utility || typeof config.utility.createSvgImage !== 'function') {
        console.error("[PromptMate] ui-manager.js: Invalid config for createPromptItem. Missing usePromptHandler or utility.createSvgImage.", {configExists: !!config, usePromptHandlerExists: typeof config?.usePromptHandler === 'function', utilityExists: !!config?.utility, createSvgImageExists: typeof config?.utility?.createSvgImage === 'function'});
        return null; // Cannot create item without essential config
    }
     if (!config.copyIconSvg || !config.editIconSvg || !config.deleteIconSvg) {
        console.warn("[PromptMate] ui-manager.js: One or more SVG icons are missing in config for createPromptItem. Buttons may look empty.");
    }


    const item = document.createElement('div');
    // Ensure promptItemClasses exists and is an array before joining, or use a fallback.
    item.className = Array.isArray(config.promptItemClasses) ? config.promptItemClasses.join(' ') : 'prompt-item bg-bg-000'; 

    const titleEl = document.createElement('h3');
    titleEl.textContent = prompt.title;
    titleEl.style.fontSize = '16px'; // Consider moving to classes in config
    item.appendChild(titleEl);

    const preview = document.createElement('p');
    preview.textContent = prompt.promptBody.length > 40 ? prompt.promptBody.slice(0, 40) + '…' : prompt.promptBody;
    preview.style.fontSize = '14px'; // Consider moving to classes in config
    preview.style.color = '#555';   // Consider moving to classes in config
    item.appendChild(preview);

    const actions = document.createElement('div');
    actions.style.marginTop = '0.5rem';    // Consider moving to classes in config
    actions.style.display = 'flex';       // Consider moving to classes in config
    actions.style.gap = '0.5rem';         // Consider moving to classes in config

    const useBtn = document.createElement('button');
    useBtn.textContent = 'Use';
    useBtn.className = config.useButtonClasses?.join(' ') || 'bg-accent-main-000 btn-xs use'; 
    useBtn.style.color = 'white'; // Example, can be part of classes
    useBtn.onclick = () => {
        recordAnalytics('used');
        // usePromptHandler is expected to handle its own DOM checks
        config.usePromptHandler(prompt);
    };

    const copyBtn = document.createElement('button');
    // Use utility.createSvgImage if SVG string is provided, otherwise text
    if (config.copyIconSvg && typeof config.copyIconSvg === 'string' && config.copyIconSvg.trim().startsWith('<svg')) {
        copyBtn.appendChild(config.utility.createSvgImage(config.copyIconSvg));
    } else {
        copyBtn.textContent = 'Copy';
    }
    copyBtn.className = config.copyButtonClasses?.join(' ') || 'btn-xs'; 
    copyBtn.onclick = () => {
        recordAnalytics('copied');
        let text = prompt.promptBody;
        if (prompt.tone) {
            text += `\nTone (${prompt.tone.option}): ${prompt.tone.instruction}`;
        }
        if (prompt.format) {
            text += `\nFormat (${prompt.format.option}): ${prompt.format.instruction}`;
        }
        navigator.clipboard.writeText(text).catch(err => console.error("[PromptMate] Clipboard write failed:", err));
    };

    const editBtn = document.createElement('button');
    if (config.editIconSvg && typeof config.editIconSvg === 'string' && config.editIconSvg.trim().startsWith('<svg')) {
        editBtn.appendChild(config.utility.createSvgImage(config.editIconSvg));
    } else {
        editBtn.textContent = 'Edit';
    }
    editBtn.className = config.editButtonClasses?.join(' ') || 'btn-xs';
    editBtn.onclick = () => {
        recordAnalytics('edited');
        openEditModal(prompt, config); 
    };

    const delBtn = document.createElement('button');
    if (config.deleteIconSvg && typeof config.deleteIconSvg === 'string' && config.deleteIconSvg.trim().startsWith('<svg')) {
        delBtn.appendChild(config.utility.createSvgImage(config.deleteIconSvg));
    } else {
        delBtn.textContent = 'Delete';
    }
    delBtn.className = config.deleteButtonClasses?.join(' ') || 'btn-xs delete';
    delBtn.onclick = () => {
        if (confirm(`Delete prompt "${prompt.title}"?`)) {
            recordAnalytics('deleted');
            loadPrompts(list => {
                const updated = list.filter(p => p.id !== prompt.id);
                savePrompts(updated);
                renderPromptList(config); 
            });
        }
    };

    actions.append(useBtn, copyBtn, editBtn, delBtn);
    item.appendChild(actions);
    return item;
}


// createPromptModal - creates the modal for adding/editing prompts
export function createPromptModal(config, isEdit = false) {
    if (document.getElementById(config.MODAL_ID)) {
        console.warn(`[PromptMate] ui-manager.js: Modal with ID '${config.MODAL_ID}' already exists.`);
        return document.getElementById(config.MODAL_ID); // Return existing modal
    }
    let title = isEdit ? 'Edit Prompt' : 'New Prompt';

    const modal = document.createElement('div');
    modal.id = config.MODAL_ID;
    modal.className = Array.isArray(config.modalContainerClasses) ? config.modalContainerClasses.join(' ') : 'fixed z-modal inset-0 grid items-center justify-items-center bg-black bg-opacity-50 backdrop-brightness-75 overflow-y-auto md:p-10 p-4';
    
    modal.innerHTML = `
        <div class="${Array.isArray(config.modalDialogClasses) ? config.modalDialogClasses.join(' ') : 'flex flex-col focus:outline-none relative text-text-100 text-left shadow-xl border-0.5 border-border-300 rounded-2xl md:p-6 p-4 align-middle min-w-0 w-full max-w-lg bg-bg-200'}">
            <div class="flex flex-col min-h-full">
                <div class="${Array.isArray(config.modalHeaderClasses) ? config.modalHeaderClasses.join(' ') : 'flex items-center gap-4 justify-between'}">
                    <h2 class="${Array.isArray(config.modalTitleClasses) ? config.modalTitleClasses.join(' ') : 'font-styrene-display text-text-100 flex w-full min-w-0 items-center text-lg font-medium leading-6 break-words'}">
                        <div class="text-text-200 font-copernicus text-xl font-medium tracking-tight">${title}</div>
                    </h2>
                    <div class="flex items-center gap-2">
                        <button id="btn-close-modal" class="${Array.isArray(config.modalCloseBtnClasses) ? config.modalCloseBtnClasses.join(' ') : 'text-text-500 hover:text-text-400 hover:bg-bg-300 -ml-2 rounded-full px-2 py-2 transition-colors'}">
                            ${(config.closeIconSvg && typeof config.closeIconSvg === 'string' && config.closeIconSvg.trim().startsWith('<svg')) ? config.closeIconSvg : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"></path></svg>'}
                        </button>
                    </div>
                </div>
                <div class="${Array.isArray(config.modalBodyClasses) ? config.modalBodyClasses.join(' ') : 'flex flex-col gap-3'}">
                    <div id="modal-fields"></div>
                    <div class="${Array.isArray(config.modalFooterClasses) ? config.modalFooterClasses.join(' ') : 'flex justify-end gap-3 mt-4'}">
                        <button id="cancel-btn-modal" class="${Array.isArray(config.modalCancelBtnClasses) ? config.modalCancelBtnClasses.join(' ') : 'btn rounded bg-bg-400 px-2 hover:bg-bg-300'}">Cancel</button>
                        <button id="save-btn-modal" class="${Array.isArray(config.modalSaveBtnClasses) ? config.modalSaveBtnClasses.join(' ') : 'btn bg-accent-main-000 text-white px-3 py-1 rounded'}">Save</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const fieldsContainer = modal.querySelector('#modal-fields');
    if (!fieldsContainer) {
        console.error(`[PromptMate] ui-manager.js: Modal fields container ('#modal-fields') not found for modal ID '${config.MODAL_ID}'.`);
        // Cannot proceed without fields container
        return null; 
    }

    if (!config.utility || typeof config.utility.makeInputField !== 'function' || typeof config.utility.makeSelectField !== 'function') {
        console.error("[PromptMate] ui-manager.js: config.utility.makeInputField or makeSelectField is not a function. Cannot create modal fields.", config.utility);
        fieldsContainer.innerHTML = "<p style='color:red;'>Error: Field generation functions are missing.</p>";
    } else if (!config.fieldStyles || !config.fieldStyles.inputField || !config.fieldStyles.selectField) {
        console.error("[PromptMate] ui-manager.js: config.fieldStyles.inputField or .selectField is missing. Cannot style modal fields correctly.", config.fieldStyles);
        fieldsContainer.innerHTML = "<p style='color:red;'>Error: Field styling configuration is missing.</p>";
    } else {
        try {
            fieldsContainer.append(
                config.utility.makeInputField({ id: 'pm-title', label: 'Title', placeholder: 'E.g. Improve tone', fieldConfig: config.fieldStyles.inputField }),
                config.utility.makeSelectField({ id: 'pm-tone', label: 'Tone', options: TONE_OPTIONS, fieldConfig: config.fieldStyles.selectField }),
                config.utility.makeSelectField({ id: 'pm-format', label: 'Format', options: FORMAT_OPTIONS, fieldConfig: config.fieldStyles.selectField }),
                config.utility.makeInputField({ id: 'pm-prompt-body', label: 'Prompt', type: 'textarea', placeholder: 'Write your prompt here…', fieldConfig: config.fieldStyles.inputField })
            );
        } catch (e) {
            console.error("[PromptMate] ui-manager.js: Error creating modal fields:", e);
            fieldsContainer.innerHTML = `<p style='color:red;'>Error: Could not create one or more fields. ${e.message}</p>`;
        }
    }
    
    const cancelBtnModal = modal.querySelector('#cancel-btn-modal');
    if (cancelBtnModal) {
        cancelBtnModal.onclick = () => modal.remove();
    } else {
        console.error(`[PromptMate] ui-manager.js: Cancel button not found in modal ID '${config.MODAL_ID}'.`);
    }

    const closeBtnModal = modal.querySelector('#btn-close-modal');
    if (closeBtnModal) {
        closeBtnModal.onclick = () => modal.remove();
    } else {
        console.error(`[PromptMate] ui-manager.js: Close (X) button not found in modal ID '${config.MODAL_ID}'.`);
    }
    
    const saveBtnModal = modal.querySelector('#save-btn-modal');
    if (saveBtnModal) {
        saveBtnModal.onclick = () => onSavePrompt(modal, config);
    } else {
        console.error(`[PromptMate] ui-manager.js: Save button not found in modal ID '${config.MODAL_ID}'.`);
    }

    document.body.appendChild(modal);
    return modal;
}

export function openPromptModal(config, isEdit = false, promptToEdit = null) {
    const modal = createPromptModal(config, isEdit); // createPromptModal now handles if it already exists or fails
    if (!modal || !modal.id) { // Check if modal was successfully created/retrieved
        console.error("[PromptMate] ui-manager.js: Failed to create or retrieve modal in openPromptModal.");
        return; 
    }

    if (isEdit && promptToEdit) {
        modal.dataset.editId = promptToEdit.id;
        const titleField = document.getElementById('pm-title');
        const bodyField = document.getElementById('pm-prompt-body');
        const toneField = document.getElementById('pm-tone');
        const formatField = document.getElementById('pm-format');

        if (titleField) titleField.value = promptToEdit.title;
        else console.error("[PromptMate] ui-manager.js: Title field ('pm-title') not found in modal for editing.");
        
        if (bodyField) bodyField.value = promptToEdit.promptBody;
        else console.error("[PromptMate] ui-manager.js: Prompt body field ('pm-prompt-body') not found in modal for editing.");

        if (toneField) toneField.value = promptToEdit.tone?.option || ""; // Handle cases where tone might be null/undefined
        else console.error("[PromptMate] ui-manager.js: Tone field ('pm-tone') not found in modal for editing.");
        
        if (formatField) formatField.value = promptToEdit.format?.option || ""; // Handle cases where format might be null/undefined
        else console.error("[PromptMate] ui-manager.js: Format field ('pm-format') not found in modal for editing.");
    }
    
    // Standard way to show the modal (assuming it's hidden by default via CSS or class)
    if (modal.classList.contains('hidden')) { // Check if 'hidden' class is used
      modal.classList.remove('hidden');
    }
    modal.style.display = config.modalDisplay genellikle || 'grid'; // 'grid' was from Claude, make it configurable or default
}

export function openEditModal(prompt, config) {
    openPromptModal(config, true, prompt);
}

export function onSavePrompt(modal, config) {
    if (!modal) {
        console.error("[PromptMate] ui-manager.js: onSavePrompt called with no modal element.");
        return;
    }
    const id = modal.dataset.editId;

    const titleField = document.getElementById('pm-title');
    const promptBodyField = document.getElementById('pm-prompt-body');
    const toneField = document.getElementById('pm-tone');
    const formatField = document.getElementById('pm-format');

    if (!titleField || !promptBodyField || !toneField || !formatField) {
        console.error("[PromptMate] ui-manager.js: One or more fields not found in modal for saving.");
        alert('Error: Could not save prompt. Required fields are missing from the modal.');
        return;
    }

    const title = titleField.value.trim();
    const promptBody = promptBodyField.value.trim();
    const toneOptValue = toneField.value;
    const formatOptValue = formatField.value;
    
    const toneOpt = TONE_OPTIONS.find(t => t.option === toneOptValue);
    const formatOpt = FORMAT_OPTIONS.find(f => f.option === formatOptValue);

    if (!title || !promptBody) {
        // Consider a more user-friendly way to display this, perhaps in the modal itself.
        alert('Please fill in title and prompt body.'); 
        return;
    }
    if (!toneOpt || !formatOpt) {
        console.warn("[PromptMate] ui-manager.js: Tone or Format option not found for the selected value. Saving with potentially incomplete data.", {toneOptValue, formatOptValue});
        // Allow saving but warn, or prevent if these are strictly required.
        // For now, allowing save.
    }

    loadPrompts(list => {
        if (id) {
            const idx = list.findIndex(p => p.id === id);
            if (idx !== -1) {
                list[idx] = { ...list[idx], title, promptBody, tone: toneOpt, format: formatOpt };
                recordAnalytics('edited');
            } else {
                console.error(`[PromptMate] ui-manager.js: Prompt with ID '${id}' not found for editing.`);
                // Optionally, convert to new prompt creation or alert user
                // For now, just logging.
            }
        } else {
            const newPrompt = {
                id: crypto.randomUUID(),
                createdAt: new Date().toISOString(),
                title,
                promptBody,
                tone: toneOpt, 
                format: formatOpt 
            };
            list.push(newPrompt);
            recordAnalytics('created');
        }
        savePrompts(list);
        renderPromptList(config); 
        modal.remove();
    });
}

/**
 * Displays a notification message within the PromptMate UI.
 * @param {object} config - The UI configuration object for the current site.
 * @param {string} message - The message to display.
 * @param {string} [type='info'] - The type of notification ('info', 'error', 'success').
 * @param {number} [duration=3000] - How long the notification should be visible (in ms).
 */
export function showNotification(config, message, type = 'info', duration = 3000) {
    const sidebar = document.getElementById(config.SIDEBAR_ID);
    if (!sidebar) {
        console.error("[PromptMate] showNotification: Sidebar not found, cannot display notification.");
        return;
    }

    // Attempt to find a container within the sidebar, e.g., the main content area or header.
    // Let's use the main sidebar div (firstChild) or the sidebar itself as a fallback.
    let notificationContainer = sidebar.querySelector('div:first-child'); // The .pm-sidebar-inner or equivalent
    if (!notificationContainer) {
        notificationContainer = sidebar; // Fallback to the main sidebar element
    }
    
    const notificationId = `pm-notification-${Date.now()}`;
    const notificationDiv = document.createElement('div');
    notificationDiv.id = notificationId;
    notificationDiv.textContent = message;
    
    // Basic styling - can be expanded with classes from config if needed
    notificationDiv.style.padding = '10px';
    notificationDiv.style.margin = '10px'; // Margin around the notification
    notificationDiv.style.borderRadius = '5px';
    notificationDiv.style.color = 'white';
    notificationDiv.style.position = 'relative'; // For absolute positioning of close button
    notificationDiv.style.zIndex = '10001'; // Ensure it's above other sidebar content
    notificationDiv.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    notificationDiv.style.textAlign = 'center';


    switch (type) {
        case 'error':
            notificationDiv.style.backgroundColor = '#D32F2F'; // Red
            break;
        case 'success':
            notificationDiv.style.backgroundColor = '#388E3C'; // Green
            break;
        case 'info':
        default:
            notificationDiv.style.backgroundColor = '#1976D2'; // Blue
            break;
    }

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.position = 'absolute';
    closeBtn.style.right = '10px';
    closeBtn.style.top = '50%';
    closeBtn.style.transform = 'translateY(-50%)';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.color = 'white';
    closeBtn.style.fontSize = '20px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.lineHeight = '1';
    
    closeBtn.onclick = () => notificationDiv.remove();
    notificationDiv.appendChild(closeBtn);

    // Insert at the top of the container
    if (notificationContainer.firstChild) {
        notificationContainer.insertBefore(notificationDiv, notificationContainer.firstChild);
    } else {
        notificationContainer.appendChild(notificationDiv);
    }

    if (duration > 0) {
        setTimeout(() => {
            const existingNotification = document.getElementById(notificationId);
            if (existingNotification) {
                existingNotification.remove();
            }
        }, duration);
    }
}


console.log("ui-manager.js loaded with sidebar, prompt list, modal functions, notification handler. Includes enhanced DOM checks.");
