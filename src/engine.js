/** Offline brief → prompt compiler. No network, model calls, or quota estimates. */
export const BRIEF_FIELDS = Object.freeze([
  'idea', 'subject', 'style', 'composition', 'lighting', 'palette',
  'background', 'details', 'avoid', 'aspectRatio', 'purpose', 'text',
]);
const MAX_FIELD_LENGTH = 2400;

function clean(value) {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())
    .slice(0, MAX_FIELD_LENGTH).join('');
}

/** Ignore unknown fields and non-string values; preserve the user's language. */
export function normalizeBrief(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return Object.fromEntries(BRIEF_FIELDS.map((key) => [key, clean(source[key])]));
}

const CHECKS = [
  { field: 'subject', label: 'Главный объект', question: 'Кого или что нужно изобразить? Какие черты обязательны?', weight: 30, present: (b) => Boolean(b.subject || b.idea) },
  { field: 'style', label: 'Визуальный стиль', question: 'Как это должно выглядеть: аниме, фотография, акварель или другой стиль?', weight: 20 },
  { field: 'composition', label: 'Композиция', question: 'Какой нужен ракурс и кадр: лицо, по пояс, в полный рост или общий план?', weight: 20 },
  { field: 'background', label: 'Фон', question: 'Где находится объект? Нужен простой, прозрачный или подробный фон?', weight: 15 },
  { field: 'aspectRatio', label: 'Формат', question: 'Какой нужен формат: квадрат 1:1, вертикальный 2:3 или горизонтальный 3:2?', weight: 15 },
];

function positiveMention(text, expression) {
  const matches = text.matchAll(new RegExp(expression.source, 'giu'));
  for (const match of matches) {
    const prefix = text.slice(Math.max(0, match.index - 45), match.index).split(/[.!?;,:\n]/u).at(-1);
    // Exclusions in a style/background description must not create false conflicts.
    if (!/(?:\b(?:not|no|without|avoid|exclude)\b|(?:^|\s)(?:не|без|никакого|никакой))\s+(?:\S+\s+){0,2}$/iu.test(prefix)) return true;
  }
  return false;
}

function ratioWarnings(brief) {
  const ratios = [...brief.aspectRatio.matchAll(/(-?\d+(?:\.\d+)?)\s*[:/]\s*(-?\d+(?:\.\d+)?)/g)]
    .map((match) => Number(match[1]) / Number(match[2]));
  const warnings = [];
  if (ratios.some((ratio) => !Number.isFinite(ratio) || ratio <= 0)) {
    warnings.push({ code: 'invalid-ratio', message: 'В соотношении сторон нужны два положительных числа, например 2:3.' });
  } else if (ratios.length > 1 && ratios.some((ratio) => Math.abs(ratio - ratios[0]) > 0.01)) {
    warnings.push({ code: 'multiple-ratios', message: 'Указаны разные соотношения сторон. Выберите один формат.' });
  }
  const positive = ratios.filter((ratio) => Number.isFinite(ratio) && ratio > 0);
  if (positive.some((ratio) => ratio > 1.01) && /(?:vertical|portrait|вертикаль)/iu.test(brief.aspectRatio)
    || positive.some((ratio) => ratio < 0.99) && /(?:horizontal|landscape|горизонталь)/iu.test(brief.aspectRatio)) {
    warnings.push({ code: 'ratio-orientation', message: 'Числа соотношения сторон не совпадают с указанной ориентацией. Формат записывается как ширина:высота.' });
  }
  return warnings;
}

/** A checklist coverage score, not a prediction of image quality. */
export function analyzeBrief(input) {
  const brief = normalizeBrief(input);
  const missing = [];
  let score = 0;
  for (const check of CHECKS) {
    if (check.present ? check.present(brief) : Boolean(brief[check.field])) score += check.weight;
    else missing.push({ field: check.field, label: check.label, question: check.question });
  }
  const warnings = ratioWarnings(brief);
  if (positiveMention(brief.style, /(?:photoreal\w*|фотореал\p{L}*)/u)
    && positiveMention(brief.style, /(?:\banime\b|аниме)/u)
    && !/(?:hybrid|blend|fusion|mix|гибрид|смеш|сочетан)/iu.test(brief.style)) {
    warnings.push({ code: 'style-mix', message: 'Есть аниме и фотореализм. Если нужен гибрид, опишите, что взять от каждого стиля; иначе выберите один.' });
  }
  if (positiveMention(brief.background, /(?:transparent|прозрачн\p{L}*)/u)
    && positiveMention(brief.background, /(?:\b(?:forest|city|room|scenery|landscape|street|ocean)\b|(?:лес|город|комнат|пейзаж|улиц|океан)\p{L}*)/u)) {
    warnings.push({ code: 'background-conflict', message: 'На фоне указаны прозрачность и окружение. Уточните: окружение внутри объекта или отдельный фон?' });
  }
  if (/\b(?:--ar|--no|--stylize|--seed|CFG|sampler)\b|--(?:ar|no|stylize|seed)\b/iu.test(Object.values(brief).join(' '))) {
    warnings.push({ code: 'model-flags', message: 'Похоже, добавлены параметры другой модели. Для ChatGPT опишите формат и ограничения обычными словами.' });
  }
  return { score, missing, warnings, ready: missing.length === 0 && warnings.length === 0 };
}

/** Compile only provided choices; no invented details or hidden style defaults. */
export function buildPrompt(input) {
  const brief = normalizeBrief(input);
  if (!brief.idea && !brief.subject) return '';
  const lines = ['Create one image using this visual brief.'];
  const labels = {
    idea: 'Concept', subject: 'Main subject', purpose: 'Intended use', style: 'Visual style',
    composition: 'Composition and viewpoint', background: 'Background', lighting: 'Lighting',
    palette: 'Color palette', details: 'Required details', aspectRatio: 'Canvas aspect ratio (width:height)',
  };
  for (const [field, label] of Object.entries(labels)) {
    if (brief[field]) lines.push(`${label}: ${brief[field]}`);
  }
  if (brief.text) {
    lines.push(`Visible text, transcribed exactly: ${JSON.stringify(brief.text)}. Do not add any other lettering.`);
  }
  if (brief.avoid) lines.push(`Avoid these elements: ${brief.avoid}`);
  lines.push('Prioritize the explicitly requested subject, composition, and required details.');
  return lines.join('\n\n');
}

/** Edits depend on a reference the user selects in ChatGPT, never an implicit upload. */
export function buildEditPrompt(input = {}) {
  const change = clean(input?.change);
  const preserve = clean(input?.preserve);
  const reference = clean(input?.reference);
  if (!change || !preserve) return '';
  return [
    `Edit ${reference ? `the existing reference image identified as ${JSON.stringify(reference)}` : 'the existing reference image I have selected or attached in this chat'}.`,
    `Change only: ${change}`,
    `Keep unchanged: ${preserve}`,
    'Keep all other elements as close as possible to the reference. Do not redesign the image or add unrelated elements.',
    'If the reference image is missing or ambiguous, ask me to select it before generating.',
  ].join('\n\n');
}
