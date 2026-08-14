(function () {
  const JS_KEYWORDS = [
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
    'do', 'else', 'export', 'extends', 'finally', 'for', 'function', 'if', 'import', 'in',
    'instanceof', 'let', 'new', 'return', 'super', 'switch', 'this', 'throw', 'try', 'typeof',
    'var', 'void', 'while', 'with', 'yield', 'async', 'await'
  ];

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function detectLanguage(filePath) {
    const path = String(filePath || '').toLowerCase();
    if (path.endsWith('.json')) return 'json';
    if (path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.cjs') || path.endsWith('.ts')) return 'js';
    if (path.endsWith('.html') || path.endsWith('.htm')) return 'html';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.md')) return 'md';
    return 'txt';
  }

  function buildSimpleHighlight(code, lang) {
    let text = escapeHtml(code);
    const tokens = [];
    const stash = (regex, cls) => {
      text = text.replace(regex, m => {
        const id = tokens.length;
        tokens.push(`<span class="${cls}">${m}</span>`);
        return `@@TOK${id}@@`;
      });
    };

    stash(/\/\*[\s\S]*?\*\//g, 'repo-token-comment');
    stash(/(^|[^:])\/\/[^\n]*/gm, 'repo-token-comment');
    stash(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, 'repo-token-string');

    if (lang === 'html') {
      stash(/&lt;\/?[a-zA-Z][^&]*?&gt;/g, 'repo-token-tag');
      stash(/\s[a-zA-Z-:]+(?==)/g, 'repo-token-attr');
    }

    if (lang === 'js' || lang === 'json') {
      stash(/\b\d+(?:\.\d+)?\b/g, 'repo-token-number');
    }

    if (lang === 'js') {
      const keywordRx = new RegExp(`\\b(${JS_KEYWORDS.join('|')})\\b`, 'g');
      stash(keywordRx, 'repo-token-keyword');
    }

    if (lang === 'json') {
      stash(/\b(true|false|null)\b/g, 'repo-token-keyword');
    }

    stash(/[=+\-*/%<>!&|^~?:]+/g, 'repo-token-operator');
    stash(/[{}()[\],.;]/g, 'repo-token-punct');

    text = text.replace(/@@TOK(\d+)@@/g, (_, idx) => tokens[Number(idx)] || '');
    return text;
  }

  function mount(host) {
    const card = document.createElement('div');
    card.className = 'repo-editor-widget';
    card.innerHTML = `
      <div class="repo-editor-connect">
        <input class="repo-editor-input" type="text" placeholder="https://github.com/usuario/repo.git" data-remote-input>
        <button class="repo-editor-btn" type="button" data-action="connect">Conectar GitHub</button>
      </div>
      <div class="repo-editor-top">
        <span class="repo-editor-branch" data-branch>branch: ...</span>
        <div class="repo-editor-remote" data-remote>origin: ...</div>
      </div>
      <div class="repo-editor-actions" style="padding: 0 10px 8px; margin-top: 6px;">
        <button class="repo-editor-btn" type="button" data-action="github_login">Login GitHub</button>
        <button class="repo-editor-btn" type="button" data-action="github_token">Crear token</button>
        <button class="repo-editor-btn" type="button" data-action="check_auth">Probar auth</button>
      </div>
      <div class="repo-editor-main">
        <div class="repo-editor-sidebar">
          <select class="repo-editor-select" data-file-select>
            <option value="">Seleccionar archivo...</option>
          </select>
          <div class="repo-editor-filelist" data-file-list></div>
        </div>
        <div class="repo-editor-work">
          <div class="repo-editor-path" data-path>Sin archivo cargado</div>
          <div class="repo-editor-actions" style="margin-top: -2px; margin-bottom: 2px;">
            <select class="repo-editor-select" data-plugin-select style="width: 220px; height: 30px;">
              <option value="">Plugin rapido...</option>
            </select>
            <button class="repo-editor-btn" type="button" data-action="run_plugin">Aplicar plugin</button>
            <span class="repo-editor-lang" data-lang>lang: txt</span>
          </div>
          <div class="repo-editor-editor-shell">
            <div class="repo-editor-gutter" data-gutter>1</div>
            <div class="repo-editor-code">
              <pre class="repo-editor-highlight" data-highlight aria-hidden="true"></pre>
              <textarea class="repo-editor-textarea" data-editor spellcheck="false"></textarea>
            </div>
          </div>
          <div class="repo-editor-commit">
            <input class="repo-editor-input" type="text" placeholder="Mensaje de commit" data-msg>
            <div class="repo-editor-actions">
              <button class="repo-editor-btn" type="button" data-action="refresh">Actualizar</button>
              <button class="repo-editor-btn" type="button" data-action="save">Guardar</button>
              <button class="repo-editor-btn" type="button" data-action="commit">Commit</button>
              <button class="repo-editor-btn" type="button" data-action="push">Push</button>
              <button class="repo-editor-btn" type="button" data-action="commit_push">Commit + Push</button>
            </div>
          </div>
        </div>
      </div>`
      // <div class="repo-editor-status" data-out>Editor repo listo.</div>`;

    const branchEl = card.querySelector('[data-branch]');
    const remoteEl = card.querySelector('[data-remote]');
    const remoteInputEl = card.querySelector('[data-remote-input]');
    const selectEl = card.querySelector('[data-file-select]');
    const listEl = card.querySelector('[data-file-list]');
    const pathEl = card.querySelector('[data-path]');
    const gutterEl = card.querySelector('[data-gutter]');
    const highlightEl = card.querySelector('[data-highlight]');
    const pluginSelectEl = card.querySelector('[data-plugin-select]');
    const langEl = card.querySelector('[data-lang]');
    const editorEl = card.querySelector('[data-editor]');
    const msgEl = card.querySelector('[data-msg]');
    const outEl = card.querySelector('[data-out]');
    let currentPath = '';
    let currentLang = 'txt';
    let repoFiles = [];
    const plugins = {
      format_json: {
        label: 'Formatear JSON',
        run(ctx) {
          if (ctx.language !== 'json') throw new Error('Este plugin aplica a archivos JSON.');
          return JSON.stringify(JSON.parse(ctx.value), null, 2);
        }
      },
      trim_spaces: {
        label: 'Quitar espacios finales',
        run(ctx) {
          return ctx.value.replace(/[ \t]+$/gm, '');
        }
      },
      sort_lines: {
        label: 'Ordenar lineas (A-Z)',
        run(ctx) {
          const lines = ctx.value.split('\n');
          return lines.slice().sort((a, b) => a.localeCompare(b, 'es')).join('\n');
        }
      }
    };

    Object.entries(plugins).forEach(([key, plugin]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = plugin.label;
      pluginSelectEl.appendChild(option);
    });

    const setOut = text => {
      outEl.textContent = String(text || '').trim() || 'Sin cambios';
    };

    function updateLineNumbers() {
      const lines = Math.max(1, editorEl.value.split('\n').length);
      let out = '';
      for (let i = 1; i <= lines; i += 1) out += `${i}\n`;
      gutterEl.textContent = out;
    }

    function syncEditorScroll() {
      const top = editorEl.scrollTop;
      const left = editorEl.scrollLeft;
      highlightEl.style.transform = `translate(${-left}px, ${-top}px)`;
      gutterEl.style.transform = `translateY(${-top}px)`;
    }

    function repaintEditor() {
      highlightEl.innerHTML = buildSimpleHighlight(editorEl.value, currentLang);
      updateLineNumbers();
      syncEditorScroll();
    }

    function applyPlugin() {
      const key = pluginSelectEl.value;
      if (!key || !plugins[key]) {
        setOut('Selecciona un plugin para aplicar.');
        return;
      }
      try {
        const next = plugins[key].run({ value: editorEl.value, path: currentPath, language: currentLang });
        if (typeof next === 'string') {
          editorEl.value = next;
          repaintEditor();
          setOut(`Plugin aplicado: ${plugins[key].label}`);
        } else {
          setOut('El plugin no devolvio contenido.');
        }
      } catch (e) {
        setOut(`Error plugin: ${e.message || 'No se pudo ejecutar'}`);
      }
    }

    function renderFileList() {
      selectEl.innerHTML = '<option value="">Seleccionar archivo...</option>';
      listEl.innerHTML = '';
      repoFiles.forEach(file => {
        const option = document.createElement('option');
        option.value = file;
        option.textContent = file;
        selectEl.appendChild(option);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'repo-editor-file' + (file === currentPath ? ' active' : '');
        btn.textContent = file;
        btn.addEventListener('click', () => loadFile(file));
        listEl.appendChild(btn);
      });
      if (currentPath) selectEl.value = currentPath;
    }

    async function loadFile(file) {
      if (!file) return;
      setOut(`Cargando ${file}...`);
      try {
        const r = await fetch(`/repo-file?path=${encodeURIComponent(file)}`);
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'file load error');
        currentPath = d.path;
        currentLang = detectLanguage(currentPath);
        langEl.textContent = `lang: ${currentLang}`;
        pathEl.textContent = d.path;
        editorEl.value = d.content || '';
        repaintEditor();
        renderFileList();
        setOut(`Archivo cargado: ${d.path}`);
      } catch (e) {
        setOut(`Error: ${e.message || 'No se pudo cargar archivo'}`);
      }
    }

    async function saveFile() {
      if (!currentPath) {
        setOut('Selecciona un archivo antes de guardar.');
        return;
      }
      setOut(`Guardando ${currentPath}...`);
      try {
        const r = await fetch('/repo-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: currentPath, content: editorEl.value })
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'save error');
        setOut(`Guardado: ${d.path}`);
      } catch (e) {
        setOut(`Error: ${e.message || 'No se pudo guardar archivo'}`);
      }
    }

    async function refreshStatus() {
      setOut('Consultando repo...');
      try {
        const [repoRes, statusRes] = await Promise.all([
          fetch('/repo-info'),
          fetch('/git-status')
        ]);
        const repo = await repoRes.json();
        const d = await statusRes.json();
        if (!repo.ok) throw new Error(repo.error || 'repo info error');
        if (!d.ok) throw new Error(d.error || 'status error');
        repoFiles = Array.isArray(repo.files) ? repo.files : [];
        branchEl.textContent = `branch: ${repo.branch || d.branch || '-'}`;
        remoteEl.textContent = `origin: ${repo.remote || 'sin remote'}`;
        remoteInputEl.value = repo.remote || remoteInputEl.value || '';
        renderFileList();
        setOut(d.status || 'Working tree limpio');
      } catch (e) {
        setOut(`Error: ${e.message || 'No se pudo obtener status'}`);
      }
    }

    async function connectGithub() {
      const remoteUrl = (remoteInputEl.value || '').trim();
      if (!remoteUrl) {
        setOut('Pega una URL de GitHub para conectar origin.');
        return;
      }
      setOut('Conectando GitHub...');
      try {
        const r = await fetch('/git-connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remoteUrl })
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'git connect error');
        remoteEl.textContent = `origin: ${d.remote}`;
        setOut(`GitHub conectado: ${d.remote}`);
        await refreshStatus();
      } catch (e) {
        setOut(`Error: ${e.message || 'No se pudo conectar GitHub'}`);
      }
    }

    function openGithubLogin() {
      // conectar a github por api sin salir de la app.
      window.open('https://github.com/login', '_blank', 'noopener,noreferrer');
      setOut('Se abrio GitHub Login en una nueva pestana. Luego volve y proba auth.');
    }

    function openGithubTokenPage() {
      window.open(
        'https://github.com/settings/tokens/new?description=WebBoard%20Repo%20Editor&scopes=repo',
        '_blank',
        'noopener,noreferrer'
      );
      setOut('Abri la pantalla de token. Si push falla por auth, crea un token con scope repo.');
    }

    async function checkAuth() {
      setOut('Probando autenticacion contra origin...');
      try {
        const r = await fetch('/git-auth-check', { method: 'POST' });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'auth check error');
        setOut(d.output || 'Auth OK');
      } catch (e) {
        setOut(`Error auth: ${e.message || 'No se pudo validar autenticacion'}`);
      }
    }

    async function doCommit() {
      const message = (msgEl.value || '').trim();
      if (!message) {
        setOut('Falta mensaje de commit.');
        return;
      }
      setOut('Ejecutando commit...');
      try {
        const r = await fetch('/git-commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'commit error');
        setOut(d.output || 'Commit OK');
        await refreshStatus();
      } catch (e) {
        setOut(`Error: ${e.message || 'No se pudo commitear'}`);
      }
    }

    async function doPush() {
      setOut('Ejecutando push...');
      try {
        const r = await fetch('/git-push', { method: 'POST' });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'push error');
        setOut(d.output || 'Push OK');
        await refreshStatus();
      } catch (e) {
        setOut(`Error: ${e.message || 'No se pudo pushear'}`);
      }
    }

    card.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.getAttribute('data-action');
        if (action === 'refresh') { await refreshStatus(); return; }
        if (action === 'connect') { await connectGithub(); return; }
        if (action === 'github_login') { openGithubLogin(); return; }
        if (action === 'github_token') { openGithubTokenPage(); return; }
        if (action === 'check_auth') { await checkAuth(); return; }
        if (action === 'run_plugin') { applyPlugin(); return; }
        if (action === 'save') { await saveFile(); return; }
        if (action === 'commit') { await doCommit(); return; }
        if (action === 'push') { await doPush(); return; }
        if (action === 'commit_push') {
          await doCommit();
          await doPush();
        }
      });
    });

    selectEl.addEventListener('change', () => loadFile(selectEl.value));
    editorEl.addEventListener('input', repaintEditor);
    editorEl.addEventListener('scroll', syncEditorScroll);
    editorEl.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = editorEl.selectionStart;
        const end = editorEl.selectionEnd;
        const value = editorEl.value;
        editorEl.value = `${value.slice(0, start)}  ${value.slice(end)}`;
        editorEl.selectionStart = editorEl.selectionEnd = start + 2;
        repaintEditor();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveFile();
      }
    });

    repaintEditor();

    refreshStatus();
    host.appendChild(card);
  }

  window.RepoEditorWidget = { mount };
})();
