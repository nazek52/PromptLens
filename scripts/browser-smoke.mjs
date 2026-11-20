// Optional real-Chromium smoke check, no npm dependencies. Start `npm run dev` first.
// Set QA_CHROME to an installed Chromium executable. Uses a disposable profile.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
const executable = process.env.QA_CHROME;
if (!executable) throw new Error('Set QA_CHROME to an installed Chrome/Chromium executable.');
const profile = await mkdtemp(resolve(tmpdir(),'promptlens-qa-'));
const browser = spawn(executable,['--headless=new','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let ws;
try {
  const endpoint = await new Promise((resolve,reject) => {
    let output='';
    const timer=setTimeout(()=>reject(new Error('Chromium startup timeout')),20000);
    browser.once('error',reject);
    browser.stderr.on('data',chunk=>{output+=chunk;const match=output.match(/DevTools listening on (ws:\/\/\S+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
    browser.once('exit',code=>reject(new Error(`Chromium exited ${code}`)));
  });
  ws = new WebSocket(endpoint);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let id=0;
  const waiting = new Map();
  ws.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id&&waiting.has(data.id)){const task=waiting.get(data.id);waiting.delete(data.id);data.error?task.reject(new Error(data.error.message)):task.resolve(data.result);}});
  function send(method,params={},sessionId) {return new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>{waiting.delete(key);reject(new Error('CDP timeout: '+method));},15000);waiting.set(key,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id:key,method,params,...(sessionId?{sessionId}:{})}));});}
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const call=(method,params)=>send(method,params,sessionId);
  async function evaluate(expression) {
    const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:1180,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:'http://127.0.0.1:4173'});
  for(let n=0;n<100;n++) {if(await evaluate("Boolean(document.querySelectorAll('#presets button').length===5)")) break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(await evaluate("document.querySelectorAll('#presets button').length"),5);
  const result=await evaluate(`(async()=>{
    const $=id=>document.getElementById(id);const check=(v,m)=>{if(!v)throw new Error(m);};
    const tick=()=>new Promise(r=>setTimeout(r,100));
    window.confirm=()=>true;
    $('brief-form').requestSubmit();check(!$('prompt-output').value,'blank prompt');
    document.querySelector('[data-preset="anime"]').click();await tick();
    $('brief-form').requestSubmit();await tick();
    check($('prompt-output').value.includes('Main subject'),'compiled prompt');
    check($('readiness-value').textContent.includes('100'),'complete preset');
    const prompt=$('prompt-output').value+'\\nManual refinement';$('prompt-output').value=prompt;$('prompt-output').dispatchEvent(new Event('input',{bubbles:true}));
    $('idea').value+=' revised';$('idea').dispatchEvent(new Event('input',{bubbles:true}));
    check($('prompt-output').value===prompt,'manual output retained');
    $('save-prompt').click();await tick();check($('history-count').textContent==='0','stale brief save refused');
    $('brief-form').requestSubmit();await tick();$('save-prompt').click();await tick();check($('history-count').textContent==='1','history saved');
    $('insert-prompt').click();await tick();check($('action-status').textContent.includes('демо'),'demo fallback');
    $('edit-tab').click();$('edit-form').requestSubmit();check($('action-status').dataset.error==='true','edit needs fields');
    $('edit-change').value='Change hair to blue';$('edit-preserve').value='Face, pose, clothes';$('edit-form').requestSubmit();
    check($('prompt-output').value.includes('Change only: Change hair to blue'),'focused edit');
    check($('prompt-output').value.includes('Keep unchanged: Face, pose, clothes'),'preserve instructions');
    $('create-tab').click();
    return {presetCount:document.querySelectorAll('#presets button').length,historyCount:$('history-count').textContent,checks:10};
  })()`);
  await mkdir('artifacts',{recursive:true});
  // Capture the actual populated creation studio as a reproducible UI artifact.
  await evaluate("document.querySelector('[data-preset=\"anime\"]').click();document.getElementById('brief-form').requestSubmit();window.scrollTo(0,0);");
  await new Promise(r=>setTimeout(r,200));
  const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  await writeFile('artifacts/studio-desktop.png',Buffer.from(screenshot.data,'base64'));
  const sizes=[];
  for(const width of [360,420,1280]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1180,deviceScaleFactor:1,mobile:false});
    const dimensions=await evaluate('({viewport:innerWidth,document:document.documentElement.scrollWidth})');
    assert(dimensions.document<=dimensions.viewport,`Overflow at ${width}: ${JSON.stringify(dimensions)}`);sizes.push(dimensions);
  }
  await call('Emulation.setDeviceMetricsOverride',{width:360,height:1180,deviceScaleFactor:1,mobile:false});
  const mobile=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  await writeFile('artifacts/studio-mobile.png',Buffer.from(mobile.data,'base64'));
  await call('Page.reload');await new Promise(r=>setTimeout(r,250));
  assert.equal(await evaluate("document.getElementById('history-count').textContent"),'1');
  await evaluate("window.confirm=()=>true;document.getElementById('idea').value='pending draft';document.getElementById('idea').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('clear-history').click();");
  await new Promise(r=>setTimeout(r,450));await call('Page.reload');await new Promise(r=>setTimeout(r,250));
  assert.equal(await evaluate("document.getElementById('idea').value"),'');
  assert.equal(await evaluate("document.getElementById('history-count').textContent"),'0');
  console.log(JSON.stringify({passed:true,...result,responsive:sizes,persistenceAndClear:true},null,2));
} finally {
  if(ws)ws.close();
  browser.kill();
  await new Promise(r=>setTimeout(r,250));
  // This directory is the fresh disposable profile produced above.
  const tempRoot = resolve(tmpdir());
  const cleanupPath = resolve(profile);
  assert(cleanupPath.startsWith(tempRoot + sep) && cleanupPath.slice(tempRoot.length + 1).startsWith('promptlens-qa-'), 'Refusing cleanup outside the disposable test profile');
  await rm(cleanupPath,{recursive:true,force:true,maxRetries:3,retryDelay:250}).catch(()=>{});
}
