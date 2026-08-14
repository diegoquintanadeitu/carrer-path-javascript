// Servidor local mínimo — node server.js
const http = require('http');
const https = require('https');
const fs   = require('fs');
const path = require('path');
const { execFile } = require('child_process');

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

function runGit(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: ROOT, timeout: 20000 }, (err, stdout, stderr) => {
      const out = (stdout || '').toString();
      const errOut = (stderr || '').toString();
      if (err) {
        reject(new Error(errOut.trim() || out.trim() || err.message));
        return;
      }
      resolve({ stdout: out, stderr: errOut });
    });
  });
}

function sendJson(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function resolveRepoPath(relPath) {
  const safeRel = String(relPath || '').replace(/^\/+/, '');
  const resolved = path.resolve(ROOT, safeRel);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) return null;
  return resolved;
}

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

  if (req.method === 'GET' && urlPath === '/repo-info') {
    (async () => {
      try {
        const branch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
        const remote = await runGit(['remote', 'get-url', 'origin']).catch(() => ({ stdout: '' }));
        const files = await runGit(['ls-files']);
        sendJson(res, 200, {
          ok: true,
          branch: branch.stdout.trim(),
          remote: remote.stdout.trim(),
          files: files.stdout.split('\n').map(s => s.trim()).filter(Boolean),
        });
      } catch (e) {
        sendJson(res, 500, { ok: false, error: e.message || 'repo info error' });
      }
    })();
    return;
  }

  if (req.method === 'GET' && urlPath === '/repo-file') {
    const relPath = (parsedUrl.searchParams.get('path') || '').trim();
    const filePath = resolveRepoPath(relPath);
    if (!relPath || !filePath) {
      sendJson(res, 400, { ok: false, error: 'invalid path' });
      return;
    }
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        sendJson(res, 404, { ok: false, error: 'file not found' });
        return;
      }
      sendJson(res, 200, { ok: true, path: relPath, content: data });
    });
    return;
  }

  if (req.method === 'POST' && urlPath === '/repo-file') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        const relPath = (data && data.path ? String(data.path) : '').trim();
        const content = data && typeof data.content === 'string' ? data.content : null;
        const filePath = resolveRepoPath(relPath);
        if (!relPath || !filePath || content === null) {
          sendJson(res, 400, { ok: false, error: 'invalid payload' });
          return;
        }
        fs.writeFile(filePath, content, 'utf8', err => {
          if (err) {
            sendJson(res, 500, { ok: false, error: 'write error' });
            return;
          }
          sendJson(res, 200, { ok: true, path: relPath });
        });
      } catch {
        sendJson(res, 400, { ok: false, error: 'invalid JSON' });
      }
    });
    return;
  }

  if (req.method === 'POST' && urlPath === '/git-connect') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      (async () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const remoteUrl = (data && data.remoteUrl ? String(data.remoteUrl) : '').trim();
          if (!/^https:\/\/github\.com\/.+|^git@github\.com:.+/i.test(remoteUrl)) {
            sendJson(res, 400, { ok: false, error: 'github url invalida' });
            return;
          }
          const hasOrigin = await runGit(['remote', 'get-url', 'origin'])
            .then(() => true)
            .catch(() => false);
          if (hasOrigin) await runGit(['remote', 'set-url', 'origin', remoteUrl]);
          else await runGit(['remote', 'add', 'origin', remoteUrl]);
          sendJson(res, 200, { ok: true, remote: remoteUrl });
        } catch (e) {
          sendJson(res, 500, { ok: false, error: e.message || 'git connect error' });
        }
      })();
    });
    return;
  }

  /* ── Git agent endpoints ────────────────────────────────────── */
  if (req.method === 'GET' && urlPath === '/git-status') {
    (async () => {
      try {
        const branch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
        const status = await runGit(['status', '--short']);
        sendJson(res, 200, {
          ok: true,
          branch: branch.stdout.trim(),
          status: status.stdout.trim(),
        });
      } catch (e) {
        sendJson(res, 500, { ok: false, error: e.message || 'git status error' });
      }
    })();
    return;
  }

  if (req.method === 'POST' && urlPath === '/git-commit') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      (async () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const message = (data && data.message ? String(data.message) : '').trim();
          if (!message) {
            sendJson(res, 400, { ok: false, error: 'commit message required' });
            return;
          }
          await runGit(['add', '-A']);
          const commit = await runGit(['commit', '-m', message]);
          sendJson(res, 200, { ok: true, output: (commit.stdout || commit.stderr || '').trim() });
        } catch (e) {
          sendJson(res, 500, { ok: false, error: e.message || 'git commit error' });
        }
      })();
    });
    return;
  }

  if (req.method === 'POST' && urlPath === '/git-push') {
    (async () => {
      try {
        const push = await runGit(['push']);
        sendJson(res, 200, { ok: true, output: (push.stdout || push.stderr || '').trim() });
      } catch (e) {
        sendJson(res, 500, { ok: false, error: e.message || 'git push error' });
      }
    })();
    return;
  }

  if (req.method === 'POST' && urlPath === '/git-auth-check') {
    (async () => {
      try {
        const probe = await runGit(['ls-remote', '--heads', 'origin']);
        const summary = (probe.stdout || '').split('\n').filter(Boolean)[0] || 'Auth OK con origin';
        sendJson(res, 200, { ok: true, output: summary });
      } catch (e) {
        sendJson(res, 500, { ok: false, error: e.message || 'git auth check error' });
      }
    })();
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
