import {
  escapeHtml,
  formatDate,
  renderBadge,
  renderCopyButton,
  renderEmptyState,
  renderHelpText,
  renderIcon,
  renderLayout,
  renderPager,
  renderTable,
  truncate
} from './render.js';

function initials(name, phone) {
  const source = String(name || '').trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
    return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
  }
  const digits = String(phone || '').replace(/\D+/g, '');
  if (digits.length >= 2) {
    return digits.slice(-2);
  }
  return '?';
}

function formatShortTime(value) {
  if (!value) return '';
  const raw = String(value).replace('T', ' ').trim();
  const dt = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) {
    return raw.slice(5, 16); // fallback: "MM-DD HH:MM"
  }
  const now = new Date();
  const sameDay = dt.toDateString() === now.toDateString();
  if (sameDay) {
    return dt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  }
  const thisYear = dt.getFullYear() === now.getFullYear();
  if (thisYear) {
    return dt.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
  }
  return dt.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function statusTone(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'active' || text === 'sent' || text === 'delivered' || text === 'read' || text === 'completed') {
    return 'good';
  }
  if (text.includes('skip') || text === 'pending' || text === 'draft' || text === 'scheduled' || text === 'paused') {
    return 'warn';
  }
  if (text === 'failed' || text === 'opted_out' || text === 'cancelled') {
    return 'bad';
  }
  return 'muted';
}

function formatDateTimeLocal(value) {
  if (!value) {
    return '';
  }
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return text.replace(' ', 'T').slice(0, 16);
}

