
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