import { normalizeBrief } from './engine.js';

const KEY = 'promptlens.v1';
const MAX_HISTORY = 30;
let pending = Promise.resolve();
const extensionStorage = () => globalThis.chrome?.storage?.local;

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object' || typeof entry.prompt !== 'string' || !entry.prompt.trim()) return null;
  return {
    id: typeof entry.id === 'string' ? entry.id.slice(0, 100) : crypto.randomUUID(),
    name: typeof entry.name === 'string' ? entry.name.slice(0, 120) : 'Без названия',
    brief: normalizeBrief(entry.brief), prompt: entry.prompt.slice(0, 30000),
    createdAt: typeof entry.createdAt === 'string' && Number.isFinite(Date.parse(entry.createdAt)) ? entry.createdAt : new Date().toISOString()
  };
}

export async function getState() {
  const area = extensionStorage();
  let raw;
  if (area) raw = (await area.get(KEY))[KEY];
  else {
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { raw = null; }
  }
  return { draft: normalizeBrief(raw?.draft), history: Array.isArray(raw?.history) ? raw.history.slice(0, MAX_HISTORY).map(sanitizeEntry).filter(Boolean) : [] };
}

async function write(state) {
  const area = extensionStorage();
  if (area) await area.set({ [KEY]: state });
  else localStorage.setItem(KEY, JSON.stringify(state));
}

function mutate(update) {
  const next = pending.catch(() => {}).then(async () => {
    const state = await getState();
    const result = update(state);
    await write(state);
    return result;
  });
  pending = next;
  return next;
}

export function saveDraft(brief) {
  return mutate(state => { state.draft = normalizeBrief(brief); return state.draft; });
}
export function saveHistory(entry) {
  return mutate(state => {
    const clean = sanitizeEntry(entry);
    if (!clean) throw new Error('Сначала соберите промпт.');
    state.history = [clean, ...state.history.filter(item => item.id !== clean.id)].slice(0, MAX_HISTORY);
    return state.history;
  });
}
export function deleteHistory(id) {
  return mutate(state => { state.history = state.history.filter(item => item.id !== id); return state.history; });
}
export function clearAll() {
  return mutate(state => { state.draft = normalizeBrief({}); state.history = []; });
}
export function exportProject(brief) {
  return JSON.stringify({ format: 'promptlens', version: 1, brief: normalizeBrief(brief) }, null, 2);
}
export function importProject(text) {
  if (typeof text !== 'string' || text.length > 100000) throw new Error('Файл должен быть JSON размером до 100 КБ.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Не удалось прочитать JSON.'); }
  if (data?.format !== 'promptlens' || data.version !== 1 || !data.brief || typeof data.brief !== 'object' || Array.isArray(data.brief)) throw new Error('Ожидается проект PromptLens версии 1.');
  const known = ['idea','subject','style','composition','lighting','palette','background','details','avoid','aspectRatio','purpose','text'];
  if (known.some(key => data.brief[key] !== undefined && typeof data.brief[key] !== 'string')) throw new Error('Поля описания должны содержать текст.');
  return normalizeBrief(data.brief);
}
