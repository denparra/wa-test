import {
  escapeHtml,
  formatDate,
  renderBadge,
  renderLayout,
  renderPager,
  renderTable,
  truncate
} from './render.js';

function statusTone(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'active' || text === 'sent' || text === 'delivered') {
    return 'good';
  }
  if (text.includes('skip') || text === 'pending') {
    return 'warn';
  }
  if (text === 'failed' || text === 'opted_out') {
    return 'bad';
  }
  return 'muted';
}

export function renderDashboardPage({ stats }) {
  const cards = [
    { label: 'Contactos', value: stats.contacts },
    { label: 'Vehiculos', value: stats.vehicles },
    { label: 'Opt-outs', value: stats.optOuts },
    { label: 'Campanas', value: stats.campaigns },
    { label: 'Recipients', value: stats.campaignRecipients },
    { label: 'Mensajes', value: stats.messages }
  ];

  const content = `<section class="panel">
      <div class="panel-header"><h1>Resumen</h1></div>
      <div class="cards">
        ${cards.map((card) => `<div class="card"><h2>${card.label}</h2><p>${card.value}</p></div>`).join('')}
      </div>
    </section>`;

  return renderLayout({ title: 'Resumen', content, active: 'home' });
}

export function renderContactsPage({ contacts, query, offset, limit }) {
  const content = `<section class="panel">
      <div class="panel-header">
        <h1>Contactos</h1>
        <form class="inline" method="get" action="/admin/contacts">
          <input type="text" name="q" placeholder="Buscar telefono o nombre" value="${escapeHtml(query || '')}" />
          <button type="submit">Buscar</button>
        </form>
      </div>
      ${renderTable({
    columns: [
      { key: 'phone', label: 'Telefono' },
      { key: 'name', label: 'Nombre' },
      { key: 'status', label: 'Status', render: (row) => renderBadge(row.status, statusTone(row.status)) },
      { key: 'created_at', label: 'Creado', render: (row) => escapeHtml(formatDate(row.created_at)) },
      { key: 'updated_at', label: 'Actualizado', render: (row) => escapeHtml(formatDate(row.updated_at)) }
    ],
    rows: contacts
  })}
      ${renderPager({
    basePath: '/admin/contacts',
    query: { q: query || '' },
    offset,
    limit,
    hasNext: contacts.length === limit
  })}
    </section>`;

  return renderLayout({ title: 'Contactos', content, active: 'contacts' });
}

export function renderMessagesPage({ messages, direction, offset, limit }) {
  const content = `<section class="panel">
      <div class="panel-header">
        <h1>Mensajes</h1>
        <form class="inline" method="get" action="/admin/messages">
          <select name="direction">
            <option value="" ${direction ? '' : 'selected'}>Todos</option>
            <option value="inbound" ${direction === 'inbound' ? 'selected' : ''}>Inbound</option>
            <option value="outbound" ${direction === 'outbound' ? 'selected' : ''}>Outbound</option>
          </select>
          <button type="submit">Filtrar</button>
        </form>
      </div>
      ${renderTable({
    columns: [
      { key: 'created_at', label: 'Fecha', render: (row) => escapeHtml(formatDate(row.created_at)) },
      { key: 'direction', label: 'Direccion', render: (row) => renderBadge(row.direction, statusTone(row.direction)) },
      { key: 'contact_phone', label: 'Telefono' },
      { key: 'contact_name', label: 'Nombre' },
      { key: 'campaign_name', label: 'Campana' },
      { key: 'status', label: 'Status', render: (row) => renderBadge(row.status || 'n/a', statusTone(row.status)) },
      { key: 'body', label: 'Contenido', render: (row) => escapeHtml(truncate(row.body || '', 80)) }
    ],
    rows: messages
  })}
      ${renderPager({
    basePath: '/admin/messages',
    query: { direction: direction || '' },
    offset,
    limit,
    hasNext: messages.length === limit
  })}
    </section>`;

  return renderLayout({ title: 'Mensajes', content, active: 'messages' });
}

