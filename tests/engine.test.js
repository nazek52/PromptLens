import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBrief, buildPrompt, buildEditPrompt, normalizeBrief, BRIEF_FIELDS } from '../src/engine.js';
import { PRESETS } from '../src/presets.js';

test('empty or malformed input asks for meaningful choices and cannot generate a blank image', () => {
  for (const input of [undefined, null, 42, ['anime'], {}]) {
    const result = analyzeBrief(input);
    assert.equal(result.score, 0);
    assert.equal(result.ready, false);
    assert.equal(result.missing.length, 5);
    assert.equal(buildPrompt(input), '');
  }
});

test('all templates contain complete editable briefs and compile deterministically', () => {
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length);
  for (const preset of PRESETS) {
    const analysis = analyzeBrief(preset.brief);
    assert.equal(analysis.ready, true, preset.id + ': ' + JSON.stringify(analysis));
    assert.equal(analysis.score, 100);
    assert.equal(buildPrompt(preset.brief), buildPrompt(preset.brief));
    assert.ok(buildPrompt(preset.brief).includes(preset.brief.subject));
  }
});

test('a concept substitutes for subject; optional lighting, purpose and lettering do not block readiness', () => {
  const brief = { idea: 'Кошка в шляпе', style: 'Watercolor', composition: 'Close-up', background: 'White', aspectRatio: '1:1' };
  assert.equal(analyzeBrief(brief).ready, true);
  assert.equal(analyzeBrief(brief).score, 100);
  const prompt = buildPrompt(brief);
  assert.match(prompt, /Кошка в шляпе/);
  assert.doesNotMatch(prompt, /Lighting:|Visible text/);
});

test('normalization removes controls, bounds Unicode input safely, and rejects non-string or unknown fields', () => {
  const result = normalizeBrief({ idea: ' \u0000Әлем\r\n🌙 ', subject: 99, secret: 'token', style: '🌙'.repeat(9000) });
  assert.deepEqual(Object.keys(result), BRIEF_FIELDS);
  assert.equal(result.idea, 'Әлем\n🌙');
  assert.equal(result.subject, '');
  assert.equal(Array.from(result.style).length, 2400);
  assert.ok(result.style.endsWith('🌙'));
  assert.equal('secret' in result, false);
});

test('untrusted markup and template syntax remain plain data and are never executed', () => {
  globalThis.__promptlensExecuted = false;
  const idea = '<img src=x onerror="globalThis.__promptlensExecuted=true"> ${process.exit(1)}';
  assert.ok(buildPrompt({ idea }).includes(idea));
  assert.equal(globalThis.__promptlensExecuted, false);
  delete globalThis.__promptlensExecuted;
});

test('explicit style collisions invite clarification; an intentional hybrid or an exclusion does not', () => {
  assert.ok(analyzeBrief({ style: 'anime, photorealistic' }).warnings.some((w) => w.code === 'style-mix'));
  assert.ok(analyzeBrief({ style: 'anime, no noise, photorealistic' }).warnings.some((w) => w.code === 'style-mix'));
  for (const style of ['anime, not photorealistic', 'anime, no photorealism', 'anime, без фотореализма', 'A hybrid of anime and photorealism']) {
    assert.ok(!analyzeBrief({ style }).warnings.some((w) => w.code === 'style-mix'), style);
  }
});

test('a transparent background with scenery is flagged, but exclusions are respected', () => {
  assert.ok(analyzeBrief({ background: 'transparent, forest behind character' }).warnings.some((w) => w.code === 'background-conflict'));
  assert.ok(!analyzeBrief({ background: 'transparent, without forest' }).warnings.some((w) => w.code === 'background-conflict'));
  assert.ok(!analyzeBrief({ background: 'Лес, без прозрачного фона' }).warnings.some((w) => w.code === 'background-conflict'));
});

test('aspect ratios detect incompatible choices, zero values, and swapped orientation', () => {
  assert.ok(analyzeBrief({ aspectRatio: '1:1 or 2:3' }).warnings.some((w) => w.code === 'multiple-ratios'));
  assert.ok(analyzeBrief({ aspectRatio: '2:0' }).warnings.some((w) => w.code === 'invalid-ratio'));
  assert.ok(analyzeBrief({ aspectRatio: '0:2' }).warnings.some((w) => w.code === 'invalid-ratio'));
  assert.ok(analyzeBrief({ aspectRatio: '-1:2' }).warnings.some((w) => w.code === 'invalid-ratio'));
  assert.ok(analyzeBrief({ aspectRatio: 'vertical 3:2' }).warnings.some((w) => w.code === 'ratio-orientation'));
  assert.ok(!analyzeBrief({ aspectRatio: '2:3, 4:6' }).warnings.length);
  assert.ok(!analyzeBrief({ aspectRatio: 'Вертикальный 2:3' }).warnings.length);
});

test('avoid field does not count as a requested style or background', () => {
  assert.deepEqual(analyzeBrief({ style: 'anime', background: 'transparent', avoid: 'photorealism, forest' }).warnings, []);
});

test('foreign generator flags are identified without claiming they work in ChatGPT', () => {
  assert.ok(analyzeBrief({ idea: 'cat --ar 2:3 --seed 5' }).warnings.some((w) => w.code === 'model-flags'));
});

test('exact lettering is quoted and multiline user text is preserved', () => {
  const text = 'Әлем "🌙"\nNew line';
  assert.ok(buildPrompt({ subject: 'Sign', text }).includes(JSON.stringify(text)));
});

test('edit requires both change and preservation and never claims to upload a reference', () => {
  for (const data of [undefined, {}, { change: 'Red hair' }, { preserve: 'Face' }, { change: ' ', preserve: 'Face' }]) {
    assert.equal(buildEditPrompt(data), '');
  }
  const result = buildEditPrompt({ change: 'Make the jacket blue', preserve: 'Face, hair and pose', reference: 'Image 2' });
  assert.match(result, /Image 2/);
  assert.match(result, /Change only: Make the jacket blue/);
  assert.match(result, /Keep unchanged: Face, hair and pose/);
  assert.match(result, /missing or ambiguous/);
  assert.doesNotMatch(result, /uploaded the|I attached/);
});

test('analysis scores are bounded for any combination of fields', () => {
  for (let mask = 0; mask < 32; mask++) {
    const brief = Object.fromEntries(['subject', 'style', 'composition', 'background', 'aspectRatio'].map((key, i) => [key, mask & (1 << i) ? 'chosen' : '']));
    const { score, missing, ready } = analyzeBrief(brief);
    assert.ok(score >= 0 && score <= 100);
    assert.equal(ready, missing.length === 0);
  }
});
