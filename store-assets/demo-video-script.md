# OAuth verification demo video — shot list

Required by Google when requesting verification for sensitive scopes (`drive.appdata`). Upload as **Unlisted** on YouTube and paste the link into the OAuth consent screen verification form.

## Goals the video must satisfy (from Google's verification rubric)

1. Show the full OAuth flow, including the consent screen listing the scopes being requested.
2. Demonstrate **each requested scope in actual use** within the app.
3. Show the app's **URL/domain** on screen so Google can tie the demo to the submitted OAuth client.
4. Speak or caption each action so it's clear what's happening.

Videos that skip step 2 — i.e. show sign-in but not scope usage — are the single most common cause of rejection. Make sure the Drive file creation moment is unmistakable.

## Target length

60–90 seconds. Google reviewers watch a lot of these.

## Setup before recording

- Fresh Chrome profile (no existing PromptMate sign-in) so the consent screen appears.
- PromptMate loaded from the CWS-submission zip, not a dev build.
- A second browser tab open to drive.google.com signed into the same Google account — you'll flip to it to prove the file actually landed in Drive.
- Screen recorder at 1080p or higher. OBS, Loom, or Windows Game Bar all fine.
- Optional: script the voiceover in advance and read it, or add caption text in post — Google accepts either.

## Shot list

### 1. Identify the app (5 sec)

- Open `chrome://extensions`, point at the PromptMate card.
- Voiceover/caption: *"This is PromptMate, a Chrome extension for ChatGPT and Claude. Extension ID: pkggmbahngamfhcecegpchijdgfbfbkd."*

### 2. Show the extension loading into a host site (5 sec)

- Navigate to `https://chatgpt.com`.
- Point at the "PromptMate" button in the header.
- Voiceover/caption: *"PromptMate adds a sidebar to ChatGPT and Claude."*

### 3. Trigger sign-in and show the consent screen (15 sec)

- Click the PromptMate button → sidebar opens → click "Sign in with Google".
- Google's OAuth consent screen appears.
- **Slow down here.** Hover or highlight the line that lists:
  - "See, create, and delete its own configuration data in your Google Drive." (`drive.appdata`)
  - "See your primary Google Account email address." (`userinfo.email`)
- Voiceover/caption: *"PromptMate requests two scopes: hidden app-data storage for the user's prompts, and your email for display in the sidebar."*
- Click "Allow".

### 4. Create a prompt — demonstrates `drive.appdata` in use (15 sec)

- Back in the sidebar, click "+ Add Prompt".
- Fill in: Title = "Demo prompt", pick any Tone + Format, Body = "Summarize this page".
- Click Save.
- Voiceover/caption: *"Saving a prompt writes a JSON file to Drive's hidden appDataFolder — only PromptMate can read it."*

### 5. Prove it landed in Drive (10 sec)

- Flip to the drive.google.com tab → Settings (gear icon) → "Manage apps".
- Scroll to PromptMate — it shows "Hidden app data". Highlight the storage count ticking up.
- Voiceover/caption: *"Drive confirms PromptMate has stored hidden app data — this is the appDataFolder."*

### 6. Use the prompt — demonstrates `scripting` and the user-facing loop (10 sec)

- Back on ChatGPT, click "Use" on the prompt card.
- Show the composed prompt text appearing in the ChatGPT input.
- Voiceover/caption: *"Clicking Use inserts the prompt into the ChatGPT input."*

### 7. Show the email display — demonstrates `userinfo.email` scope (5 sec)

- Point at the sidebar footer showing "Signed in as your.email@gmail.com".
- Voiceover/caption: *"The signed-in email is shown in the sidebar footer. It is not transmitted anywhere else."*

### 8. Show sign-out clears state (5 sec)

- Click Sign out.
- Sidebar returns to the sign-in prompt; email disappears.
- Voiceover/caption: *"Signing out clears the local cache and the cached email."*

## Caption-only alternative

If you don't want to record voiceover, add on-screen captions for each shot using your recorder's text overlay. Google explicitly allows this in their guidance.

## Upload checklist

- [ ] YouTube → set visibility to **Unlisted** (not Private — Google reviewers need to be able to open it without being added as collaborators).
- [ ] Title: `PromptMate — OAuth verification demo`.
- [ ] Description: one sentence plus a link back to https://github.com/jitangupta/PromptMate.
- [ ] Paste the video URL into the OAuth consent screen verification form.
