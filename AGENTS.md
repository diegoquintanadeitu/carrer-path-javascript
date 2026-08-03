# AGENTS - diegoquintana.ar

Project context
- Product: static dashboard-like web app with local Node server.
- Stack: HTML/CSS/JS + server.js (Node http module).
- Runtime: Node.

Source of truth
- Product map: ../workspace_summary.md
- Main app: index.html
- Local server: server.js
- Persisted state: config.json

Operating rules for agents
1. Work only inside `diegoquintana.ar`.
2. Keep server simple; avoid introducing heavy dependencies unless requested.
3. Preserve `/save-config` behavior and config file shape unless task requires change.

Allowed commands
- node server.js

Required validation before completion
1. Start local server with node server.js.
2. Validate that static assets are served.
3. Validate POST /save-config if server/config logic changed.

Definition of done
1. App still serves from root path.
2. Config persistence works when touched.
3. No unrelated re-architecture introduced.

Known risks
- No package.json toolchain by default.
- Browser-facing behavior mostly embedded in one HTML file, so regressions can be broad.
