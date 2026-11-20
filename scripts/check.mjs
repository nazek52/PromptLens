import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'));
assert.equal(manifest.manifest_version,3);
assert.deepEqual(new Set(manifest.permissions),new Set(['activeTab','scripting','storage','sidePanel']));
assert.equal(manifest.host_permissions,undefined);
assert.equal(manifest.content_scripts,undefined);
for (const path of [manifest.background.service_worker,manifest.side_panel.default_path,...Object.values(manifest.icons)]) await access(resolve(root,path));
const html = await readFile(resolve(root,'panel.html'),'utf8');
assert(!/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html),'No inline scripts');
assert(!/\son\w+\s*=/i.test(html),'No inline event handlers');
assert(!/https?:\/\//i.test(html.replace(/href="https?:[^\"]*"/g,'')),'No remote resources');
for (const file of await readdir(resolve(root,'src'))) {
  if (!file.endsWith('.js')) continue;
  const path = resolve(root,'src',file);
  const check = spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
  const code = await readFile(path,'utf8');
  assert(!/\b(?:eval|fetch)\s*\(|new\s+(?:Function|WebSocket|XMLHttpRequest)\s*\(/.test(code),`${file}: remote calls or dynamic code`);
}
console.log('Manifest, assets, JavaScript syntax, CSP, and offline checks passed.');