export function renderDashboardPage({ stats, metrics = null }) {
  const cards = [
    { label: 'Contactos', value: stats.contacts, link: '/admin/contacts', desc: 'Total de contactos en la base', icon: 'users', kicker: 'Base activa' },
    { label: 'Vehiculos', value: stats.vehicles, link: '/admin/vehicles', desc: 'Vehículos asociados a contactos', icon: 'car', kicker: 'Inventario asociado' },
    { label: 'Opt-outs', value: stats.optOuts, link: '/admin/opt-outs', desc: 'Usuarios que pidieron BAJA', icon: 'user-x', kicker: 'Excluidos de envíos' },
    { label: 'Campañas', value: stats.campaigns, link: '/admin/campaigns', desc: 'Campañas creadas en total', icon: 'send', kicker: 'Todos los estados' },
    { label: 'Destinatarios', value: stats.campaignRecipients, desc: 'Registros de destino en campañas', icon: 'inbox', kicker: 'Acumulado' },
    { label: 'Mensajes', value: stats.messages, link: '/admin/messages', desc: 'Total inbound + outbound', icon: 'message-square', kicker: 'Últimos registros' }
  ];

  const helpText = renderHelpText(
    `<strong>Vista general:</strong> actividad del sistema en un vistazo.
    Haz clic en una tarjeta para navegar a la sección correspondiente.`
  );

  const cardHtml = cards.map((card) => {
    const inner = `<div class="card card-accent" title="${escapeHtml(card.desc)}">
      <h2>${renderIcon(card.icon, 14)}<span>${escapeHtml(card.label)}</span></h2>
      <p>${Number.isFinite(Number(card.value)) ? Number(card.value).toLocaleString('es-CL') : escapeHtml(String(card.value || '0'))}</p>
      <div class="card-kicker">${escapeHtml(card.kicker)}${card.link ? ' · ver detalle ' + renderIcon('arrow-right', 11) : ''}</div>
    </div>`;
    return card.link
      ? `<a href="${card.link}" style="text-decoration:none; color:inherit;">${inner}</a>`
      : `<div>${inner}</div>`;
  }).join('');

  let metricsHtml = '';
  if (metrics) {
    // rr30 / rr60 come from db as { sent, responded } rows — compute rate here
    const raw30 = metrics.rr30 || {};
    const raw60 = metrics.rr60 || {};
    const rate30 = raw30.sent > 0 ? Math.round(((raw30.responded || 0) / raw30.sent) * 100) : null;
    const rate60 = raw60.sent > 0 ? Math.round(((raw60.responded || 0) / raw60.sent) * 100) : null;
    const rr30 = rate30 !== null ? `${rate30}%` : 'N/D';
    const rr60 = rate60 !== null ? `${rate60}%` : 'N/D';
    const delta = rate30 !== null && rate60 !== null ? rate30 - rate60 : null;
    const deltaHtml = delta !== null
      ? `<span style="color:${delta >= 0 ? 'var(--success-500)' : 'var(--danger-500)'}; font-size:12px; font-weight:600;">${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp vs período anterior</span>`
      : (rate30 !== null ? `<span style="font-size:12px;color:var(--ink-400);">${raw30.sent} enviados en 30d</span>` : '');

    // topCampaigns: db returns { id, name, sent, responded } — compute rate inline
    const topCampaigns = (metrics.topCampaigns || []).map(c => {
      const rate = c.sent > 0 ? Math.round(((c.responded || 0) / c.sent) * 100) : 0;
      return `<tr>
        <td style="font-size:12px;">${escapeHtml(c.name)}</td>
        <td style="text-align:right;font-weight:600;font-size:12px;">${rate}%</td>
        <td style="text-align:right;font-size:11px;color:var(--ink-400);">${c.responded || 0}/${c.sent}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="3" class="muted" style="font-size:12px;padding:12px;">Sin campañas con envíos</td></tr>`;

    // weeklySends: db returns { week_key, week_start, sent }
    const weeklySends = metrics.weeklySends || [];
    const maxWeekly = Math.max(...weeklySends.map(w => w.sent || 0), 1);
    const chartBars = weeklySends.map(w => {
      const pct = Math.round(((w.sent || 0) / maxWeekly) * 10);
      const bar = '█'.repeat(pct) + '░'.repeat(10 - pct);
      const label = String(w.week_start || w.week_key || '').slice(5); // MM-DD
      return `<div style="display:flex;align-items:center;gap:8px;font-size:11.5px;font-family:var(--font-mono);">
        <span style="color:var(--ink-400);min-width:48px;">${escapeHtml(label)}</span>
        <span style="color:var(--brand-500);">${bar}</span>
        <span style="color:var(--ink-700);font-weight:600;">${w.sent || 0}</span>
      </div>`;
    }).join('') || `<div class="muted" style="font-size:12px;">Sin envíos recientes</div>`;

    // brandDist: db returns { make, cnt }
    const brandDist = metrics.brandDist || [];
    const topMakes = brandDist.map((m) => {
      const pct = Math.round((m.cnt / (brandDist[0]?.cnt || 1)) * 100);
      return `<div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
          <span style="font-weight:600;">${escapeHtml(m.make)}</span>
          <span style="color:var(--ink-500);">${m.cnt}</span>
        </div>
        <div style="height:6px;border-radius:3px;background:var(--surface-2);overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:var(--brand-500);border-radius:3px;transition:width 0.4s ease;"></div>
        </div>
      </div>`;
    }).join('') || `<div class="muted" style="font-size:12px;">Sin vehículos registrados</div>`;

    metricsHtml = `
    <section class="panel" style="margin-top:18px;">
      <div class="panel-header"><h1>Métricas de campañas (30 días)</h1></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:18px;">
        <div class="card">
          <h2>${renderIcon('check-circle', 14)}<span>Tasa de respuesta (30d)</span></h2>
          <p style="font-size:28px;">${rr30}</p>
          <div class="card-kicker">${deltaHtml}</div>
        </div>
        <div class="card">
          <h2>${renderIcon('check-circle', 14)}<span>Tasa de respuesta (60d)</span></h2>
          <p style="font-size:28px;">${rr60}</p>
          <div class="card-kicker">Período base de comparación</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;align-items:start;">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:var(--ink-500);font-weight:600;margin-bottom:10px;">Top campañas</div>
          <table style="font-size:12px;">
            <thead><tr><th>Campaña</th><th style="text-align:right;">Resp%</th><th style="text-align:right;">N</th></tr></thead>
            <tbody>${topCampaigns}</tbody>
          </table>
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:var(--ink-500);font-weight:600;margin-bottom:10px;">Envíos por semana (4 sem)</div>
          <div style="display:flex;flex-direction:column;gap:6px;">${chartBars}</div>
        </div>
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:var(--ink-500);font-weight:600;margin-bottom:10px;">Marcas más frecuentes</div>
          ${topMakes}
        </div>
      </div>
    </section>`;
  }

  const content = `<section class="panel">
      <div class="panel-header"><h1>Resumen</h1></div>
      ${helpText}
      <div class="cards">
        ${cardHtml}
      </div>
    </section>${metricsHtml}`;

  return renderLayout({ title: 'Resumen', content, active: 'home' });
}

export function renderContactsPage({ contacts, query, offset, limit, makes = [], make = '' }) {
  const helpText = renderHelpText(
    `<strong>Gestión de contactos:</strong> Lista de todos los contactos registrados. Los estados son:
    <strong>active</strong> (activo, recibe mensajes), <strong>opted_out</strong> (BAJA solicitada),
    <strong>invalid</strong> (teléfono inválido). Usa la búsqueda para filtrar por teléfono o nombre.`
  );

  const tableContent = contacts.length > 0
    ? renderTable({
      columns: [
        { key: 'phone', label: 'Telefono' },
        { key: 'name', label: 'Nombre' },
        { key: 'status', label: 'Status', render: (row) => renderBadge(row.status, statusTone(row.status)) },
        { key: 'created_at', label: 'Creado', render: (row) => escapeHtml(formatDate(row.created_at)) },
        { key: 'updated_at', label: 'Actualizado', render: (row) => escapeHtml(formatDate(row.updated_at)) },
        {
          key: 'actions', label: 'Acciones', render: (row) => `<div class="row-actions">
          <a href="/admin/contacts/${row.id}/edit" class="action-btn" title="Editar contacto" aria-label="Editar">${renderIcon('edit', 13)}</a>
          <button onclick="deleteContact(${row.id}, '${escapeHtml(row.phone)}')" class="action-btn danger" title="Eliminar contacto" aria-label="Eliminar">${renderIcon('trash', 13)}</button>
          ${renderCopyButton(row.phone, '')}
        </div>` }
      ],
      rows: contacts,
      searchable: true,
      sortable: true,
      tableId: 'contacts-table'
    })
    : renderEmptyState({
      title: 'Sin contactos',
      message: 'Aún no hay contactos registrados. Los contactos se crean automáticamente al recibir mensajes inbound.',
      ctaText: 'Ver mensajes',
      ctaLink: '/admin/messages'
    });

  const script = `
    <script>
      async function deleteContact(id, phone) {
        if (!confirm('¿Eliminar contacto ' + phone + '?\\n\\nEsto eliminará también todos los vehículos asociados.')) {
          return;
        }
        try {
          const res = await fetch('/admin/api/contacts/' + id, { method: 'DELETE' });
          if (res.ok) {
            window.location.reload();
          } else {
            const error = await res.text();
            alert('Error al eliminar: ' + error);
          }
        } catch (error) {
          alert('Error al eliminar: ' + error.message);
        }
      }
    </script>
  `;

  const chipStyle = (active) => active
    ? 'display:inline-block;padding:4px 12px;border-radius:12px;font-size:13px;text-decoration:none;margin:2px;background:var(--accent);color:#fff;font-weight:600;'
    : 'display:inline-block;padding:4px 12px;border-radius:12px;font-size:13px;text-decoration:none;margin:2px;background:#e8e0d5;color:#555;';

  const chipsHtml = makes.length > 0 ? `
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:10px;">
      <a href="/admin/contacts" style="${chipStyle(!make)}">Todos</a>
      ${makes.map(m =>
    `<a href="/admin/contacts?make=${encodeURIComponent(m.make)}" style="${chipStyle(make === m.make)}">${escapeHtml(m.make)} <span style="opacity:0.7;font-size:11px;">${m.contacts}</span></a>`
  ).join('')}
    </div>` : '';

  const searchOrFilter = make
    ? `<div style="margin-top:8px;font-size:13px;color:#888;">Filtrando por marca: <strong>${escapeHtml(make)}</strong> · <a href="/admin/contacts">Ver todos</a></div>`
    : `<form class="inline" method="get" action="/admin/contacts" style="margin-top:10px;">
        <input type="text" name="q" placeholder="Buscar telefono o nombre" value="${escapeHtml(query || '')}" />
        <button type="submit">Buscar</button>
       </form>`;

  const content = `<section class="panel">
      <div class="panel-header">
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <h1>Contactos</h1>
          <a href="/admin/contacts/new" class="action-btn primary" style="padding:10px 18px; text-decoration:none;">${renderIcon('plus', 14)}<span>Agregar Contacto</span></a>
        </div>
        ${chipsHtml}
        ${searchOrFilter}
      </div>
      ${helpText}
      ${tableContent}
      ${contacts.length > 0 ? renderPager({
    basePath: '/admin/contacts',
    query: make ? { make } : { q: query || '' },
    offset,
    limit,
    hasNext: contacts.length === limit
  }) : ''}
    </section>${script}`;

  return renderLayout({ title: 'Contactos', content, active: 'contacts' });
}

export function renderContactEditPage({ contact = null, error = null, vehicles = [], engagement = null }) {
  const isNew = !contact;
  const title = isNew ? 'Nuevo Contacto' : 'Editar Contacto';
  const action = isNew ? 'Crear' : 'Guardar';

  const helpText = renderHelpText(
    `<strong>Editar contacto:</strong> Modifica la información del contacto.
    <strong>Importante:</strong> El teléfono debe estar en formato E.164 (+56...).
    Si cambias el estado a <strong>opted_out</strong>, el contacto no recibirá más mensajes.`
  );

  const errorMessage = error ? `<div class="muted" style="color:var(--bad); margin-bottom:10px;">${escapeHtml(error)}</div>` : '';

  const form = `
    <form id="contactForm" class="panel" method="POST" action="/admin/contacts/${contact ? contact.id : 'new'}">
      <div class="panel-header"><h1>${title}</h1></div>
      ${helpText}
      ${errorMessage}

      <div style="margin-bottom:15px;">
        <label style="display:block; font-weight:600; margin-bottom:5px;">Teléfono (E.164) *</label>
        <input type="text" name="phone" value="${escapeHtml(contact?.phone || '')}" required
               pattern="^\\+[1-9]\\d{1,14}$"
               placeholder="+56975400946"
               style="width:100%;" />
        <div class="muted" style="font-size:12px; margin-top:5px;">
          Formato E.164: +[código país][número]. Ejemplo: +56975400946
        </div>
      </div>

      <div style="margin-bottom:15px;">
        <label style="display:block; font-weight:600; margin-bottom:5px;">Nombre</label>
        <input type="text" name="name" value="${escapeHtml(contact?.name || '')}"
               placeholder="Juan Perez"
               style="width:100%;" />
        <div class="muted" style="font-size:12px; margin-top:5px;">
          Opcional. Nombre del contacto.
        </div>
      </div>

      <div style="margin-bottom:15px;">
        <label style="display:block; font-weight:600; margin-bottom:5px;">Estado *</label>
        <select name="status" required style="width:100%;">
          <option value="active" ${!contact || contact.status === 'active' ? 'selected' : ''}>Active (Activo)</option>
          <option value="opted_out" ${contact?.status === 'opted_out' ? 'selected' : ''}>Opted Out (BAJA)</option>
          <option value="invalid" ${contact?.status === 'invalid' ? 'selected' : ''}>Invalid (Inválido)</option>
        </select>
        <div class="muted" style="font-size:12px; margin-top:5px;">
          <strong>active</strong>: Recibe mensajes normalmente<br/>
          <strong>opted_out</strong>: No recibirá más mensajes (BAJA)<br/>
          <strong>invalid</strong>: Teléfono inválido, no se usará
        </div>
      </div>

      ${contact ? `
      <div class="muted" style="margin-bottom:15px; padding:10px; background:#f8f5f1; border-radius:8px;">
        <strong>Información adicional:</strong><br/>
        <strong>ID:</strong> ${contact.id}<br/>
        <strong>Creado:</strong> ${escapeHtml(formatDate(contact.created_at))}<br/>
        <strong>Actualizado:</strong> ${escapeHtml(formatDate(contact.updated_at))}
      </div>

      <div style="margin-bottom:16px; padding:12px; border:1px solid var(--ink-100); border-radius:var(--radius-md); background:var(--surface-1);">
        <div style="font-weight:700; margin-bottom:6px;">Baja global manual</div>
        <div class="muted" style="font-size:12px; margin-bottom:10px;">Esto bloquea el teléfono completo para campañas futuras. Úsalo solo para BAJA real, no para un auto puntual.</div>
        ${contact.status === 'opted_out'
          ? `<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              ${renderBadge('BAJA global activa', 'bad')}
              <span class="muted" style="font-size:12px;">Puedes revertirla cambiando el estado a <strong>active</strong> y guardando.</span>
            </div>`
          : `<input type="hidden" name="reason_code" value="global_manual" />
             <input type="hidden" name="reason_detail" value="Aplicado manualmente desde perfil de contacto" />
             <button type="submit" class="action-btn danger" formaction="/admin/opt-outs/manual" formmethod="POST">${renderIcon('user-x', 12)} Aplicar BAJA global</button>`}
      </div>
      ` : ''}

      <div style="margin-top:20px; display:flex; gap:10px;">
        <button type="submit">${action}</button>
        <a href="/admin/contacts" class="action-btn">Cancelar</a>
      </div>
    </form>
  `;

  const vehiclesSection = contact ? `
    <section class="panel" style="margin-top:20px;">
      <div class="panel-header">
        <h3>Vehículos asociados</h3>
        <a href="/admin/vehicles/new?phone=${encodeURIComponent(contact.phone)}&back=/admin/contacts/${contact.id}/edit" class="action-btn primary">
          ${renderIcon('plus', 13)} Agregar vehículo
        </a>
      </div>
      ${vehicles.length > 0 ? `
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${vehicles.map(v => `
            <div style="padding:12px;background:var(--surface-1);border:1px solid var(--ink-100);border-radius:var(--radius-md);display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
              <div>
                <strong>${escapeHtml(v.make)} ${escapeHtml(v.model)} ${v.year}</strong>
                ${v.price != null ? `<div style="font-size:13px;font-feature-settings:'tnum';color:var(--ink-700);">$${Number(v.price).toLocaleString('es-CL')}</div>` : ''}
                <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">
                  ${v.origin ? renderBadge(v.origin, v.origin === 'manual' ? 'info' : 'muted') : ''}
                  ${v.external_id ? `<span class="muted" style="font-size:11px;font-family:var(--font-mono);">${escapeHtml(v.external_id)}</span>` : ''}
                  ${v.is_suppressed ? renderBadge('Suprimido', 'warn') : ''}
                </div>
              </div>
              <div class="row-actions" style="flex-shrink:0;">
                ${v.link ? `<a href="${escapeHtml(v.link)}" target="_blank" rel="noopener" class="action-btn" title="Ver publicación">${renderIcon('arrow-up-right', 12)}</a>` : ''}
                <a href="/admin/vehicles/${v.id}/edit?back=/admin/contacts/${contact.id}/edit" class="action-btn">${renderIcon('edit', 12)} Editar</a>
                ${v.is_suppressed
                  ? `<form method="POST" action="/admin/vehicles/${v.id}/release-suppression" style="display:inline;">
                      <input type="hidden" name="back" value="/admin/contacts/${contact.id}/edit" />
                      <button type="submit" class="action-btn">${renderIcon('refresh', 12)} Liberar</button>
                    </form>`
                  : `<form method="POST" action="/admin/vehicles/${v.id}/suppress" style="display:inline;" onsubmit="return confirm('¿Suprimir este vehículo/publicación para futuras campañas?');">
                      <input type="hidden" name="back" value="/admin/contacts/${contact.id}/edit" />
                      <input type="hidden" name="reason_code" value="vehicle_manual" />
                      <input type="hidden" name="notes" value="Aplicado manualmente desde perfil de contacto" />
                      <button type="submit" class="action-btn danger">${renderIcon('user-x', 12)} Suprimir</button>
                    </form>`}
                <form method="POST" action="/admin/vehicles/${v.id}/delete" style="display:inline;" onsubmit="return confirm('¿Eliminar este vehículo? No se puede deshacer.')">
                  <input type="hidden" name="back" value="/admin/contacts/${contact.id}/edit" />
                  <button type="submit" class="action-btn danger">${renderIcon('trash', 12)}</button>
                </form>
              </div>
            </div>
          `).join('')}
        </div>` : `
        <div class="empty" style="padding:18px 22px;">
          <div class="muted">Sin vehículos registrados.</div>
          <a href="/admin/vehicles/new?phone=${encodeURIComponent(contact.phone)}&back=/admin/contacts/${contact.id}/edit" class="empty-cta" style="margin-top:10px;">${renderIcon('plus', 13)} Agregar vehículo</a>
        </div>`}
    </section>` : '';

  const engagementSection = (contact && engagement) ? `
    <section class="panel" style="margin-top:20px;">
      <div class="panel-header"><h3>Historial de engagement</h3></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:4px 0 8px;">
        <div style="background:var(--surface-1);border:1px solid var(--ink-100);border-radius:var(--radius-md);padding:12px;">
          <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Campañas recibidas</div>
          <div style="font-size:1.5rem;font-weight:700;line-height:1;">${engagement.campaigns_received}</div>
        </div>
        <div style="background:var(--surface-1);border:1px solid var(--ink-100);border-radius:var(--radius-md);padding:12px;">
          <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Campañas respondidas</div>
          <div style="font-size:1.5rem;font-weight:700;line-height:1;">${engagement.campaigns_responded}${engagement.campaigns_received > 0 ? `<span style="font-size:13px;font-weight:400;color:var(--ink-500);margin-left:6px;">(${Math.round(engagement.campaigns_responded / engagement.campaigns_received * 100)}%)</span>` : ''}</div>
        </div>
      </div>
      <div style="font-size:13px;display:flex;flex-direction:column;gap:6px;padding-top:4px;">
        ${engagement.last_campaign_name ? `
        <div>
          <span class="muted">Última campaña:</span>
          <strong style="margin-left:6px;">${escapeHtml(engagement.last_campaign_name)}</strong>
          ${engagement.last_campaign_sent_at ? `<span class="muted" style="margin-left:6px;">${escapeHtml(formatDate(engagement.last_campaign_sent_at))}</span>` : ''}
        </div>` : '<div class="muted">Sin campañas enviadas aún.</div>'}
        ${engagement.last_reply_body ? `
        <div>
          <span class="muted">Última respuesta:</span>
          <span style="margin-left:6px;font-style:italic;">"${escapeHtml(truncate(engagement.last_reply_body, 80))}"</span>
          ${engagement.last_reply_at ? `<span class="muted" style="margin-left:6px;">${escapeHtml(formatDate(engagement.last_reply_at))}</span>` : ''}
        </div>` : '<div class="muted">Sin respuestas registradas.</div>'}
      </div>
    </section>` : '';

  return renderLayout({ title, content: form + vehiclesSection + engagementSection, active: 'contacts' });
}

export function renderContactCreatePage({ error = null, formData = {} }) {
  const title = 'Crear Contacto';

  const helpText = renderHelpText(
    `<strong>Crear nuevo contacto:</strong> Ingresa los datos del contacto.
    El teléfono debe estar en formato E.164 (+56...).
    Opcionalmente puedes asociar un vehículo al contacto durante la creación.`
  );

  const errorMessage = error ? `<div class="muted" style="color:var(--bad); margin-bottom:10px;">${escapeHtml(error)}</div>` : '';

  const vehicleSection = `
    <div style="margin-bottom:15px; padding:15px; background:#f8f5f1; border-radius:8px;">
      <div style="margin-bottom:10px;">
        <label style="display:flex; align-items:center; cursor:pointer;">
          <input type="checkbox" id="has_vehicle" name="has_vehicle" ${formData.has_vehicle ? 'checked' : ''}
                 onchange="document.getElementById('vehicle-fields').style.display = this.checked ? 'block' : 'none';" />
          <span style="margin-left:8px; font-weight:600;">¿Tiene vehículo asociado?</span>
        </label>
      </div>

      <div id="vehicle-fields" style="display:${formData.has_vehicle ? 'block' : 'none'}; margin-top:15px; padding-left:10px; border-left:3px solid var(--accent);">
        <h3 style="margin-bottom:10px;">Datos del Vehículo</h3>

        <div style="margin-bottom:15px;">
          <label style="display:block; font-weight:600; margin-bottom:5px;">Marca *</label>
          <input type="text" name="make" value="${escapeHtml(formData.make || '')}"
                 placeholder="Toyota"
                 style="width:100%;" />
        </div>

        <div style="margin-bottom:15px;">
          <label style="display:block; font-weight:600; margin-bottom:5px;">Modelo *</label>
          <input type="text" name="model" value="${escapeHtml(formData.model || '')}"
                 placeholder="Corolla"
                 style="width:100%;" />
        </div>

        <div style="margin-bottom:15px;">
          <label style="display:block; font-weight:600; margin-bottom:5px;">Año *</label>
          <input type="number" name="year" value="${escapeHtml(formData.year || '')}"
                 placeholder="2020" min="1900" max="${new Date().getFullYear() + 1}"
                 style="width:100%;" />
        </div>

        <div style="margin-bottom:15px;">
          <label style="display:block; font-weight:600; margin-bottom:5px;">Precio (CLP)</label>
          <input type="number" name="price" value="${escapeHtml(formData.price || '')}"
                 placeholder="10000000" step="100000"
                 style="width:100%;" />
          <div class="muted" style="font-size:12px; margin-top:5px;">
            Opcional. Precio en pesos chilenos.
          </div>
        </div>

        <div style="margin-bottom:15px;">
          <label style="display:block; font-weight:600; margin-bottom:5px;">Link de Publicación</label>
          <input type="url" name="link" value="${escapeHtml(formData.link || '')}"
                 placeholder="https://example.com/auto"
                 style="width:100%;" />
          <div class="muted" style="font-size:12px; margin-top:5px;">
            Opcional. URL de la publicación del vehículo.
          </div>
        </div>

        <div class="muted" style="font-size:12px; margin-top:10px;">
          * Si activas la opción de vehículo, marca, modelo y año son obligatorios.
        </div>
      </div>
    </div>
  `;

  const form = `
    <form id="contactForm" class="panel" method="POST" action="/admin/contacts">
      <div class="panel-header"><h1>${title}</h1></div>
      ${helpText}
      ${errorMessage}

      <div style="margin-bottom:15px;">
        <label style="display:block; font-weight:600; margin-bottom:5px;">Teléfono (E.164) *</label>
        <input type="text" name="phone" value="${escapeHtml(formData.phone || '')}" required
               pattern="^\\+[1-9]\\d{1,14}$"
               placeholder="+56975400946"
               style="width:100%;" />
        <div class="muted" style="font-size:12px; margin-top:5px;">
          Formato E.164: +[código país][número]. Ejemplo: +56975400946
        </div>
      </div>

      <div style="margin-bottom:15px;">
        <label style="display:block; font-weight:600; margin-bottom:5px;">Nombre</label>
        <input type="text" name="name" value="${escapeHtml(formData.name || '')}"
               placeholder="Juan Perez"
               style="width:100%;" />
        <div class="muted" style="font-size:12px; margin-top:5px;">
          Opcional. Nombre del contacto.
        </div>
      </div>

      <div style="margin-bottom:15px;">
        <label style="display:block; font-weight:600; margin-bottom:5px;">Estado *</label>
        <select name="status" required style="width:100%;">
          <option value="active" ${!formData.status || formData.status === 'active' ? 'selected' : ''}>Active (Activo)</option>
          <option value="opted_out" ${formData.status === 'opted_out' ? 'selected' : ''}>Opted Out (BAJA)</option>
          <option value="invalid" ${formData.status === 'invalid' ? 'selected' : ''}>Invalid (Inválido)</option>
        </select>
        <div class="muted" style="font-size:12px; margin-top:5px;">
          <strong>active</strong>: Recibe mensajes normalmente<br/>
          <strong>opted_out</strong>: No recibirá más mensajes (BAJA)<br/>
          <strong>invalid</strong>: Teléfono inválido, no se usará
        </div>
      </div>

      ${vehicleSection}

      <div style="margin-top:20px; display:flex; gap:10px;">
        <button type="submit">Crear Contacto</button>
        <a href="/admin/contacts" class="action-btn">Cancelar</a>
      </div>
    </form>
  `;

  return renderLayout({ title, content: form, active: 'contacts' });
}

export function renderOptOutEditPage({ optOut = null, error = null }) {
  const title = 'Editar Opt-Out';
  const action = 'Guardar';
  const phone = optOut?.phone || '';

  const helpText = renderHelpText(
    `<strong>Editar Opt-Out:</strong> Modifica la razón de la baja para el número <strong>${escapeHtml(phone)}</strong>.`
  );

  const errorMessage = error ? `<div class="muted" style="color:var(--bad); margin-bottom:10px;">${escapeHtml(error)}</div>` : '';

  const form = `
    <form class="panel" method="POST" action="/admin/opt-outs/${encodeURIComponent(phone)}">
      <div class="panel-header"><h1>${title}</h1></div>
      ${helpText}
      ${errorMessage}

      <div style="margin-bottom:15px;">
        <label style="display:block; font-weight:600; margin-bottom:5px;">Teléfono</label>
        <input type="text" value="${escapeHtml(phone)}" disabled style="width:100%; background:#eee; cursor:not-allowed;" />
      </div>

      <div style="margin-bottom:15px;">
        <label style="display:block; font-weight:600; margin-bottom:5px;">Razón</label>
        <select name="reason" style="width:100%;">
            <option value="global_user_request" ${optOut?.reason_code === 'global_user_request' || optOut?.reason === 'user_request' ? 'selected' : ''}>Solicitud de usuario (STOP/BAJA)</option>
            <option value="global_manual" ${optOut?.reason_code === 'global_manual' || optOut?.reason === 'manual' ? 'selected' : ''}>Manual (Admin)</option>
            <option value="global_ai_detected" ${optOut?.reason_code === 'global_ai_detected' || optOut?.reason === 'user_request_ai' ? 'selected' : ''}>Detectado por IA</option>
            <option value="global_import" ${optOut?.reason_code === 'global_import' || optOut?.reason === 'bulk_import' ? 'selected' : ''}>Importación</option>
        </select>
      </div>

      <div style="margin-top:20px; display:flex; gap:10px;">
        <button type="submit">${action}</button>
        <a href="/admin/opt-outs" class="action-btn">Cancelar</a>
      </div>
    </form>
  `;

  return renderLayout({ title, content: form, active: 'home' }); // 'home' or 'contacts' depending on where we want to highlight
}

export function renderMessagesPage({ messages, direction, offset, limit }) {
  const helpText = renderHelpText(
    `<strong>Bandeja de conversaciones:</strong> los mensajes se agrupan por contacto
    para que puedas leer cada conversación como un chat. Haz clic en una conversación
    para ver el hilo completo; filtra por <strong>entrantes</strong> / <strong>salientes</strong>
    o busca por nombre, teléfono o contenido.`
  );

  function getDisplayBody(msg) {
    const body = String(msg?.body || '').trim();
    if (body) {
      return body;
    }
    if (msg?.direction === 'outbound') {
      return msg?.campaign_name ? '[Plantilla de campana enviada]' : '[Mensaje saliente sin cuerpo]';
    }
    return '[Mensaje sin contenido]';
  }

  // ---- Agrupación por contacto (sin tocar persistencia) ----
  const groupsMap = new Map();
  for (const msg of messages) {
    const key = msg.contact_phone || `id:${msg.id}`;
    let group = groupsMap.get(key);
    if (!group) {
      group = {
        key,
        phone: msg.contact_phone || '',
        name: msg.contact_name || '',
        messages: [],
        lastAt: msg.created_at,
        lastBody: getDisplayBody(msg),
        lastDirection: msg.direction,
        lastStatus: msg.status,
        campaigns: new Set(),
        hasFailure: false,
        inboundCount: 0,
        outboundCount: 0
      };
      groupsMap.set(key, group);
    }
    const normalizedMsg = {
      ...msg,
      body: getDisplayBody(msg)
    };
    group.messages.push(normalizedMsg);
    if (msg.campaign_name) {
      group.campaigns.add(msg.campaign_name);
    }
    if (String(msg.status || '').toLowerCase() === 'failed') {
      group.hasFailure = true;
    }
    if (msg.direction === 'inbound') group.inboundCount += 1;
    else if (msg.direction === 'outbound') group.outboundCount += 1;
    // Primera aparición == más reciente porque listMessages ordena DESC.
    if (!group.lastAt || String(msg.created_at || '') > String(group.lastAt)) {
      group.lastAt = msg.created_at;
      group.lastBody = getDisplayBody(msg);
      group.lastDirection = msg.direction;
      group.lastStatus = msg.status;
    }
    if (!group.name && msg.contact_name) {
      group.name = msg.contact_name;
    }
  }

  const groups = Array.from(groupsMap.values()).sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')));

  // Orden cronológico ascendente dentro de cada conversación para renderizar chat.
  for (const g of groups) {
    g.messages.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  }

  const totalMsgs = messages.length;
  const totalConv = groups.length;
  const inboundCount = messages.filter((m) => m.direction === 'inbound').length;
  const outboundCount = totalMsgs - inboundCount;

  const chipBase = '/admin/messages';
  const chips = `
    <div class="chip-group" role="tablist" aria-label="Filtro de dirección">
      <a class="chip ${!direction ? 'active' : ''}" href="${chipBase}">Todos <span class="muted">${totalMsgs}</span></a>
      <a class="chip ${direction === 'inbound' ? 'active' : ''}" href="${chipBase}?direction=inbound">${renderIcon('arrow-down-left', 13)} Entrantes <span class="muted">${inboundCount}</span></a>
      <a class="chip ${direction === 'outbound' ? 'active' : ''}" href="${chipBase}?direction=outbound">${renderIcon('arrow-up-right', 13)} Salientes <span class="muted">${outboundCount}</span></a>
    </div>`;

  const inboxItems = groups.map((g, idx) => {
    const displayName = g.name ? escapeHtml(g.name) : `<span class="muted">Sin nombre</span>`;
    const phoneSafe = escapeHtml(g.phone || '—');
    const dirIconName = g.lastDirection === 'outbound' ? 'arrow-up-right' : 'arrow-down-left';
    const dirClass = g.lastDirection === 'outbound' ? 'inbox-dir-out' : 'inbox-dir-in';
    const preview = escapeHtml(truncate(g.lastBody || '(sin contenido)', 70));
    const timeLabel = escapeHtml(formatShortTime(g.lastAt));
    const statusLabel = g.lastStatus ? renderBadge(g.lastStatus, statusTone(g.lastStatus)) : '';
    const failureLabel = g.hasFailure && String(g.lastStatus || '').toLowerCase() !== 'failed'
      ? renderBadge('fallo previo', 'bad')
      : '';
    const campaignLabels = Array.from(g.campaigns).slice(0, 1).map((c) => renderBadge(truncate(c, 22), 'accent')).join('');
    const avatar = `<div class="inbox-avatar">${escapeHtml(initials(g.name, g.phone))}</div>`;
    return `<div class="inbox-item${idx === 0 ? ' active' : ''}" data-conv-key="${escapeHtml(g.key)}" role="button" tabindex="0">
      ${avatar}
      <div class="inbox-body">
        <div class="inbox-row1">
          <div class="inbox-name">${displayName}</div>
          <div class="inbox-time">${timeLabel}</div>
        </div>
        <div class="inbox-phone">${phoneSafe}</div>
        <div class="inbox-row3">
          <span class="inbox-dir-icon ${dirClass}" title="${g.lastDirection === 'outbound' ? 'Último: saliente' : 'Último: entrante'}">${renderIcon(dirIconName, 11)}</span>
          <span class="inbox-preview">${preview}</span>
        </div>
        <div class="inbox-meta">
          ${statusLabel}
          ${failureLabel}
          ${campaignLabels}
          ${g.messages.length > 1 ? `<span class="badge badge-muted">${g.messages.length} msgs</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  // Payload JSON para detalle (se imprime embebido como script JSON seguro).
  const conversationsPayload = groups.map((g) => ({
    key: g.key,
    phone: g.phone,
    name: g.name,
    campaigns: Array.from(g.campaigns),
    inbound: g.inboundCount,
    outbound: g.outboundCount,
    messages: g.messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body || '',
      status: m.status || '',
      message_sid: m.message_sid || '',
      campaign_name: m.campaign_name || '',
      created_at: m.created_at || ''
    }))
  }));

  const payloadJson = JSON.stringify(conversationsPayload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  const emptyInbox = totalMsgs === 0
    ? renderEmptyState({
      title: 'Sin mensajes',
      message: direction === 'inbound'
        ? 'Aún no hay mensajes inbound. Aparecerán cuando los usuarios escriban al WhatsApp.'
        : direction === 'outbound'
          ? 'Aún no hay mensajes outbound. Se generan al enviar campañas.'
          : 'Aún no hay mensajes registrados en el sistema.',
      ctaText: 'Ver campañas',
      ctaLink: '/admin/campaigns'
    })
    : '';

  const inboxLayout = totalMsgs > 0 ? `
    <div class="inbox" id="messages-inbox">
      <aside class="inbox-list">
        <div class="inbox-toolbar">
          <div class="search-box" style="flex:1;">
            <span class="search-icon">${renderIcon('search', 14)}</span>
            <input type="text" id="inbox-search" placeholder="Buscar contacto, teléfono o mensaje…" autocomplete="off" />
          </div>
        </div>
        <div class="inbox-count">
          ${totalConv} ${totalConv === 1 ? 'conversación' : 'conversaciones'} ·
          ${totalMsgs} ${totalMsgs === 1 ? 'mensaje' : 'mensajes'}
        </div>
        <div class="inbox-items" id="inbox-items">${inboxItems}</div>
      </aside>
      <section class="conv-pane" id="conv-pane">
        <div class="conv-empty" id="conv-empty" hidden>
          ${renderIcon('message-square', 14)}
          <span>Selecciona una conversación para ver el hilo.</span>
        </div>
        <div class="conv-header" id="conv-header"></div>
        <div class="conv-body" id="conv-body"></div>
      </section>
    </div>
  ` : '';

  const pager = totalMsgs > 0 ? renderPager({
    basePath: '/admin/messages',
    query: { direction: direction || '' },
    offset,
    limit,
    hasNext: totalMsgs === limit
  }) : '';

  const script = totalMsgs > 0 ? `
    <script id="conversations-data" type="application/json">${payloadJson}</script>
    <script>
    (function() {
      const raw = document.getElementById('conversations-data')?.textContent || '[]';
      let conversations = [];
      try { conversations = JSON.parse(raw); } catch (_) { conversations = []; }
      const byKey = new Map(conversations.map((c) => [c.key, c]));

      const items = Array.from(document.querySelectorAll('.inbox-item'));
      const searchInput = document.getElementById('inbox-search');
      const convHeader = document.getElementById('conv-header');
      const convBody = document.getElementById('conv-body');
      const convEmpty = document.getElementById('conv-empty');

      function escapeHtml(value) {
        return String(value == null ? '' : value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function statusTone(value) {
        const text = String(value || '').toLowerCase();
        if (['sent','delivered','read','received','active','completed'].includes(text)) return 'good';
        if (['pending','queued','sending','scheduled','draft','paused'].includes(text) || text.includes('skip')) return 'warn';
        if (['failed','opted_out','cancelled','undelivered','error'].includes(text)) return 'bad';
        return 'muted';
      }

      function formatDay(value) {
        const raw = String(value || '').replace('T', ' ').trim();
        if (!raw) return '';
        const dt = new Date(raw.includes(':') ? raw.replace(' ', 'T') : raw);
        if (isNaN(dt.getTime())) return raw.slice(0, 10);
        const today = new Date();
        const yest = new Date(); yest.setDate(today.getDate() - 1);
        const sameDay = (a, b) => a.toDateString() === b.toDateString();
        if (sameDay(dt, today)) return 'Hoy';
        if (sameDay(dt, yest)) return 'Ayer';
        return dt.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
      }

      function formatTime(value) {
        const raw = String(value || '').replace('T', ' ').trim();
        if (!raw) return '';
        const dt = new Date(raw.includes(':') ? raw.replace(' ', 'T') : raw);
        if (isNaN(dt.getTime())) return raw.slice(11, 16);
        return dt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
      }

      function initialsFor(name, phone) {
        const s = String(name || '').trim();
        if (s) {
          const parts = s.split(/\\s+/).filter(Boolean).slice(0, 2);
          return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
        }
        const d = String(phone || '').replace(/\\D+/g, '');
        return d.length >= 2 ? d.slice(-2) : '?';
      }

      function renderConversation(key) {
        const conv = byKey.get(key);
        if (!conv) {
          convEmpty.hidden = false;
          convHeader.innerHTML = '';
          convBody.innerHTML = '';
          return;
        }
        convEmpty.hidden = true;

        const title = conv.name ? escapeHtml(conv.name) : '<span class="muted">Sin nombre registrado</span>';
        const phone = conv.phone ? escapeHtml(conv.phone) : '—';
        const camps = conv.campaigns && conv.campaigns.length
          ? conv.campaigns.slice(0, 2).map((c) => '<span class="badge badge-accent">' + escapeHtml(c) + '</span>').join(' ')
          : '';
        convHeader.innerHTML = ''
          + '<div class="inbox-avatar">' + escapeHtml(initialsFor(conv.name, conv.phone)) + '</div>'
          + '<div class="conv-header-main">'
          +   '<div class="conv-header-title">' + title + '</div>'
          +   '<div class="conv-header-sub">' + phone + '</div>'
          + '</div>'
          + '<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">'
          +   '<span class="badge badge-info">' + conv.inbound + ' in</span>'
          +   '<span class="badge badge-good">' + conv.outbound + ' out</span>'
          +   camps
          + '</div>';

        let html = '';
        let lastDay = '';
        for (const m of (conv.messages || [])) {
          const day = formatDay(m.created_at);
          if (day && day !== lastDay) {
            html += '<div class="conv-date-sep">' + escapeHtml(day) + '</div>';
            lastDay = day;
          }
          const side = m.direction === 'outbound' ? 'outbound' : 'inbound';
          const time = formatTime(m.created_at);
          const statusChip = m.status
            ? '<span class="badge badge-' + statusTone(m.status) + '" style="padding:1px 6px; font-size:9.5px;">' + escapeHtml(m.status) + '</span>'
            : '';
          const campChip = m.campaign_name
            ? '<span class="badge badge-accent" style="padding:1px 6px; font-size:9.5px;">' + escapeHtml(m.campaign_name) + '</span>'
            : '';
          const body = escapeHtml(m.body || '');
          html += ''
            + '<div class="bubble ' + side + '">'
            +   '<div>' + body + '</div>'
            +   '<div class="bubble-meta">'
            +     '<span>' + escapeHtml(time) + '</span>'
            +     (statusChip ? ' · ' + statusChip : '')
            +     (campChip ? ' · ' + campChip : '')
            +   '</div>'
            + '</div>';
        }
        convBody.innerHTML = html;
        convBody.scrollTop = convBody.scrollHeight;
      }

      function selectItem(el) {
        if (!el) return;
        items.forEach((it) => it.classList.remove('active'));
        el.classList.add('active');
        renderConversation(el.dataset.convKey);
      }

      items.forEach((it) => {
        it.addEventListener('click', () => selectItem(it));
        it.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectItem(it);
          }
        });
      });

      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const q = e.target.value.toLowerCase();
          let anyVisible = false;
          items.forEach((it) => {
            const text = it.textContent.toLowerCase();
            const match = !q || text.includes(q);
            it.classList.toggle('hidden', !match);
            if (match) anyVisible = true;
          });
          if (anyVisible) {
            const firstVisible = items.find((it) => !it.classList.contains('hidden'));
            if (firstVisible && !firstVisible.classList.contains('active')) {
              selectItem(firstVisible);
            }
          }
        });
      }

      // Auto-seleccionar la primera conversación al cargar.
      const first = items[0];
      if (first) {
        renderConversation(first.dataset.convKey);
      } else {
        if (convEmpty) convEmpty.hidden = false;
      }
    })();
    </script>
  ` : '';

  const content = `<section class="panel">
      <div class="panel-header">
        <div>
          <h1>Mensajes</h1>
          <div class="muted" style="margin-top:4px; font-size:12.5px;">
            ${totalConv} ${totalConv === 1 ? 'conversación' : 'conversaciones'} ·
            ${totalMsgs} ${totalMsgs === 1 ? 'mensaje' : 'mensajes'} en la página actual
          </div>
        </div>
        ${chips}
      </div>
      ${helpText}
      ${emptyInbox}
      ${inboxLayout}
      ${pager}
    </section>${script}`;

  return renderLayout({ title: 'Mensajes', content, active: 'messages' });
}

export function renderChatLabPage({ defaultPhone = '+56911112222', scenarioCatalog = [] }) {
  const helpText = renderHelpText(
    `<strong>Lab Chat:</strong> entorno de prueba ida/vuelta que espeja el comportamiento de WhatsApp sin enviar mensajes reales.
    Usa un telefono de laboratorio aislado y ejecuta casos para detectar loops o respuestas incoherentes antes de produccion.`
  );

  const smokeScenarios = scenarioCatalog.filter((scenario) => scenario.suite === 'smoke');
  const regressionScenarios = scenarioCatalog.filter((scenario) => scenario.suite === 'regression');
  const vehicleSuppressionScenarios = scenarioCatalog.filter((scenario) => scenario.suite === 'vehicle-suppression');
  const scenarioOptions = scenarioCatalog
    .map((scenario) => `<option value="${escapeHtml(scenario.id)}">${escapeHtml(scenario.name)} (${escapeHtml(scenario.suite)})</option>`)
    .join('');

  const content = `
    <section class="panel">
      <div class="panel-header" style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:flex-start;">
        <div>
          <h1>Lab Chat</h1>
          <div class="muted" style="margin-top:4px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <span>Telefono lab:</span>
            <input id="lab-phone-input" class="mono" type="text" value="${escapeHtml(defaultPhone)}" placeholder="+569..." style="width:170px;" />
            <span id="lab-phone-label" class="mono" style="opacity:0.8;">${escapeHtml(defaultPhone)}</span>
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <select id="lab-scenario" style="min-width:220px;">
            <option value="">Escenario rapido...</option>
            ${scenarioOptions}
          </select>
          <button type="button" id="run-scenario-btn" class="action-btn">Ejecutar escenario</button>
          <button type="button" id="run-smoke-btn" class="action-btn">Run smoke</button>
          <button type="button" id="run-regression-btn" class="action-btn">Run regression</button>
          <button type="button" id="run-dialect-btn" class="action-btn">Run dialect</button>
          <button type="button" id="run-intent-btn" class="action-btn">Run intent</button>
          <button type="button" id="run-optout-btn" class="action-btn">Run optout</button>
          <button type="button" id="run-vehicle-suppression-btn" class="action-btn">Run vehicle suppression</button>
          <button type="button" id="run-edge-btn" class="action-btn">Run edge</button>
          <button type="button" id="save-session-btn" class="action-btn">Guardar session .md</button>
          <button type="button" id="new-session-btn" class="action-btn">Nueva sesion</button>
        </div>
      </div>
      ${helpText}

      <div style="display:grid; grid-template-columns: 1fr 300px; gap:14px; align-items:start;">
        <div>
          <div id="lab-chat-window" class="conv-body" style="max-height:58vh; min-height:320px; border-radius: var(--radius-lg); border:1px solid var(--ink-100);"></div>
          <form id="lab-chat-form" style="display:flex; gap:10px; margin-top:10px;">
            <input id="lab-chat-input" type="text" placeholder="Escribe un mensaje para probar..." style="flex:1;" autocomplete="off" />
            <button type="submit">Enviar</button>
          </form>
        </div>
        <aside class="panel" style="margin:0;">
          <h3 style="margin-top:0;">Meta test</h3>
          <div id="lab-meta" class="muted" style="font-size:12px; line-height:1.45;">Sin eventos aun.</div>
          <div id="lab-last-report" class="muted" style="font-size:12px; line-height:1.45; margin-top:8px;"></div>
          <hr style="border:none; border-top:1px solid var(--ink-100); margin:12px 0;" />
          <h3 style="margin-top:0;">Suites</h3>
          <ul style="margin:0; padding-left:18px; font-size:13px; color:var(--ink-500); line-height:1.5;">
            <li>Smoke (${smokeScenarios.length}): criticos de no-regresion</li>
            <li>Regression (${regressionScenarios.length}): cobertura ampliada</li>
            <li>Vehicle suppression (${vehicleSuppressionScenarios.length}): distingue baja global vs vehículo puntual</li>
            <li>Cada corrida puede guardar reporte Markdown en <code>docs/qa</code></li>
          </ul>
        </aside>
      </div>
    </section>

    <script>
    (function () {
      const scenarioCatalog = ${JSON.stringify(scenarioCatalog)};
      const scenarioById = new Map(scenarioCatalog.map((scenario) => [scenario.id, scenario]));

      const state = {
        phone: ${JSON.stringify(defaultPhone)},
        sending: false,
        transcript: []
      };

      const phoneLabel = document.getElementById('lab-phone-label');
      const phoneInput = document.getElementById('lab-phone-input');
      const chatWindow = document.getElementById('lab-chat-window');
      const chatForm = document.getElementById('lab-chat-form');
      const chatInput = document.getElementById('lab-chat-input');
      const runScenarioBtn = document.getElementById('run-scenario-btn');
      const runSmokeBtn = document.getElementById('run-smoke-btn');
      const runRegressionBtn = document.getElementById('run-regression-btn');
      const runDialectBtn = document.getElementById('run-dialect-btn');
      const runIntentBtn = document.getElementById('run-intent-btn');
      const runOptoutBtn = document.getElementById('run-optout-btn');
      const runVehicleSuppressionBtn = document.getElementById('run-vehicle-suppression-btn');
      const runEdgeBtn = document.getElementById('run-edge-btn');
      const scenarioSelect = document.getElementById('lab-scenario');
      const newSessionBtn = document.getElementById('new-session-btn');
      const saveSessionBtn = document.getElementById('save-session-btn');
      const metaBox = document.getElementById('lab-meta');
      const lastReportEl = document.getElementById('lab-last-report');

      function escapeHtml(value) {
        return String(value == null ? '' : value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function setMeta(text) {
        metaBox.innerHTML = escapeHtml(text);
      }

      function updatePhoneLabel() {
        phoneLabel.textContent = state.phone;
        if (phoneInput && phoneInput.value !== state.phone) {
          phoneInput.value = state.phone;
        }
      }

      function appendBubble(role, text) {
        const side = role === 'assistant' ? 'outbound' : 'inbound';
        const who = role === 'assistant' ? 'Bot' : 'Tester';
        const safeText = String(text || '');
        const bubble = document.createElement('div');
        bubble.className = 'bubble ' + side;
        bubble.innerHTML = ''
          + '<div>' + escapeHtml(safeText) + '</div>'
          + '<div class="bubble-meta">' + who + ' · ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) + '</div>';
        chatWindow.appendChild(bubble);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        state.transcript.push({ role, text: safeText, at: new Date().toISOString() });
      }

      async function sendMessage(message) {
        if (state.sending) return;
        const text = String(message || '').trim();
        if (!text) return;
        appendBubble('user', text);
        state.sending = true;
        setMeta('Procesando...');
        try {
          const selectedPhone = (phoneInput && phoneInput.value ? phoneInput.value : state.phone);
          const res = await fetch('/admin/api/lab/chat/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: selectedPhone,
              message: text
            })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || 'Error de API');
          }
          state.phone = data.phone || state.phone;
          updatePhoneLabel();
          appendBubble('assistant', data.reply || '(sin respuesta)');
          const meta = data.meta || {};
          setMeta('used_ai=' + Boolean(meta.used_ai)
            + ' · needs_human=' + Boolean(meta.needs_human)
            + (meta.handoff_reason ? ' · reason=' + meta.handoff_reason : ''));
        } catch (error) {
          appendBubble('assistant', 'Error de laboratorio: ' + (error.message || error));
          setMeta('ERROR: ' + (error.message || error));
        } finally {
          state.sending = false;
        }
      }

      async function resetSession() {
        try {
          const selectedPhone = (phoneInput && phoneInput.value ? phoneInput.value : state.phone);
          const res = await fetch('/admin/api/lab/chat/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: selectedPhone })
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.phone) {
            state.phone = data.phone;
          }
        } catch (_) {
          // no-op
        }
        chatWindow.innerHTML = '';
        state.transcript = [];
        updatePhoneLabel();
        setMeta('Sesion reiniciada.');
        if (lastReportEl) {
          lastReportEl.textContent = '';
        }
      }

      async function runScenario() {
        const key = scenarioSelect.value;
        if (!key) {
          setMeta('Selecciona un escenario.');
          return;
        }
        setMeta('Ejecutando escenario: ' + key + '...');
        await runSuite({ scenarioIds: [key], suite: 'custom' });
      }

      async function runSuite({ suite, scenarioIds = [] }) {
        if (state.sending) return;
        state.sending = true;
        try {
          const selectedPhone = (phoneInput && phoneInput.value ? phoneInput.value : state.phone);
          const res = await fetch('/admin/api/lab/chat/run-scenarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              suite,
              scenario_ids: scenarioIds,
              phone: selectedPhone,
              save_report: true
            })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || 'No se pudo ejecutar la suite');
          }

          if (lastReportEl) {
            lastReportEl.textContent = data.report_path ? ('Reporte: ' + data.report_path) : 'Reporte no guardado';
          }

          const summary = data.summary || {};
          setMeta('Suite=' + (data.suite || suite)
            + ' · total=' + (summary.total || 0)
            + ' · pass=' + (summary.passed || 0)
            + ' · fail=' + (summary.failed || 0));

          const results = Array.isArray(data.results) ? data.results : [];
          chatWindow.innerHTML = '';
          state.transcript = [];
          for (const scenario of results) {
            appendBubble('assistant', '[Escenario] ' + scenario.name + ' -> ' + (scenario.ok ? 'PASS' : 'FAIL'));
            const steps = Array.isArray(scenario.steps) ? scenario.steps : [];
            for (const step of steps) {
              appendBubble('user', step.user || '');
              appendBubble('assistant', (step.reply || '(sin respuesta)') + (step.ok ? '' : ' [FAIL]'));
            }
          }
        } catch (error) {
          setMeta('ERROR suite: ' + (error.message || error));
        } finally {
          state.sending = false;
        }
      }

      async function saveSession() {
        if (!state.transcript.length) {
          setMeta('No hay transcript para guardar.');
          return;
        }
        try {
          const selectedPhone = (phoneInput && phoneInput.value ? phoneInput.value : state.phone);
          const res = await fetch('/admin/api/lab/chat/save-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: selectedPhone,
              transcript: state.transcript
            })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || 'No se pudo guardar la sesion');
          }
          if (lastReportEl) {
            lastReportEl.textContent = 'Session: ' + (data.report_path || 'sin path');
          }
          setMeta('Sesion guardada en markdown.');
        } catch (error) {
          setMeta('ERROR session: ' + (error.message || error));
        }
      }

      chatForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const value = chatInput.value;
        chatInput.value = '';
        await sendMessage(value);
      });

      if (runScenarioBtn) runScenarioBtn.addEventListener('click', runScenario);
      if (runSmokeBtn) runSmokeBtn.addEventListener('click', () => runSuite({ suite: 'smoke' }));
      if (runRegressionBtn) runRegressionBtn.addEventListener('click', () => runSuite({ suite: 'regression' }));
      if (runDialectBtn) runDialectBtn.addEventListener('click', () => runSuite({ suite: 'dialect' }));
      if (runIntentBtn) runIntentBtn.addEventListener('click', () => runSuite({ suite: 'intent' }));
      if (runOptoutBtn) runOptoutBtn.addEventListener('click', () => runSuite({ suite: 'optout-full' }));
      if (runVehicleSuppressionBtn) runVehicleSuppressionBtn.addEventListener('click', () => runSuite({ suite: 'vehicle-suppression' }));
      if (runEdgeBtn) runEdgeBtn.addEventListener('click', () => runSuite({ suite: 'edge-cases' }));
      if (newSessionBtn) newSessionBtn.addEventListener('click', resetSession);
      if (saveSessionBtn) saveSessionBtn.addEventListener('click', saveSession);
      if (phoneInput) {
        phoneInput.addEventListener('change', () => {
          state.phone = String(phoneInput.value || '').trim() || state.phone;
          updatePhoneLabel();
          setMeta('Telefono lab actualizado.');
        });
      }

      setMeta('Listo para probar.');
      updatePhoneLabel();
      chatInput.focus();
    })();
    </script>
  `;

  return renderLayout({ title: 'Lab Chat', content, active: 'lab-chat' });
}

export function renderCampaignsPage({ campaigns, offset, limit }) {
  const helpText = renderHelpText(
    `<strong>Gestión de campañas:</strong> Campañas de mensajería outbound. Estados: draft, active, paused, completed, cancelled. 
        <a href="/admin/campaigns/new" class="action-btn" style="float: right; margin-top: -5px;">+ Nueva Campaña</a>`
  );

  const tableContent = campaigns.length > 0
    ? renderTable({
      columns: [
        {
          key: 'name',
          label: 'Nombre',
          render: (row) => {
            const badge = row.is_test
              ? `<span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;background:#fffbeb;border:1px solid #f59e0b;color:#92400e;margin-right:5px;">🧪 TEST</span>`
              : '';
            return `${badge}<a href="/admin/campaigns/${row.id}" style="color:var(--accent);font-weight:600;">${escapeHtml(row.name)}</a>`;
          }
        },
        { key: 'status', label: 'Status', render: (row) => renderBadge(row.status, statusTone(row.status)) },
        { key: 'type', label: 'Tipo' },
        { key: 'message_template', label: 'Mensaje', render: (row) => `<span title="${escapeHtml(row.message_template || '')}">${escapeHtml(truncate(row.message_template || '', 40))}</span>` },
        { key: 'recipients_total', label: 'Total' },
        { key: 'recipients_sent', label: 'Enviados' },
        { key: 'created_at', label: 'Creada', render: (row) => escapeHtml(formatDate(row.created_at)) },
        { key: 'scheduled_at', label: 'Programada', render: (row) => escapeHtml(formatDate(row.scheduled_at || '')) },
        {
          key: 'actions',
          label: 'Acciones',
          render: (row) => {
            const dupBtn = `<button onclick="duplicateCampaign(${row.id})" class="action-btn" title="Duplicar campaña">⧉</button>`;
            if (row.status === 'draft') {
              return `<a href="/admin/campaigns/${row.id}/edit" class="action-btn">Editar</a>
                      <button onclick="deleteCampaign(${row.id})" class="action-btn">Eliminar</button>
                      ${dupBtn}`;
            }
            if (row.status === 'scheduled') {
              return `<button onclick="cancelCampaign(${row.id})" class="action-btn">Cancelar</button>${dupBtn}`;
            }
            if (row.status === 'sending') {
              return `<button onclick="pauseCampaign(${row.id})" class="action-btn">Pausar</button>${dupBtn}`;
            }
            if (row.status === 'paused') {
              return `<button onclick="resumeCampaign(${row.id})" class="action-btn">Reanudar</button>
                      <button onclick="cancelCampaign(${row.id})" class="action-btn">Cancelar</button>${dupBtn}`;
            }
            return dupBtn;
          }
        }
      ],
      rows: campaigns,
      searchable: true,
      sortable: true,
      tableId: 'campaigns-table'
    })
    : renderEmptyState({
      title: 'Sin campañas',
      message: 'Aún no hay campañas creadas.',
      ctaText: 'Crear Campaña',
      ctaLink: '/admin/campaigns/new'
    });

  const content = `<section class="panel">
      <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
        <div>
            <h1>Campañas</h1>
            <div class="muted">Total: ${campaigns.length}</div>
        </div>
        <div id="campaign-clock" style="font-family:monospace; font-size:1.2rem; font-weight:bold; color:var(--accent);">--:--:--</div>
      </div>
      ${helpText}
      ${tableContent}
      ${campaigns.length > 0 ? renderPager({
    basePath: '/admin/campaigns',
    query: {},
    offset,
    limit,
    hasNext: campaigns.length === limit
  }) : ''}
    </section>
    <script>
    async function pauseCampaign(id) {
        if(!confirm('Pausar campana?')) return;
        const res = await fetch('/admin/api/campaigns/'+id+'/pause', {method: 'POST'});
        if(res.ok) window.location.reload();
        else alert('Error al pausar');
    }
    async function resumeCampaign(id) {
        if(!confirm('Reanudar campana?')) return;
        const res = await fetch('/admin/api/campaigns/'+id+'/resume', {method: 'POST'});
        if(res.ok) window.location.reload();
        else alert('Error al reanudar');
    }
    async function cancelCampaign(id) {
        if(!confirm('Cancelar campana?')) return;
        const res = await fetch('/admin/api/campaigns/'+id+'/cancel', {method: 'POST'});
        if(res.ok) window.location.reload();
        else alert('Error al cancelar');
    }
    async function deleteCampaign(id) {
        if(!confirm('Eliminar campana? Esta accion es irreversible.')) return;
        const res = await fetch('/admin/api/campaigns/'+id, {method: 'DELETE'});
        if(res.ok) window.location.reload();
        else alert('Error al eliminar');
    }
    async function duplicateCampaign(id) {
        const r = await fetch('/admin/api/campaigns/'+id+'/duplicate', {method: 'POST'});
        if(r.ok) window.location.href = '/admin/campaigns';
        else alert('Error al duplicar la campaña');
    }

    document.addEventListener('DOMContentLoaded', () => {
        function updateClock() {
            const clock = document.getElementById('campaign-clock');
            if (clock) {
                const now = new Date();
                clock.textContent = now.toLocaleTimeString('es-CL');
            }
        }
        setInterval(updateClock, 1000);
        updateClock();
    });
    </script>
    `;

  return renderLayout({ title: 'Campañas', content, active: 'campaigns' });
}

export function renderCampaignDetailPage({ campaign, recipients, offset, limit }) {
  const isDraft = campaign.status === 'draft';
  const isScheduled = campaign.status === 'scheduled';
  const isPaused = campaign.status === 'paused';
  const isSending = campaign.status === 'sending' || campaign.status === 'active';
  const canAssign = isDraft || isScheduled || isPaused;

  // Progress bar calculation
  const total = campaign.total_recipients || 0;
  const sent = campaign.sent_count || 0; // Assuming sent_count is updated directly on campaign or sum from recipients
  // Note: In previous schema sent_count was added.
  const percent = total > 0 ? Math.round((sent / total) * 100) : 0;

  const progressBar = total > 0 ? `
    <div style="margin: 10px 0;" id="campaign-progress">
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
            <span>Progreso: <span id="progress-sent">${sent}</span> / <span id="progress-total">${total}</span></span>
            <span id="progress-percent">${percent}%</span>
        </div>
        <div style="background:#eee; border-radius:4px; height:8px; overflow:hidden;">
            <div id="progress-bar" style="background:var(--accent); width:${percent}%; height:100%;"></div>
        </div>
    </div>` : '';

  const primaryActions = (isDraft || isScheduled) ? `
        <div style="margin-top: 15px; display:flex; gap:10px;">
            <a href="/admin/campaigns/${campaign.id}/edit" class="action-btn">Editar Configuracion</a>
            <button onclick="startCampaign()" class="action-btn" style="background:var(--accent); color:white; border-color:var(--accent)">Iniciar Campana</button>
            <button onclick="deleteCampaign()" class="action-btn">Eliminar</button>
        </div>
    ` : '';

  const pausedActions = isPaused ? `
        <div style="margin-top: 15px; display:flex; gap:10px;">
            <button onclick="resumeCampaign()" class="action-btn">Reanudar</button>
            <button onclick="cancelCampaign()" class="action-btn" style="background:var(--bad); color:white;">Cancelar</button>
        </div>
    ` : '';

  const pauseCancel = isSending ? `
        <div style="margin-top: 15px; display:flex; gap:10px;">
             <button onclick="pauseCampaign()" class="action-btn">Pausar</button>
             <button onclick="cancelCampaign()" class="action-btn" style="background:var(--bad); color:white;">Cancelar</button>
        </div>
    ` : '';

  const header = `<section class="panel">
      <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
        <div>
            <h1>${escapeHtml(campaign.name)}</h1>
            ${renderBadge(campaign.status, statusTone(campaign.status))}
        </div>
        <div id="campaign-clock" style="font-family:monospace; font-size:1.2rem; font-weight:bold; color:var(--accent);">--:--:--</div>
      </div>
      <div class="muted"><strong>Tipo:</strong> ${escapeHtml(campaign.type || 'N/A')}</div>
      <div class="muted"><strong>Programada:</strong> ${escapeHtml(formatDate(campaign.scheduled_at || '')) || 'N/A'}</div>
      <div class="muted"><strong>Mensaje:</strong> ${escapeHtml(campaign.message_template || 'N/A')}</div>
      ${progressBar}
      <div style="margin-top: 15px;">
        <a href="/admin/campaigns/${campaign.id}/seguimiento" class="action-btn" style="background:var(--accent); color:white; border-color:var(--accent)">📊 Ver Seguimiento</a>
      </div>
      ${primaryActions}
      ${pausedActions}
      ${pauseCancel}
    </section>`;

  const assignPanel = canAssign ? `
    <section class="panel" id="assign-recipients">
      <div class="panel-header"><h3>Asignar destinatarios</h3></div>
      <div class="muted">Elige fuente y filtros. Los opt-outs se excluyen automaticamente.</div>
      <div style="margin-top:12px;">
        <div class="inline">
          <label for="recipientSource" class="muted">Fuente:</label>
          <select id="recipientSource">
            <option value="vehicles">Por vehiculos</option>
            <option value="contacts">Por contactos</option>
          </select>
          <button type="button" id="assignRecipientsBtn">Asignar</button>
          <span id="assignResult" class="muted"></span>
        </div>
        <div id="recipientVehicleFilters" style="margin-top:10px;">
          <div class="inline">
            <input type="text" id="filterMake" placeholder="Marca (opcional)" />
            <input type="text" id="filterModel" placeholder="Modelo (opcional)" />
            <input type="number" id="filterYearMin" placeholder="Ano min" />
            <input type="number" id="filterYearMax" placeholder="Ano max" />
          </div>
        </div>
        <div id="recipientContactFilters" class="hidden" style="margin-top:10px;">
          <div class="inline">
            <input type="text" id="filterQuery" placeholder="Telefono o nombre" />
          </div>
        </div>
      </div>
    </section>` : '';

  const recipientsContent = recipients.length > 0
    ? renderTable({
      columns: [
        { key: 'phone', label: 'Telefono' },
        { key: 'contact_name', label: 'Nombre' },
        { key: 'status', label: 'Status', render: (row) => renderBadge(row.status, statusTone(row.status)) },
        { key: 'message_sid', label: 'SID' },
        { key: 'sent_at', label: 'Enviado', render: (row) => escapeHtml(formatDate(row.sent_at)) },
        { key: 'error_message', label: 'Error', render: (row) => escapeHtml(truncate(row.error_message || '', 30)) }
      ],
      rows: recipients,
      searchable: true,
      sortable: true,
      tableId: 'recipients-table'
    })
    : renderEmptyState({
      title: 'Sin destinatarios',
      message: 'Esta campana aun no tiene destinatarios asignados.',
      ctaText: canAssign ? 'Asignar destinatarios' : null,
      ctaLink: canAssign ? '#assign-recipients' : null
    });

  const script = `
    <script>
      const campaignStatus = '${campaign.status}';

      function toggleRecipientFilters() {
          const sourceEl = document.getElementById('recipientSource');
          if (!sourceEl) return;
          const vehicleFilters = document.getElementById('recipientVehicleFilters');
          const contactFilters = document.getElementById('recipientContactFilters');
          if (sourceEl.value === 'contacts') {
              if (vehicleFilters) vehicleFilters.classList.add('hidden');
              if (contactFilters) contactFilters.classList.remove('hidden');
          } else {
              if (vehicleFilters) vehicleFilters.classList.remove('hidden');
              if (contactFilters) contactFilters.classList.add('hidden');
          }
      }

      async function assignRecipients() {
          const sourceEl = document.getElementById('recipientSource');
          const source = sourceEl ? sourceEl.value : 'vehicles';
          const filters = {};
          let query = '';

          if (source === 'contacts') {
              const queryEl = document.getElementById('filterQuery');
              query = queryEl ? queryEl.value.trim() : '';
              filters.query = query || '';
          } else {
              const make = document.getElementById('filterMake')?.value?.trim() || null;
              const model = document.getElementById('filterModel')?.value?.trim() || null;
              const yearMinRaw = document.getElementById('filterYearMin')?.value || '';
              const yearMaxRaw = document.getElementById('filterYearMax')?.value || '';
              const yearMin = yearMinRaw ? Number(yearMinRaw) : null;
              const yearMax = yearMaxRaw ? Number(yearMaxRaw) : null;
              filters.make = make || null;
              filters.model = model || null;
              filters.yearMin = Number.isNaN(yearMin) ? null : yearMin;
              filters.yearMax = Number.isNaN(yearMax) ? null : yearMax;
          }

          const res = await fetch('/admin/api/campaigns/${campaign.id}/assign-recipients', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ source, filters, query })
          });

          if (res.ok) {
              const data = await res.json();
              const result = document.getElementById('assignResult');
              if (result) result.textContent = 'Asignados: ' + data.assigned;
              window.location.reload();
          } else {
              alert('Error al asignar destinatarios');
          }
      }

      async function startCampaign() {
          const res = await fetch('/admin/api/campaigns/${campaign.id}/start', { method: 'POST' });
          if (res.ok) window.location.reload();
          else alert('Error al iniciar');
      }

      async function pauseCampaign() {
          if (!confirm('Pausar campana?')) return;
          const res = await fetch('/admin/api/campaigns/${campaign.id}/pause', { method: 'POST' });
          if (res.ok) window.location.reload();
          else alert('Error al pausar');
      }

      async function resumeCampaign() {
          const res = await fetch('/admin/api/campaigns/${campaign.id}/resume', { method: 'POST' });
          if (res.ok) window.location.reload();
          else alert('Error al reanudar');
      }

      async function cancelCampaign() {
          if (!confirm('Cancelar campana?')) return;
          const res = await fetch('/admin/api/campaigns/${campaign.id}/cancel', { method: 'POST' });
          if (res.ok) window.location.reload();
          else alert('Error al cancelar');
      }

      async function deleteCampaign() {
          if (!confirm('Eliminar campana? Esta accion es irreversible.')) return;
          const res = await fetch('/admin/api/campaigns/${campaign.id}', { method: 'DELETE' });
          if (res.ok) window.location.href = '/admin/campaigns';
          else alert('Error al eliminar');
      }

      async function refreshProgress() {
          const res = await fetch('/admin/api/campaigns/${campaign.id}/progress');
          if (!res.ok) return;
          const data = await res.json();
          const total = Number(data.total || 0);
          const sent = Number(data.sent || 0);
          const percent = total > 0 ? Math.round((sent / total) * 100) : 0;

          const sentEl = document.getElementById('progress-sent');
          const totalEl = document.getElementById('progress-total');
          const percentEl = document.getElementById('progress-percent');
          const barEl = document.getElementById('progress-bar');

          if (sentEl) sentEl.textContent = sent;
          if (totalEl) totalEl.textContent = total;
          if (percentEl) percentEl.textContent = percent + '%';
          if (barEl) barEl.style.width = percent + '%';
      }

      document.addEventListener('DOMContentLoaded', () => {
          const sourceEl = document.getElementById('recipientSource');
          if (sourceEl) {
              sourceEl.addEventListener('change', toggleRecipientFilters);
              toggleRecipientFilters();
          }
          const assignBtn = document.getElementById('assignRecipientsBtn');
          if (assignBtn) assignBtn.addEventListener('click', assignRecipients);

          if (['sending', 'scheduled', 'active'].includes(campaignStatus)) {
              refreshProgress();
              setInterval(refreshProgress, 10000);
          }

          function updateClock() {
              const clock = document.getElementById('campaign-clock');
              if (clock) {
                  const now = new Date();
                  clock.textContent = now.toLocaleTimeString('es-CL');
              }
          }
          setInterval(updateClock, 1000);
          updateClock();
      });
    </script>
    `;

  return renderLayout({
    title: `Campaña ${campaign.id}`,
    content: header + assignPanel + `<section class="panel"><h3>Destinatarios</h3>${recipientsContent}</section>` + script,
    active: 'campaigns'
  });
}

export function renderCampaignFormPage({ campaign = {}, makes = [], templates = [] }) {
  const isNew = !campaign.id;
  const title = isNew ? 'Nueva Campaña' : 'Editar Campaña';
  const submitLabel = isNew ? 'Crear Campaña' : 'Guardar Cambios';
  const scheduledValue = formatDateTimeLocal(campaign.scheduled_at || '');
  const msgType = (campaign.content_sid || campaign.template_id) ? 'twilio' : 'libre';
  const isTestCampaign = campaign.is_test ? 'test' : (campaign.id ? 'prod' : '');
  const selectedTemplateId = campaign.template_id ? String(campaign.template_id) : '';
  let campaignFilters = {};
  try {
    campaignFilters = typeof campaign.filters === 'string'
      ? JSON.parse(campaign.filters || '{}')
      : (campaign.filters || {});
  } catch (_) {
    campaignFilters = {};
  }
  const initialRecipientSource = campaignFilters.source === 'contacts'
    ? 'contacts'
    : (isTestCampaign === 'prod' ? 'vehicles' : '');
  const initialSegmentId = campaignFilters.segmentId ? String(campaignFilters.segmentId) : '';
  const initialFilterMake = campaignFilters.make || '';
  const initialFilterModel = campaignFilters.model || '';
  const initialFilterYearMin = campaignFilters.yearMin ? String(campaignFilters.yearMin) : '';
  const initialFilterYearMax = campaignFilters.yearMax ? String(campaignFilters.yearMax) : '';
  const initialFilterQuery = campaignFilters.query || '';

  const dotBase = 'width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0;';
  const dotActive   = dotBase + 'background:var(--accent);color:#fff;';
  const dotInactive = dotBase + 'background:#e0d8ce;color:#999;';

  const brandChips = makes.length > 0
    ? '<button type="button" class="brand-chip" data-make="" style="padding:4px 12px;border-radius:12px;border:1px solid var(--accent);background:var(--accent);color:#fff;font-size:13px;cursor:pointer;margin:2px;">Todos</button>'
      + makes.map(m =>
          '<button type="button" class="brand-chip" data-make="' + escapeHtml(m.make) + '" style="padding:4px 12px;border-radius:12px;border:1px solid #d0c8be;background:#f0ebe4;color:#555;font-size:13px;cursor:pointer;margin:2px;">'
          + escapeHtml(m.make) + ' <span style="opacity:.6;font-size:11px;">' + m.contacts + '</span></button>'
        ).join('')
    : '<span class="muted" style="font-size:13px;">Sin marcas aún — importa contactos primero.</span>';

  const templateChoices = templates.length > 0
    ? templates.map((tpl) => {
      const isChecked = selectedTemplateId && Number(selectedTemplateId) === Number(tpl.id);
      const isActive = tpl.is_active === 1;
      const itemStyle = isActive
        ? 'border:1px solid var(--line);background:#fff;'
        : 'border:1px dashed #d0c8be;background:#f8f5f1;opacity:.75;';
      return `<label style="display:block;padding:10px;border-radius:8px;cursor:pointer;${itemStyle}">
        <div style="display:flex;align-items:flex-start;gap:8px;">
          <input type="radio" name="templateId" value="${tpl.id}" ${isChecked ? 'checked' : ''} style="margin-top:3px;" />
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
              <strong style="font-size:13px;">${escapeHtml(tpl.name || '')}</strong>
              ${isActive ? '<span class="badge badge-good">activa</span>' : '<span class="badge badge-muted">archivada</span>'}
            </div>
            <div class="muted" style="font-size:12px;margin-top:2px;">SID: ${escapeHtml(tpl.content_sid || 'sin SID')}</div>
            <div style="font-size:12px;margin-top:4px;line-height:1.35;">${escapeHtml(truncate(tpl.body || '', 110))}</div>
          </div>
        </div>
      </label>`;
    }).join('')
    : '<div class="muted" style="font-size:12px;">No hay plantillas creadas aún. Crea una en la sección Plantillas.</div>';

  const templateMapJson = JSON.stringify(templates.map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    body: tpl.body,
    content_sid: tpl.content_sid,
    is_active: tpl.is_active
  }))).replace(/</g, '\\u003c');

  const form = `
<div id="campaignFormError" style="color:var(--bad);margin-bottom:10px;min-height:18px;font-size:13px;"></div>

<!-- ── Indicador de pasos ── -->
<div style="display:flex;align-items:center;gap:8px;margin-bottom:22px;padding:14px 18px;background:#f8f5f1;border-radius:10px;">
  <div id="dot1" style="${dotActive}">1</div>
  <div id="line1" style="flex:1;height:3px;background:var(--accent);border-radius:2px;"></div>
  <div id="dot2" style="${dotInactive}">2</div>
  <div id="line2" style="flex:1;height:3px;background:#e0d8ce;border-radius:2px;"></div>
  <div id="dot3" style="${dotInactive}">3</div>
  <span id="stepTitle" style="margin-left:12px;font-weight:600;font-size:15px;">Mensaje</span>
</div>

<form id="campaignForm" autocomplete="off">

<!-- ════════════════════════════════════
     PASO 1 — MENSAJE
     ════════════════════════════════════ -->
<section id="stepPanel1" class="panel">
  <div class="panel-header"><h1>${title}</h1></div>

  <div style="margin-bottom:15px;">
    <label style="display:block;font-weight:600;margin-bottom:5px;">Nombre *</label>
    <input type="text" name="name" value="${escapeHtml(campaign.name || '')}" required style="width:100%;" placeholder="Ej: Toyota Abril 2026" />
  </div>

  <div style="margin-bottom:15px;">
    <label style="display:block;font-weight:600;margin-bottom:8px;">Tipo de mensaje</label>
    <div style="display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;">
      <label id="tabLibre" style="flex:1;display:flex;align-items:center;justify-content:center;padding:10px;cursor:pointer;font-size:14px;font-weight:600;background:var(--accent);color:#fff;">
        <input type="radio" name="msgType" value="libre" ${msgType !== 'twilio' ? 'checked' : ''} style="display:none;" />
        Mensaje libre
      </label>
      <label id="tabTwilio" style="flex:1;display:flex;align-items:center;justify-content:center;padding:10px;cursor:pointer;font-size:14px;background:#f8f5f1;color:#666;">
        <input type="radio" name="msgType" value="twilio" ${msgType === 'twilio' ? 'checked' : ''} style="display:none;" />
        Plantilla Twilio (SID)
      </label>
    </div>
  </div>

  <div id="panelLibre">
    <label style="display:block;font-weight:600;margin-bottom:5px;">Mensaje</label>
    <textarea name="messageTemplate" id="msgTextarea" rows="4"
      style="width:100%;border-radius:8px;border:1px solid var(--line);padding:10px;resize:vertical;"
      placeholder="Hola {{nombre}}, te contactamos sobre tu {{marca}} {{modelo}}..."
    >${escapeHtml(campaign.message_template || '')}</textarea>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;flex-wrap:wrap;gap:4px;">
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button type="button" class="var-btn action-btn" data-var="{{nombre}}" style="font-size:12px;padding:3px 8px;">+{{nombre}}</button>
        <button type="button" class="var-btn action-btn" data-var="{{marca}}" style="font-size:12px;padding:3px 8px;">+{{marca}}</button>
        <button type="button" class="var-btn action-btn" data-var="{{modelo}}" style="font-size:12px;padding:3px 8px;">+{{modelo}}</button>
        <button type="button" class="var-btn action-btn" data-var="{{año}}" style="font-size:12px;padding:3px 8px;">+{{año}}</button>
      </div>
      <span id="charCount" class="muted" style="font-size:12px;"></span>
    </div>
  </div>

  <div id="panelTwilio" style="display:none;">
    <label style="display:block;font-weight:600;margin-bottom:5px;">Selecciona una plantilla Twilio</label>
    <div id="templateChecklist" style="display:flex;flex-direction:column;gap:8px;max-height:260px;overflow:auto;padding:2px;">
      ${templateChoices}
    </div>
    <div id="selectedTemplateInfo" class="muted" style="font-size:12px;margin-top:8px;min-height:18px;"></div>

    <details style="margin-top:10px;">
      <summary style="cursor:pointer;font-size:12px;">Modo avanzado: SID manual</summary>
      <div style="margin-top:8px;">
        <label style="display:block;font-weight:600;margin-bottom:5px;">Content SID (Twilio)</label>
        <input type="text" name="contentSid" id="manualContentSid" value="${escapeHtml(campaign.content_sid || '')}" style="width:100%;" placeholder="HX..." />
        <div class="muted" style="font-size:12px;margin-top:5px;">Se usa si no seleccionas plantilla o para compatibilidad con campañas antiguas.</div>
      </div>
    </details>
  </div>

  <div style="display:flex;justify-content:flex-end;margin-top:20px;gap:10px;">
    <a href="/admin/campaigns" style="padding:10px 16px;color:var(--muted);text-decoration:none;">Cancelar</a>
    <button type="button" id="toStep2" style="padding:10px 24px;font-weight:600;">Siguiente →</button>
  </div>
</section>

<!-- ════════════════════════════════════
     PASO 2 — PREVIEW
     ════════════════════════════════════ -->
<section id="stepPanel2" class="panel" style="display:none;">
  <div class="panel-header"><h2>Vista previa del mensaje</h2></div>
  <div class="muted" style="margin-bottom:12px;font-size:13px;">
    Muestra cómo queda el mensaje con datos reales. Solo visual — no envía nada.
  </div>

  ${makes.length > 0 ? `
  <div style="margin-bottom:10px;">
    <label style="display:block;font-weight:600;margin-bottom:6px;">Filtrar muestra por marca:</label>
    <div style="display:flex;flex-wrap:wrap;" id="brandChipRow">${brandChips}</div>
  </div>` : ''}

  <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center;">
    <input type="text" id="previewModel" placeholder="Modelo (opcional)" style="flex:1;" />
    <button type="button" id="previewBtn" style="padding:8px 16px;">Previsualizar</button>
  </div>

  <div id="previewResults" style="min-height:60px;padding:12px;background:#f8f5f1;border-radius:8px;">
    <span class="muted">Haz click en "Previsualizar" para ver ejemplos del mensaje.</span>
  </div>

  <div style="display:flex;justify-content:space-between;margin-top:20px;">
    <button type="button" id="toStep1" style="padding:10px 20px;">← Anterior</button>
    <button type="button" id="toStep3" style="padding:10px 24px;font-weight:600;">Siguiente →</button>
  </div>
</section>

<!-- ════════════════════════════════════
     PASO 3 — DESTINATARIOS + ENVÍO
     ════════════════════════════════════ -->
<section id="stepPanel3" class="panel" style="display:none;">
  <div class="panel-header"><h2>Destinatarios y envío</h2></div>

  <!-- Tarjetas de tipo de campaña -->
  <div style="margin-bottom:20px;">
    <label style="display:block;font-weight:600;margin-bottom:10px;">Tipo de campaña:</label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div id="cardTest" onclick="selectMode('test')"
        style="padding:16px;border-radius:10px;border:2px solid #d0c8be;cursor:pointer;">
        <div style="font-size:22px;margin-bottom:6px;">🧪</div>
        <div style="font-weight:700;margin-bottom:4px;">Prueba</div>
        <div class="muted" style="font-size:12px;line-height:1.5;">Selecciona contactos manualmente.<br/>Verifica el pipeline completo antes de producción.</div>
      </div>
      <div id="cardProd" onclick="selectMode('prod')"
        style="padding:16px;border-radius:10px;border:2px solid #d0c8be;cursor:pointer;">
        <div style="font-size:22px;margin-bottom:6px;">🚀</div>
        <div style="font-weight:700;margin-bottom:4px;">Producción</div>
        <div class="muted" style="font-size:12px;line-height:1.5;">Destinatarios por filtros masivos.<br/>Campaña real para tu audiencia.</div>
      </div>
    </div>
  </div>

  <!-- Panel 🧪 Prueba -->
  <div id="panelTest" style="display:none;margin-bottom:20px;padding:15px;background:#fffbeb;border:1px solid #f59e0b;border-radius:10px;">
    <h3 style="margin:0 0 10px;color:#92400e;">Seleccionar contactos</h3>
    <div class="muted" style="font-size:12px;margin-bottom:10px;">Los opt-outs se excluyen automáticamente durante el envío.</div>
    <div style="display:flex;gap:8px;margin-bottom:10px;">
      <input type="text" id="testQuery" placeholder="Buscar por nombre o teléfono" style="flex:1;" />
      <button type="button" id="testPreviewBtn" style="padding:8px 14px;">Buscar</button>
    </div>
    <div id="testModeHint" class="muted" style="font-size:12px;margin-bottom:6px;"></div>
    <div id="testContactsWrapper"></div>
    <div id="testSelectionCount" style="margin-top:8px;font-weight:600;font-size:13px;color:#92400e;min-height:18px;"></div>
  </div>

  <!-- Panel 🚀 Producción -->
    <div id="panelProd" style="display:none;margin-bottom:20px;">
      <div class="inline" style="margin-bottom:10px;">
        <label class="muted">Fuente:</label>
        <select id="recipientSource">
          <option value="" ${!initialRecipientSource ? 'selected' : ''}>No asignar ahora (borrador)</option>
          <option value="vehicles" ${initialRecipientSource === 'vehicles' ? 'selected' : ''}>Por vehículos</option>
          <option value="contacts" ${initialRecipientSource === 'contacts' ? 'selected' : ''}>Por contactos</option>
        </select>
        <button type="button" id="loadRecipientsBtn">Cargar destinatarios</button>
      </div>

      <div id="recipientSegmentTools" class="hidden" style="background:#f8f5f1;padding:12px;border-radius:8px;border:1px solid var(--line);margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
          <div class="inline">
            <select id="segmentSelect" style="max-width:260px;">
              <option value="">-- Cargar Segmento --</option>
            </select>
            <button type="button" id="loadSegmentBtn" class="action-btn">Cargar segmento</button>
          </div>
          <div class="muted" style="font-size:12px;">Solo se muestran segmentos compatibles con la fuente elegida.</div>
        </div>
      </div>

      <div id="recipientVehicleFilters" class="hidden" style="background:#f8f5f1;padding:12px;border-radius:8px;border:1px solid var(--line);margin-bottom:10px;">
        <div style="display:flex;justify-content:flex-end;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #eee;">
          <button type="button" id="saveSegmentBtn" class="action-btn" style="background:var(--accent-2);border-color:var(--accent-2);color:white;">Guardar Filtros</button>
        </div>
        <div class="inline">
          <input type="text" id="filterMake" placeholder="Marca (opcional)" value="${escapeHtml(initialFilterMake)}" />
          <input type="text" id="filterModel" placeholder="Modelo (opcional)" value="${escapeHtml(initialFilterModel)}" />
        <input type="number" id="filterYearMin" placeholder="Año min" value="${escapeHtml(initialFilterYearMin)}" />
        <input type="number" id="filterYearMax" placeholder="Año max" value="${escapeHtml(initialFilterYearMax)}" />
      </div>
    </div>

      <div id="recipientContactFilters" class="hidden" style="background:#f8f5f1;padding:12px;border-radius:8px;border:1px solid var(--line);margin-bottom:10px;">
        <div class="inline">
          <input type="text" id="filterQuery" placeholder="Teléfono o nombre" value="${escapeHtml(initialFilterQuery)}" />
        </div>
      </div>

    <div id="recipientFeedback" class="muted" style="margin-top:8px;min-height:18px;"></div>
    <div id="recipientCount" class="muted" style="margin-top:8px;"></div>
    <div id="recipientPreview" style="margin-top:8px;max-height:200px;overflow-y:auto;"></div>
  </div>

  <!-- Programar envío -->
  <div style="padding:15px;border:1px solid var(--line);border-radius:10px;margin-bottom:20px;">
    <label style="display:block;font-weight:600;margin-bottom:10px;">Programar envío:</label>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="radio" name="sendTiming" value="draft" checked onchange="updateTimingUI()" />
        <span><strong>Borrador</strong> — guardar para enviar manualmente después</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="radio" name="sendTiming" value="scheduled" onchange="updateTimingUI()" />
        <span><strong>Programar para:</strong></span>
      </label>
    </div>
    <div id="scheduledPicker" style="display:none;margin-top:10px;padding-left:24px;">
      <input type="datetime-local" name="scheduledAt" value="${escapeHtml(scheduledValue)}" style="width:100%;" />
    </div>
  </div>

  <div style="display:flex;justify-content:space-between;align-items:center;">
    <button type="button" id="toStep2back" style="padding:10px 20px;">← Anterior</button>
    <button type="submit" id="submitBtn" disabled style="padding:10px 24px;font-weight:600;opacity:.4;cursor:not-allowed;">${submitLabel}</button>
  </div>
  <div id="submitHint" class="muted" style="text-align:right;font-size:12px;margin-top:4px;">Selecciona el tipo de campaña para activar el botón.</div>
</section>

</form>

<script>
// ── Estado ──────────────────────────
const campaignId = ${campaign.id ? Number(campaign.id) : 'null'};
let currentStep = 1;
let campaignMode = '${isTestCampaign}';
let selectedTestIds = [];
const TEMPLATE_MAP = ${templateMapJson};

const STEP_LABELS = { 1: 'Mensaje', 2: 'Vista previa', 3: 'Destinatarios y envío' };

// ── Helpers ──────────────────────────
function escapeHtml(v) {
  return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function maskPhone(p) {
  const s = String(p||''); return s.length<=4?s:s.slice(0,-4).replace(/\\d/g,'*')+s.slice(-4);
}
function setFormError(msg) {
  const el = document.getElementById('campaignFormError');
  if (el) el.textContent = msg || '';
}
function setTestHint(msg, isErr) {
  const el = document.getElementById('testModeHint');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = isErr ? 'var(--bad)' : 'var(--muted)';
}

// ── Navegación de pasos ──────────────
function goToStep(n) {
  const dotBase = 'width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0;';
  [1,2,3].forEach(i => {
    const p = document.getElementById('stepPanel' + i);
    const d = document.getElementById('dot' + i);
    if (p) p.style.display = i===n ? '' : 'none';
    if (d) d.style.cssText = i<n ? dotBase+'background:#22c55e;color:#fff;'
                              : i===n ? dotBase+'background:var(--accent);color:#fff;'
                              : dotBase+'background:#e0d8ce;color:#999;';
  });
  [1,2].forEach(i => {
    const l = document.getElementById('line'+i);
    if (l) l.style.background = i<n ? '#22c55e' : '#e0d8ce';
  });
  const t = document.getElementById('stepTitle');
  if (t) t.textContent = STEP_LABELS[n] || '';
  currentStep = n;
  window.scrollTo(0,0);
}

function validateStep1() {
  const name = document.querySelector('input[name="name"]')?.value?.trim();
  if (!name) { setFormError('El nombre es requerido.'); return false; }
  const type = document.querySelector('input[name="msgType"]:checked')?.value;
  if (type === 'libre') {
    if (!document.getElementById('msgTextarea')?.value?.trim()) { setFormError('Escribe el contenido del mensaje.'); return false; }
  } else {
    const selectedTemplate = document.querySelector('input[name="templateId"]:checked')?.value || '';
    const sidValue = document.querySelector('input[name="contentSid"]')?.value?.trim() || '';
    if (!selectedTemplate && !sidValue) { setFormError('Selecciona una plantilla o ingresa un Content SID.'); return false; }
  }
  setFormError('');
  return true;
}

function updateTemplateSelectionUI() {
  const info = document.getElementById('selectedTemplateInfo');
  const selectedId = document.querySelector('input[name="templateId"]:checked')?.value || '';
  const sidInput = document.getElementById('manualContentSid');
  if (!info) return;

  if (!selectedId) {
    info.textContent = 'Sin plantilla seleccionada.';
    return;
  }

  const selected = TEMPLATE_MAP.find(t => String(t.id) === String(selectedId));
  if (!selected) {
    info.textContent = 'Plantilla no encontrada.';
    return;
  }

  if (sidInput && selected.content_sid) {
    sidInput.value = selected.content_sid;
  }

  const sidTxt = selected.content_sid ? ('SID: ' + selected.content_sid) : 'Sin SID';
  const bodyTxt = selected.body ? (' | ' + selected.body.slice(0, 90)) : '';
  info.textContent = selected.name + ' - ' + sidTxt + bodyTxt;
}

// ── Tabs de tipo de mensaje ──────────
function updateMsgTabs() {
  const t = document.querySelector('input[name="msgType"]:checked')?.value || 'libre';
  const libre = t === 'libre';
  document.getElementById('panelLibre').style.display  = libre ? '' : 'none';
  document.getElementById('panelTwilio').style.display = libre ? 'none' : '';
  const tl = document.getElementById('tabLibre');
  const tw = document.getElementById('tabTwilio');
  if (tl) { tl.style.background = libre ? 'var(--accent)' : '#f8f5f1'; tl.style.color = libre ? '#fff' : '#666'; tl.style.fontWeight = libre ? '600' : '400'; }
  if (tw) { tw.style.background = libre ? '#f8f5f1' : 'var(--accent)'; tw.style.color = libre ? '#666' : '#fff'; tw.style.fontWeight = libre ? '400' : '600'; }
}

// ── Inserción de variables ───────────
function insertVar(v) {
  const ta = document.getElementById('msgTextarea');
  if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.slice(0,s) + v + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + v.length;
  ta.focus(); updateCharCount();
}
function updateCharCount() {
  const ta = document.getElementById('msgTextarea');
  const el = document.getElementById('charCount');
  if (!ta||!el) return;
  el.textContent = ta.value.length + ' caracteres';
  el.style.color = ta.value.length > 1600 ? 'var(--bad)' : '';
}

// ── Preview (paso 2) ─────────────────
let activeMake = '';
function setActiveChip(make) {
  activeMake = make;
  document.querySelectorAll('.brand-chip').forEach(b => {
    const active = b.dataset.make === make;
    b.style.background = active ? 'var(--accent)' : '#f0ebe4';
    b.style.color       = active ? '#fff' : '#555';
    b.style.border      = active ? '1px solid var(--accent)' : '1px solid #d0c8be';
  });
}

async function runPreview() {
  const results = document.getElementById('previewResults');
  if (!results) return;
  const type = document.querySelector('input[name="msgType"]:checked')?.value || 'libre';
  const template = document.getElementById('msgTextarea')?.value?.trim() || '';
  if (type === 'libre' && !template) {
    results.innerHTML = '<span class="muted">Escribe un mensaje en el Paso 1 para previsualizar.</span>'; return;
  }
  results.innerHTML = '<span class="muted">Cargando...</span>';
  const model = document.getElementById('previewModel')?.value?.trim() || null;
  try {
    const sr = await fetch('/admin/api/campaigns/preview-samples', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ source:'vehicles', filters:{ make:activeMake||null, model }, limit:3 })
    });
    if (!sr.ok) { results.innerHTML='<span class="muted">Error al cargar muestras.</span>'; return; }
    const { samples=[] } = await sr.json();
    if (!samples.length) { results.innerHTML='<span class="muted">No hay contactos con vehículos para este filtro.</span>'; return; }
    if (type !== 'libre') {
      results.innerHTML = samples.map(s=>
        '<div style="padding:8px;border-bottom:1px solid #eee;"><strong>'+escapeHtml(maskPhone(s.phone))+'</strong>'+(s.name?' — '+escapeHtml(s.name):'')+' · '+escapeHtml([s.make,s.model,s.year].filter(Boolean).join(' '))+'</div>'
      ).join(''); return;
    }
    const previews = await Promise.all(samples.map(async s => {
      const r = await fetch('/admin/api/campaigns/preview', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ template, variableSource:s })
      });
      const d = await r.json();
      return { phone:s.phone, text:d.preview||'' };
    }));
    results.innerHTML = previews.map(p=>
      '<div style="padding:8px;border-bottom:1px solid #eee;"><strong>'+escapeHtml(maskPhone(p.phone))+'</strong> '+escapeHtml(p.text)+'</div>'
    ).join('');
  } catch(e) { results.innerHTML='<span class="muted">Error: '+escapeHtml(e.message)+'</span>'; }
}

// ── Selección de tipo de campaña ─────
function selectMode(mode) {
  campaignMode = mode;
  const isTest = mode === 'test';
  document.getElementById('panelTest').style.display = isTest ? '' : 'none';
  document.getElementById('panelProd').style.display = isTest ? 'none' : '';
  const selStyle = 'padding:16px;border-radius:10px;border:2px solid var(--accent);cursor:pointer;background:#f0ebe4;';
  const norStyle = 'padding:16px;border-radius:10px;border:2px solid #d0c8be;cursor:pointer;';
  document.getElementById('cardTest').style.cssText = isTest ? selStyle : norStyle;
  document.getElementById('cardProd').style.cssText = isTest ? norStyle : selStyle;
  const btn = document.getElementById('submitBtn');
  if (btn) { btn.disabled=false; btn.style.opacity='1'; btn.style.cursor='pointer'; }
  const hint = document.getElementById('submitHint');
  if (hint) hint.textContent = '';
}

// ── Timing UI ────────────────────────
function updateTimingUI() {
  const v = document.querySelector('input[name="sendTiming"]:checked')?.value;
  const p = document.getElementById('scheduledPicker');
  if (p) p.style.display = v==='scheduled' ? '' : 'none';
}

// ── Selector de contactos (prueba) ───
function renderTestContacts(contacts) {
  const wrapper = document.getElementById('testContactsWrapper');
  if (!wrapper) return;
  if (!contacts.length) { wrapper.innerHTML='<p class="muted">No se encontraron contactos.</p>'; return; }
  const rows = contacts.map(c =>
    '<tr>'
    +'<td style="width:32px;padding:4px;"><input type="checkbox" class="test-contact" data-id="'+c.id+'" /></td>'
    +'<td style="padding:4px;">'+escapeHtml(maskPhone(c.phone))+'</td>'
    +'<td style="padding:4px;">'+escapeHtml(c.name||'—')+'</td>'
    +'<td style="padding:4px;">'+escapeHtml(c.status||'')+'</td>'
    +'</tr>'
  ).join('');
  wrapper.innerHTML =
    '<table style="width:100%;font-size:13px;border-collapse:collapse;">'
    +'<thead><tr style="border-bottom:2px solid #e8e0d5;">'
    +'<th style="padding:4px;"><input type="checkbox" id="selectAllTest" /></th>'
    +'<th style="padding:4px;text-align:left;">Teléfono</th>'
    +'<th style="padding:4px;text-align:left;">Nombre</th>'
    +'<th style="padding:4px;text-align:left;">Estado</th>'
    +'</tr></thead>'
    +'<tbody>'+rows+'</tbody></table>';
  document.getElementById('selectAllTest')?.addEventListener('change', e => {
    document.querySelectorAll('.test-contact').forEach(cb => cb.checked=e.target.checked);
    updateTestCount();
  });
  document.querySelectorAll('.test-contact').forEach(cb => cb.addEventListener('change', updateTestCount));
}
function updateTestCount() {
  selectedTestIds = [];
  document.querySelectorAll('.test-contact:checked').forEach(cb => { const id=Number(cb.dataset.id); if(id) selectedTestIds.push(id); });
  const el = document.getElementById('testSelectionCount');
  if (el) el.textContent = selectedTestIds.length ? selectedTestIds.length+' contacto(s) seleccionado(s)' : '';
}
async function loadTestContacts() {
  const wrapper = document.getElementById('testContactsWrapper');
  if (!wrapper) return;
  const q = document.getElementById('testQuery')?.value?.trim()||'';
  wrapper.innerHTML='<p class="muted">Buscando...</p>';
  try {
    const res = await fetch('/admin/api/contacts?q='+encodeURIComponent(q)+'&limit=100');
    if (!res.ok) { wrapper.innerHTML='<p class="muted">Error al cargar contactos.</p>'; return; }
    const { contacts=[] } = await res.json();
    renderTestContacts(contacts);
  } catch(e) { wrapper.innerHTML='<p class="muted">Error: '+escapeHtml(e.message)+'</p>'; }
}

// ── Segmentos (producción) ───────────
let availableSegments = [];
let prodAudienceTotal = 0;
const INITIAL_SEGMENT_ID = '${initialSegmentId}';

function setRecipientFeedback(msg, isError = false) {
  const el = document.getElementById('recipientFeedback');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = isError ? 'var(--bad)' : 'var(--muted)';
}

function getCurrentRecipientSource() {
  return document.getElementById('recipientSource')?.value || '';
}

function resetProdRecipientPreview() {
  prodAudienceTotal = 0;
  document.getElementById('recipientCount').textContent = '';
  document.getElementById('recipientPreview').innerHTML = '';
  window.selectedRecipients = [];
}

function parseSegmentConfig(segment) {
  if (!segment) return {};
  try {
    return typeof segment.filters === 'string' ? JSON.parse(segment.filters || '{}') : (segment.filters || {});
  } catch (_) {
    return {};
  }
}

function getSelectedSegmentMeta() {
  const segmentId = document.getElementById('segmentSelect')?.value || '';
  if (!segmentId) return null;
  return availableSegments.find((segment) => String(segment.id) === String(segmentId)) || null;
}

function renderSegmentOptions(selectedSegmentId = '') {
  const sel = document.getElementById('segmentSelect');
  if (!sel) return;

  const source = getCurrentRecipientSource();
  let placeholder = '-- Selecciona una fuente --';
  if (source) {
    placeholder = availableSegments.length
      ? '-- Cargar Segmento --'
      : '-- Sin segmentos para esta fuente --';
  }

  sel.innerHTML = '<option value="">' + escapeHtml(placeholder) + '</option>'
    + availableSegments.map((segment) => {
      const parsed = parseSegmentConfig(segment);
      const mode = parsed.mode === 'manual' ? 'manual' : 'dinámico';
      const sourceLabel = parsed.source === 'contacts' ? 'contactos' : 'vehículos';
      const selected = selectedSegmentId && String(segment.id) === String(selectedSegmentId) ? ' selected' : '';
      return "<option value='" + String(segment.id) + "'" + selected + ">"
        + escapeHtml(segment.name + ' · ' + mode + ' · ' + sourceLabel)
        + '</option>';
    }).join('');
}

function getVehicleFilters() {
  const yearMinRaw = document.getElementById('filterYearMin')?.value || '';
  const yearMaxRaw = document.getElementById('filterYearMax')?.value || '';
  const yearMin = yearMinRaw ? Number(yearMinRaw) : null;
  const yearMax = yearMaxRaw ? Number(yearMaxRaw) : null;
  return {
    make: document.getElementById('filterMake')?.value?.trim() || null,
    model: document.getElementById('filterModel')?.value?.trim() || null,
    yearMin: Number.isNaN(yearMin) ? null : yearMin,
    yearMax: Number.isNaN(yearMax) ? null : yearMax
  };
}

function getCurrentRecipientConfig() {
  const segment = getSelectedSegmentMeta();
  const segmentFilters = parseSegmentConfig(segment);
  if (segment && segmentFilters.mode === 'manual') {
    const source = segmentFilters.source === 'contacts' ? 'contacts' : 'vehicles';
    return {
      source,
      filters: {
        source,
        mode: 'manual',
        segmentId: Number(segment.id)
      }
    };
  }

  const source = document.getElementById('recipientSource')?.value || '';
  if (source === 'contacts') {
    return {
      source,
      filters: {
        source,
        mode: 'dynamic',
        segmentId: segment ? Number(segment.id) : null,
        query: document.getElementById('filterQuery')?.value?.trim() || ''
      }
    };
  }

  return {
    source,
    filters: {
      source,
      mode: 'dynamic',
      segmentId: segment ? Number(segment.id) : null,
      ...getVehicleFilters()
    }
  };
}

function applySegmentFilters(filters = {}, segmentId = '') {
  const source = filters.source === 'contacts' ? 'contacts' : 'vehicles';
  const recipientSource = document.getElementById('recipientSource');
  if (recipientSource) {
    recipientSource.value = source;
  }
  document.getElementById('filterMake').value = filters.make || '';
  document.getElementById('filterModel').value = filters.model || '';
  document.getElementById('filterYearMin').value = filters.yearMin || '';
  document.getElementById('filterYearMax').value = filters.yearMax || '';
  const queryInput = document.getElementById('filterQuery');
  if (queryInput) {
    queryInput.value = filters.query || '';
  }
  const segmentSelect = document.getElementById('segmentSelect');
  if (segmentSelect) {
    segmentSelect.value = segmentId ? String(segmentId) : '';
  }

  updateRecipientSourceUI();
}

function updateRecipientSourceUI() {
  const source = getCurrentRecipientSource();
  document.getElementById('recipientSegmentTools')?.classList.toggle('hidden', !source);
  document.getElementById('recipientVehicleFilters')?.classList.toggle('hidden', source !== 'vehicles');
  document.getElementById('recipientContactFilters')?.classList.toggle('hidden', source !== 'contacts');
}

async function loadSegments(selectedSegmentId = '') {
  const sel = document.getElementById('segmentSelect');
  if (!sel) return;

  const source = getCurrentRecipientSource();
  availableSegments = [];
  renderSegmentOptions(selectedSegmentId);
  if (!source) {
    return;
  }

  try {
    const r = await fetch('/admin/api/segments?source=' + encodeURIComponent(source));
    if (r.ok) {
      const d = await r.json();
      availableSegments = Array.isArray(d.segments) ? d.segments : [];
      renderSegmentOptions(selectedSegmentId);

      if (selectedSegmentId) {
        const initialSegment = availableSegments.find((segment) => String(segment.id) === String(selectedSegmentId));
        if (initialSegment) {
          const filters = parseSegmentConfig(initialSegment);
          applySegmentFilters(filters, initialSegment.id);
        }
      }
    }
  } catch(e) { console.error('loadSegments',e); }
}
async function saveSegment() {
  const source = document.getElementById('recipientSource')?.value || 'vehicles';
  if (source !== 'vehicles') {
    setRecipientFeedback('Por ahora solo puedes guardar segmentos dinámicos desde filtros de vehículos.', true);
    return;
  }
  const { make, model, yearMin, yearMax } = getVehicleFilters();
  if (!make&&!model&&!yearMin&&!yearMax) { alert('Ingresa al menos un filtro.'); return; }
  const name=prompt('Nombre para este segmento:');
  if (!name) return;
  try {
    const r=await fetch('/admin/api/segments',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,filters:{mode:'dynamic',source:'vehicles',make,model,yearMin,yearMax}})});
    if(r.ok){
      setRecipientFeedback('Segmento guardado.');
      await loadSegments();
    }
    else{
      const e=await r.json().catch(()=>({error:'No se pudo guardar el segmento'}));
      setRecipientFeedback('Error: '+(e.error||'No se pudo guardar el segmento'), true);
    }
  } catch(e){
    setRecipientFeedback('Error de conexión al guardar el segmento.', true);
  }
}

// ── Destinatarios producción ─────────
async function loadProdRecipients() {
  const { source, filters } = getCurrentRecipientConfig();
  if (!source){
    window.selectedRecipients=[];
    prodAudienceTotal = 0;
    document.getElementById('recipientCount').textContent='';
    document.getElementById('recipientPreview').innerHTML='';
    setRecipientFeedback('Borrador sin destinatarios precargados.');
    return;
  }
  setRecipientFeedback('Cargando destinatarios...');
  try {
    const r=await fetch('/admin/api/campaigns/preview-samples',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({source,filters,limit:100})});
    if(!r.ok){
      const err = await r.json().catch(()=>({error:'Error al cargar destinatarios'}));
      setRecipientFeedback('Error: '+(err.error||'Error al cargar destinatarios'), true);
      return;
    }
    const {samples:recipients=[], total=0, mode='dynamic'}=await r.json();
    prodAudienceTotal = Number(total || 0);
    document.getElementById('recipientCount').textContent=prodAudienceTotal+' destinatarios encontrados';
    document.getElementById('recipientPreview').innerHTML=
      recipients.slice(0,10).map(r=>'<div style="padding:4px;border-bottom:1px solid #eee;">'+maskPhone(r.phone)+' — '+escapeHtml(r.name||'Sin nombre')+(source==='vehicles'?' · '+escapeHtml([r.make,r.model,r.year].filter(Boolean).join(' ')):'')+'</div>').join('')
      +(recipients.length>10?'<div class="muted" style="padding:8px;">...y '+(recipients.length-10)+' más</div>':'');
    window.selectedRecipients=recipients;
    if (mode === 'manual') {
      setRecipientFeedback(prodAudienceTotal ? 'Segmento manual listo para usar en campaña.' : 'El segmento manual todavía no tiene miembros cargados.');
    } else {
      setRecipientFeedback(prodAudienceTotal ? 'Audiencia resuelta. Al guardar se cargará el total completo en backend.' : 'No se encontraron destinatarios para ese filtro.');
    }
  } catch(e){setRecipientFeedback('Error: '+e.message, true);}
}

// ── Submit ───────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  setFormError('');
  if (!campaignMode) { setFormError('Selecciona el tipo de campaña (Paso 3).'); goToStep(3); return; }
  const name=document.querySelector('input[name="name"]')?.value?.trim();
  if (!name) { goToStep(1); setFormError('El nombre es requerido.'); return; }
  const msgType=document.querySelector('input[name="msgType"]:checked')?.value||'libre';
  const msgTemplate=document.getElementById('msgTextarea')?.value?.trim()||'';
  const contentSid=document.querySelector('input[name="contentSid"]')?.value?.trim()||'';
  const selectedTemplateId=document.querySelector('input[name="templateId"]:checked')?.value||'';
  if (msgType==='libre'&&!msgTemplate){goToStep(1);setFormError('Escribe el contenido del mensaje.');return;}
  if (msgType==='twilio'&&!selectedTemplateId&&!contentSid){goToStep(1);setFormError('Selecciona una plantilla o ingresa un Content SID.');return;}
  const timing=document.querySelector('input[name="sendTiming"]:checked')?.value||'draft';
  const scheduledAt=timing==='scheduled'?document.querySelector('input[name="scheduledAt"]')?.value||'':'';
  const isTest=campaignMode==='test';
  let recipientIds=[];
  let filters=null;
  if (isTest) {
    if (!selectedTestIds.length){setTestHint('Selecciona al menos un contacto.',true);return;}
    recipientIds=selectedTestIds;
  } else {
    const config = getCurrentRecipientConfig();
    filters = config.source ? config.filters : null;
    if (!filters&&scheduledAt) {
      if (!confirm('⚠️ Estás programando sin destinatarios.\\n\\n¿Deseas continuar de todos modos?')) return;
    }
    if (filters&&prodAudienceTotal===0&&scheduledAt) {
      if (!confirm('⚠️ La audiencia actual está vacía.\\n\\n¿Deseas programar igual?')) return;
    }
  }
  const payload={name,messageTemplate:msgType==='libre'?msgTemplate:'',contentSid:msgType==='twilio'?contentSid:'',templateId:selectedTemplateId||null,
    type:msgType==='twilio'?'twilio_template':'custom_message',scheduledAt,isTest,recipientIds,filters};
  const url=campaignId?'/admin/api/campaigns/'+campaignId:'/admin/api/campaigns';
  const method=campaignId?'PATCH':'POST';
  const btn=document.getElementById('submitBtn');
  if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  try {
    const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(r.ok){window.location.href='/admin/campaigns';}
    else{const err=await r.json().catch(()=>({error:'Error desconocido'}));setFormError('Error: '+(err.error||r.statusText));if(btn){btn.disabled=false;btn.textContent='${submitLabel}';}}
  } catch(e){setFormError('Error de conexión: '+e.message);if(btn){btn.disabled=false;btn.textContent='${submitLabel}';}}
}

// ── DOMContentLoaded ────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Step navigation
  document.getElementById('toStep2')?.addEventListener('click', () => { if(validateStep1()) goToStep(2); });
  document.getElementById('toStep1')?.addEventListener('click', () => goToStep(1));
  document.getElementById('toStep3')?.addEventListener('click', () => goToStep(3));
  document.getElementById('toStep2back')?.addEventListener('click', () => goToStep(2));

  // Message type tabs
  document.querySelectorAll('input[name="msgType"]').forEach(r => r.addEventListener('change', updateMsgTabs));
  updateMsgTabs();

  document.querySelectorAll('input[name="templateId"]').forEach(r => r.addEventListener('change', updateTemplateSelectionUI));
  updateTemplateSelectionUI();

  // Variable insertion
  document.querySelectorAll('.var-btn').forEach(b => b.addEventListener('click', () => insertVar(b.dataset.var)));

  // Char counter
  document.getElementById('msgTextarea')?.addEventListener('input', updateCharCount);
  updateCharCount();

  // Brand chips (preview step)
  document.querySelectorAll('.brand-chip').forEach(b => b.addEventListener('click', () => setActiveChip(b.dataset.make)));

  // Preview button
  document.getElementById('previewBtn')?.addEventListener('click', runPreview);

  // Test contact search
  document.getElementById('testPreviewBtn')?.addEventListener('click', loadTestContacts);

  // Production: segment management
  document.getElementById('saveSegmentBtn')?.addEventListener('click', saveSegment);
  document.getElementById('loadSegmentBtn')?.addEventListener('click', async () => {
    const sel=document.getElementById('segmentSelect');
    if(!sel?.value) return;
    const segment = availableSegments.find((item) => String(item.id) === String(sel.value));
    if (!segment) return;
    const filters = parseSegmentConfig(segment);
    applySegmentFilters(filters, segment.id);
    setRecipientFeedback(filters.mode === 'manual'
      ? 'Segmento manual cargado. Resolviendo audiencia...'
      : 'Filtros del segmento cargados. Resolviendo audiencia...');
    await loadProdRecipients();
  });
  updateRecipientSourceUI();
  loadSegments(INITIAL_SEGMENT_ID);

  // Production: recipient source toggle
  document.getElementById('recipientSource')?.addEventListener('change', async () => {
    updateRecipientSourceUI();
    await loadSegments();
    resetProdRecipientPreview();
    setRecipientFeedback('');
  });
  document.getElementById('loadRecipientsBtn')?.addEventListener('click', loadProdRecipients);

  // Scheduling
  document.querySelectorAll('input[name="sendTiming"]').forEach(r => r.addEventListener('change', updateTimingUI));
  updateTimingUI();

  // Form submit
  document.getElementById('campaignForm')?.addEventListener('submit', handleSubmit);

  // Edit mode: restore state
  if ('${isTestCampaign}') { selectMode('${isTestCampaign}'); goToStep(3); }
  updateRecipientSourceUI();
});
</script>
  `;

  return renderLayout({ title, content: form, active: 'campaigns' });
}

