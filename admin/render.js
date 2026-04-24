const NAV_ITEMS = [
  { key: 'home', label: 'Resumen', href: '/admin', icon: 'bar-chart' },
  { key: 'contacts', label: 'Contactos', href: '/admin/contacts', icon: 'users' },
  { key: 'vehicles', label: 'Vehículos', href: '/admin/vehicles', icon: 'car' },
  { key: 'messages', label: 'Mensajes', href: '/admin/messages', icon: 'message-square' },
  { key: 'lab-chat', label: 'Lab Chat', href: '/admin/lab/chat', icon: 'message-square' },
  { key: 'campaigns', label: 'Campanas', href: '/admin/campaigns', icon: 'send' },
  { key: 'templates', label: 'Templates', href: '/admin/templates', icon: 'file-text' },
  { key: 'opt-outs', label: 'Opt-outs', href: '/admin/opt-outs', icon: 'user-x' },
  { key: 'import', label: 'Importar', href: '/admin/import', icon: 'upload' }
];

// Inline Lucide-style SVG icon library. Keeps bundle small and avoids CDN dependency.
const ICONS = {
  'bar-chart': '<path d="M3 3v18h18"/><path d="M7 16V10"/><path d="M12 16V7"/><path d="M17 16v-4"/>',
  'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'message-square': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  'send': '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  'user-x': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5"/><path d="m22 8-5 5"/>',
  'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'trash': '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  'edit': '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  'copy': '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  'check': '<polyline points="20 6 9 17 4 12"/>',
  'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'x-circle': '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  'x': '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  'phone': '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  'car': '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  'inbox': '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  'arrow-up-right': '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
  'arrow-down-left': '<line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/>',
  'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  'arrow-left': '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  'pause': '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
  'play': '<polygon points="5 3 19 12 5 21 5 3"/>',
  'refresh': '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/>',
  'plus': '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'user': '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'filter': '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  'chevron-right': '<polyline points="9 18 15 12 9 6"/>',
  'chevron-down': '<polyline points="6 9 12 15 18 9"/>'
};

