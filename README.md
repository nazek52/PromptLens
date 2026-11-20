# PromptLens

**Сначала замысел. Потом генерация.**

Browser extension for people who know what an image should feel like, but don't know how to describe it. Build a visual brief, resolve missing choices, and prepare focused image edits before spending another generation in ChatGPT.

**Русский интерфейс · Offline · No API key · No runtime dependencies · Manifest V3**

> PromptLens is an independent project, not an OpenAI product. It cannot change ChatGPT limits or guarantee fewer generations. Its goal is to make your instructions more explicit. No measured token or quota savings are claimed.

## What it does

- **Five editable starting points:** anime character, portrait, product photo, environment, and logo.
- **A guided visual brief:** subject, style, composition, background, canvas proportions, lighting, colors, exact text, required details, and things to avoid.
- **Preflight questions:** identify unspecified choices and selected conflicts, including incompatible aspect ratios and transparent backgrounds with scenery.
- **Focused edits:** say exactly what to change and what to keep; use your existing image instead of repeatedly redesigning it.
- **Editable output:** generated instructions can be rewritten before copying. Changes to the brief flag stale output and prevent saving it against the wrong brief.
- **Local history:** keep up to 30 creation briefs with their manually edited prompts, restore/delete them, and import/export a brief as JSON.
- **One-click insertion:** insert into the active ChatGPT composer, then review and send yourself. Existing text is never replaced.

The completeness score is a checklist of provided choices, **not** a probability that the image will be correct. Checks are rules, not an AI understanding of your idea. They do not detect every contradiction. A short prompt can be enough when the missing choices do not matter to you.

## Install in Chrome

1. [Download the repository ZIP](https://github.com/nazek52/PromptLens/archive/refs/heads/main.zip) and extract it. The source folder is already a loadable extension; no build or dependency installation is required.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted `PromptLens-main` folder containing `manifest.json` (or `dist/` if you optionally ran `npm run build`).
4. Open [ChatGPT](https://chatgpt.com), pin PromptLens, and click its toolbar icon. The studio opens in a side panel.
5. Choose **Аниме-персонаж**, replace the sample details with your own, then click **Собрать промпт**.
6. Review the questions and output. Click **Вставить в ChatGPT** or **Скопировать**. Send only after checking the text.

Chrome 116+ is required by the manifest. Other Chromium browsers that implement `chrome.sidePanel` may work, but are not verified. There is no Chrome Web Store listing yet. No Firefox support is included.

### If insertion is unavailable

Click the toolbar icon while the ChatGPT tab is active to grant temporary tab access. If the editor changes or the browser does not support insertion, use **Скопировать**. PromptLens only recognizes `https://chatgpt.com` and `https://chat.openai.com`, on their default HTTPS ports. It does not select a chat, attach an image, submit a prompt, or read conversations.

For edits, open the conversation with your image or attach the reference yourself. Choose **Точная правка**, describe the change, and list what must remain unchanged. Reference descriptions are labels only; they do not upload a file.

## Run without installing an extension

Install Node.js 22+, then run:

```sh
npm run dev
```

Open <http://127.0.0.1:4173>. Briefs, questions, history, import/export, and copying work in the demo. ChatGPT insertion requires the installed extension. No `npm install` is needed.

## Example

Instead of just `сделай красивого аниме-персонажа`, specify choices you care about:

```text
Главный объект: взрослая героиня, короткие серебристые волосы, круглые очки
Стиль: 2D-аниме, чёткий контур, cel shading
Композиция: портрет по грудь, взгляд в камеру, место вокруг головы
Фон: простой тёмно-фиолетовый
Формат: 2:3
Детали: янтарные глаза, тёмная куртка, спокойное выражение
Избегать: надписей и дополнительных персонажей
```

If only the hair is wrong, use a targeted edit:

```text
Что изменить: сделать волосы тёмно-синими
Что сохранить: лицо, очки, причёску, позу, куртку, фон и освещение
```

Prompt section labels are English; the user's descriptions stay in the original language. PromptLens does not translate, call a model, inspect an image, or invent custom character details. Presets contain visible sample choices that should be edited before use.

## Development and verification

```sh
npm test          # Node built-in unit and integration tests
npm run check    # syntax, manifest, assets, CSP and offline checks
npm run build    # unpacked extension in dist/
```

The repo has no production or test package dependencies. `scripts/icons.mjs` regenerates the included PNG icons using Node built-ins.

Tests cover prompt compilation, Unicode, exclusions, selected contradictions, JSON import validation, history limits, queued storage writes, origin allowlisting, editor preservation, and insertion without submission. DOM insertion tests use mocks. **Actual insertion into the live ChatGPT editor has not been verified in this environment.** See [manual acceptance checks](docs/TESTING.md) before a public release. No empirical image-quality or quota-savings benchmark has been performed.

An optional `scripts/browser-smoke.mjs` uses an installed Chromium executable specified by `QA_CHROME` and the running local demo. It checks the studio with a disposable browser profile and can capture desktop/mobile screenshots. Its execution was blocked by process-launch restrictions in the development environment; no browser-smoke success is claimed.

## Privacy and permissions

All application logic and presets are bundled locally. There is no backend, analytics, model API, external font, tracking, or remote code. The extension CSP disables network connections.

| Permission | Purpose |
| --- | --- |
| `sidePanel` | Display the studio next to ChatGPT |
| `storage` | Save drafts and history in local extension storage |
| `activeTab` | Temporary access to the tab where you click the icon |
| `scripting` | Insert the text you explicitly choose into the composer |

There are no permanent host permissions or automatic content scripts. Although `activeTab` may temporarily grant access to another site after an icon click, the insertion handler rejects every origin outside the ChatGPT allowlist. Insertion checks only the composer for existing text, not conversation history. Data stays in `chrome.storage.local`, or this site's `localStorage` for the standalone demo. No cross-device sync is used. Clearing local data removes drafts and history; exports remain where you saved them. Do not put secrets in prompts or share exports containing private information.

See [PRIVACY.md](PRIVACY.md) for details.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/engine.js` | Pure prompt compiler and brief checks |
| `src/presets.js` | Editable example briefs |
| `src/panel.js` / `panel.css` | Accessible responsive studio |
| `src/storage.js` | Bounded local persistence and validated JSON |
| `src/chatgpt.js` | User-initiated, origin-restricted composer insertion |
| `src/background.js` | Open the panel on a toolbar click |

No image-generation API is bundled. AI-powered rephrasing, image analysis, reference uploads, Firefox support, and measured user studies are possible future work, not implemented features.

## References

The prompt structure follows the principle of making subjects, composition, constraints, and preservation instructions explicit:

- [OpenAI: Image prompting](https://developers.openai.com/api/docs/guides/image-prompting)
- [OpenAI Academy: Creating images with ChatGPT](https://openai.com/academy/image-generation/)
- [Chrome Extensions: Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

MIT © 2026 Rymbek Nazerke
