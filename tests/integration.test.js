import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { isChatGPTUrl, insertIntoChatGPT, insertPromptInPage } from '../src/chatgpt.js';
import { getState, saveDraft, saveHistory, deleteHistory, clearAll, exportProject, importProject } from '../src/storage.js';

function localStore(initial = null) {
  let stored = initial;
  return {
    getItem: () => stored,
    setItem: (_key, value) => { stored = value; },
    value: () => stored,
  };
}

test('only exact HTTPS ChatGPT origins are authorized', () => {
  for (const url of ['https://chatgpt.com/', 'https://chatgpt.com/c/123', 'https://chat.openai.com/', 'https://chatgpt.com:443/']) assert.equal(isChatGPTUrl(url), true, url);
  for (const url of ['http://chatgpt.com/', 'https://chatgpt.com:8443/', 'https://chatgpt.com.evil.test/', 'https://evil.test/chatgpt.com', 'https://chatgpt.com@evil.test/', 'https://sub.chatgpt.com', 'javascript:alert(1)', null, '']) assert.equal(isChatGPTUrl(url), false, String(url));
});

test('project JSON round-trips Unicode and keeps markup inert while discarding unknown fields', () => {
  const brief = { idea: 'Anime heroine 🌙', text: 'Сәлем, Назерке', details: '<img src=x onerror="throw 1">', apiKey: 'must-not-export' };
  const serialized = exportProject(brief);
  assert.equal(serialized.includes('must-not-export'), false);
  const parsed = importProject(serialized);
  assert.equal(parsed.text, brief.text);
  assert.equal(parsed.details, brief.details);
  assert.equal('apiKey' in parsed, false);
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
});

test('imports reject malformed, oversized, wrong-version and non-string known fields', () => {
  for (const input of ['{', 'x'.repeat(100001), JSON.stringify({ format: 'other', version: 1, brief: {} }), JSON.stringify({ format: 'promptlens', version: 2, brief: {} }), JSON.stringify({ format: 'promptlens', version: 1, brief: [] }), JSON.stringify({ format: 'promptlens', version: 1, brief: { idea: 3 } })]) assert.throws(() => importProject(input));
});

test('local storage recovers a damaged JSON state and clearAll remains usable', async () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = localStore('{broken');
  try {
    const state = await getState();
    assert.equal(state.draft.idea, '');
    assert.deepEqual(state.history, []);
    await clearAll();
    assert.doesNotThrow(() => JSON.parse(localStorage.value()));
  } finally { globalThis.localStorage = previous; }
});

test('queued saves retain the latest draft and all independent history entries', async () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = localStore();
  try {
    await Promise.all([
      saveDraft({ idea: 'First' }),
      saveHistory({ id: 'first', name: 'First', brief: { idea: 'First' }, prompt: 'Create first image' }),
      saveDraft({ idea: 'Second' }),
      saveHistory({ id: 'second', name: 'Second', brief: { idea: 'Second' }, prompt: 'Create second image' }),
    ]);
    let state = await getState();
    assert.equal(state.draft.idea, 'Second');
    assert.deepEqual(state.history.map(entry => entry.id), ['second', 'first']);
    await saveHistory({ id: 'first', name: 'Updated', brief: {}, prompt: 'Edited prompt' });
    state = await getState();
    assert.deepEqual(state.history.map(entry => entry.id), ['first', 'second']);
    assert.equal(state.history[0].prompt, 'Edited prompt');
    await deleteHistory('first');
    assert.deepEqual((await getState()).history.map(entry => entry.id), ['second']);
    await clearAll();
    assert.equal((await getState()).draft.idea, '');
    assert.deepEqual((await getState()).history, []);
  } finally { globalThis.localStorage = previous; }
});

test('history is bounded and invalid saves do not poison later operations', async () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = localStore();
  try {
    await assert.rejects(saveHistory({ prompt: ' ' }));
    for (let i = 0; i < 33; i++) await saveHistory({ id: String(i), prompt: 'Prompt ' + i, brief: {} });
    const { history } = await getState();
    assert.equal(history.length, 30);
    assert.equal(history[0].id, '32');
    assert.equal(history.at(-1).id, '3');
  } finally { globalThis.localStorage = previous; }
});

test('chrome.storage.local is preferred over web demo storage', async () => {
  const previousChrome = globalThis.chrome;
  const previousLocal = globalThis.localStorage;
  let state = {};
  let writes = 0;
  globalThis.localStorage = { getItem() { throw new Error('Should not access localStorage in extension'); } };
  globalThis.chrome = { storage: { local: {
    async get() { return structuredClone(state); },
    async set(value) { state = structuredClone(value); writes++; },
  } } };
  try {
    await saveDraft({ idea: 'Private local draft' });
    assert.equal((await getState()).draft.idea, 'Private local draft');
    assert.equal(writes, 1);
  } finally { globalThis.chrome = previousChrome; globalThis.localStorage = previousLocal; }
});

