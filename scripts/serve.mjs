import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json' };
http.createServer(async (req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if (path === '/') path = '/panel.html';
  const absolute = resolve(root, '.' + path);
  const relative = absolute.slice(root.length + 1);
  if (!absolute.startsWith(root + sep) || relative.split(/[\\/]/).some(part => part.startsWith('.')) || !['.html','.js','.css','.svg','.png','.json'].includes(extname(absolute))) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(absolute);
    res.writeHead(200, { 'Content-Type': types[extname(absolute)] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-store', 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'" });
    res.end(body);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`PromptLens demo: http://127.0.0.1:${port}`));
