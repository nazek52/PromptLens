// Deterministic PNG icon generation using only Node built-ins.
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../assets');
await mkdir(dir, { recursive:true });
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for(let bit=0;bit<8;bit++) crc = (crc>>>1) ^ (0xedb88320 & -(crc&1)); }
  return (crc ^ 0xffffffff)>>>0;
}
function chunk(type, data) {
  const name = Buffer.from(type); const body = Buffer.concat([name,data]);
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([size,body,crc]);
}
for(const size of [16,48,128]) {
  const raw = Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const px=x/size*128, py=y/size*128;
    const rounded = Math.hypot(Math.max(25-px,0,px-103), Math.max(25-py,0,py-103))<=25;
    const letter = (px>=43&&px<=61&&py>=24&&py<=99)||(px>=52&&px<=87&&py>=24&&py<=41)||(px>=52&&px<=87&&py>=55&&py<=71)||(px>=69&&px<=87&&py>=36&&py<=60);
    const dot = Math.hypot(px-94,py-93)<=8;
    const color=dot?[212,237,170,255]:letter?[255,249,238,255]:[117,96,212,rounded?255:0];
    const offset=y*(size*4+1)+1+x*4;
    color.forEach((v,i)=>raw[offset+i]=v);
  }
  const header=Buffer.alloc(13); header.writeUInt32BE(size,0); header.writeUInt32BE(size,4); header[8]=8; header[9]=6;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
  await writeFile(resolve(dir,`icon${size}.png`),png);
}
console.log('Created 16, 48 and 128 px icons.');
