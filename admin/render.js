const NAV_ITEMS = [
    { key: 'home', label: 'Resumen', href: '/admin' },
    { key: 'contacts', label: 'Contactos', href: '/admin/contacts' },
    { key: 'messages', label: 'Mensajes', href: '/admin/messages' },
    { key: 'campaigns', label: 'Campanas', href: '/admin/campaigns' },
    { key: 'opt-outs', label: 'Opt-outs', href: '/admin/opt-outs' }
];

export function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function truncate(value = '', max = 80) {
    const text = String(value || '');
    if (text.length <= max) {
        return text;
    }
    return `${text.slice(0, Math.max(0, max - 3))}...`;
}

export function formatDate(value) {
    if (!value) {
        return '';
    }
    return String(value).replace('T', ' ');
}

export function renderBadge(value, tone = 'muted') {
    const safe = escapeHtml(value || '');
    return `<span class="badge badge-${tone}">${safe}</span>`;
}

export function renderLayout({ title, content, active }) {
    const nav = NAV_ITEMS.map((item) => {
        const isActive = item.key === active ? 'active' : '';
        return `<a class="nav-link ${isActive}" href="${item.href}">${item.label}</a>`;
    }).join('');

    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} | WA Test</title>
  <style>
    :root {
      --bg: #f3efe7;
      --bg-accent: #f8f6f1;
      --panel: #ffffff;
      --ink: #1f1d1b;
      --muted: #5d5b56;
      --accent: #c85b34;
      --accent-2: #1f7a6b;
      --line: #e6e0d8;
      --shadow: 0 18px 38px rgba(31, 29, 27, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Alegreya Sans", "Trebuchet MS", sans-serif;
      color: var(--ink);
      background: radial-gradient(circle at 15% 20%, #fbf4e9 0%, var(--bg) 45%, #eff6f3 100%);
    }
    .shell {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      padding: 28px 32px 14px;
    }
    .title {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: 0.2px;
    }
    .subtitle {
      margin-top: 6px;
      color: var(--muted);
      font-size: 14px;
    }
    nav {
      display: flex;
      gap: 12px;
      padding: 0 32px 18px;
      flex-wrap: wrap;
    }
    .nav-link {
      padding: 8px 14px;
      border-radius: 999px;
      background: var(--bg-accent);
      color: var(--muted);
      border: 1px solid var(--line);
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.2px;
    }
    .nav-link.active {
      background: var(--ink);
      color: #fff;
      border-color: var(--ink);
    }
    main {
      padding: 0 32px 40px;
      flex: 1;
    }
    .panel {
      background: var(--panel);
      border-radius: 18px;
      padding: 20px;
      box-shadow: var(--shadow);
      border: 1px solid var(--line);
    }
    .panel + .panel {
      margin-top: 18px;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .panel-header h1 {
      margin: 0;
      font-size: 20px;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 14px;
    }
    .card {
      padding: 16px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: #fff9f2;
    }
    .card h2 {
      margin: 0;
      font-size: 13px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .card p {
      margin: 8px 0 0;
      font-size: 24px;
      font-weight: 700;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      text-align: left;
      padding: 10px 8px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--muted);
    }
    .muted { color: var(--muted); }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      border: 1px solid transparent;
    }
    .badge-muted { background: #f1f1ef; color: var(--muted); }
    .badge-good { background: #e0f3ee; color: #1f7a6b; border-color: #c5e8df; }
    .badge-warn { background: #fff0dc; color: #b15a14; border-color: #f5d0a8; }
    .badge-bad { background: #fce8e8; color: #b23a3a; border-color: #f5c3c3; }
    .badge-accent { background: #f7e6df; color: #c85b34; border-color: #ecc7b9; }
    form.inline {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    input[type="text"], select {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid var(--line);
      font-size: 13px;
      min-width: 160px;
    }
    button {
      padding: 8px 12px;
      border-radius: 10px;
      border: 1px solid var(--ink);
      background: var(--ink);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.4px;
      cursor: pointer;
    }
    .pager {
      display: flex;
      justify-content: space-between;
      margin-top: 12px;
      font-size: 12px;
    }
    .pager a {
      color: var(--accent);
      text-decoration: none;
      font-weight: 600;
    }
    .empty {
      padding: 20px;
      border-radius: 12px;
      background: #f8f5f1;
      border: 1px dashed var(--line);
      color: var(--muted);
    }
    @media (max-width: 700px) {
      header, nav, main { padding-left: 18px; padding-right: 18px; }
      .panel { padding: 16px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div class="title">WA Test Dashboard</div>
      <div class="subtitle">Resumen rapido de contactos, campanas y mensajes.</div>
    </header>
    <nav>${nav}</nav>
    <main>${content}</main>
  </div>
</body>
</html>`;
}

export function renderTable({ columns, rows }) {
    if (!rows.length) {
        return '<div class="empty">Sin datos para mostrar.</div>';
    }
    const header = columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join('');
    const body = rows.map((row) => {
        const cells = columns.map((col) => {
            if (col.render) {
                return `<td>${col.render(row)}</td>`;
            }
            const value = row[col.key];
            return `<td>${escapeHtml(value ?? '')}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    return `<table>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

export function renderPager({ basePath, query, offset, limit, hasNext }) {
    const prevOffset = Math.max(0, offset - limit);
    const nextOffset = offset + limit;
    const prevLink = offset > 0 ? `${basePath}?${buildQuery({ ...query, offset: prevOffset, limit })}` : '';
    const nextLink = hasNext ? `${basePath}?${buildQuery({ ...query, offset: nextOffset, limit })}` : '';

    return `<div class="pager">
      <div>${prevLink ? `<a href="${prevLink}">← Anterior</a>` : ''}</div>
      <div>${nextLink ? `<a href="${nextLink}">Siguiente →</a>` : ''}</div>
    </div>`;
}

export function buildQuery(params) {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
            return;
        }
        search.set(key, String(value));
    });
    return search.toString();
}