export function renderOptOutsPage({ optOuts, vehicleSuppressions = [], offset, limit }) {
  const helpText = renderHelpText(
    `<strong>Gestión de exclusiones:</strong> aquí conviven dos niveles.
    <strong>BAJA global</strong> bloquea el teléfono completo. <strong>Supresión por vehículo</strong>
    bloquea solo una publicación / vehículo exacto sin invalidar otros autos del mismo contacto.`
  );

  const manualForm = `<section class="panel" style="margin-bottom:18px;">
      <div class="panel-header"><h3>Crear BAJA global manual</h3></div>
      <form method="POST" action="/admin/opt-outs/manual" style="display:grid;grid-template-columns:1.1fr 0.9fr 1.4fr auto;gap:10px;align-items:end;">
        <div>
          <label style="display:block;font-weight:600;margin-bottom:5px;">Teléfono</label>
          <input type="text" name="phone" required pattern="^\+[1-9]\d{1,14}$" placeholder="+56975400946" style="width:100%;" />
        </div>
        <div>
          <label style="display:block;font-weight:600;margin-bottom:5px;">Motivo</label>
          <select name="reason_code" style="width:100%;">
            <option value="global_manual">Manual</option>
            <option value="global_user_request">Solicitud usuario</option>
            <option value="global_ai_detected">Detectado por IA</option>
            <option value="global_import">Importación</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-weight:600;margin-bottom:5px;">Detalle</label>
          <input type="text" name="reason_detail" placeholder="Observación opcional" style="width:100%;" />
        </div>
        <button type="submit">${renderIcon('user-x', 13)} Aplicar BAJA</button>
      </form>
    </section>`;

  const tableContent = optOuts.length > 0
    ? renderTable({
      columns: [
        { key: 'phone', label: 'Telefono' },
        { key: 'contact_name', label: 'Nombre' },
        { key: 'reason', label: 'Motivo', render: (row) => renderBadge(row.reason_code || row.reason || 'global_user_request', 'bad') },
        { key: 'created_at', label: 'Fecha', render: (row) => escapeHtml(formatDate(row.created_at)) },
        {
          key: 'actions', label: 'Acciones', render: (row) => `<div class="row-actions">
            <a href="/admin/opt-outs/${encodeURIComponent(row.phone)}/edit" class="action-btn" title="Editar razón" aria-label="Editar">${renderIcon('edit', 13)}</a>
            <button onclick="deleteOptOut('${escapeHtml(row.phone)}')" class="action-btn" title="Liberar BAJA" aria-label="Liberar">${renderIcon('refresh', 13)}</button>
        </div>` }
      ],
      rows: optOuts,
      searchable: true,
      sortable: true,
      tableId: 'opt-outs-table'
    })
    : renderEmptyState({
      title: 'Sin opt-outs',
      message: 'Aún no hay usuarios que hayan solicitado BAJA. Cuando un usuario responda "BAJA" o "3", aparecerá aquí.',
      ctaText: 'Ver contactos',
      ctaLink: '/admin/contacts'
    });

  const vehicleSuppressionTable = vehicleSuppressions.length > 0
    ? renderTable({
      columns: [
        { key: 'vehicle', label: 'Vehículo', render: (row) => `<strong>${escapeHtml(row.make || '')} ${escapeHtml(row.model || '')}</strong> ${row.year ? escapeHtml(String(row.year)) : ''}` },
        { key: 'contact_name', label: 'Contacto', render: (row) => `<a href="/admin/contacts/${row.contact_id}/edit" style="color:var(--accent);font-weight:600;text-decoration:none;">${escapeHtml(row.contact_name || row.contact_phone || '—')}</a>` },
        { key: 'reason_code', label: 'Motivo', render: (row) => renderBadge(row.reason_code || 'vehicle_unavailable', 'warn') },
        { key: 'suppressed_at', label: 'Fecha', render: (row) => escapeHtml(formatDate(row.suppressed_at)) },
        {
          key: 'actions', label: 'Acciones', render: (row) => `<div class="row-actions">
            ${row.link ? `<a href="${escapeHtml(row.link)}" target="_blank" rel="noopener" class="action-btn" title="Ver publicación">${renderIcon('arrow-up-right', 12)}</a>` : ''}
            <a href="/admin/vehicles/${row.vehicle_id}/edit" class="action-btn">${renderIcon('edit', 12)} Vehículo</a>
            <button onclick="releaseVehicleSuppression(${row.id})" class="action-btn">${renderIcon('refresh', 12)} Liberar</button>
          </div>`
        }
      ],
      rows: vehicleSuppressions,
      searchable: true,
      sortable: true,
      tableId: 'vehicle-suppressions-table'
    })
    : renderEmptyState({
      title: 'Sin suppressions por vehículo',
      message: 'Todavía no hay vehículos/publicaciones suprimidos.',
      ctaText: 'Ver vehículos',
      ctaLink: '/admin/vehicles'
    });

  const script = `
    <script>
      async function deleteOptOut(phone) {
        if (!confirm('¿Eliminar BAJA para ' + phone + '?\\n\\nEl contacto volverá a quedar habilitado para recibir mensajes si su estado en Contactos es activo.')) {
          return;
        }
        try {
          // Encode phone properly for URL
          const encodedPhone = encodeURIComponent(phone);
          const res = await fetch('/admin/api/opt-outs/' + encodedPhone, { method: 'DELETE' });
          if (res.ok) {
            window.location.reload();
          } else {
            const error = await res.text();
            alert('Error al eliminar: ' + error);
          }
        } catch (error) {
          alert('Error al eliminar: ' + error.message);
        }
      }

      async function releaseVehicleSuppression(id) {
        if (!confirm('¿Liberar esta supresión de vehículo?')) {
          return;
        }
        try {
          const res = await fetch('/admin/api/vehicle-suppressions/' + id + '/release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
          if (res.ok) {
            window.location.reload();
          } else {
            const error = await res.text();
            alert('Error al liberar: ' + error);
          }
        } catch (error) {
          alert('Error al liberar: ' + error.message);
        }
      }
    </script>
  `;

  const content = `${manualForm}<section class="panel">
      <div class="panel-header">
        <h1>BAJAS globales</h1>
        <a href="/admin/export/opt-outs" class="action-btn">Exportar CSV</a>
      </div>
      ${helpText}
      ${tableContent}
      ${optOuts.length > 0 ? renderPager({
    basePath: '/admin/opt-outs',
    query: {},
    offset,
    limit,
    hasNext: optOuts.length === limit
  }) : ''}
    </section>

    <section class="panel" style="margin-top:18px;">
      <div class="panel-header">
        <h1>Supresión por vehículo / publicación</h1>
      </div>
      <div class="muted" style="font-size:12px;margin-bottom:12px;">Estas exclusiones no bloquean el teléfono completo; solo evitan futuros contactos sobre el vehículo exacto.</div>
      ${vehicleSuppressionTable}
    </section>${script}`;

  return renderLayout({ title: 'Opt-outs', content, active: 'opt-outs' });
}