export function renderIcon(name, size = 16, extraClass = '') {
  const path = ICONS[name];
  if (!path) {
    return '';
  }
  const cls = `icon ${extraClass}`.trim();
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

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
    const icon = item.icon ? renderIcon(item.icon, 15) : '';
    return `<a class="nav-link ${isActive}" href="${item.href}">${icon}<span>${item.label}</span></a>`;
  }).join('');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} | Queirolo Autos</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      /* ---------- Brand ---------- */
      --brand-50:  #fdf4ef;
      --brand-100: #fce9df;
      --brand-200: #f7d1bd;
      --brand-500: #c85b34;
      --brand-600: #a04923;

      /* ---------- Semantic tones ---------- */
      --success-50:  #ecf8f4;
      --success-100: #e0f3ee;
      --success-500: #1f7a6b;
      --success-700: #175d52;

      --warn-50:  #fff7ea;
      --warn-100: #fff0dc;
      --warn-500: #b15a14;

      --danger-50:  #fdecec;
      --danger-100: #fce8e8;
      --danger-500: #b23a3a;

      --info-50:  #eef4fb;
      --info-100: #e1ecf6;
      --info-500: #2c5f8a;

      /* ---------- Neutrals ---------- */
      --ink-900: #1f1d1b;
      --ink-700: #3a3836;
      --ink-500: #5d5b56;
      --ink-400: #7a7873;
      --ink-300: #a8a49c;
      --ink-200: #d9d5cc;
      --ink-100: #ebe6dc;

      --surface-0: #ffffff;
      --surface-1: #fbf8f3;
      --surface-2: #f3efe7;
      --surface-3: #ece7dc;

      /* ---------- Legacy aliases (mantener compatibilidad) ---------- */
      --bg: var(--surface-2);
      --bg-accent: var(--surface-1);
      --panel: var(--surface-0);
      --ink: var(--ink-900);
      --muted: var(--ink-500);
      --accent: var(--brand-500);
      --accent-2: var(--success-500);
      --line: var(--ink-100);
      --bad: var(--danger-500);

      /* ---------- Spacing ---------- */
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 12px;
      --space-4: 16px;
      --space-5: 20px;
      --space-6: 24px;
      --space-8: 32px;
      --space-10: 40px;

      /* ---------- Radius ---------- */
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 14px;
      --radius-xl: 18px;
      --radius-full: 999px;

      /* ---------- Shadow ---------- */
      --shadow-1: 0 1px 2px rgba(31, 29, 27, 0.05);
      --shadow-2: 0 2px 8px rgba(31, 29, 27, 0.06);
      --shadow-3: 0 8px 24px rgba(31, 29, 27, 0.08);
      --shadow: 0 18px 38px rgba(31, 29, 27, 0.08);

      --font-ui: "Inter", "Segoe UI", "Trebuchet MS", sans-serif;
      --font-mono: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
    }

    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0;
      font-family: var(--font-ui);
      font-feature-settings: 'cv11', 'ss01';
      color: var(--ink-900);
      background: radial-gradient(circle at 15% 20%, #fbf4e9 0%, var(--surface-2) 45%, #eff6f3 100%);
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    a { color: inherit; }
    a:focus-visible,
    button:focus-visible,
    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible {
      outline: 2px solid var(--brand-500);
      outline-offset: 2px;
    }
    code, .mono, .phone-text, .sid-text {
      font-family: var(--font-mono);
      font-size: 0.92em;
      letter-spacing: -0.01em;
    }

    /* ---------- Shell ---------- */
    .shell {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header.app-header {
      padding: 26px 32px 10px;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-mark {
      width: 44px;
      height: 44px;
      border-radius: var(--radius-lg);
      background: linear-gradient(135deg, var(--brand-500), var(--brand-600));
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--shadow-2);
      flex-shrink: 0;
    }
    .brand-mark svg { width: 22px; height: 22px; }
    .brand-text .title {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.2px;
      color: var(--ink-900);
      line-height: 1.2;
    }
    .brand-text .subtitle {
      margin-top: 3px;
      color: var(--ink-500);
      font-size: 13px;
      letter-spacing: 0.1px;
    }

    /* ---------- Navigation ---------- */
    nav.app-nav {
      display: flex;
      gap: 6px;
      padding: 6px 24px 18px;
      flex-wrap: wrap;
      margin: 0 8px;
    }
    .nav-link {
      padding: 8px 14px;
      border-radius: var(--radius-full);
      background: var(--surface-1);
      color: var(--ink-500);
      border: 1px solid var(--ink-100);
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.1px;
      transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .nav-link svg { opacity: 0.75; }
    .nav-link:hover {
      background: var(--ink-900);
      color: #fff;
      border-color: var(--ink-900);
    }
    .nav-link:hover svg { opacity: 1; }
    .nav-link.active {
      background: var(--ink-900);
      color: #fff;
      border-color: var(--ink-900);
    }
    .nav-link.active svg { opacity: 1; }

    main { padding: 0 32px 40px; flex: 1; }

    /* ---------- Panel & cards ---------- */
    .panel {
      background: var(--surface-0);
      border-radius: var(--radius-xl);
      padding: 22px;
      box-shadow: var(--shadow);
      border: 1px solid var(--ink-100);
    }
    .panel + .panel { margin-top: 18px; }
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
      font-weight: 700;
      letter-spacing: -0.2px;
    }
    .panel-header h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.1px;
    }
    .help-text {
      background: var(--surface-1);
      border-left: 3px solid var(--success-500);
      padding: 12px 14px;
      margin-bottom: 16px;
      border-radius: var(--radius-md);
      font-size: 13px;
      color: var(--ink-500);
      line-height: 1.55;
    }
    .help-text strong { color: var(--ink-900); font-weight: 600; }
    .help-text code {
      background: var(--surface-2);
      padding: 1px 6px;
      border-radius: 4px;
      color: var(--ink-700);
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 14px;
    }
    .card {
      padding: 18px;
      border-radius: var(--radius-lg);
      border: 1px solid var(--ink-100);
      background: var(--surface-0);
      transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
      display: flex;
      flex-direction: column;
      gap: 8px;
      position: relative;
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-3);
      border-color: var(--brand-200);
    }
    .card h2 {
      margin: 0;
      font-size: 11px;
      color: var(--ink-500);
      text-transform: uppercase;
      letter-spacing: 1.1px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .card p {
      margin: 0;
      font-size: 30px;
      font-weight: 700;
      font-feature-settings: 'tnum';
      letter-spacing: -0.5px;
      line-height: 1;
    }
    .card-kicker {
      font-size: 11px;
      color: var(--ink-400);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .card-accent { border-top: 3px solid var(--brand-500); }

    /* ---------- Tables ---------- */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      text-align: left;
      padding: 11px 10px;
      border-bottom: 1px solid var(--ink-100);
      vertical-align: top;
    }
    tr { transition: background 0.12s ease; }
    tbody tr:hover { background: var(--surface-1); }
    th {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--ink-500);
      cursor: pointer;
      user-select: none;
      position: sticky;
      top: 0;
      background: var(--surface-0);
      font-weight: 600;
      z-index: 1;
    }
    th.sortable:hover { color: var(--brand-500); }
    th .sort-icon {
      display: inline-block;
      margin-left: 4px;
      opacity: 0.3;
      font-size: 10px;
    }
    th.sorted .sort-icon { opacity: 1; color: var(--brand-500); }
    tbody td { font-feature-settings: 'tnum'; }

    /* ---------- Action button ---------- */
    .row-actions {
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }
    .action-btn {
      padding: 6px 10px;
      font-size: 12px;
      background: var(--surface-1);
      color: var(--ink-700);
      border: 1px solid var(--ink-100);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all 0.15s ease;
      text-decoration: none;
      font-weight: 600;
      font-family: var(--font-ui);
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .action-btn:hover {
      background: var(--brand-500);
      color: #fff;
      border-color: var(--brand-500);
    }
    .action-btn.ghost:hover {
      background: var(--surface-2);
      color: var(--ink-900);
      border-color: var(--ink-200);
    }
    .action-btn.primary {
      background: var(--brand-500);
      color: #fff;
      border-color: var(--brand-500);
    }
    .action-btn.primary:hover {
      background: var(--brand-600);
      border-color: var(--brand-600);
    }
    .action-btn.danger {
      background: var(--surface-1);
      color: var(--danger-500);
      border-color: var(--ink-100);
    }
    .action-btn.danger:hover {
      background: var(--danger-500);
      color: #fff;
      border-color: var(--danger-500);
    }

    /* ---------- Search ---------- */
    .search-box {
      position: relative;
      display: inline-block;
    }
    .search-box input { padding-left: 34px; }
    .search-box .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--ink-400);
      pointer-events: none;
    }

    .muted { color: var(--ink-500); }

    /* ---------- Badges ---------- */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 9px;
      border-radius: var(--radius-full);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .badge-muted  { background: var(--surface-2); color: var(--ink-500); border-color: var(--ink-100); }
    .badge-good   { background: var(--success-100); color: var(--success-700); border-color: #c5e8df; }
    .badge-warn   { background: var(--warn-100); color: var(--warn-500); border-color: #f5d0a8; }
    .badge-bad    { background: var(--danger-100); color: var(--danger-500); border-color: #f5c3c3; }
    .badge-accent { background: var(--brand-100); color: var(--brand-500); border-color: var(--brand-200); }
    .badge-info   { background: var(--info-100); color: var(--info-500); border-color: #cfe1f0; }

    /* ---------- Forms ---------- */
    form.inline {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    input[type="text"],
    input[type="number"],
    input[type="datetime-local"],
    input[type="email"],
    input[type="url"],
    input[type="file"],
    select,
    textarea {
      padding: 9px 11px;
      border-radius: var(--radius-md);
      border: 1px solid var(--ink-100);
      font-size: 13px;
      min-width: 160px;
      transition: border-color 0.18s ease, box-shadow 0.18s ease;
      font-family: var(--font-ui);
      background: var(--surface-0);
      color: var(--ink-900);
    }
    input[type="text"]:focus,
    input[type="number"]:focus,
    input[type="datetime-local"]:focus,
    input[type="email"]:focus,
    input[type="url"]:focus,
    select:focus,
    textarea:focus {
      outline: none;
      border-color: var(--brand-500);
      box-shadow: 0 0 0 3px rgba(200, 91, 52, 0.15);
    }
    label { font-size: 13px; }

    button {
      padding: 9px 14px;
      border-radius: var(--radius-md);
      border: 1px solid var(--ink-900);
      background: var(--ink-900);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.4px;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.12s ease;
      font-family: var(--font-ui);
    }
    button:hover { background: var(--brand-500); border-color: var(--brand-500); }
    button:active { transform: translateY(1px); }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      background: var(--ink-300);
      border-color: var(--ink-300);
    }

    /* ---------- Pager ---------- */
    .pager {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 14px;
      font-size: 12px;
      color: var(--ink-500);
    }
    .pager a {
      color: var(--brand-500);
      text-decoration: none;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: var(--radius-md);
      transition: background 0.15s ease;
    }
    .pager a:hover { background: var(--surface-1); }

    /* ---------- Empty state ---------- */
    .empty {
      padding: 36px 22px;
      border-radius: var(--radius-lg);
      background: var(--surface-1);
      border: 1px dashed var(--ink-100);
      color: var(--ink-500);
      text-align: center;
    }
    .empty-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--ink-900);
      margin-bottom: 6px;
    }
    .empty-cta {
      margin-top: 14px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 18px;
      background: var(--brand-500);
      color: #fff;
      border-radius: var(--radius-md);
      text-decoration: none;
      font-weight: 600;
      font-size: 13px;
      transition: background 0.15s ease;
    }
    .empty-cta:hover { background: var(--brand-600); }

    .hidden { display: none !important; }

    /* ---------- Inbox (mensajes) ---------- */
    .inbox {
      display: grid;
      grid-template-columns: minmax(280px, 360px) 1fr;
      gap: 16px;
      min-height: 540px;
    }
    .inbox-list {
      background: var(--surface-0);
      border: 1px solid var(--ink-100);
      border-radius: var(--radius-lg);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      max-height: 72vh;
    }
    .inbox-toolbar {
      padding: 12px 14px;
      border-bottom: 1px solid var(--ink-100);
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--surface-1);
    }
    .inbox-toolbar .search-box { flex: 1; }
    .inbox-toolbar input[type="text"] {
      width: 100%;
      min-width: 0;
      background: var(--surface-0);
      font-size: 12.5px;
    }
    .inbox-count {
      padding: 8px 14px;
      font-size: 11px;
      color: var(--ink-500);
      text-transform: uppercase;
      letter-spacing: 0.8px;
      border-bottom: 1px solid var(--ink-100);
      background: var(--surface-1);
    }
    .inbox-items {
      overflow-y: auto;
      flex: 1;
    }
    .inbox-item {
      padding: 12px 14px;
      border-bottom: 1px solid var(--ink-100);
      cursor: pointer;
      display: flex;
      gap: 10px;
      align-items: flex-start;
      transition: background 0.15s ease;
      border-left: 3px solid transparent;
    }
    .inbox-item:hover { background: var(--surface-1); }
    .inbox-item.active {
      background: var(--brand-50);
      border-left-color: var(--brand-500);
    }
    .inbox-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--brand-200), var(--brand-100));
      color: var(--brand-600);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 13px;
      flex-shrink: 0;
    }
    .inbox-body {
      flex: 1;
      min-width: 0;
    }
    .inbox-row1 {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }
    .inbox-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--ink-900);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .inbox-time {
      font-size: 11px;
      color: var(--ink-400);
      flex-shrink: 0;
      font-feature-settings: 'tnum';
    }
    .inbox-phone {
      font-family: var(--font-mono);
      font-size: 11.5px;
      color: var(--ink-500);
      margin-top: 1px;
    }
    .inbox-row3 {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
    }
    .inbox-dir-icon {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
    }
    .inbox-dir-in  { background: var(--info-100); color: var(--info-500); }
    .inbox-dir-out { background: var(--success-100); color: var(--success-700); }
    .inbox-preview {
      font-size: 12px;
      color: var(--ink-500);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }
    .inbox-meta {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      margin-top: 6px;
    }

    /* ---------- Conversation pane ---------- */
    .conv-pane {
      background: var(--surface-0);
      border: 1px solid var(--ink-100);
      border-radius: var(--radius-lg);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      max-height: 72vh;
    }
    .conv-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--ink-400);
      padding: 40px 24px;
      text-align: center;
      gap: 10px;
    }
    .conv-empty svg { opacity: 0.4; }
    .conv-header {
      padding: 14px 18px;
      border-bottom: 1px solid var(--ink-100);
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--surface-1);
    }
    .conv-header .inbox-avatar { width: 40px; height: 40px; font-size: 14px; }
    .conv-header-main { flex: 1; min-width: 0; }
    .conv-header-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--ink-900);
    }
    .conv-header-sub {
      font-size: 11.5px;
      color: var(--ink-500);
      font-family: var(--font-mono);
      margin-top: 2px;
    }
    .conv-body {
      flex: 1;
      overflow-y: auto;
      padding: 18px;
      background: var(--surface-1);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .conv-date-sep {
      align-self: center;
      font-size: 10.5px;
      color: var(--ink-500);
      padding: 3px 10px;
      background: var(--surface-0);
      border-radius: var(--radius-full);
      border: 1px solid var(--ink-100);
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin: 6px 0;
    }
    .bubble {
      max-width: 78%;
      padding: 10px 12px;
      border-radius: var(--radius-lg);
      font-size: 13.5px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      box-shadow: var(--shadow-1);
      position: relative;
    }
    .bubble .bubble-meta {
      margin-top: 5px;
      font-size: 10.5px;
      color: var(--ink-400);
      display: flex;
      align-items: center;
      gap: 6px;
      font-feature-settings: 'tnum';
    }
    .bubble.inbound {
      align-self: flex-start;
      background: var(--surface-0);
      border: 1px solid var(--ink-100);
      border-top-left-radius: 4px;
    }
    .bubble.outbound {
      align-self: flex-end;
      background: linear-gradient(180deg, #e9f7f2, #dff1ea);
      border: 1px solid #c5e8df;
      color: var(--ink-900);
      border-top-right-radius: 4px;
    }
    .conv-caption {
      align-self: center;
      font-size: 11px;
      color: var(--ink-500);
      padding: 6px 10px;
    }

    /* ---------- Filter chips ---------- */
    .chip-group {
      display: inline-flex;
      gap: 4px;
      padding: 3px;
      background: var(--surface-1);
      border: 1px solid var(--ink-100);
      border-radius: var(--radius-full);
    }
    .chip {
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 600;
      color: var(--ink-500);
      border-radius: var(--radius-full);
      cursor: pointer;
      text-decoration: none;
      border: none;
      background: transparent;
      font-family: var(--font-ui);
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .chip:hover { color: var(--ink-900); }
    .chip.active {
      background: var(--surface-0);
      color: var(--ink-900);
      box-shadow: var(--shadow-1);
    }

    @media (max-width: 900px) {
      .inbox { grid-template-columns: 1fr; }
      .inbox-list { max-height: none; }
      .conv-pane { max-height: none; }
    }
    @media (max-width: 700px) {
      header.app-header, nav.app-nav, main {
        padding-left: 18px;
        padding-right: 18px;
      }
      .panel { padding: 16px; }
      .cards { grid-template-columns: 1fr; }
      table { font-size: 12px; }
      th, td { padding: 9px 6px; }
      .brand-text .title { font-size: 19px; }
      .brand-text .subtitle { font-size: 12px; }
    }
    @media (prefers-reduced-motion: reduce) {
      * { animation: none !important; transition: none !important; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="app-header">
      <div class="brand-mark">${renderIcon('car', 22)}</div>
      <div class="brand-text">
        <div class="title">Queirolo Autos · Centro de comunicaciones</div>
        <div class="subtitle">WhatsApp · Campañas · Seguimiento</div>
      </div>
    </header>
    <nav class="app-nav">${nav}</nav>
    <main>${content}</main>
  </div>
</body>
</html>`;
}

export function renderHelpText(text) {
  return `<div class="help-text">${text}</div>`;
}

export function renderEmptyState({ title, message, ctaText, ctaLink }) {
  const cta = ctaText && ctaLink
    ? `<a href="${ctaLink}" class="empty-cta">${escapeHtml(ctaText)}</a>`
    : '';
  return `<div class="empty">
      <div class="empty-title">${escapeHtml(title)}</div>
      <div>${escapeHtml(message)}</div>
      ${cta}
    </div>`;
}

export function renderTable({ columns, rows, searchable = false, sortable = false, tableId = 'data-table' }) {
  if (!rows.length) {
    return '<div class="empty">Sin datos para mostrar.</div>';
  }

  const header = columns.map((col) => {
    const sortClass = sortable ? 'sortable' : '';
    const sortIcon = sortable ? '<span class="sort-icon">↕</span>' : '';
    return `<th class="${sortClass}" data-key="${col.key}">${escapeHtml(col.label)}${sortIcon}</th>`;
  }).join('');

  const body = rows.map((row, idx) => {
    const cells = columns.map((col) => {
      if (col.render) {
        return `<td>${col.render(row)}</td>`;
      }
      const value = row[col.key];
      return `<td>${escapeHtml(value ?? '')}</td>`;
    }).join('');
    return `<tr data-row-index="${idx}">${cells}</tr>`;
  }).join('');

  const searchBox = searchable
    ? `<div class="search-box" style="margin-bottom: 12px;">
             <span class="search-icon">${renderIcon('search', 14)}</span>
             <input type="text" id="${tableId}-search" placeholder="Buscar en tabla..." />
           </div>`
    : '';

  const script = (searchable || sortable) ? `
      <script>
      (function() {
        const table = document.getElementById('${tableId}');
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        ${searchable ? `
        const searchInput = document.getElementById('${tableId}-search');
        searchInput.addEventListener('input', function(e) {
          const query = e.target.value.toLowerCase();
          rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.classList.toggle('hidden', !text.includes(query));
          });
        });
        ` : ''}

        ${sortable ? `
        let currentSort = { key: null, asc: true };
        const headers = table.querySelectorAll('th.sortable');

        headers.forEach(th => {
          th.addEventListener('click', function() {
            const key = this.dataset.key;
            const asc = currentSort.key === key ? !currentSort.asc : true;
            currentSort = { key, asc };

            headers.forEach(h => h.classList.remove('sorted'));
            this.classList.add('sorted');
            this.querySelector('.sort-icon').textContent = asc ? '↑' : '↓';

            const colIndex = Array.from(this.parentNode.children).indexOf(this);
            const sorted = rows.sort((a, b) => {
              const aVal = a.children[colIndex].textContent.trim();
              const bVal = b.children[colIndex].textContent.trim();
              const result = aVal.localeCompare(bVal, 'es', { numeric: true, sensitivity: 'base' });
              return asc ? result : -result;
            });

            sorted.forEach(row => tbody.appendChild(row));
          });
        });
        ` : ''}
      })();
      </script>
    ` : '';

  return `${searchBox}<div style="overflow:auto; border-radius: var(--radius-md);"><table id="${tableId}">
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table></div>${script}`;
}

export function renderPager({ basePath, query, offset, limit, hasNext }) {
  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const prevLink = offset > 0 ? `${basePath}?${buildQuery({ ...query, offset: prevOffset, limit })}` : '';
  const nextLink = hasNext ? `${basePath}?${buildQuery({ ...query, offset: nextOffset, limit })}` : '';
  const rangeStart = offset + 1;
  const rangeEnd = offset + limit;

  return `<div class="pager">
      <div>${prevLink ? `<a href="${prevLink}">← Anterior</a>` : ''}</div>
      <div class="pager-info">Mostrando ${rangeStart}–${rangeEnd}</div>
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

export function renderCopyButton(text, label = 'Copiar') {
  const encoded = escapeHtml(text).replace(/'/g, '&apos;');
  const icon = renderIcon('copy', 13);
  return `<button type="button" class="action-btn" title="Copiar" onclick="navigator.clipboard.writeText('${encoded}').then(() => { this.innerHTML='${renderIcon('check', 13)} Copiado'; setTimeout(() => this.innerHTML='${icon}${label ? `<span>${escapeHtml(label)}</span>` : ''}', 1500); })">${icon}${label ? `<span>${escapeHtml(label)}</span>` : ''}</button>`;
}
