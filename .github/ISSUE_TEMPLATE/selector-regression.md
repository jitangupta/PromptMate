---
name: Host site selector broke (ChatGPT / Claude redesign)
about: The PromptMate button disappeared or injects into the wrong place after a host site update
title: "[selector] PromptMate button missing on <chatgpt.com | claude.ai>"
labels: ["bug", "selector-regression"]
---

## Which host site
- [ ] chatgpt.com
- [ ] claude.ai

## What happened
A clear, one-line description. Example: "The PromptMate button no longer appears in the ChatGPT header after the 2026-04-10 redesign."

## Date you noticed it
YYYY-MM-DD

## Browser + extension version
- Chrome version:
- PromptMate version (from `chrome://extensions`):

## Current header DOM
Open DevTools on the host site, inspect the header area, and paste the relevant markup here (or attach a screenshot of the Elements panel).

```html
<!-- paste the header/toolbar markup where PromptMate *should* inject -->
```

## Suggested selector (optional)
If you've identified a working selector for the new DOM, paste it here:

```js
// e.g. document.querySelector('#new-header-actions-container')
```

## Anything else
Screenshots, screen recordings, or notes about when the regression started.