export function renderImportPage({ preview = null, result = null, optOutResult = null }) {
  const helpText = renderHelpText(
    `<strong>Importación CSV:</strong> Importa contactos y vehículos desde un archivo CSV.
    El formato esperado es: <code>Telefono,Nombre,Marca,Modelo,Año,Precio,Link</code><br/>
    <strong>Importante:</strong> Los teléfonos deben incluir código de país (+56 para Chile).
    Si vienen sin '+', se normalizarán automáticamente.`
  );

  const uploadForm = !preview && !result ? `
    <section class="panel">
      <div class="panel-header"><h3>1. Cargar Archivo CSV</h3></div>
      <form id="uploadForm" enctype="multipart/form-data" method="POST" action="/admin/import/upload">
        <div style="margin-bottom:15px;">
          <input type="file" name="csvFile" accept=".csv,text/csv" required style="padding: 8px; width:100%; border:1px solid var(--line); border-radius:10px; font-size:13px;" />
          <div class="muted" style="font-size:12px; margin-top:5px;">
            Selecciona un archivo CSV con contactos. Máximo 5000 registros por importación.
          </div>
        </div>
        <button type="submit">Previsualizar datos</button>
      </form>
    </section>
  ` : '';

  const previewSection = preview ? `
    <section class="panel">
      <div class="panel-header">
        <h3>2. Previsualización (${preview.valid.length} válidos, ${preview.invalid.length} inválidos)</h3>
      </div>
      ${preview.valid.length > 0 ? `
        <div style="margin-bottom:15px;">
          <strong>Registros válidos que serán importados:</strong>
          ${renderTable({
    columns: [
      { key: 'phone', label: 'Teléfono (E.164)' },
      { key: 'name', label: 'Nombre' },
      { key: 'make', label: 'Marca' },
      { key: 'model', label: 'Modelo' },
      { key: 'year', label: 'Año' },
      { key: 'price', label: 'Precio' },
      { key: 'link', label: 'Link', render: (row) => row.link ? `<span title="${escapeHtml(row.link)}">${escapeHtml(truncate(row.link, 30))}</span>` : '' }
    ],
    rows: preview.valid.slice(0, 100),
    searchable: true,
    sortable: true,
    tableId: 'preview-valid-table'
  })}
          ${preview.valid.length > 100 ? `<div class="muted" style="margin-top:8px;">Mostrando primeros 100 de ${preview.valid.length} registros válidos.</div>` : ''}
        </div>
      ` : ''}

      ${preview.invalid.length > 0 ? `
        <div style="margin-bottom:15px;">
          <strong>Registros inválidos (NO se importarán):</strong>
          ${renderTable({
    columns: [
      { key: 'row', label: 'Fila' },
      { key: 'phone', label: 'Teléfono' },
      { key: 'name', label: 'Nombre' },
      { key: 'error', label: 'Motivo del error' }
    ],
    rows: preview.invalid.slice(0, 50),
    searchable: false,
    sortable: false,
    tableId: 'preview-invalid-table'
  })}
          ${preview.invalid.length > 50 ? `<div class="muted" style="margin-top:8px;">Mostrando primeros 50 de ${preview.invalid.length} registros inválidos.</div>` : ''}
        </div>
      ` : ''}

      <form method="POST" action="/admin/import/confirm">
        <input type="hidden" name="csvData" value="${escapeHtml(JSON.stringify(preview.valid))}" />
        <div style="display:flex; gap:10px;">
          <button type="submit" ${preview.valid.length === 0 ? 'disabled' : ''}>Finalizar y cargar ${preview.valid.length} contactos</button>
          <a href="/admin/import" class="action-btn">Cancelar</a>
        </div>
      </form>
    </section>
  ` : '';

  const resultSection = result ? `
    <section class="panel">
      <div class="panel-header"><h3>✅ Importación completada</h3></div>
      <div style="margin-bottom:15px;">
        <p><strong>Total procesados:</strong> ${result.processed}</p>
        <p><strong>Contactos insertados:</strong> ${result.contactsInserted}</p>
        <p><strong>Contactos actualizados:</strong> ${result.contactsUpdated}</p>
        <p><strong>Vehículos insertados:</strong> ${result.vehiclesInserted}</p>
        <p><strong>Vehículos actualizados:</strong> ${result.vehiclesUpdated ?? 0}</p>
        ${result.errors.length > 0 ? `<p><strong>Errores:</strong> ${result.errors.length}</p>` : ''}
      </div>

      ${result.errors.length > 0 ? `
        <div style="margin-bottom:15px;">
          <strong>Errores durante la importación:</strong>
          ${renderTable({
    columns: [
      { key: 'row', label: 'Fila' },
      { key: 'phone', label: 'Teléfono' },
      { key: 'error', label: 'Error' }
    ],
    rows: result.errors.slice(0, 50),
    searchable: false,
    sortable: false,
    tableId: 'result-errors-table'
  })}
        </div>
      ` : ''}

      <div style="display:flex; gap:10px;">
        <a href="/admin/import" class="action-btn">Nueva importación</a>
        <a href="/admin/contacts" class="action-btn">Ver contactos</a>
      </div>
    </section>
  ` : '';

  const optOutSection = `
    <section class="panel" style="margin-top:20px;">
      <div class="panel-header"><h3>Importar Opt-outs desde CSV</h3></div>
      ${renderHelpText(`Sube un CSV con columna <code>Telefono</code> (una por fila, formato E.164 o +56...).
        Todos los números quedarán registrados en la lista de exclusión y no recibirán más campañas.`)}
      ${optOutResult?.error ? `<div style="color:var(--bad);margin-bottom:12px;">${escapeHtml(optOutResult.error)}</div>` : ''}
      ${optOutResult && !optOutResult.error ? `
        <div style="margin-bottom:14px;padding:12px;background:var(--surface-1);border:1px solid var(--ink-100);border-radius:var(--radius-md);">
          <strong>Importación completada</strong><br/>
          <span class="muted">Procesados: ${optOutResult.total} · Válidos: ${optOutResult.valid} · <strong>Nuevos opt-outs: ${optOutResult.inserted}</strong> · Ya existían: ${optOutResult.skipped} · Inválidos: ${optOutResult.invalidCount}</span>
        </div>
      ` : ''}
      <form enctype="multipart/form-data" method="POST" action="/admin/import/optouts">
        <div style="margin-bottom:12px;">
          <input type="file" name="csvFile" accept=".csv,text/csv" required
                 style="padding:8px;width:100%;border:1px solid var(--line);border-radius:10px;font-size:13px;" />
          <div class="muted" style="font-size:12px;margin-top:5px;">CSV con cabecera <code>Telefono</code>. Máximo 5000 registros.</div>
        </div>
        <button type="submit">Importar opt-outs</button>
      </form>
    </section>
  `;

  const content = `
    <section class="panel">
      <div class="panel-header"><h1>Importar Contactos desde CSV</h1></div>
      ${helpText}
    </section>
    ${uploadForm}
    ${previewSection}
    ${resultSection}
    ${optOutSection}
  `;

  return renderLayout({ title: 'Importar', content, active: 'import' });
}

