---
description: Build and package the extension for Chrome Web Store upload.
allowed-tools: Bash(npm run release), Bash(ls:*), Read
---

Run `npm run release` — this executes `npm run build` followed by `npm run build:package`, which copies `dist/`, `icons/`, `popup/`, and `manifest.json` into `promptmate-dist/` and zips the output.

After the command completes:

1. List the contents of `promptmate-dist/` to confirm the zip was created.
2. Report the absolute path of the zip file — that's what gets uploaded to the Chrome Web Store dashboard.
3. Print the current `manifest.json` version so the user can cross-check it matches the release they intend to ship.

If the build or packaging fails, surface the error and stop — do not retry silently.