test('insertion requires a valid prompt and active ChatGPT tab, and never calls scripting on another origin', async () => {
  const previous = globalThis.chrome;
  let executions = 0;
  globalThis.chrome = { tabs: { async query() { return [{ id: 7, url: 'https://example.com/' }]; } }, scripting: { async executeScript() { executions++; } } };
  try {
    assert.equal((await insertIntoChatGPT('')).ok, false);
    assert.equal((await insertIntoChatGPT('x'.repeat(30001))).ok, false);
    assert.equal((await insertIntoChatGPT('Create a moon')).ok, false);
    assert.equal(executions, 0);
    chrome.tabs.query = async () => [{ id: 7, url: 'https://chatgpt.com/' }];
    chrome.scripting.executeScript = async options => {
      executions++;
      assert.deepEqual(options.target, { tabId: 7 });
      assert.equal(options.func, insertPromptInPage);
      assert.deepEqual(options.args, ['Create a moon']);
      return [{ result: { ok: true, message: 'Inserted' } }];
    };
    assert.equal((await insertIntoChatGPT('Create a moon')).ok, true);
    assert.equal(executions, 1);
  } finally { globalThis.chrome = previous; }
});

test('serialized page insertion rechecks its own origin before touching any DOM', () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = { location: { origin: 'https://evil.test' } };
  globalThis.document = { querySelectorAll() { throw new Error('Must not inspect other website DOM'); } };
  try { assert.equal(insertPromptInPage('Create a moon').ok, false); }
  finally { globalThis.window = previousWindow; globalThis.document = previousDocument; }
});

test('composer insertion refuses existing text and avoids unrelated generic textareas', () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  let focused = false;
  globalThis.window = { location: { origin: 'https://chatgpt.com' } };
  globalThis.document = { querySelectorAll(selector) {
    assert.equal(selector.includes('textarea[placeholder]'), false);
    assert.equal(selector.includes('[contenteditable="true"][role="textbox"]'), false);
    return [{ tagName: 'TEXTAREA', value: 'Unsaved user draft', getClientRects: () => [1], getAttribute: () => null, focus: () => { focused = true; } }];
  } };
  try {
    assert.equal(insertPromptInPage('Create a moon').ok, false);
    assert.equal(focused, false);
    document.querySelectorAll = () => [];
    assert.equal(insertPromptInPage('Create a moon').ok, false);
  } finally { globalThis.window = previousWindow; globalThis.document = previousDocument; }
});

test('textarea insertion updates the editor through its setter and input event without submitting', () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousTextarea = globalThis.HTMLTextAreaElement;
  const events = [];
  let focusCount = 0;
  class Textarea {
    constructor() { this.tagName = 'TEXTAREA'; this._value = ''; }
    get value() { return this._value; }
    set value(value) { this._value = value; }
    getClientRects() { return [1]; }
    getAttribute() { return null; }
    focus() { focusCount++; }
    dispatchEvent(event) { events.push(event.type); }
  }
  const editor = new Textarea();
  globalThis.HTMLTextAreaElement = Textarea;
  globalThis.window = { location: { origin: 'https://chatgpt.com' } };
  globalThis.document = { querySelectorAll: () => [editor] };
  try {
    const prompt = 'Create one moon.\nKeep the sky dark.';
    assert.equal(insertPromptInPage(prompt).ok, true);
    assert.equal(editor.value, prompt);
    assert.equal(focusCount, 1);
    assert.deepEqual(events, ['input']);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.HTMLTextAreaElement = previousTextarea;
  }
});

test('rich editor insertion uses text editing pipeline and reports a rejected edit', () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  let selected;
  let command;
  const editor = { tagName: 'DIV', isContentEditable: true, innerText: '', getClientRects: () => [1], getAttribute: () => null, focus() {} };
  globalThis.window = {
    location: { origin: 'https://chatgpt.com' },
    getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
  };
  globalThis.document = {
    querySelectorAll: () => [editor],
    createRange: () => ({ selectNodeContents(value) { selected = value; } }),
    execCommand(name, ui, text) { command = [name, ui]; editor.innerText = text; return true; },
  };
  try {
    assert.equal(insertPromptInPage('Create a moon').ok, true);
    assert.equal(selected, editor);
    assert.deepEqual(command, ['insertText', false]);
    assert.equal(editor.innerText, 'Create a moon');
    editor.innerText = '';
    document.execCommand = () => false;
    assert.equal(insertPromptInPage('Create a moon').ok, false);
  } finally { globalThis.window = previousWindow; globalThis.document = previousDocument; }
});

test('manifest has no persistent website access or remote execution permission', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(new Set(manifest.permissions), new Set(['activeTab', 'scripting', 'storage', 'sidePanel']));
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.ok(manifest.content_security_policy.extension_pages.includes("connect-src 'none'"));
  assert.ok(manifest.content_security_policy.extension_pages.includes("script-src 'self'"));
});