// ============================================================
// Phase 1: Campaign Follow-Up Tracking Pages
// ============================================================

export function renderCampaignFollowUpPage({ campaign, stats, recipients, offset, limit }) {
  const totalRecipients = stats?.total_recipients || 0;
  const sentOk = stats?.sent_ok || 0;
  const delivered = stats?.delivered || 0;
  const read = stats?.read || 0;
  const failed = stats?.failed || 0;
  const totalReplies = stats?.total_replies || 0;
  const replies24h = stats?.replies_24h || 0;
  const replies7d = stats?.recipients_with_replies || 0;

  const formatPct = (value, total) => total ? ((value / total) * 100).toFixed(1) : '0.0';
  const failureRate = totalRecipients ? (failed / totalRecipients) * 100 : 0;
  const deliveryRate = formatPct(delivered, totalRecipients);
  const openRate = delivered ? formatPct(read, delivered) : '0.0';
  const conversionRate = formatPct(replies7d, sentOk || totalRecipients);

  const alertHtml = `
      <div id="failure-alert" style="display: ${failureRate > 10 && failed > 0 ? 'block' : 'none'}; background: #f8d7da; color: #721c24; padding: 0.75rem 1rem; border-radius: 4px; margin: 0.75rem 0; border: 1px solid #f5c6cb;">
        <strong>Alerta: Tasa de fallo alta (<span id="failure-rate">${failureRate.toFixed(1)}</span>%)</strong>. Revisa los mensajes fallidos.
      </div>
  `;

  const kpisHtml = `
    <div class="panel">
      <div class="panel-header">
        <h1>Seguimiento: ${escapeHtml(campaign.name)}</h1>
        <a href="/admin/campaigns/${campaign.id}" class="action-btn">Volver a Campana</a>
      </div>
      ${alertHtml}
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 1rem 0;">
        <div style="background: #f8f9fa; padding: 1rem; border-radius: 4px;">
          <div style="font-size: 0.875rem; color: #6c757d;">Total Recipients</div>
          <div style="font-size: 1.5rem; font-weight: bold;" id="kpi-total">${totalRecipients}</div>
        </div>
        <div style="background: #d4edda; padding: 1rem; border-radius: 4px;">
          <div style="font-size: 0.875rem; color: #155724;">Enviados OK</div>
          <div style="font-size: 1.5rem; font-weight: bold;"><span id="kpi-sent-ok">${sentOk}</span> (<span id="kpi-sent-ok-pct">${formatPct(sentOk, totalRecipients)}</span>%)</div>
        </div>
        <div style="background: #cce5ff; padding: 1rem; border-radius: 4px;">
          <div style="font-size: 0.875rem; color: #004085;">Entregados</div>
          <div style="font-size: 1.5rem; font-weight: bold;"><span id="kpi-delivered">${delivered}</span> (<span id="kpi-delivered-pct">${formatPct(delivered, totalRecipients)}</span>%)</div>
        </div>
        <div style="background: #f8d7da; padding: 1rem; border-radius: 4px;">
          <div style="font-size: 0.875rem; color: #721c24;">Fallidos</div>
          <div style="font-size: 1.5rem; font-weight: bold;"><span id="kpi-failed">${failed}</span> (<span id="kpi-failed-pct">${formatPct(failed, totalRecipients)}</span>%)</div>
        </div>
        <div style="background: #d1ecf1; padding: 1rem; border-radius: 4px;">
          <div style="font-size: 0.875rem; color: #0c5460;">Replies Recibidos</div>
          <div style="font-size: 1.5rem; font-weight: bold;" id="kpi-replies-total">${totalReplies}</div>
        </div>
        <div style="background: #fff3cd; padding: 1rem; border-radius: 4px;">
          <div style="font-size: 0.875rem; color: #856404;">Respuesta 24h</div>
          <div style="font-size: 1.5rem; font-weight: bold;"><span id="kpi-replies-24h">${replies24h}</span> (<span id="kpi-replies-24h-pct">${formatPct(replies24h, sentOk)}</span>%)</div>
        </div>
        <div style="background: #e2e3e5; padding: 1rem; border-radius: 4px;">
          <div style="font-size: 0.875rem; color: #383d41;">Conversiones 7d</div>
          <div style="font-size: 1.5rem; font-weight: bold;"><span id="kpi-replies-7d">${replies7d}</span> (<span id="kpi-replies-7d-pct">${formatPct(replies7d, sentOk)}</span>%)</div>
        </div>
      </div>
      <div style="margin: 0.75rem 0; color: #6c757d; font-size: 0.875rem;">
        <strong>Metricas:</strong>
        <span style="margin-left: 0.5rem;">Tasa entrega <span id="kpi-delivery-rate">${deliveryRate}</span>%</span>
        <span style="margin-left: 0.75rem;">Apertura (read) <span id="kpi-open-rate">${openRate}</span>%</span>
        <span style="margin-left: 0.75rem;">Conversiones <span id="kpi-conversion-rate">${conversionRate}</span>%</span>
      </div>
      <p style="margin: 0.5rem 0; color: #6c757d; font-size: 0.875rem;">Ultimo reply: <span id="kpi-last-reply">${stats?.last_reply_at ? formatDate(stats.last_reply_at) : '-'}</span></p>
    </div>
  `;

  const recipientsTable = recipients.length > 0
    ? renderTable({
      columns: [
        { key: 'phone', label: 'Telefono' },
        { key: 'contact_name', label: 'Nombre', render: (row) => escapeHtml(row.contact_name || '-') },
        { key: 'send_status', label: 'Estado Envio', render: (row) => renderBadge(row.send_status, statusTone(row.send_status)) },
        { key: 'sent_at', label: 'Fecha Envio', render: (row) => escapeHtml(formatDate(row.sent_at)) },
        { key: 'total_replies', label: '# Replies', render: (row) => `<strong>${row.total_replies || 0}</strong>` },
        { key: 'last_reply_at', label: 'Ultimo Reply', render: (row) => escapeHtml(row.last_reply_at ? formatDate(row.last_reply_at) : '-') },
        { key: 'last_reply_preview', label: 'Preview', render: (row) => escapeHtml(truncate(row.last_reply_preview || '', 40)) },
        { key: 'actions', label: 'Acciones', render: (row) => `<a href="/admin/campaigns/${campaign.id}/conversation/${encodeURIComponent(row.phone)}" class="action-btn">Ver</a>` }
      ],
      rows: recipients,
      searchable: true,
      sortable: true,
      tableId: 'follow-up-table'
    })
    : renderEmptyState({
      title: 'Sin destinatarios',
      message: 'Esta campana aun no tiene destinatarios asignados.'
    });

  const realtimeScript = `
    <script>
      const campaignId = ${campaign.id};

      const formatPct = (value, total) => {
        if (!total) return '0.0';
        return ((value / total) * 100).toFixed(1);
      };

      const formatTimestamp = (value) => {
        if (!value) return '-';
        return String(value).replace('T', ' ');
      };

      const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };

      async function refreshFollowUpStats() {
        try {
          const res = await fetch('/admin/api/campaigns/' + campaignId + '/follow-up-stats');
          if (!res.ok) return;
          const stats = await res.json();

          const totalRecipients = stats.total_recipients || 0;
          const sentOk = stats.sent_ok || 0;
          const delivered = stats.delivered || 0;
          const read = stats.read || 0;
          const failed = stats.failed || 0;
          const totalReplies = stats.total_replies || 0;
          const replies24h = stats.replies_24h || 0;
          const replies7d = stats.recipients_with_replies || 0;

          setText('kpi-total', totalRecipients);
          setText('kpi-sent-ok', sentOk);
          setText('kpi-sent-ok-pct', formatPct(sentOk, totalRecipients));
          setText('kpi-delivered', delivered);
          setText('kpi-delivered-pct', formatPct(delivered, totalRecipients));
          setText('kpi-failed', failed);
          setText('kpi-failed-pct', formatPct(failed, totalRecipients));
          setText('kpi-replies-total', totalReplies);
          setText('kpi-replies-24h', replies24h);
          setText('kpi-replies-24h-pct', formatPct(replies24h, sentOk));
          setText('kpi-replies-7d', replies7d);
          setText('kpi-replies-7d-pct', formatPct(replies7d, sentOk));
          setText('kpi-delivery-rate', formatPct(delivered, totalRecipients));
          setText('kpi-open-rate', delivered ? formatPct(read, delivered) : '0.0');
          setText('kpi-conversion-rate', formatPct(replies7d, sentOk || totalRecipients));
          setText('kpi-last-reply', formatTimestamp(stats.last_reply_at));

          const failureRate = totalRecipients ? (failed / totalRecipients) * 100 : 0;
          const alertEl = document.getElementById('failure-alert');
          if (alertEl) {
            if (failureRate > 10 && failed > 0) {
              alertEl.style.display = 'block';
              setText('failure-rate', failureRate.toFixed(1));
            } else {
              alertEl.style.display = 'none';
            }
          }
        } catch (error) {
          console.error('Error polling follow-up stats:', error);
        }
      }

      setInterval(refreshFollowUpStats, 5000);
    </script>
  `;

  const content = kpisHtml + `
    <section class="panel">
      <h3>Destinatarios y Respuestas</h3>
      ${recipientsTable}
      ${recipients.length > 0 ? renderPager({
    basePath: `/admin/campaigns/${campaign.id}/seguimiento`,
    query: {},
    offset,
    limit,
    hasNext: recipients.length === limit
  }) : ''}
    </section>
  ` + realtimeScript;

  return renderLayout({ title: `Seguimiento - ${campaign.name}`, content, active: 'campaigns' });
}


