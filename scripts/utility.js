
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