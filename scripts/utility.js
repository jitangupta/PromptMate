
export function makeInputField({ id, label, type = "text", placeholder = "" }) {
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

export function makeSelectField({ id, label, options }) {
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

export function makeSignInButton({ onClick, message, loading } = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex-col gap-3 p-4 text-center';

    const heading = document.createElement('p');
    heading.className = 'text-sm text-token-text-secondary';
    heading.textContent = 'Sign in to sync your prompts with Google Drive.';
    wrapper.appendChild(heading);

    if (message) {
        const note = document.createElement('p');
        note.className = 'text-xs text-red-400';
        note.textContent = message;
        wrapper.appendChild(note);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary w-full';
    btn.textContent = loading ? 'Signing in…' : 'Sign in with Google';
    btn.disabled = !!loading;
    if (onClick) btn.addEventListener('click', onClick);
    wrapper.appendChild(btn);

    return wrapper;
}

export function makeAuthFooter({ email, onSignOut } = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center justify-between gap-2 px-3 py-2 text-xs text-token-text-secondary border-t border-token-border-secondary';

    const emailEl = document.createElement('span');
    emailEl.className = 'truncate';
    emailEl.title = email || '';
    emailEl.textContent = email || 'Signed in';
    wrapper.appendChild(emailEl);

    const signOutBtn = document.createElement('button');
    signOutBtn.type = 'button';
    signOutBtn.className = 'underline hover:text-token-text-primary';
    signOutBtn.textContent = 'Sign out';
    if (onSignOut) signOutBtn.addEventListener('click', onSignOut);
    wrapper.appendChild(signOutBtn);

    return wrapper;
}

export function createSvgImage(svgIcon){
    const encoded = encodeURIComponent(svgIcon);
    const img = document.createElement('img');
    img.src = `data:image/svg+xml;utf8,${encoded}`;
    return img;
}

export function makeClaudeInputField({ id, label, type = "text", placeholder = "" }) {
    const wrapper = document.createElement("label");
    wrapper.className = "flex flex-col gap-1 mb-3";
    wrapper.htmlFor = id;

    const lbl = document.createElement("span");
    lbl.textContent = label;
    lbl.className = "text-text-200 mb-1 block text-sm";

    const input = document.createElement(type === "textarea" ? "textarea" : "input");
    input.id = id;
    input.placeholder = placeholder;
    input.className = `
          bg-bg-000
            border
            border-border-300
            hover:border-border-200
            transition-colors
            placeholder:text-text-500
            can-focus
            disabled:cursor-not-allowed
            disabled:opacity-50 h-11 px-3 rounded-[0.6rem]
        `;
    if (type !== "textarea") input.type = type;
    else input.rows = 3;

    wrapper.append(lbl, input);
    return wrapper;
}

export function makeClaudeSignInButton({ onClick, message, loading } = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex-col gap-3 p-4 text-center';

    const heading = document.createElement('p');
    heading.className = 'text-text-200 text-sm';
    heading.textContent = 'Sign in to sync your prompts with Google Drive.';
    wrapper.appendChild(heading);

    if (message) {
        const note = document.createElement('p');
        note.className = 'text-xs text-danger-000';
        note.textContent = message;
        wrapper.appendChild(note);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inline-flex items-center justify-center text-sm px-4 py-2 rounded-lg bg-accent-main-000 text-white';
    btn.textContent = loading ? 'Signing in…' : 'Sign in with Google';
    btn.disabled = !!loading;
    if (onClick) btn.addEventListener('click', onClick);
    wrapper.appendChild(btn);

    return wrapper;
}

export function makeClaudeAuthFooter({ email, onSignOut } = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center justify-between gap-2 px-3 py-2 text-xs text-text-300 border-t border-border-300';

    const emailEl = document.createElement('span');
    emailEl.className = 'truncate';
    emailEl.title = email || '';
    emailEl.textContent = email || 'Signed in';
    wrapper.appendChild(emailEl);

    const signOutBtn = document.createElement('button');
    signOutBtn.type = 'button';
    signOutBtn.className = 'underline hover:text-text-100';
    signOutBtn.textContent = 'Sign out';
    if (onSignOut) signOutBtn.addEventListener('click', onSignOut);
    wrapper.appendChild(signOutBtn);

    return wrapper;
}

export function makeClaudeSelectField({ id, label, options }) {
    const wrapper = document.createElement('label');
    wrapper.className = 'flex flex-col gap-1 mb-3';
    wrapper.htmlFor = id;

    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.className = 'text-text-200 mb-1 block text-sm';

    const select = document.createElement('select');
    select.id = id;
    select.className = `
          text-text-100 py-0 transition-colors can-focus cursor-pointer appearance-none w-full h-11 pl-2 pr-6 rounded-[0.6rem] bg-bg-000 border border-border-300 hover:border-border-200 shadow-none w-full
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