import { analyzeBrief, buildPrompt, buildEditPrompt, normalizeBrief } from './engine.js';
import { PRESETS } from './presets.js';
import { getState, saveDraft, saveHistory, deleteHistory, clearAll, exportProject, importProject } from './storage.js';
import { insertIntoChatGPT } from './chatgpt.js';

const $ = (id) => document.getElementById(id);
const form = $('brief-form');
const output = $('prompt-output');
const fields = ['idea', 'subject', 'style', 'composition', 'lighting', 'palette', 'background', 'details', 'avoid', 'aspectRatio', 'purpose', 'text'];
const icons = ['✧', '◉', '◈', '☷', '⌁', '◇'];
let mode = 'create';
let history = [];
let buildSnapshot = '';
let draftTimer;
let persistenceQueue = Promise.resolve();
let persistenceVersion = 0;

function status(message = '', error = false) {
  $('action-status').textContent = message;
  $('action-status').dataset.error = String(error);
}

function readBrief() {
  return normalizeBrief(Object.fromEntries(fields.map((key) => [key, $(key).value])));
}

function fillBrief(value) {
  const brief = normalizeBrief(value);
  fields.forEach((key) => {
    // Imported or saved custom aspect ratios remain selectable and round-trip safely.
    if (key === 'aspectRatio' && brief[key] && !Array.from($(key).options).some((option) => option.value === brief[key])) {
      const option = document.createElement('option');
      option.value = brief[key];
      option.textContent = brief[key];
      $(key).append(option);
    }
    $(key).value = brief[key] || '';
  });
  refreshAnalysis();
}

function enqueuePersistence(action) {
  persistenceQueue = persistenceQueue.catch(() => {}).then(action);
  return persistenceQueue;
}

function scheduleDraft() {
  clearTimeout(draftTimer);
  const version = persistenceVersion;
  draftTimer = setTimeout(() => {
    const draft = readBrief();
    enqueuePersistence(() => version === persistenceVersion ? saveDraft(draft) : undefined)
      .catch(() => status('Не удалось сохранить черновик. Проверьте доступное место в браузере.', true));
  }, 300);
}

async function persistNow() {
  clearTimeout(draftTimer);
  const brief = readBrief();
  await enqueuePersistence(() => saveDraft(brief));
}

function setMode(nextMode) {
  mode = nextMode;
  for (const name of ['create', 'edit']) {
    const active = mode === name;
    $(`${name}-tab`).setAttribute('aria-selected', String(active));
    $(`${name}-tab`).tabIndex = active ? 0 : -1;
    $(`${name}-panel`).hidden = !active;
  }
  $('readiness-title').textContent = mode === 'edit' ? 'Проверим границы правки' : 'Проверим замысел';
  $('prompt-hint').textContent = mode === 'edit' ? 'Соберите точную правку для существующего изображения.' : 'Соберите промпт, когда важные детали определены.';
  refreshAnalysis();
  refreshOutputMeta();
}

