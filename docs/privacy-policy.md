# PromptMate — Privacy Policy

_Last updated: 2026-04-18_

PromptMate is a Chrome extension that helps you save and reuse prompts on ChatGPT and Claude. This page explains what data PromptMate handles, where it's stored, and your options for deleting it.

## TL;DR

- Your prompts are stored **in your own Google Drive**, not on our servers. We don't operate a backend.
- We request access to Drive only to read and write the prompts you create in PromptMate.
- Prompt-usage counters (how many times you've created, used, or copied prompts) are kept **on your device** and never leave it unless you click "Share Analytics" to copy them to your clipboard.
- Sign out or uninstall the extension to stop all data collection. Delete the files from Drive to remove stored prompts.

## Who we are

PromptMate is an independent, open-source project maintained by Jitan Gupta.

- Source code: https://github.com/jitangupta/PromptMate
- Contact: hi@jitangupta.com

## What data PromptMate accesses

### 1. Prompt content (stored in your Google Drive)

When you create a prompt in PromptMate, we store a JSON file containing:

- The prompt title and body text you typed
- The Tone and Output Format presets you selected
- Creation and last-updated timestamps

These files live in **your own Google Drive**, inside Drive's hidden `appDataFolder` — a per-application storage area only PromptMate can read. You won't see these files in drive.google.com.

PromptMate does not upload your prompts anywhere else. No copy passes through a server we control.

### 2. Google email address (shown in the sidebar)

After sign-in, PromptMate fetches your primary Google account email via the standard OpenID `userinfo` endpoint. It's displayed in the sidebar footer so you can confirm which account you're signed into. The email is cached locally in `chrome.storage.local` and is cleared on sign-out.

### 3. OAuth authentication token

Sign-in uses Chrome's built-in `chrome.identity` API, which manages the OAuth token for us. PromptMate never reads the token from disk or transmits it anywhere other than to Google's own APIs over HTTPS.

### 4. Local usage counters (stay on your device)

PromptMate maintains simple counters in Chrome local storage for: `created`, `used`, `copied`, `edited`, `deleted`. These are incremented as you interact with the extension. They are **never transmitted** anywhere. The "Share Analytics" button in the sidebar copies a human-readable summary to your clipboard — nothing is sent over the network.

### 5. Prompt index cache

To keep the sidebar fast, PromptMate maintains a local cache of your prompt list (mirroring what's in Drive) in `chrome.storage.local`. The cache is wiped on sign-out.

## What data PromptMate does NOT access

- The chat messages, conversations, or responses on ChatGPT or Claude.
- Any file in your Google Drive outside the hidden `appDataFolder` created for PromptMate. The `drive.appdata` scope grants no access to the rest of your Drive.
- Your Google contacts, calendar, or any other Google service.
- Browsing history, cookies, or other tab content.

## Google API Services User Data Policy

PromptMate's use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the **Limited Use** requirements. Specifically:

- We only use Google user data to provide the user-facing features described above.
- We do **not** transfer this data to third parties except as necessary to provide or improve those features, comply with applicable law, or as part of a merger, acquisition, or sale of assets with notice to users.
- We do **not** use this data for advertising, including retargeting, personalized advertising, or interest-based advertising.
- We do **not** allow humans to read this data, except (a) with your affirmative consent for specific messages, (b) when necessary for security purposes, or (c) to comply with applicable law. In practice, since the data never leaves your Drive and your device, there is no server where a human could read it.

## Data retention and deletion

- **Prompt files in Drive**: kept until you delete them, either from within PromptMate or directly in Drive.
- **Cached prompt list, email, and usage counters** (on your device): cleared automatically when you sign out of PromptMate or uninstall the extension.
- **OAuth authorization**: you can revoke PromptMate's access at any time from https://myaccount.google.com/permissions. Doing so does not delete any prompt files already in Drive — those remain yours to keep or delete.

To fully remove all PromptMate data:

1. Click "Sign out" in the sidebar footer.
2. Uninstall the extension from `chrome://extensions`.
3. At https://myaccount.google.com/permissions, revoke PromptMate's access. This also removes the hidden `appDataFolder` contents on Google's side.

## Children's privacy

PromptMate is not directed at children under 13. We do not knowingly collect data from children under 13.

## Changes to this policy

Material changes will be reflected in the "Last updated" date at the top of this page and, where appropriate, announced in the extension's Chrome Web Store release notes.

## Contact

Questions about this policy, or data deletion requests beyond the self-service steps above: hi@jitangupta.com.
