# Manual acceptance checklist

Automated tests do not establish live ChatGPT compatibility or image-quality improvement.

## Studio

- [ ] At 360 px, 420 px, and desktop widths, no horizontal overflow; all controls accessible.
- [ ] Keyboard: labeled inputs, visible focus, tabs switch with arrows/Home/End.
- [ ] Empty brief explains missing choices and blank build focuses concept.
- [ ] Each preset loads; editing a populated brief asks before replacing it.
- [ ] Full brief builds; incomplete briefs can build when user intentionally leaves choices open.
- [ ] Manual output edits survive brief changes; stale output has a warning and cannot be saved against a changed brief.
- [ ] Switching create/edit modes does not silently overwrite output.
- [ ] Edit mode needs both a change and preservation; reference selection is explained.
- [ ] Save/load/delete a creation prompt; reload restores draft and history.
- [ ] Clear data while a draft save is pending; reload stays cleared.
- [ ] Valid exported JSON round-trips; invalid JSON, wrong version, and oversized files show a useful error.
- [ ] Copy success and denied clipboard fallback both work.

## Installed extension, in Chrome

- [ ] Load `dist/` via `chrome://extensions`; no manifest or worker errors.
- [ ] Toolbar click opens the side panel.
- [ ] Open ChatGPT and click toolbar icon; insert into empty composer, verify full text survives editor state updates, and verify nothing is sent.
- [ ] Insert while composer already contains text; nothing is overwritten.
- [ ] Navigate between ChatGPT conversations and repeat insertion.
- [ ] On another website, insertion is refused and page fields do not change.
- [ ] If ChatGPT changes the composer selector, copying remains usable.
- [ ] No unexpected network requests from extension pages.

## Honest reporting

Report completeness as checklist coverage. Never infer actual tokens, generations saved, quota balance, generated-image quality, or successful reference attachment from the studio. Those values are not measured.