export function renderConversationPage({ campaign, phone, contactName, messages }) {
  const bubbles = messages.length > 0
    ? messages.map((msg) => {
      const side = msg.direction === 'outbound' ? 'outbound' : 'inbound';
      const time = formatDate(msg.created_at);
      const statusChip = msg.status
        ? renderBadge(msg.status, statusTone(msg.status))
        : '';
      const sidText = side === 'outbound' && msg.message_sid
        ? `<span class="mono muted" style="font-size:10.5px;">${escapeHtml(String(msg.message_sid).slice(0, 14))}…</span>`
        : '';
      return `<div class="bubble ${side}">
          <div>${escapeHtml(msg.body || '')}</div>
          <div class="bubble-meta">
            <span>${escapeHtml(time)}</span>
            ${statusChip ? ` · ${statusChip}` : ''}
            ${sidText ? ` · ${sidText}` : ''}
          </div>
        </div>`;
    }).join('')
    : `<div class="conv-caption">No hay mensajes en esta conversación.</div>`;

  const header = `
    <div class="conv-header" style="border-radius: var(--radius-lg) var(--radius-lg) 0 0;">
      <div class="inbox-avatar">${escapeHtml(initials(contactName, phone))}</div>
      <div class="conv-header-main">
        <div class="conv-header-title">${contactName ? escapeHtml(contactName) : '<span class="muted">Sin nombre</span>'}</div>
        <div class="conv-header-sub">${escapeHtml(phone || '')}</div>
      </div>
      <a href="/admin/campaigns/${campaign.id}/seguimiento" class="action-btn">${renderIcon('arrow-left', 13)}<span>Volver</span></a>
    </div>`;

  const content = `
    <section class="panel" style="padding: 0; overflow: hidden;">
      ${header}
      <div style="padding: 10px 18px; background: var(--surface-1); border-bottom: 1px solid var(--ink-100); font-size: 12.5px; color: var(--ink-500);">
        ${renderIcon('send', 12)} <strong>Campaña:</strong> ${escapeHtml(campaign.name)}
      </div>
      <div class="conv-body" style="max-height: 62vh; border-radius: 0;">
        ${bubbles}
      </div>
    </section>
  `;

  return renderLayout({ title: `Conversación - ${phone}`, content, active: 'campaigns' });
}

// ============================================================
// Phase 2.2: Message Templates Pages
// ============================================================

export function renderTemplatesPage({ templates, offset, limit }) {
  const helpText = renderHelpText(
    `<strong>Plantillas de mensajes:</strong> Crea y gestiona mensajes reutilizables con variables dinámicas.
    Variables disponibles: <code>{{nombre}}</code>, <code>{{marca}}</code>, <code>{{modelo}}</code>, <code>{{year}}</code>.`
  );

  const tableContent = templates.length > 0
    ? renderTable({
      columns: [
        { key: 'name', label: 'Nombre', render: (row) => `<a href="/admin/templates/${row.id}/edit" style="color: var(--accent); font-weight: 600;">${escapeHtml(row.name)}</a>` },
        { key: 'body', label: 'Mensaje', render: (row) => `<span title="${escapeHtml(row.body || '')}">${escapeHtml(truncate(row.body || '', 50))}</span>` },
        { key: 'content_sid', label: 'Content SID', render: (row) => escapeHtml(row.content_sid ? truncate(row.content_sid, 20) : '-') },
        { key: 'is_active', label: 'Estado', render: (row) => row.is_active ? renderBadge('activo', 'good') : renderBadge('archivado', 'muted') },
        { key: 'updated_at', label: 'Actualizado', render: (row) => escapeHtml(formatDate(row.updated_at)) },
        {
          key: 'actions',
          label: 'Acciones',
          render: (row) => `<div class="row-actions">
            <a href="/admin/templates/${row.id}/edit" class="action-btn">Editar</a>
            <button onclick="deleteTemplate(${row.id})" class="action-btn">Eliminar</button>
          </div>`
        }
      ],
      rows: templates,
      searchable: true,
      sortable: true,
      tableId: 'templates-table'
    })
    : renderEmptyState({
      title: 'Sin plantillas',
      message: 'Aún no hay plantillas creadas. Crea tu primera plantilla para agilizar las campañas.',
      ctaText: 'Crear Plantilla',
      ctaLink: '/admin/templates/new'
    });

  const script = `
    <script>
      async function deleteTemplate(id) {
        if (!confirm('¿Eliminar esta plantilla?')) return;
        const res = await fetch('/admin/api/templates/' + id, { method: 'DELETE' });
        if (res.ok) window.location.reload();
        else alert('Error al eliminar');
      }
    </script>
  `;

  const content = `<section class="panel">
      <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h1>Plantillas de Mensajes</h1>
          <div class="muted">Total: ${templates.length}</div>
        </div>
        <a href="/admin/templates/new" class="action-btn primary" style="padding:10px 18px; text-decoration:none;">${renderIcon('plus', 14)}<span>Nueva Plantilla</span></a>
      </div>
      ${helpText}
      ${tableContent}
      ${templates.length > 0 ? renderPager({
    basePath: '/admin/templates',
    query: {},
    offset,
    limit,
    hasNext: templates.length === limit
  }) : ''}
    </section>${script}`;

  return renderLayout({ title: 'Templates', content, active: 'templates' });
}

export function renderTemplateFormPage({ template = null, error = null }) {
  const isNew = !template?.id;
  const title = isNew ? 'Nueva Plantilla' : 'Editar Plantilla';
  const action = isNew ? 'Crear' : 'Guardar';

  const helpText = renderHelpText(
    `<strong>Variables disponibles:</strong> Usa estas variables para personalizar el mensaje:<br/>
    <code>{{nombre}}</code> - Nombre del contacto<br/>
    <code>{{marca}}</code> - Marca del vehículo<br/>
    <code>{{modelo}}</code> - Modelo del vehículo<br/>
    <code>{{year}}</code> - Año del vehículo`
  );

  const errorMessage = error ? `<div class="muted" style="color:var(--bad); margin-bottom:10px;">${escapeHtml(error)}</div>` : '';

  const form = `
    <form id="templateForm" class="panel" method="POST" action="/admin/templates${isNew ? '' : '/' + template.id}">
      <div class="panel-header"><h1>${title}</h1></div>
      ${helpText}
      ${errorMessage}

      <div style="margin-bottom:15px;">
        <label style="display:block; font-weight:600; margin-bottom:5px;">Nombre de la plantilla *</label>
        <input type="text" name="name" value="${escapeHtml(template?.name || '')}" required
               placeholder="Ej: Oferta Toyota 2024"
               style="width:100%;" />
      </div>

      <div style="margin-bottom:15px;">
        <label style="display:block; font-weight:600; margin-bottom:5px;">Mensaje *</label>
        <textarea id="templateBody" name="body" rows="5" required
                  style="width:100%; border-radius:10px; border:1px solid var(--line); padding:10px;"
                  placeholder="Hola {{nombre}}, tenemos ofertas especiales para tu {{marca}} {{modelo}} {{year}}!">${escapeHtml(template?.body || '')}</textarea>
        <div class="muted" style="font-size:12px; margin-top:5px;">
          Usa las variables entre dobles llaves. Ejemplo: <code>{{nombre}}</code>
        </div>
      </div>

      <div style="margin-bottom:15px;">
        <button type="button" id="insertVarBtn" class="action-btn" style="margin-right:5px;" data-var="{{nombre}}">+ nombre</button>
        <button type="button" id="insertVarBtn2" class="action-btn" style="margin-right:5px;" data-var="{{marca}}">+ marca</button>
        <button type="button" id="insertVarBtn3" class="action-btn" style="margin-right:5px;" data-var="{{modelo}}">+ modelo</button>
        <button type="button" id="insertVarBtn4" class="action-btn" data-var="{{year}}">+ year</button>
      </div>

      <div style="margin-bottom:15px; padding:15px; background:#f8f5f1; border-radius:10px;">
        <label style="display:block; font-weight:600; margin-bottom:5px;">Vista previa en vivo</label>
        <div id="livePreview" style="padding:10px; background:white; border-radius:8px; border:1px solid var(--line); min-height:60px;">
          <span class="muted">Escribe un mensaje para ver la vista previa...</span>
        </div>
        <div class="muted" style="font-size:12px; margin-top:5px;">
          Datos de ejemplo: nombre=Juan, marca=Toyota, modelo=Corolla, year=2020
        </div>
      </div>

      <div style="margin-bottom:15px;">
        <label style="display:block; font-weight:600; margin-bottom:5px;">Content SID (Twilio - opcional)</label>
        <input type="text" name="contentSid" value="${escapeHtml(template?.content_sid || '')}"
               placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
               style="width:100%;" />
        <div class="muted" style="font-size:12px; margin-top:5px;">
          Si usas Twilio Content API, pega aquí el SID de la plantilla aprobada.
        </div>
      </div>

      ${!isNew ? `
      <div style="margin-bottom:15px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" name="isActive" value="1" ${template?.is_active ? 'checked' : ''} />
          <span>Plantilla activa</span>
        </label>
        <div class="muted" style="font-size:12px; margin-top:5px;">
          Desactiva para archivar sin eliminar.
        </div>
      </div>
      ` : ''}

      <div style="margin-top:20px; display:flex; gap:10px;">
        <button type="submit">${action}</button>
        <a href="/admin/templates" class="action-btn">Cancelar</a>
      </div>
    </form>

    <script>
      function escapeHtml(text) {
        return String(text || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function renderPreview(template) {
        const sampleVars = {
          nombre: 'Juan',
          marca: 'Toyota',
          modelo: 'Corolla',
          year: '2020'
        };
        return String(template || '').replace(/\\{\\{(\\w+)\\}\\}/g, (match, varName) => {
          return sampleVars[varName] !== undefined ? sampleVars[varName] : match;
        });
      }

      function updatePreview() {
        const body = document.getElementById('templateBody')?.value || '';
        const preview = document.getElementById('livePreview');
        if (!preview) return;
        if (!body.trim()) {
          preview.innerHTML = '<span class="muted">Escribe un mensaje para ver la vista previa...</span>';
        } else {
          preview.textContent = renderPreview(body);
        }
      }

      function insertVariable(varText) {
        const textarea = document.getElementById('templateBody');
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        textarea.value = text.substring(0, start) + varText + text.substring(end);
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + varText.length;
        updatePreview();
      }

      document.addEventListener('DOMContentLoaded', () => {
        const bodyEl = document.getElementById('templateBody');
        if (bodyEl) {
          bodyEl.addEventListener('input', updatePreview);
          updatePreview();
        }

        document.querySelectorAll('[data-var]').forEach(btn => {
          btn.addEventListener('click', () => insertVariable(btn.dataset.var));
        });
      });
    </script>
  `;

  return renderLayout({ title, content: form, active: 'templates' });
}

// ============================================================
// Vehicles: Lista e inventario
// ============================================================

export function renderVehiclesPage({ vehicles, vehicleStats, makes, filters = {}, offset, limit, total }) {
  const { make = '', yearMin = '', yearMax = '', search = '' } = filters;
  const hasNext = offset + limit < total;

  const helpText = renderHelpText(
    `<strong>Inventario de vehículos:</strong> todos los autos registrados en el sistema.
    Filtra por marca, modelo o rango de año. Haz clic en <strong>Editar</strong> para modificar un vehículo o en el nombre del contacto para ir a su perfil.`
  );

  const kpiCards = [
    { label: 'Total', value: vehicleStats.total ?? 0, icon: 'car', accent: true },
    { label: 'Marcas', value: vehicleStats.makes ?? 0, icon: 'filter', accent: false },
    { label: 'Contactos con auto', value: vehicleStats.contacts_with_vehicles ?? 0, icon: 'users', accent: false },
    { label: 'Con publicación', value: vehicleStats.with_link ?? 0, icon: 'arrow-up-right', accent: false },
    { label: 'Suprimidos', value: vehicleStats.suppressed ?? 0, icon: 'user-x', accent: false }
  ].map(c => `
    <div class="card${c.accent ? ' card-accent' : ''}">
      <h2>${renderIcon(c.icon, 14)}<span>${escapeHtml(c.label)}</span></h2>
      <p>${Number(c.value).toLocaleString('es-CL')}</p>
    </div>`).join('');

  const makeOptions = [
    `<option value="">Todas las marcas</option>`,
    ...makes.map(m => `<option value="${escapeHtml(m.make)}" ${make === m.make ? 'selected' : ''}>${escapeHtml(m.make)} (${m.vehicles})</option>`)
  ].join('');

  const filtersHtml = `
    <form method="GET" action="/admin/vehicles" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center;">
      <div class="search-box">
        <span class="search-icon">${renderIcon('search', 14)}</span>
        <input type="text" name="search" value="${escapeHtml(search)}" placeholder="Buscar marca, modelo o contacto…" style="min-width:210px;" />
      </div>
      <select name="make" style="min-width:150px;">${makeOptions}</select>
      <input type="number" name="year_min" value="${escapeHtml(String(yearMin))}" placeholder="Año desde" style="width:110px;" min="1960" max="2030" />
      <input type="number" name="year_max" value="${escapeHtml(String(yearMax))}" placeholder="Año hasta" style="width:110px;" min="1960" max="2030" />
      <button type="submit">Filtrar</button>
      ${(make || yearMin || yearMax || search) ? `<a href="/admin/vehicles" class="action-btn ghost">Limpiar</a>` : ''}
    </form>`;

  // --- Table view ---
  const tableRows = vehicles.map(v => {
    const priceText = v.price ? `$${Number(v.price).toLocaleString('es-CL')}` : '—';
    const originBadge = v.origin ? renderBadge(v.origin, v.origin === 'manual' ? 'info' : 'muted') : '';
    const linkBtn = v.link
      ? `<a href="${escapeHtml(v.link)}" target="_blank" rel="noopener" class="action-btn" title="Ver publicación">${renderIcon('arrow-up-right', 12)}</a>`
      : '';
    const statusBadge = v.contact_status === 'opted_out' ? ` ${renderBadge('baja', 'bad')}` : '';
    const suppressionBadge = v.is_suppressed ? ` ${renderBadge('suprimido', 'warn')}` : '';
    return `<tr>
      <td><strong>${escapeHtml(v.make)}</strong> ${originBadge}</td>
      <td>${escapeHtml(v.model)}</td>
      <td>${v.year}</td>
      <td class="mono" style="color:var(--ink-700);">${priceText}</td>
      <td><a href="/admin/contacts/${v.contact_id}/edit" style="color:var(--brand-500);text-decoration:none;font-weight:600;">${escapeHtml(v.contact_name || '—')}</a>${statusBadge}${suppressionBadge}</td>
      <td class="mono" style="font-size:12px;">${escapeHtml(v.contact_phone)}</td>
      <td>${linkBtn}</td>
      <td>
        <div class="row-actions">
          <a href="/admin/vehicles/${v.id}/edit" class="action-btn">${renderIcon('edit', 12)} Editar</a>
          ${v.is_suppressed
            ? `<form method="POST" action="/admin/vehicles/${v.id}/release-suppression" style="display:inline;">
                <input type="hidden" name="back" value="/admin/vehicles" />
                <button type="submit" class="action-btn">${renderIcon('refresh', 12)}</button>
              </form>`
            : `<form method="POST" action="/admin/vehicles/${v.id}/suppress" style="display:inline;" onsubmit="return confirm('¿Suprimir este vehículo/publicación para futuras campañas?');">
                <input type="hidden" name="back" value="/admin/vehicles" />
                <input type="hidden" name="reason_code" value="vehicle_manual" />
                <input type="hidden" name="notes" value="Aplicado manualmente desde inventario de vehículos" />
                <button type="submit" class="action-btn danger">${renderIcon('user-x', 12)}</button>
              </form>`}
          <form method="POST" action="/admin/vehicles/${v.id}/delete" style="display:inline;" onsubmit="return confirm('¿Eliminar este vehículo? No se puede deshacer.')">
            <button type="submit" class="action-btn danger">${renderIcon('trash', 12)}</button>
          </form>
        </div>
      </td>
    </tr>`;
  }).join('');

  const tableHtml = vehicles.length > 0 ? `
    <div id="vehicle-table-view" style="overflow:auto;border-radius:var(--radius-md);">
      <table>
        <thead><tr>
          <th>Marca</th><th>Modelo</th><th>Año</th><th>Precio</th>
          <th>Contacto</th><th>Teléfono</th><th>Pub.</th><th>Acciones</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>` : `<div class="empty" id="vehicle-table-view"><div class="empty-title">Sin vehículos</div><div>No hay resultados para los filtros actuales.</div>${(make || yearMin || yearMax || search) ? `<a href="/admin/vehicles" class="empty-cta">Limpiar filtros</a>` : `<a href="/admin/vehicles/new" class="empty-cta">${renderIcon('plus', 13)} Agregar el primero</a>`}</div>`;

  // --- Card view ---
  const cardsHtml = vehicles.length > 0 ? `
    <div id="vehicle-card-view" style="display:none;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">
      ${vehicles.map(v => `
        <div class="card card-accent" style="gap:10px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
            <div>
              <div style="font-size:11px;color:var(--ink-400);text-transform:uppercase;letter-spacing:1px;font-weight:600;">${escapeHtml(v.make)}</div>
              <div style="font-size:19px;font-weight:700;letter-spacing:-0.3px;line-height:1.2;">${escapeHtml(v.model)}</div>
              <div style="font-size:13px;color:var(--ink-500);">${v.year}</div>
              ${v.is_suppressed ? `<div style="margin-top:6px;">${renderBadge('Suprimido', 'warn')}</div>` : ''}
            </div>
            ${v.link ? `<a href="${escapeHtml(v.link)}" target="_blank" rel="noopener" class="action-btn" title="Ver publicación" style="padding:6px;flex-shrink:0;">${renderIcon('arrow-up-right', 14)}</a>` : ''}
          </div>
          ${v.price ? `<div style="font-size:16px;font-weight:700;color:var(--brand-500);font-feature-settings:'tnum';">$${Number(v.price).toLocaleString('es-CL')}</div>` : '<div style="font-size:13px;color:var(--ink-400);">Sin precio</div>'}
          <div style="border-top:1px solid var(--ink-100);padding-top:8px;">
            <a href="/admin/contacts/${v.contact_id}/edit" style="font-size:12px;font-weight:600;color:var(--brand-500);text-decoration:none;">${escapeHtml(v.contact_name || '—')}</a>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--ink-400);margin-top:2px;">${escapeHtml(v.contact_phone)}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <a href="/admin/vehicles/${v.id}/edit" class="action-btn" style="flex:1;justify-content:center;">${renderIcon('edit', 12)} Editar</a>
            ${v.is_suppressed
              ? `<form method="POST" action="/admin/vehicles/${v.id}/release-suppression" style="display:inline;">
                  <input type="hidden" name="back" value="/admin/vehicles" />
                  <button type="submit" class="action-btn">${renderIcon('refresh', 12)}</button>
                </form>`
              : `<form method="POST" action="/admin/vehicles/${v.id}/suppress" style="display:inline;" onsubmit="return confirm('¿Suprimir este vehículo/publicación para futuras campañas?');">
                  <input type="hidden" name="back" value="/admin/vehicles" />
                  <input type="hidden" name="reason_code" value="vehicle_manual" />
                  <input type="hidden" name="notes" value="Aplicado manualmente desde inventario de vehículos" />
                  <button type="submit" class="action-btn danger">${renderIcon('user-x', 12)}</button>
                </form>`}
            <form method="POST" action="/admin/vehicles/${v.id}/delete" style="display:inline;" onsubmit="return confirm('¿Eliminar este vehículo? No se puede deshacer.')">
              <button type="submit" class="action-btn danger">${renderIcon('trash', 12)}</button>
            </form>
          </div>
        </div>`).join('')}
    </div>` : '';

  const pager = vehicles.length > 0
    ? renderPager({ basePath: '/admin/vehicles', query: { make, year_min: yearMin, year_max: yearMax, search }, offset, limit, hasNext })
    : '';

  const toggleScript = `<script>
    (function() {
      var tableView = document.getElementById('vehicle-table-view');
      var cardView = document.getElementById('vehicle-card-view');
      var btnTable = document.getElementById('btn-view-table');
      var btnCards = document.getElementById('btn-view-cards');
      if (!tableView || !cardView) return;
      function setView(v) {
        if (v === 'cards') {
          tableView.style.display = 'none';
          cardView.style.display = 'grid';
          btnTable.classList.remove('active');
          btnCards.classList.add('active');
        } else {
          tableView.style.display = '';
          cardView.style.display = 'none';
          btnTable.classList.add('active');
          btnCards.classList.remove('active');
        }
        try { localStorage.setItem('vehicleView', v); } catch(e) {}
      }
      btnTable.addEventListener('click', function() { setView('table'); });
      btnCards.addEventListener('click', function() { setView('cards'); });
      var saved = 'table';
      try { saved = localStorage.getItem('vehicleView') || 'table'; } catch(e) {}
      setView(saved);
    })();
  </script>`;

  const content = `
    <section class="panel">
      <div class="panel-header">
        <h1>Vehículos ${total > 0 ? `<span style="font-size:14px;color:var(--ink-400);font-weight:400;">(${Number(total).toLocaleString('es-CL')})</span>` : ''}</h1>
        <div style="display:flex;gap:8px;align-items:center;">
          <div class="chip-group">
            <button type="button" class="chip active" id="btn-view-table">${renderIcon('filter', 12)} Lista</button>
            <button type="button" class="chip" id="btn-view-cards">${renderIcon('car', 12)} Cards</button>
          </div>
          <a href="/admin/vehicles/new" class="action-btn primary">${renderIcon('plus', 13)} Nuevo vehículo</a>
        </div>
      </div>
      ${helpText}
      <div class="cards" style="margin-bottom:18px;">${kpiCards}</div>
      ${filtersHtml}
      ${tableHtml}
      ${cardsHtml}
      ${pager}
    </section>
    ${toggleScript}`;

  return renderLayout({ title: 'Vehículos', content, active: 'vehicles' });
}

