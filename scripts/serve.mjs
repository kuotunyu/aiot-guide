// Minimal static server for tests: node scripts/serve.mjs [port]
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join, extname, normalize} from 'node:path';
const TYPES = {'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8'};
const port = +process.argv[2] || 8799;
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '');
  try {
    const body = await readFile(join('dist', path || 'index.html'));
    res.writeHead(200, {'Content-Type': TYPES[extname(path)] || 'application/octet-stream'}).end(body);
  } catch { res.writeHead(404).end('not found'); }
}).listen(port, '127.0.0.1');
