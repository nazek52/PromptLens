export function isChatGPTUrl(value) {
  try {
    const url = new URL(value);
    return ['https://chatgpt.com', 'https://chat.openai.com'].includes(url.origin);
  } catch { return false; }
}

// Self-contained because Chrome serializes this function into the active tab.
export function insertPromptInPage(prompt) {
  if (!['https://chatgpt.com', 'https://chat.openai.com'].includes(window.location.origin)) return { ok: false, message: 'Вставка доступна только на сайте ChatGPT.' };
  const candidates = [...document.querySelectorAll('#prompt-textarea, form[data-type="unified-composer"] textarea[data-id="root"]')];
  const editor = candidates.find(el => el.getClientRects().length && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && (el.tagName === 'TEXTAREA' || el.isContentEditable));
  if (!editor) return { ok: false, message: 'Поле ввода ChatGPT не найдено. Скопируйте промпт вручную.' };
  const existing = editor.tagName === 'TEXTAREA' ? editor.value : (editor.innerText ?? editor.textContent);
  if (existing?.trim()) return { ok: false, message: 'В ChatGPT уже есть черновик. Сохраните или очистите его перед вставкой.' };
  editor.focus();
  if (editor.tagName === 'TEXTAREA') {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (!setter) return { ok: false, message: 'Не удалось вставить текст. Используйте копирование.' };
    setter.call(editor, prompt);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    // Insert through the browser editing pipeline so rich editors update their state.
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
    const inserted = document.execCommand('insertText', false, prompt);
    if (!inserted) return { ok: false, message: 'Редактор не принял вставку. Скопируйте промпт вручную.' };
  }
  const actual = editor.tagName === 'TEXTAREA' ? editor.value : editor.innerText;
  if (actual.replace(/\r\n/g, '\n').trim() !== prompt.replace(/\r\n/g, '\n').trim()) {
    return { ok: false, message: 'Проверьте текст в ChatGPT: редактор изменил вставку. При необходимости скопируйте промпт вручную.' };
  }
  return { ok: true, message: 'Промпт вставлен. Проверьте его и отправьте самостоятельно.' };
}

export async function insertIntoChatGPT(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 30000) return { ok: false, message: 'Сначала соберите промпт (до 30 000 символов).' };
  if (!globalThis.chrome?.scripting || !globalThis.chrome?.tabs) return { ok: false, message: 'В демо доступно копирование. Для вставки установите расширение и откройте ChatGPT.' };
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isChatGPTUrl(tab.url)) return { ok: false, message: 'Откройте вкладку https://chatgpt.com и нажмите значок PromptLens.' };
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: insertPromptInPage, args: [prompt] });
    return results[0]?.result ?? { ok: false, message: 'Не удалось подтвердить вставку. Используйте копирование.' };
  } catch {
    return { ok: false, message: 'Нет доступа к полю ввода. Нажмите значок расширения на вкладке ChatGPT или скопируйте промпт.' };
  }
}