// ============================================================
// Vehicles: Formulario crear/editar
// ============================================================

export function renderVehicleFormPage({ vehicle = null, error = null, formData = {}, back = '/admin/vehicles' }) {
  const isNew = !vehicle;
  const title = isNew ? 'Nuevo Vehículo' : `Editar · ${vehicle.make} ${vehicle.model} ${vehicle.year}`;
  const action = isNew ? '/admin/vehicles' : `/admin/vehicles/${vehicle.id}`;
  const backUrl = escapeHtml(formData.back ?? back);

  const fPhone = escapeHtml(formData.contact_phone ?? vehicle?.contact_phone ?? '');
  const fMake  = escapeHtml(formData.make  ?? vehicle?.make  ?? '');
  const fModel = escapeHtml(formData.model ?? vehicle?.model ?? '');
  const fYear  = escapeHtml(String(formData.year  ?? vehicle?.year  ?? ''));
  const fPrice = escapeHtml(String(formData.price ?? vehicle?.price ?? ''));
  const fLink  = escapeHtml(formData.link  ?? vehicle?.link  ?? '');

  const helpText = renderHelpText(
    `<strong>${isNew ? 'Nuevo vehículo' : 'Editar vehículo'}:</strong>
    El teléfono del contacto propietario debe existir en la base de datos.
    Si el contacto aún no existe, <a href="/admin/contacts/new" style="color:var(--brand-500);">créalo primero</a>.`
  );

  const errorHtml = error
    ? `<div style="color:var(--danger-500);background:var(--danger-50);border:1px solid #f5c3c3;padding:10px 14px;border-radius:var(--radius-md);margin-bottom:14px;">${escapeHtml(error)}</div>`
    : '';

  const currentContactInfo = !isNew && vehicle
    ? `<div class="muted" style="font-size:12px;margin-top:4px;">Contacto actual: <strong>${escapeHtml(vehicle.contact_name || vehicle.contact_phone)}</strong> — cambia el teléfono para reasignar el vehículo.</div>`
    : '';

  const content = `
    <section class="panel" style="max-width:580px;">
      <div class="panel-header">
        <h1>${escapeHtml(title)}</h1>
        <a href="${backUrl}" class="action-btn">${renderIcon('arrow-left', 13)} Volver</a>
      </div>
      ${helpText}
      ${errorHtml}
      <form method="POST" action="${action}">
        <input type="hidden" name="back" value="${backUrl}" />

        <div style="margin-bottom:16px;">
          <label style="display:block;font-weight:600;margin-bottom:5px;">Teléfono del contacto (E.164) *</label>
          <input type="text" name="contact_phone" value="${fPhone}" required
                 pattern="^\\+[1-9]\\d{1,14}$"
                 placeholder="+56975400946"
                 style="width:100%;" />
          ${currentContactInfo}
          <div class="muted" style="font-size:12px;margin-top:4px;">Formato: +56912345678</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div>
            <label style="display:block;font-weight:600;margin-bottom:5px;">Marca *</label>
            <input type="text" name="make" value="${fMake}" required placeholder="Toyota" style="width:100%;" />
          </div>
          <div>
            <label style="display:block;font-weight:600;margin-bottom:5px;">Modelo *</label>
            <input type="text" name="model" value="${fModel}" required placeholder="Corolla" style="width:100%;" />
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div>
            <label style="display:block;font-weight:600;margin-bottom:5px;">Año *</label>
            <input type="number" name="year" value="${fYear}" required placeholder="2018" min="1960" max="2030" style="width:100%;" />
          </div>
          <div>
            <label style="display:block;font-weight:600;margin-bottom:5px;">Precio (CLP)</label>
            <input type="number" name="price" value="${fPrice}" placeholder="8900000" min="0" step="1000" style="width:100%;" />
          </div>
        </div>

        <div style="margin-bottom:20px;">
          <label style="display:block;font-weight:600;margin-bottom:5px;">Link publicación</label>
          <input type="url" name="link" value="${fLink}" placeholder="https://..." style="width:100%;" />
          <div class="muted" style="font-size:12px;margin-top:4px;">URL de la publicación del vehículo (opcional).</div>
        </div>

        <div style="display:flex;gap:10px;">
          <button type="submit">${isNew ? 'Crear vehículo' : 'Guardar cambios'}</button>
          <a href="${backUrl}" class="action-btn">Cancelar</a>
        </div>
      </form>
    </section>`;

  return renderLayout({ title, content, active: 'vehicles' });
}

