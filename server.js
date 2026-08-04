// Servidor local mínimo — node server.js
const http = require('http');
const https = require('https');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
};

http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);

  /* ── POST /save-config ───────────────────────────────────────── */
  if (req.method === 'POST' && urlPath === '/save-config') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('invalid');
        const configPath = path.join(ROOT, 'config.json');
        fs.writeFile(configPath, JSON.stringify(data, null, 2), err => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'write error' }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          }
        });
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }));
      }
    });
    return;
  }

  /* ── GET /yt-search?q=... ──────────────────────────────────── */
  if (req.method === 'GET' && urlPath === '/yt-search') {
    const q = (parsedUrl.searchParams.get('q') || '').trim();
    if (!q) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, items: [] }));
      return;
    }

    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    https.get(ytUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      }
    }, ytRes => {
      if (ytRes.statusCode !== 200) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'youtube unavailable' }));
        ytRes.resume();
        return;
      }

      let html = '';
      ytRes.on('data', chunk => { html += chunk; });
      ytRes.on('end', () => {
        try {
          const decodeText = (s) => (s || '')
            .replace(/\\u0026/g, '&')
            .replace(/\\\//g, '/')
            .replace(/\\"/g, '"')
            .replace(/\s+/g, ' ')
            .trim();

          const items = [];
          const seen = new Set();
          const idRx = /"videoId":"([A-Za-z0-9_-]{11})"/g;
          let m;

          while ((m = idRx.exec(html)) && items.length < 12) {
            const id = m[1];
            if (seen.has(id)) continue;
            seen.add(id);

            const chunk = html.slice(m.index, m.index + 1800);
            const titleRuns = chunk.match(/"title":\{"runs":\[\{"text":"([^"]+)"/);
            const titleSimple = chunk.match(/"title":\{"simpleText":"([^"]+)"/);
            const ownerRuns = chunk.match(/"ownerText":\{"runs":\[\{"text":"([^"]+)"/);

            const title = decodeText(titleRuns?.[1] || titleSimple?.[1]);
            const owner = decodeText(ownerRuns?.[1]);
            const fallback = owner
              ? `Video de ${owner} (youtu.be/${id})`
              : `Video de YouTube (youtu.be/${id})`;

            items.push({ id, title: title || fallback, autoplay: items.length === 0 });
          }

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, items }));
        } catch {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'parse error' }));
        }
      });
    }).on('error', () => {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'network error' }));
    });
    return;
  }

  /* ── Static files ─────────────────────────────────────────────── */
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(ROOT, urlPath);
  const ext  = path.extname(file).toLowerCase();

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`\n  WebBoard corriendo en → http://localhost:${PORT}\n`);
});
