# Privacy policy

PromptLens 0.1.0 — 20 November 2026

PromptLens has no server and collects no analytics. It does not use an API key or send drafts to a model. It makes no network requests of its own.

## Stored information

The latest creation brief and up to 30 saved creation prompts are stored in `chrome.storage.local`. In the standalone demo, they are stored in the site's `localStorage`. These stores are local, not encrypted by PromptLens, and are not synced by the application. The browser, device, or profile may have its own backup behavior. Edit-mode inputs and unsaved output are not persisted.

Brief fields are limited to 2400 Unicode codepoints by the engine; the interface limits inputs to 2400 UTF-16 code units. Stored prompt output is capped at 30,000 UTF-16 code units. Import JSON is limited to 100,000 characters; the file picker also enforces a 100,000-byte file limit. Unknown fields are ignored and malformed known fields are rejected. Export includes only the current creation brief, not history or manual prompt-output edits.

## Website interaction

The extension uses temporary `activeTab` permission following a toolbar click. Only an explicit insertion click executes an insertion function in the active tab. That function rechecks that it is on an allowed HTTPS ChatGPT origin. It checks whether the composer is empty and inserts the selected prompt as plain text. It does not read chat history, upload files, access account credentials, or send the prompt. After you send it, the receiving service's policies apply.

## Delete or move your data

Use **Удалить данные** to clear the locally stored creation draft and history, or remove the extension. In the web demo you can also clear the site's storage through your browser. JSON exports are separate local files; delete them yourself when no longer needed. Import/export is manual and does not upload files to a service.

## Changes

Any future addition of network-backed features must update this policy and explicitly describe where data goes. The current release has no such feature.