// ============================================================
// Feature J: Segments Page
// ============================================================
export function renderSegmentsPage({ segments = [], makes = [], years = [] }) {
  const helpText = renderHelpText(
    `<strong>Segmentos:</strong> puedes guardar filtros dinámicos sobre tu base o crear segmentos manuales
    para cargar contactos / vehículos y reutilizarlos luego en campañas.`
  );

  const segmentMetaJson = JSON.stringify(segments).replace(/</g, '\\u003c');
  const makeOptions = [`<option value="">Todas las marcas</option>`]
    .concat(makes.map((item) => `<option value="${escapeHtml(item.make)}">${escapeHtml(item.make)} (${item.vehicles})</option>`))
    .join('');
  const yearOptions = [`<option value="">Sin límite</option>`]
    .concat(years.map((year) => `<option value="${year}">${year}</option>`))
    .join('');
  const manualSegments = segments.filter((seg) => {
    try {
      const filters = typeof seg.filters === 'string' ? JSON.parse(seg.filters || '{}') : (seg.filters || {});
      return filters.mode === 'manual';
    } catch (_) {
      return false;
    }
  });

  const createForm = `<section class="panel" style="margin-bottom:18px;">
    <div class="panel-header"><h3>Crear segmento</h3></div>
    <div class="muted" style="font-size:12px;margin-bottom:12px;">Usa segmentos dinámicos para filtros vivos y manuales para audiencias curadas.</div>
    <form id="segmentCreateForm" style="display:grid;grid-template-columns:1.2fr .8fr .8fr 1fr 1fr .8fr .8fr 1fr auto;gap:10px;align-items:end;">
      <div>
        <label style="display:block;font-weight:600;margin-bottom:5px;">Nombre *</label>
        <input type="text" id="segmentName" required placeholder="Ej: Toyota 2020+" style="width:100%;" />
      </div>
      <div>
        <label style="display:block;font-weight:600;margin-bottom:5px;">Tipo</label>
        <select id="segmentMode" style="width:100%;">
          <option value="dynamic">Dinámico</option>
          <option value="manual">Manual</option>
        </select>
      </div>
      <div>
        <label style="display:block;font-weight:600;margin-bottom:5px;">Fuente</label>
        <select id="segmentSource" style="width:100%;">
          <option value="vehicles">Vehículos</option>
          <option value="contacts">Contactos</option>
        </select>
      </div>
      <div class="segment-dynamic-field">
        <label style="display:block;font-weight:600;margin-bottom:5px;">Marca</label>
        <select id="segmentMake" style="width:100%;">${makeOptions}</select>
      </div>
      <div class="segment-dynamic-field">
        <label style="display:block;font-weight:600;margin-bottom:5px;">Modelo</label>
        <input type="text" id="segmentModel" placeholder="Corolla" style="width:100%;" />
      </div>
      <div class="segment-dynamic-field">
        <label style="display:block;font-weight:600;margin-bottom:5px;">Desde</label>
        <select id="segmentYearMin" style="width:100%;">${yearOptions}</select>
      </div>
      <div class="segment-dynamic-field">
        <label style="display:block;font-weight:600;margin-bottom:5px;">Hasta</label>
        <select id="segmentYearMax" style="width:100%;">${yearOptions}</select>
      </div>
      <div id="segmentContactsQueryField" class="segment-contacts-field" style="display:none;">
        <label style="display:block;font-weight:600;margin-bottom:5px;">Buscar contacto</label>
        <input type="text" id="segmentContactQuery" placeholder="Nombre o teléfono" style="width:100%;" />
      </div>
      <button type="submit">Crear</button>
    </form>
    <div id="segmentFeedback" class="muted" style="margin-top:10px;min-height:18px;"></div>
  </section>`;

  const manualManager = `<section class="panel" style="margin-bottom:18px;">
    <div class="panel-header"><h3>Cargar miembros a segmento manual</h3></div>
    <div class="muted" style="font-size:12px;margin-bottom:12px;">Busca por vehículos o contactos y agrega el lote al segmento vacío o existente.</div>
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:end;margin-bottom:12px;">
      <div>
        <label style="display:block;font-weight:600;margin-bottom:5px;">Segmento manual</label>
        <select id="manualSegmentSelect" style="width:100%;">
          <option value="">-- Seleccionar segmento manual --</option>
          ${manualSegments.map((seg) => `<option value="${seg.id}">${escapeHtml(seg.name)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="display:block;font-weight:600;margin-bottom:5px;">Fuente</label>
        <div id="manualSegmentSourceBadge" class="badge badge-muted">—</div>
      </div>
      <div style="align-self:center;" class="muted" id="manualSegmentHint">Selecciona un segmento manual para cargar miembros.</div>
    </div>
    <div id="manualVehiclesFilters" style="display:grid;grid-template-columns:1fr 1fr .8fr .8fr auto auto;gap:10px;align-items:end;">
      <div>
        <label style="display:block;font-weight:600;margin-bottom:5px;">Marca</label>
        <select id="manualMake" style="width:100%;">${makeOptions}</select>
      </div>
      <div>
        <label style="display:block;font-weight:600;margin-bottom:5px;">Modelo</label>
        <input type="text" id="manualModel" placeholder="Corolla" style="width:100%;" />
      </div>
      <div>
        <label style="display:block;font-weight:600;margin-bottom:5px;">Desde</label>
        <select id="manualYearMin" style="width:100%;">${yearOptions}</select>
      </div>
      <div>
        <label style="display:block;font-weight:600;margin-bottom:5px;">Hasta</label>
        <select id="manualYearMax" style="width:100%;">${yearOptions}</select>
      </div>
      <button type="button" id="previewManualMembersBtn">Previsualizar</button>
      <button type="button" id="addManualMembersBtn" class="action-btn primary">Cargar al segmento</button>
    </div>
    <div id="manualContactsFilters" style="display:none;grid-template-columns:1fr auto auto;gap:10px;align-items:end;">
      <div>
        <label style="display:block;font-weight:600;margin-bottom:5px;">Buscar contacto</label>
        <input type="text" id="manualContactQuery" placeholder="Nombre o teléfono" style="width:100%;" />
      </div>
      <button type="button" id="previewManualContactsBtn">Previsualizar</button>
      <button type="button" id="addManualContactsBtn" class="action-btn primary">Cargar al segmento</button>
    </div>
    <div id="manualSegmentFeedback" class="muted" style="margin-top:10px;min-height:18px;"></div>
    <div id="manualSegmentResults" style="margin-top:10px;max-height:240px;overflow:auto;"></div>
  </section>`;

  const tableHtml = segments.length > 0
    ? `<table>
        <thead><tr><th>Nombre</th><th>Tipo</th><th>Configuración</th><th style="text-align:right;">Objetivos</th><th>Último uso</th><th>Acciones</th></tr></thead>
        <tbody>
          ${segments.map(seg => {
            let filtersDisplay = '';
            let mode = 'dynamic';
            let source = 'vehicles';
            try {
              const f = typeof seg.filters === 'string' ? JSON.parse(seg.filters) : (seg.filters || {});
              mode = f.mode === 'manual' ? 'manual' : 'dynamic';
              source = f.source === 'contacts' ? 'contacts' : 'vehicles';
              filtersDisplay = Object.entries(f)
                .filter(([key]) => !['mode'].includes(key))
                .map(([k, v]) => `<span class="badge badge-muted">${escapeHtml(k)}: ${escapeHtml(String(v))}</span>`)
                .join(' ');
            } catch (_) {
              filtersDisplay = escapeHtml(String(seg.filters || '—'));
            }
            const typeBadge = mode === 'manual'
              ? `<span class="badge badge-good">manual · ${source === 'contacts' ? 'contactos' : 'vehículos'}</span>`
              : `<span class="badge badge-muted">dinámico · ${source === 'contacts' ? 'contactos' : 'vehículos'}</span>`;
            const openLabel = mode === 'manual' ? 'Gestionar' : 'Editar';
            const openTitle = mode === 'manual' ? 'Gestionar segmento' : 'Editar segmento';
            return `<tr>
              <td style="font-weight:600;">${escapeHtml(seg.name)}</td>
              <td>${typeBadge}</td>
              <td>${filtersDisplay || '<span class="muted">Sin filtros</span>'}</td>
              <td style="text-align:right;font-weight:700;font-size:15px;">${seg.target_count ?? seg.contact_count ?? 0}</td>
              <td>${seg.last_used_at ? formatDate(seg.last_used_at) : '<span class="muted">—</span>'}</td>
              <td>
                <div class="row-actions">
                  <a href="/admin/segments/${seg.id}" class="action-btn" title="${openTitle}">${renderIcon('arrow-right', 13)} ${openLabel}</a>
                  <button onclick="deleteSegment(${seg.id}, '${escapeHtml(seg.name)}')" class="action-btn danger" title="Eliminar segmento">${renderIcon('trash', 13)}</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`
    : renderEmptyState({
        title: 'Sin segmentos',
        message: 'Todavía no hay segmentos guardados. Puedes crear el primero desde este panel.',
        ctaText: null,
        ctaLink: null
      });

  const script = `<script>
    const SEGMENTS = ${segmentMetaJson};

    function escapeHtml(value = '') {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function parseSegmentFilters(segment) {
      if (!segment) return {};
      try {
        return typeof segment.filters === 'string' ? JSON.parse(segment.filters || '{}') : (segment.filters || {});
      } catch (_) {
        return {};
      }
    }

    function setSegmentFeedback(message, isError = false) {
      const el = document.getElementById('segmentFeedback');
      if (!el) return;
      el.textContent = message || '';
      el.style.color = isError ? 'var(--bad)' : 'var(--muted)';
    }

    function setManualSegmentFeedback(message, isError = false) {
      const el = document.getElementById('manualSegmentFeedback');
      if (!el) return;
      el.textContent = message || '';
      el.style.color = isError ? 'var(--bad)' : 'var(--muted)';
    }

    function setManualSegmentLoading(isLoading, action = 'preview') {
      const previewBtns = [
        document.getElementById('previewManualMembersBtn'),
        document.getElementById('previewManualContactsBtn')
      ].filter(Boolean);
      const addBtns = [
        document.getElementById('addManualMembersBtn'),
        document.getElementById('addManualContactsBtn')
      ].filter(Boolean);

      [...previewBtns, ...addBtns].forEach((btn) => {
        btn.disabled = isLoading;
        btn.style.opacity = isLoading ? '0.6' : '1';
        btn.style.cursor = isLoading ? 'wait' : 'pointer';
      });

      addBtns.forEach((btn) => {
        btn.textContent = isLoading && action === 'add' ? 'Cargando...' : 'Cargar al segmento';
      });

      previewBtns.forEach((btn) => {
        btn.textContent = isLoading && action === 'preview' ? 'Buscando...' : 'Previsualizar';
      });
    }

    function getSelectedManualSegment() {
      const segmentId = document.getElementById('manualSegmentSelect')?.value || '';
      if (!segmentId) return null;
      return SEGMENTS.find((segment) => String(segment.id) === String(segmentId)) || null;
    }

    function toggleSegmentCreateMode() {
      const mode = document.getElementById('segmentMode')?.value || 'dynamic';
      const source = document.getElementById('segmentSource')?.value === 'contacts' ? 'contacts' : 'vehicles';
      document.querySelectorAll('.segment-dynamic-field').forEach((el) => {
        el.style.display = mode === 'dynamic' && source === 'vehicles' ? '' : 'none';
      });
      document.querySelectorAll('.segment-contacts-field').forEach((el) => {
        el.style.display = mode === 'dynamic' && source === 'contacts' ? '' : 'none';
      });
    }

    function isInvalidYearRange(yearMin, yearMax) {
      return Number.isFinite(yearMin) && Number.isFinite(yearMax) && yearMin > yearMax;
    }

    function getManualFiltersBySource(source) {
      if (source === 'contacts') {
        return {
          query: document.getElementById('manualContactQuery')?.value?.trim() || ''
        };
      }

      const yearMinRaw = document.getElementById('manualYearMin')?.value || '';
      const yearMaxRaw = document.getElementById('manualYearMax')?.value || '';
      return {
        make: document.getElementById('manualMake')?.value?.trim() || null,
        model: document.getElementById('manualModel')?.value?.trim() || null,
        yearMin: yearMinRaw ? Number(yearMinRaw) : null,
        yearMax: yearMaxRaw ? Number(yearMaxRaw) : null
      };
    }

    function renderManualPreview(samples = [], total = 0, source = 'vehicles') {
      const container = document.getElementById('manualSegmentResults');
      if (!container) return;
      if (!samples.length) {
        container.innerHTML = '<div class="muted">Sin resultados para mostrar.</div>';
        return;
      }
      container.innerHTML = '<div class="muted" style="margin-bottom:8px;">Resultados: <strong>' + total + '</strong></div>'
        + samples.map((item) => '<div style="padding:6px 8px;border-bottom:1px solid #eee;">'
          + escapeHtml(item.phone || '—') + ' — ' + escapeHtml(item.name || 'Sin nombre')
          + (source === 'vehicles' ? ' · ' + escapeHtml([item.make, item.model, item.year].filter(Boolean).join(' ')) : '')
          + '</div>').join('');
    }

    function syncManualSegmentSourceUI() {
      const segment = getSelectedManualSegment();
      const sourceBadge = document.getElementById('manualSegmentSourceBadge');
      const hint = document.getElementById('manualSegmentHint');
      const vehiclesFilters = document.getElementById('manualVehiclesFilters');
      const contactsFilters = document.getElementById('manualContactsFilters');
      const source = parseSegmentFilters(segment).source === 'contacts' ? 'contacts' : 'vehicles';

      if (!segment) {
        if (sourceBadge) sourceBadge.textContent = '—';
        if (hint) hint.textContent = 'Selecciona un segmento manual para cargar miembros.';
        if (vehiclesFilters) vehiclesFilters.style.display = 'grid';
        if (contactsFilters) contactsFilters.style.display = 'none';
        return;
      }

      if (sourceBadge) sourceBadge.textContent = source === 'contacts' ? 'Contactos' : 'Vehículos';
      if (hint) hint.textContent = source === 'contacts'
        ? 'Busca por nombre o teléfono y agrega el resultado al segmento manual.'
        : 'Filtra por vehículo y agrega los resultados al segmento manual.';
      if (vehiclesFilters) vehiclesFilters.style.display = source === 'vehicles' ? 'grid' : 'none';
      if (contactsFilters) contactsFilters.style.display = source === 'contacts' ? 'grid' : 'none';
    }

    async function createSegment(event) {
      event.preventDefault();
      const name = document.getElementById('segmentName')?.value?.trim() || '';
      const mode = document.getElementById('segmentMode')?.value || 'dynamic';
      const source = document.getElementById('segmentSource')?.value === 'contacts' ? 'contacts' : 'vehicles';
      const make = document.getElementById('segmentMake')?.value?.trim() || null;
      const model = document.getElementById('segmentModel')?.value?.trim() || null;
      const query = document.getElementById('segmentContactQuery')?.value?.trim() || '';
      const yearMinRaw = document.getElementById('segmentYearMin')?.value || '';
      const yearMaxRaw = document.getElementById('segmentYearMax')?.value || '';
      const yearMin = yearMinRaw ? Number(yearMinRaw) : null;
      const yearMax = yearMaxRaw ? Number(yearMaxRaw) : null;

      if (!name) {
        setSegmentFeedback('Ingresa un nombre para el segmento.', true);
        return;
      }
      if (mode === 'dynamic' && source === 'vehicles' && !make && !model && !yearMin && !yearMax) {
        setSegmentFeedback('Ingresa al menos un filtro de vehículo para el segmento dinámico.', true);
        return;
      }
      if (mode === 'dynamic' && source === 'contacts' && !query) {
        setSegmentFeedback('Ingresa una búsqueda para el segmento dinámico de contactos.', true);
        return;
      }
      if (mode === 'dynamic' && source === 'vehicles' && isInvalidYearRange(yearMin, yearMax)) {
        setSegmentFeedback('El rango de años es inválido: "Desde" no puede ser mayor que "Hasta".', true);
        return;
      }

      const filters = mode === 'manual'
        ? { mode: 'manual', source }
        : (source === 'contacts'
          ? { mode: 'dynamic', source: 'contacts', query }
          : { mode: 'dynamic', source: 'vehicles', make, model, yearMin, yearMax });

      setSegmentFeedback('Guardando segmento...');
      try {
        const r = await fetch('/admin/api/segments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, filters })
        });
        if (r.ok) {
          window.location.reload();
          return;
        }
        const error = await r.json().catch(() => ({ error: 'No se pudo crear el segmento' }));
        setSegmentFeedback('Error: ' + (error.error || 'No se pudo crear el segmento'), true);
      } catch (error) {
        setSegmentFeedback('Error de conexión: ' + error.message, true);
      }
    }

    async function previewManualMembers() {
      const segment = getSelectedManualSegment();
      if (!segment) {
        setManualSegmentFeedback('Selecciona un segmento manual.', true);
        return;
      }

      const source = parseSegmentFilters(segment).source === 'contacts' ? 'contacts' : 'vehicles';
      const filters = getManualFiltersBySource(source);
      if (source === 'vehicles' && isInvalidYearRange(filters.yearMin, filters.yearMax)) {
        setManualSegmentFeedback('El rango de años es inválido: "Desde" no puede ser mayor que "Hasta".', true);
        return;
      }
      setManualSegmentFeedback('Buscando resultados...');
      setManualSegmentLoading(true, 'preview');
      try {
        const r = await fetch('/admin/api/segments/' + segment.id + '/members/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters, limit: 10 })
        });
        const data = await r.json();
        if (!r.ok) {
          setManualSegmentFeedback('Error: ' + (data.error || 'No se pudo previsualizar'), true);
          return;
        }
        renderManualPreview(data.samples || [], data.total || 0, source);
        setManualSegmentFeedback((data.total || 0) ? 'Vista previa lista.' : 'No se encontraron resultados para ese filtro.');
      } catch (error) {
        setManualSegmentFeedback('Error de conexión: ' + error.message, true);
      } finally {
        setManualSegmentLoading(false, 'preview');
      }
    }

    async function addManualMembers() {
      const segment = getSelectedManualSegment();
      if (!segment) {
        setManualSegmentFeedback('Selecciona un segmento manual.', true);
        return;
      }

      const source = parseSegmentFilters(segment).source === 'contacts' ? 'contacts' : 'vehicles';
      const filters = getManualFiltersBySource(source);
      if (source === 'vehicles' && isInvalidYearRange(filters.yearMin, filters.yearMax)) {
        setManualSegmentFeedback('El rango de años es inválido: "Desde" no puede ser mayor que "Hasta".', true);
        return;
      }
      setManualSegmentFeedback('Cargando miembros al segmento...');
      setManualSegmentLoading(true, 'add');
      try {
        const r = await fetch('/admin/api/segments/' + segment.id + '/members/bulk-add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters })
        });
        const data = await r.json();
        if (!r.ok) {
          setManualSegmentFeedback('Error: ' + (data.error || 'No se pudo cargar el segmento'), true);
          return;
        }
        setManualSegmentFeedback('Carga completada. Total en segmento: ' + (data.totalMembers || 0));
      } catch (error) {
        setManualSegmentFeedback('Error de conexión: ' + error.message, true);
      } finally {
        setManualSegmentLoading(false, 'add');
      }
    }

    async function deleteSegment(id, name) {
      if (!confirm('¿Eliminar segmento "' + name + '"?')) return;
      const r = await fetch('/admin/api/segments/' + id, { method: 'DELETE' });
      if (r.ok) window.location.reload();
      else alert('Error al eliminar');
    }

    document.getElementById('segmentCreateForm')?.addEventListener('submit', createSegment);
    document.getElementById('segmentMode')?.addEventListener('change', toggleSegmentCreateMode);
    document.getElementById('segmentSource')?.addEventListener('change', toggleSegmentCreateMode);
    document.getElementById('manualSegmentSelect')?.addEventListener('change', syncManualSegmentSourceUI);
    document.getElementById('previewManualMembersBtn')?.addEventListener('click', previewManualMembers);
    document.getElementById('addManualMembersBtn')?.addEventListener('click', addManualMembers);
    document.getElementById('previewManualContactsBtn')?.addEventListener('click', previewManualMembers);
    document.getElementById('addManualContactsBtn')?.addEventListener('click', addManualMembers);
    toggleSegmentCreateMode();
    syncManualSegmentSourceUI();
  </script>`;

  const content = `${createForm}${manualManager}<section class="panel">
    <div class="panel-header">
      <h1>Segmentos</h1>
    </div>
    ${helpText}
    ${tableHtml}
  </section>${script}`;

  return renderLayout({ title: 'Segmentos', content, active: 'segments' });
}

export function renderSegmentDetailPage({ segment, segmentFilters = {}, rows = [], total = 0, offset = 0, limit = 50, importPreview = null, importResult = null }) {
  const filters = typeof segmentFilters === 'string'
    ? (() => { try { return JSON.parse(segmentFilters || '{}'); } catch (_) { return {}; } })()
    : (segmentFilters || {});
  const mode = filters.mode === 'manual' ? 'manual' : 'dynamic';
  const source = filters.source === 'contacts' ? 'contacts' : 'vehicles';

  const configBits = Object.entries(filters)
    .filter(([key, value]) => !['mode'].includes(key) && value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `<span class="badge badge-muted">${escapeHtml(key)}: ${escapeHtml(String(value))}</span>`)
    .join(' ');

  const sourceLabel = source === 'contacts' ? 'Contactos' : 'Vehículos';
  const modeBadge = mode === 'manual'
    ? renderBadge(`manual · ${sourceLabel}`, 'good')
    : renderBadge(`dinámico · ${sourceLabel}`, 'muted');
  const helpText = renderHelpText(
    mode === 'manual'
      ? `<strong>Segmento manual:</strong> esta vista muestra los miembros guardados actualmente dentro del segmento.`
      : `<strong>Segmento dinámico:</strong> esta vista muestra la coincidencia viva actual según las reglas guardadas del segmento.`
  );

  const summary = `<section class="panel" style="margin-bottom:18px;">
    <div class="panel-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
      <div>
        <h1>${escapeHtml(segment.name || 'Segmento')}</h1>
        <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">${modeBadge}</div>
      </div>
      <div class="row-actions">
        <a href="/admin/segments/${segment.id}/export" class="action-btn">${renderIcon('upload', 13)} Exportar CSV</a>
        <a href="/admin/segments" class="action-btn">${renderIcon('arrow-left', 13)} Volver</a>
      </div>
    </div>
    ${helpText}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:14px;">
      <div class="card"><h2>${renderIcon('inbox', 14)}<span>Total actual</span></h2><p>${Number(total || 0).toLocaleString('es-CL')}</p><div class="card-kicker">${mode === 'manual' ? 'miembros guardados' : 'coincidencias vivas'}</div></div>
      <div class="card"><h2>${renderIcon('filter', 14)}<span>Configuración</span></h2><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">${configBits || '<span class="muted">Sin configuración adicional</span>'}</div></div>
    </div>
  </section>`;

  const vehicleRows = source === 'vehicles'
    ? rows.map((row) => ({
        ...row,
        vehicle_label: [row.make, row.model, row.year].filter(Boolean).join(' ')
      }))
    : [];

  const table = rows.length > 0
    ? renderTable({
        columns: source === 'vehicles'
          ? [
              { key: 'phone', label: 'Teléfono' },
              { key: 'name', label: 'Nombre', render: (row) => escapeHtml(row.name || row.contact_name || '—') },
              { key: 'vehicle_label', label: 'Vehículo', render: (row) => escapeHtml(row.vehicle_label || '—') },
              { key: 'link', label: 'Link', render: (row) => row.link ? `<a href="${escapeHtml(row.link)}" target="_blank" rel="noopener">Abrir</a>` : '<span class="muted">—</span>' },
              ...(mode === 'manual'
                ? [{ key: 'actions', label: 'Acciones', render: (row) => `<button onclick="removeSegmentMember(${row.id}, '${escapeHtml(row.vehicle_label || row.name || row.phone || 'elemento')}')" class="action-btn danger">${renderIcon('trash', 12)} Quitar</button>` }]
                : [])
            ]
          : [
              { key: 'phone', label: 'Teléfono' },
              { key: 'name', label: 'Nombre', render: (row) => escapeHtml(row.name || '—') },
              { key: 'status', label: 'Estado', render: (row) => renderBadge(row.status || 'active', statusTone(row.status || 'active')) },
              ...(mode === 'manual'
                ? [{ key: 'created_at', label: 'Agregado al segmento', render: (row) => escapeHtml(formatDate(row.created_at)) }]
                : []),
              ...(mode === 'manual'
                ? [{ key: 'actions', label: 'Acciones', render: (row) => `<button onclick="removeSegmentMember(${row.id}, '${escapeHtml(row.name || row.phone || 'contacto')}')" class="action-btn danger">${renderIcon('trash', 12)} Quitar</button>` }]
                : [])
            ],
        rows: source === 'vehicles' ? vehicleRows : rows,
        searchable: true,
        sortable: true,
        tableId: 'segment-detail-table'
      })
    : renderEmptyState({
        title: 'Sin resultados',
        message: mode === 'manual'
          ? 'Este segmento manual todavía no tiene miembros cargados.'
          : 'La regla dinámica hoy no devuelve coincidencias.'
      });

  const pager = rows.length > 0 ? renderPager({
    basePath: `/admin/segments/${segment.id}`,
    query: {},
    offset,
    limit,
    hasNext: offset + rows.length < total
  }) : '';

  const editPanel = mode === 'dynamic' ? `<section class="panel" style="margin-bottom:18px;">
    <div class="panel-header"><h3>Editar segmento</h3></div>
    <div class="muted" style="font-size:12px;margin-bottom:12px;">Actualiza el nombre o las reglas sin cambiar la fuente del segmento.</div>
    <form id="segmentEditForm" style="display:grid;grid-template-columns:1.1fr ${source === 'contacts' ? '1fr' : '1fr 1fr .8fr .8fr'} auto;gap:10px;align-items:end;">
      <div>
        <label style="display:block;font-weight:600;margin-bottom:5px;">Nombre</label>
        <input type="text" id="segmentEditName" value="${escapeHtml(segment.name || '')}" required style="width:100%;" />
      </div>
      ${source === 'contacts'
        ? `<div>
            <label style="display:block;font-weight:600;margin-bottom:5px;">Buscar contacto</label>
            <input type="text" id="segmentEditQuery" value="${escapeHtml(String(filters.query || ''))}" placeholder="Nombre o teléfono" style="width:100%;" />
          </div>`
        : `<div>
            <label style="display:block;font-weight:600;margin-bottom:5px;">Marca</label>
            <input type="text" id="segmentEditMake" value="${escapeHtml(String(filters.make || ''))}" placeholder="Toyota" style="width:100%;" />
          </div>
          <div>
            <label style="display:block;font-weight:600;margin-bottom:5px;">Modelo</label>
            <input type="text" id="segmentEditModel" value="${escapeHtml(String(filters.model || ''))}" placeholder="Corolla" style="width:100%;" />
          </div>
          <div>
            <label style="display:block;font-weight:600;margin-bottom:5px;">Desde</label>
            <input type="number" id="segmentEditYearMin" value="${filters.yearMin ?? ''}" placeholder="2020" style="width:100%;" />
          </div>
          <div>
            <label style="display:block;font-weight:600;margin-bottom:5px;">Hasta</label>
            <input type="number" id="segmentEditYearMax" value="${filters.yearMax ?? ''}" placeholder="2024" style="width:100%;" />
          </div>`}
      <button type="submit">Guardar cambios</button>
    </form>
    <div id="segmentEditFeedback" class="muted" style="margin-top:10px;min-height:18px;"></div>
  </section>` : '';

  const importPreviewValidRows = Array.isArray(importPreview?.validRows) ? importPreview.validRows : [];
  const importPreviewInvalidRows = Array.isArray(importPreview?.invalidRows) ? importPreview.invalidRows : [];
  const importPreviewData = Array.isArray(importPreview?.records) ? importPreview.records : [];
  const importPreviewBlock = importPreview
    ? `<div style="margin-top:14px;padding:14px;border:1px solid var(--line);border-radius:10px;background:#fff;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
          <h4 style="margin:0;">Vista previa importación CSV</h4>
          <div class="muted" style="font-size:12px;">Válidos: <strong>${Number(importPreview.validCount || 0)}</strong> · Inválidos: <strong>${Number(importPreview.invalidCount || 0)}</strong></div>
        </div>
        ${importPreview.error
          ? `<div style="margin-bottom:10px;color:var(--bad);font-size:13px;">${escapeHtml(importPreview.error)}</div>`
          : ''}
        ${importPreviewValidRows.length > 0
          ? `<div style="margin-bottom:12px;">${renderTable({
              columns: [
                { key: 'phone', label: 'Teléfono' },
                { key: 'name', label: 'Nombre', render: (row) => escapeHtml(row.name || '—') },
                { key: 'state', label: 'Estado importación', render: (row) => renderBadge(row.state || 'válido', row.state === 'nuevo' ? 'good' : (row.state === 'existente' ? 'info' : 'muted')) }
              ],
              rows: importPreviewValidRows.slice(0, 100),
              searchable: false,
              sortable: false,
              tableId: 'segment-import-preview-valid-table'
            })}</div>`
          : '<div class="muted" style="margin-bottom:12px;">No hay registros válidos en este archivo.</div>'}
        ${importPreviewValidRows.length > 100 ? `<div class="muted" style="font-size:12px;margin-top:-6px;margin-bottom:12px;">Mostrando primeros 100 de ${importPreviewValidRows.length} registros válidos.</div>` : ''}
        ${importPreviewInvalidRows.length > 0
          ? `<div style="margin-top:10px;">${renderTable({
              columns: [
                { key: 'row', label: 'Fila' },
                { key: 'phone', label: 'Teléfono', render: (row) => escapeHtml(row.phone || '—') },
                { key: 'error', label: 'Error', render: (row) => escapeHtml(row.error || 'Dato inválido') }
              ],
              rows: importPreviewInvalidRows.slice(0, 50),
              searchable: false,
              sortable: false,
              tableId: 'segment-import-preview-invalid-table'
            })}</div>`
          : ''}
        ${importPreviewInvalidRows.length > 50 ? `<div class="muted" style="font-size:12px;margin-top:8px;">Mostrando primeros 50 de ${importPreviewInvalidRows.length} registros inválidos.</div>` : ''}
        ${importPreviewData.length > 0
          ? `<form method="POST" action="/admin/segments/${segment.id}/import-contacts/confirm" style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              <textarea name="csvData" style="display:none;">${escapeHtml(JSON.stringify(importPreviewData))}</textarea>
              <button type="submit">Confirmar e importar ${importPreviewData.length} contacto(s)</button>
              <span class="muted" style="font-size:12px;">Se hará upsert por teléfono y luego se agregará al segmento sin duplicar miembros.</span>
            </form>`
          : ''}
      </div>`
    : '';

  const importResultBlock = importResult
    ? `<div style="margin-top:14px;padding:14px;border:1px solid var(--line);border-radius:10px;background:#fffbeb;">
        <h4 style="margin:0 0 10px;">Resultado importación CSV</h4>
        ${importResult.error
          ? `<div style="color:var(--bad);font-size:13px;">${escapeHtml(importResult.error)}</div>`
          : `<div style="display:flex;gap:8px;flex-wrap:wrap;">
              <span class="badge badge-good">creados: ${Number(importResult.createdContacts || 0)}</span>
              <span class="badge badge-info">reutilizados: ${Number(importResult.reusedContacts || 0)}</span>
              <span class="badge badge-good">agregados al segmento: ${Number(importResult.addedToSegment || 0)}</span>
              <span class="badge badge-muted">ya en segmento: ${Number(importResult.alreadyInSegment || 0)}</span>
              <span class="badge badge-warn">no elegibles: ${Number(importResult.skippedIneligible || 0)}</span>
              <span class="badge badge-muted">total actual: ${Number(importResult.totalMembers || total || 0)}</span>
            </div>`}
      </div>`
    : '';

  const importPanel = mode === 'manual' && source === 'contacts' ? `<section class="panel" style="margin-bottom:18px;">
    <div class="panel-header"><h3>Importar contactos al segmento</h3></div>
    <div class="muted" style="font-size:12px;margin-bottom:12px;">Sube un CSV para crear o reutilizar contactos por teléfono y agregarlos a este segmento manual sin duplicar miembros. Columnas aceptadas: <code>phone</code> o <code>telefono</code>. <code>name</code> o <code>nombre</code> es opcional.</div>
    <form id="importContactsCsvForm" method="POST" action="/admin/segments/${segment.id}/import-contacts/upload" enctype="multipart/form-data" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <input type="file" name="csvFile" accept=".csv,text/csv" required style="max-width:320px;" />
      <button type="submit">Previsualizar CSV</button>
      <span class="muted" style="font-size:12px;">Si el contacto ya existe, se reutiliza; si no existe, se crea.</span>
    </form>
    ${importResultBlock}
    ${importPreviewBlock}
  </section>` : '';

  const script = `
    <script>
      function setSegmentEditFeedback(message, isError) {
        const el = document.getElementById('segmentEditFeedback');
        if (!el) return;
        el.textContent = message || '';
        el.style.color = isError ? 'var(--bad)' : 'var(--muted)';
      }

      async function submitSegmentEdit(event) {
        event.preventDefault();
        const name = document.getElementById('segmentEditName')?.value?.trim() || '';
        if (!name) {
          setSegmentEditFeedback('Ingresa un nombre para el segmento.', true);
          return;
        }

        const filters = ${source === 'contacts'
          ? `{ mode: 'dynamic', source: 'contacts', query: document.getElementById('segmentEditQuery')?.value?.trim() || '' }`
          : `{ mode: 'dynamic', source: 'vehicles', make: document.getElementById('segmentEditMake')?.value?.trim() || null, model: document.getElementById('segmentEditModel')?.value?.trim() || null, yearMin: document.getElementById('segmentEditYearMin')?.value ? Number(document.getElementById('segmentEditYearMin').value) : null, yearMax: document.getElementById('segmentEditYearMax')?.value ? Number(document.getElementById('segmentEditYearMax').value) : null }`};

        if (filters.source === 'contacts' && !filters.query) {
          setSegmentEditFeedback('Ingresa una búsqueda para el segmento dinámico de contactos.', true);
          return;
        }
        if (filters.source === 'vehicles' && !filters.make && !filters.model && !filters.yearMin && !filters.yearMax) {
          setSegmentEditFeedback('Ingresa al menos un filtro de vehículo.', true);
          return;
        }
        if (filters.source === 'vehicles' && Number.isFinite(filters.yearMin) && Number.isFinite(filters.yearMax) && filters.yearMin > filters.yearMax) {
          setSegmentEditFeedback('El rango de años es inválido.', true);
          return;
        }

        setSegmentEditFeedback('Guardando cambios...');
        try {
          const response = await fetch('/admin/api/segments/${segment.id}', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, filters })
          });
          const data = await response.json().catch(() => ({ error: 'No se pudo actualizar el segmento' }));
          if (!response.ok) {
            setSegmentEditFeedback('Error: ' + (data.error || 'No se pudo actualizar el segmento'), true);
            return;
          }
          window.location.reload();
        } catch (error) {
          setSegmentEditFeedback('Error de conexión: ' + error.message, true);
        }
      }

      async function removeSegmentMember(memberId, label) {
        if (!confirm('¿Quitar de este segmento a "' + label + '"?')) return;
        const r = await fetch('/admin/api/segments/${segment.id}/members/' + memberId, { method: 'DELETE' });
        if (r.ok) {
          window.location.reload();
          return;
        }
        const data = await r.json().catch(() => ({ error: 'No se pudo quitar el miembro' }));
        alert(data.error || 'No se pudo quitar el miembro');
      }

      document.getElementById('segmentEditForm')?.addEventListener('submit', submitSegmentEdit);
    </script>
  `;

  const content = `${summary}${editPanel}${importPanel}<section class="panel"><div class="panel-header"><h3>${mode === 'manual' ? 'Miembros del segmento' : 'Coincidencias actuales del segmento'}</h3></div><div class="muted" style="margin-bottom:10px;font-size:12px;">Usa la búsqueda de la tabla para filtrar lo visible rápidamente.</div>${table}${pager}</section>${script}`;
  return renderLayout({ title: `Segmento · ${segment.name}`, content, active: 'segments' });
}

// ============================================================
// Feature 4: Inbox Page
// ============================================================
export function renderInboxPage({ conversations = [], filter = 'all', unreadCount = 0 }) {
  const helpText = renderHelpText(
    `<strong>Inbox:</strong> bandeja de gestión de respuestas inbound. Muestra quién escribió, cuándo,
    y si ya fue atendido. Para leer el hilo completo usa <strong>Ver hilo</strong> → va a Mensajes.
    <strong>Mensajes</strong> tiene la vista chat; el Inbox es el tablero de estado.`
  );

  const filtered = filter === 'unread'
    ? conversations.filter(c => (c.conv_status || 'unread') === 'unread')
    : filter === 'read'
      ? conversations.filter(c => c.conv_status === 'read')
      : conversations;

  const totalAll = conversations.length;
  const totalUnread = conversations.filter(c => (c.conv_status || 'unread') === 'unread').length;
  const totalRead = conversations.filter(c => c.conv_status === 'read').length;

  const chips = `<div class="chip-group" style="margin-bottom:14px;">
    <a class="chip ${filter === 'all' ? 'active' : ''}" href="/admin/inbox">Todos <span class="muted">${totalAll}</span></a>
    <a class="chip ${filter === 'unread' ? 'active' : ''}" href="/admin/inbox?filter=unread">
      ${renderIcon('inbox', 13)} Sin leer <span class="muted">${totalUnread}</span>
    </a>
    <a class="chip ${filter === 'read' ? 'active' : ''}" href="/admin/inbox?filter=read">
      ${renderIcon('check', 13)} Leídos <span class="muted">${totalRead}</span>
    </a>
  </div>`;

  const statCards = `<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
    <div style="padding:12px 18px;border-radius:var(--radius-lg);background:var(--danger-50);border:1px solid #f5c3c3;min-width:130px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:var(--danger-500);font-weight:700;margin-bottom:4px;">Sin leer</div>
      <div style="font-size:26px;font-weight:700;color:var(--danger-500);line-height:1;">${totalUnread}</div>
    </div>
    <div style="padding:12px 18px;border-radius:var(--radius-lg);background:var(--success-50);border:1px solid #c5e8df;min-width:130px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:var(--success-500);font-weight:700;margin-bottom:4px;">Atendidos</div>
      <div style="font-size:26px;font-weight:700;color:var(--success-500);line-height:1;">${totalRead}</div>
    </div>
    <div style="padding:12px 18px;border-radius:var(--radius-lg);background:var(--surface-1);border:1px solid var(--ink-100);min-width:130px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:var(--ink-400);font-weight:700;margin-bottom:4px;">Total contactos</div>
      <div style="font-size:26px;font-weight:700;line-height:1;">${totalAll}</div>
    </div>
  </div>`;

  const tableRows = filtered.map(conv => {
    const convStatus = conv.conv_status || 'unread';
    const isUnread = convStatus === 'unread';
    const statusBadge = isUnread
      ? `<span class="badge badge-bad">Sin leer</span>`
      : `<span class="badge badge-good">Leído</span>`;
    const preview = escapeHtml(truncate(conv.last_inbound || '—', 65));
    const name = escapeHtml(conv.contact_name || '—');
    const phone = escapeHtml(conv.phone);
    const lastAt = escapeHtml(formatDate(conv.last_message_at));
    const inboundCount = conv.inbound_count || 0;
    const rowStyle = isUnread ? 'font-weight:600;' : '';
    return `<tr style="${rowStyle}" data-row>
      <td>${statusBadge}</td>
      <td>${name}</td>
      <td><span class="phone-text">${phone}</span></td>
      <td style="max-width:320px;color:var(--ink-600);">${preview}</td>
      <td style="white-space:nowrap;font-size:12px;color:var(--ink-400);">${lastAt}</td>
      <td style="text-align:center;">${inboundCount}</td>
      <td>
        <div class="row-actions">
          <a href="/admin/messages" class="action-btn" title="Ver hilo en Mensajes">${renderIcon('message-square', 13)} Ver hilo</a>
          ${isUnread
            ? `<button onclick="markRead('${escapeHtml(conv.phone)}')" class="action-btn" title="Marcar como leído">${renderIcon('check', 13)} Marcar leído</button>`
            : `<button onclick="markUnread('${escapeHtml(conv.phone)}')" class="action-btn ghost" title="Marcar como no leído">${renderIcon('refresh', 13)}</button>`
          }
        </div>
      </td>
    </tr>`;
  }).join('');

  const tableHtml = filtered.length > 0
    ? `<div style="overflow-x:auto;">
        <table id="inbox-table">
          <thead>
            <tr>
              <th>Estado</th>
              <th>Contacto</th>
              <th>Teléfono</th>
              <th>Último mensaje inbound</th>
              <th>Fecha</th>
              <th style="text-align:center;">Msgs</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`
    : renderEmptyState({
        title: 'Sin conversaciones',
        message: filter === 'unread'
          ? 'No hay mensajes pendientes de atención. ¡Todo al día!'
          : 'Aún no hay mensajes inbound registrados.',
        ctaText: 'Ver todos los mensajes',
        ctaLink: '/admin/messages'
      });

  const markAllBtn = totalUnread > 0 && filter !== 'read'
    ? `<button onclick="markAllRead()" class="action-btn primary" style="margin-left:auto;">${renderIcon('check-circle', 13)} Marcar todos leídos (${totalUnread})</button>`
    : '';

  const searchBar = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
    <div class="search-box">
      ${renderIcon('search', 14, 'search-icon')}
      <input type="text" id="inbox-search" placeholder="Buscar contacto o teléfono..." oninput="filterRows(this.value)" style="min-width:220px;" />
    </div>
    ${markAllBtn}
  </div>`;

  const script = `<script>
    function filterRows(q) {
      var ql = q.toLowerCase();
      document.querySelectorAll('#inbox-table tbody tr[data-row]').forEach(function(tr) {
        tr.style.display = tr.textContent.toLowerCase().includes(ql) ? '' : 'none';
      });
    }
    async function markRead(phone) {
      await fetch('/admin/api/inbox/' + encodeURIComponent(phone) + '/read', { method: 'POST' });
      window.location.reload();
    }
    async function markUnread(phone) {
      await fetch('/admin/api/inbox/' + encodeURIComponent(phone) + '/unread', { method: 'POST' });
      window.location.reload();
    }
    async function markAllRead() {
      var btns = document.querySelectorAll('[onclick^="markRead"]');
      var phones = Array.from(btns).map(function(b){ return b.getAttribute('onclick').match(/'([^']+)'/)[1]; });
      await Promise.all(phones.map(function(p){ return fetch('/admin/api/inbox/' + encodeURIComponent(p) + '/read', { method: 'POST' }); }));
      window.location.reload();
    }
  </script>`;

  const content = `<section class="panel">
    <div class="panel-header">
      <h1>Inbox ${unreadCount > 0 ? `<span class="badge badge-bad" style="vertical-align:middle;font-size:13px;">${unreadCount} sin leer</span>` : ''}</h1>
    </div>
    ${helpText}
    ${statCards}
    ${chips}
    ${searchBar}
    ${tableHtml}
  </section>${script}`;

  return renderLayout({ title: 'Inbox', content, active: 'inbox' });
}
