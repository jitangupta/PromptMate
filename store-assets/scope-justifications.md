# Scope & permission justifications

Copy these into the Chrome Web Store listing ("Privacy practices" tab) and the Google Cloud OAuth consent screen ("Scopes" section). Keep the wording consistent between the two — reviewers cross-check.

## Single purpose (CWS + OAuth consent screen)

> PromptMate lets users save reusable prompts and insert them into ChatGPT and Claude with one click. Prompts are stored in the user's own Google Drive so they follow the user across devices.

## Chrome Web Store — permission justifications

Field: **"Why is this permission necessary?"** next to each entry on the "Privacy practices" tab.

### `identity` permission

> Used to sign the user in with Google through `chrome.identity.getAuthToken`. Sign-in is required so PromptMate can read and write the user's prompts in their own Google Drive. No other identity-related functionality is used.

### `storage` permission

> Used to cache the user's prompt index, their Google email (for display in the sidebar), and a write queue for offline edits in `chrome.storage.local`. The cache is cleared on sign-out. No remote storage is involved.

### `scripting` permission

> Used to programmatically insert the composed prompt into the host page's input field when the user clicks "Use" in the sidebar. The injection is scoped to the two host sites listed in `host_permissions` and runs only on user action.

### `chatgpt.com` host permission

> Injects the PromptMate sidebar and header button into ChatGPT, and writes the selected prompt into the ChatGPT prompt input. Without this permission the extension cannot attach its UI to the page.

### `claude.ai` host permission

> Injects the PromptMate sidebar and header button into Claude, and writes the selected prompt into the Claude prompt input. Without this permission the extension cannot attach its UI to the page.

## Google OAuth consent screen — scope justifications

Field: **"How will the scopes be used?"** on the OAuth consent screen.

### `https://www.googleapis.com/auth/drive.appdata`

> Stores the user's prompt files in Drive's hidden per-application `appDataFolder`. This is the durable storage for PromptMate. The scope gives the extension access only to files it creates in its own hidden folder; the user cannot see these files in drive.google.com and no other application can access them. Each prompt is a small JSON file (title, body, tone, format preset, timestamps).

### `openid` and `https://www.googleapis.com/auth/userinfo.email`

> Used once per sign-in to read the user's primary Google email address via the OpenID `userinfo` endpoint, purely so PromptMate can display "Signed in as …" in the sidebar footer. The email is cached locally in `chrome.storage.local` and cleared on sign-out. It is never transmitted anywhere else.

## Data use disclosures (CWS "Privacy practices" tab checkboxes)

Mark the following as **collected**:

- **Personally identifiable information** — the user's Google email address (display only)
- **Authentication information** — the OAuth token handled by `chrome.identity`
- **User activity** — local usage counters (created / used / copied / edited / deleted), device-local, never transmitted

Mark as **NOT collected**:

- Health, financial, location, web-browsing-history, personal-communications, website-content

Mandatory certifications (check all three):

- [x] I do not sell or transfer user data to third parties, except for the approved use cases.
- [x] I do not use or transfer user data for purposes unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Privacy policy URL

Link to the publicly hosted version of `docs/privacy-policy.md`. Same URL in both:

- CWS "Privacy practices" → Privacy policy URL
- OAuth consent screen → "App information" → Application privacy policy link