export function renderCampaignsPage({ campaigns, offset, limit }) {
  const content = `<section class="panel">
      <div class="panel-header">
        <h1>Campanas</h1>
        <div class="muted">Total: ${campaigns.length}</div>
      </div>
      ${renderTable({
    columns: [
      {
        key: 'name',
        label: 'Nombre',
        render: (row) => `<a href="/admin/campaigns/${row.id}">${escapeHtml(row.name)}</a>`
      },
      { key: 'status', label: 'Status', render: (row) => renderBadge(row.status, statusTone(row.status)) },
      { key: 'category', label: 'Categoria' },
      { key: 'message_template', label: 'Mensaje', render: (row) => escapeHtml(truncate(row.message_template || '', 60)) },
      { key: 'recipients_total', label: 'Recipients' },
      { key: 'recipients_sent', label: 'Enviados' },
      { key: 'recipients_failed', label: 'Fallidos' },
      { key: 'recipients_skipped', label: 'Omitidos' },
      { key: 'created_at', label: 'Creada', render: (row) => escapeHtml(formatDate(row.created_at)) }
    ],
    rows: campaigns
  })}
      ${renderPager({
    basePath: '/admin/campaigns',
    query: {},
    offset,
    limit,
    hasNext: campaigns.length === limit
  })}
    </section>`;

  return renderLayout({ title: 'Campanas', content, active: 'campaigns' });
}

export function renderCampaignDetailPage({ campaign, recipients, offset, limit }) {
  const header = `<section class="panel">
      <div class="panel-header">
        <h1>${escapeHtml(campaign.name)}</h1>
        ${renderBadge(campaign.status, statusTone(campaign.status))}
      </div>
      <div class="muted">Categoria: ${escapeHtml(campaign.category || 'n/a')}</div>
      <div class="muted">Creada: ${escapeHtml(formatDate(campaign.created_at))}</div>
      <div class="muted">Mensaje: ${escapeHtml(campaign.message_template || 'n/a')}</div>
    </section>`;

  const recipientsTable = `<section class="panel">
      <div class="panel-header">
        <h1>Recipients</h1>
        <div class="muted">Total: ${recipients.length}</div>
      </div>
      ${renderTable({
    columns: [
      { key: 'phone', label: 'Telefono' },
      { key: 'contact_name', label: 'Nombre' },
      { key: 'status', label: 'Status', render: (row) => renderBadge(row.status, statusTone(row.status)) },
      { key: 'message_sid', label: 'Message ID' },
      { key: 'sent_at', label: 'Enviado', render: (row) => escapeHtml(formatDate(row.sent_at)) },
      { key: 'error_message', label: 'Error' }
    ],
    rows: recipients
  })}
      ${renderPager({
    basePath: `/admin/campaigns/${campaign.id}`,
    query: {},
    offset,
    limit,
    hasNext: recipients.length === limit
  })}
    </section>`;

  return renderLayout({
    title: `Campana ${campaign.id}`,
    content: `${header}${recipientsTable}`,
    active: 'campaigns'
  });
}

export function renderOptOutsPage({ optOuts, offset, limit }) {
  const content = `<section class="panel">
      <div class="panel-header">
        <h1>Opt-outs</h1>
      </div>
      ${renderTable({
    columns: [
      { key: 'phone', label: 'Telefono' },
      { key: 'contact_name', label: 'Nombre' },
      { key: 'reason', label: 'Motivo', render: (row) => escapeHtml(row.reason || 'user_request') },
      { key: 'created_at', label: 'Fecha', render: (row) => escapeHtml(formatDate(row.created_at)) }
    ],
    rows: optOuts
  })}
      ${renderPager({
    basePath: '/admin/opt-outs',
    query: {},
    offset,
    limit,
    hasNext: optOuts.length === limit
  })}
    </section>`;

  return renderLayout({ title: 'Opt-outs', content, active: 'opt-outs' });
}