function renderQuestion(question, index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'question-button';
  const marker = document.createElement('span');
  marker.className = 'question-bullet';
  marker.textContent = String(index + 1);
  marker.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = question.question || question.label;
  button.append(marker, text);
  button.addEventListener('click', () => {
    const input = $(question.field);
    if (!input) return;
    const details = input.closest('details');
    if (details) details.open = true;
    input.focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  return button;
}

function refreshAnalysis() {
  const analysis = mode === 'create' ? analyzeBrief(readBrief()) : analyzeEdit();
  const score = Math.max(0, Math.min(100, Number(analysis.score) || 0));
  $('readiness-value').textContent = `${score} / 100`;
  $('readiness-progress').value = score;
  const container = $('analysis-content');
  container.replaceChildren();
  const intro = document.createElement('p');
  intro.className = 'analysis-message';
  intro.textContent = analysis.ready ? 'Главное описано. Проверьте, что формулировки совпадают с вашим замыслом.' : 'Чем точнее важные детали, тем меньше поводов гадать. Уточните:';
  container.append(intro);
  if (analysis.missing?.length) {
    const list = document.createElement('div');
    list.className = 'question-list';
    analysis.missing.forEach((question, index) => list.append(renderQuestion(question, index)));
    container.append(list);
  }
  for (const warning of analysis.warnings || []) {
    const item = document.createElement('p');
    item.className = 'warning-message';
    item.textContent = warning.message;
    container.append(item);
  }
  refreshOutputMeta();
}

function readEdit() {
  return { change: $('edit-change').value, preserve: $('edit-preserve').value, reference: $('edit-reference').value };
}

function analyzeEdit() {
  const edit = readEdit();
  const missing = [];
  if (!edit.change.trim()) missing.push({ field: 'edit-change', question: 'Что конкретно должно измениться?' });
  if (!edit.preserve.trim()) missing.push({ field: 'edit-preserve', question: 'Что должно остаться без изменений?' });
  return { score: (2 - missing.length) * 50, missing, warnings: [], ready: missing.length === 0 };
}

function snapshot() {
  return JSON.stringify({ mode, input: mode === 'create' ? readBrief() : readEdit() });
}

function refreshOutputMeta() {
  const exists = Boolean(output.value.trim());
  $('prompt-length').textContent = `${output.value.length.toLocaleString('ru-RU')} символов`;
  $('copy-prompt').disabled = !exists;
  const tooLongToInsert = output.value.length > 30000;
  $('insert-prompt').disabled = !exists || tooLongToInsert;
  $('insert-prompt').title = tooLongToInsert ? 'Для вставки сократите промпт до 30 000 символов. Полный текст можно скопировать.' : '';
  // History entries always have a corresponding creation brief.
  $('save-prompt').disabled = !exists || mode !== 'create' || tooLongToInsert;
  $('save-prompt').title = mode === 'edit' ? 'В истории сохраняются замыслы новых изображений. Правку можно скопировать.' : tooLongToInsert ? 'Для сохранения сократите промпт до 30 000 символов. Полный текст можно скопировать.' : '';
  $('prompt-state').textContent = !exists ? 'Ждём ваш замысел' : tooLongToInsert ? 'Вставка: максимум 30 000 символов' : buildSnapshot && buildSnapshot !== snapshot() ? 'Поля изменены · пересоберите' : 'Проверьте перед отправкой';
}

function setOutput(text) {
  output.value = text;
  buildSnapshot = snapshot();
  refreshOutputMeta();
}

function markPreset(id = '') {
  for (const button of $('presets').children) button.setAttribute('aria-pressed', String(button.dataset.preset === id));
}

function renderPresets() {
  PRESETS.forEach((preset, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset-button';
    button.dataset.preset = preset.id;
    button.setAttribute('aria-pressed', 'false');
    button.title = preset.description || preset.label;
    const icon = document.createElement('span');
    icon.className = 'preset-icon';
    icon.textContent = icons[index % icons.length];
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'preset-label';
    label.textContent = preset.label;
    button.append(icon, label);
    button.addEventListener('click', async () => {
      if (fields.some((key) => $(key).value.trim()) && !window.confirm('Заменить текущий замысел выбранным примером? Сохранённые замыслы останутся в истории.')) return;
      fillBrief(preset.brief);
      markPreset(preset.id);
      setOutput('');
      scheduleDraft();
      status('Пример загружен. Измените детали под свой замысел.');
    });
    $('presets').append(button);
  });
}

function renderHistory() {
  $('history-count').textContent = String(history.length);
  const list = $('history-list');
  list.replaceChildren();
  if (!history.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-history';
    empty.textContent = 'Сохраните замысел, чтобы вернуться к нему позже.';
    list.append(empty);
    return;
  }
  history.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    const load = document.createElement('button');
    load.className = 'history-load';
    load.type = 'button';
    const name = document.createElement('span');
    name.className = 'history-name';
    name.textContent = entry.name || 'Без названия';
    const date = document.createElement('span');
    date.className = 'history-date';
    const parsed = new Date(entry.createdAt);
    date.textContent = Number.isNaN(parsed.getTime()) ? 'Сохранённый замысел' : parsed.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    load.append(name, date);
    load.addEventListener('click', () => {
      if (fields.some((key) => $(key).value.trim()) && !window.confirm('Загрузить сохранённый замысел вместо текущего черновика?')) return;
      setMode('create');
      fillBrief(entry.brief);
      markPreset();
      setOutput(entry.prompt || '');
      scheduleDraft();
      status('Замысел восстановлен.');
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'history-delete';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Удалить замысел «${entry.name || 'Без названия'}»`);
    remove.addEventListener('click', async () => {
      try {
        history = await enqueuePersistence(() => deleteHistory(entry.id));
        renderHistory();
        status('Замысел удалён из истории.');
      } catch { status('Не удалось удалить замысел.', true); }
    });
    item.append(load, remove);
    list.append(item);
  });
}

form.addEventListener('input', () => {
  markPreset();
  refreshAnalysis();
  scheduleDraft();
});
form.addEventListener('change', () => {
  refreshAnalysis();
  scheduleDraft();
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const brief = readBrief();
    if (!brief.idea && !brief.subject) {
      status('Сначала опишите идею или главный объект.', true);
      $('idea').focus();
      return;
    }
    if (output.value.trim() && !window.confirm('Пересобрать промпт? Ручные изменения в тексте промпта будут заменены.')) return;
    setOutput(buildPrompt(brief));
    status('Промпт собран. Прочитайте его перед отправкой.');
    await persistNow();
  } catch (error) { status(error.message || 'Не удалось собрать промпт.', true); }
});
$('edit-form').addEventListener('input', refreshAnalysis);
$('edit-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const check = analyzeEdit();
  if (!check.ready) {
    status('Укажите изменение и детали, которые нужно сохранить.', true);
    $(check.missing[0].field).focus();
    return;
  }
  try {
    if (output.value.trim() && !window.confirm('Заменить текущий промпт описанием правки?')) return;
    setOutput(buildEditPrompt(readEdit()));
    status('Прикрепите нужное изображение в ChatGPT или откройте чат с ним. Затем вставьте правку.');
  } catch (error) { status(error.message || 'Не удалось собрать правку.', true); }
});

for (const name of ['create', 'edit']) {
  $(`${name}-tab`).addEventListener('click', () => setMode(name));
  $(`${name}-tab`).addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'create' : event.key === 'End' ? 'edit' : name === 'create' ? 'edit' : 'create';
    setMode(next);
    $(`${next}-tab`).focus();
  });
}
output.addEventListener('input', refreshOutputMeta);

$('copy-prompt').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    status('Промпт скопирован. Вставьте его в ChatGPT и проверьте перед отправкой.');
  } catch {
    output.focus();
    output.select();
    status('Браузер не разрешил копирование. Текст выделен — нажмите Ctrl+C или ⌘C.', true);
  }
});

$('insert-prompt').addEventListener('click', async () => {
  const button = $('insert-prompt');
  button.disabled = true;
  status('Проверяем открытую вкладку ChatGPT…');
  try {
    const result = await insertIntoChatGPT(output.value);
    status(result.message, !result.ok);
  } catch { status('Не удалось вставить промпт. Скопируйте его и вставьте вручную.', true); }
  finally { refreshOutputMeta(); }
});

$('save-prompt').addEventListener('click', async () => {
  if (mode !== 'create') return;
  if (buildSnapshot && buildSnapshot !== snapshot()) {
    status('Поля изменились после сборки. Пересоберите промпт, чтобы сохранить его вместе с актуальным замыслом.', true);
    return;
  }
  const brief = readBrief();
  if (!brief.idea && !brief.subject) {
    status('Добавьте идею или главный объект, чтобы сохранить замысел.', true);
    return;
  }
  try {
    const entry = {
      id: crypto.randomUUID(),
      name: (brief.idea || brief.subject).replace(/\s+/g, ' ').slice(0, 75),
      brief,
      prompt: output.value,
      createdAt: new Date().toISOString(),
    };
    history = await enqueuePersistence(() => saveHistory(entry));
    renderHistory();
    status('Замысел и ваш текст промпта сохранены на устройстве.');
  } catch { status('Не удалось сохранить замысел. Возможно, память браузера заполнена.', true); }
});

$('empty-brief').addEventListener('click', () => {
  if (fields.some((key) => $(key).value.trim()) && !window.confirm('Очистить текущий замысел и промпт? Сохранённые замыслы останутся.')) return;
  fillBrief({});
  markPreset();
  setOutput('');
  scheduleDraft();
  status('Чистый лист готов.');
  $('idea').focus();
});

$('clear-history').addEventListener('click', async () => {
  if (!window.confirm('Удалить все сохранённые замыслы и текущий черновик с этого устройства? Это действие нельзя отменить.')) return;
  clearTimeout(draftTimer);
  persistenceVersion += 1;
  try {
    await enqueuePersistence(clearAll);
    history = [];
    fillBrief({});
    $('edit-form').reset();
    markPreset();
    setOutput('');
    renderHistory();
    status('Локальные замыслы и черновик удалены.');
  } catch { status('Не удалось удалить данные.', true); }
});

$('export-brief').addEventListener('click', () => {
  try {
    const json = exportProject(readBrief());
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `promptlens-brief-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('Экспортирован замысел из полей. Ручной текст промпта хранится отдельно — сохраните его в истории или скопируйте.');
  } catch (error) { status(error.message || 'Не удалось экспортировать замысел.', true); }
});
$('import-brief').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 100000) throw new Error('Файл слишком большой. Выберите JSON замысла размером до 100 КБ.');
    const brief = importProject(await file.text());
    if (fields.some((key) => $(key).value.trim()) && !window.confirm('Заменить текущий замысел содержимым JSON?')) return;
    setMode('create');
    fillBrief(brief);
    markPreset();
    setOutput('');
    await persistNow();
    status('Замысел импортирован. Проверьте поля и соберите промпт.');
  } catch (error) { status(error.message || 'Не удалось прочитать JSON замысла.', true); }
  finally { event.target.value = ''; }
});

async function init() {
  renderPresets();
  try {
    const state = await getState();
    fillBrief(state.draft || {});
    history = Array.isArray(state.history) ? state.history : [];
  } catch { status('Не удалось прочитать локальные данные. Можно продолжить и скопировать промпт вручную.', true); }
  renderHistory();
  refreshAnalysis();
}

await init();
