import {
  escapeHtml,
  formatDate,
  renderBadge,
  renderCopyButton,
  renderEmptyState,
  renderHelpText,
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
    { label: 'Contactos', value: stats.contacts, link: '/admin/contacts', desc: 'Total de contactos en la base de datos' },
    { label: 'Vehiculos', value: stats.vehicles, desc: 'Vehículos asociados a contactos' },
    { label: 'Opt-outs', value: stats.optOuts, link: '/admin/opt-outs', desc: 'Usuarios que pidieron BAJA' },
    { label: 'Campanas', value: stats.campaigns, link: '/admin/campaigns', desc: 'Campañas de mensajes creadas' },
    { label: 'Recipients', value: stats.campaignRecipients, desc: 'Destinatarios en todas las campañas' },
    { label: 'Mensajes', value: stats.messages, link: '/admin/messages', desc: 'Total de mensajes (inbound + outbound)' }
  ];

  const helpText = renderHelpText(
    `<strong>Dashboard de control:</strong> Vista general de la actividad del sistema. Haz clic en las tarjetas para navegar a cada sección.`
  );

  const cardHtml = cards.map((card) => {
    const wrapper = card.link
      ? `<a href="${card.link}" style="text-decoration: none; color: inherit;">`
      : '<div>';
    const endWrapper = card.link ? '</a>' : '</div>';
    return `${wrapper}<div class="card" title="${card.desc}">
      <h2>${card.label}</h2>
      <p>${card.value}</p>
    </div>${endWrapper}`;
  }).join('');

  const content = `<section class="panel">
      <div class="panel-header"><h1>Resumen</h1></div>
      ${helpText}
      <div class="cards">
        ${cardHtml}
      </div>
    </section>`;

  return renderLayout({ title: 'Resumen', content, active: 'home' });
}

export function renderContactsPage({ contacts, query, offset, limit }) {
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
          { key: 'actions', label: 'Acciones', render: (row) => `<div class="row-actions">${renderCopyButton(row.phone, '📋')}</div>` }
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

  const content = `<section class="panel">
      <div class="panel-header">
        <h1>Contactos</h1>
        <form class="inline" method="get" action="/admin/contacts">
          <input type="text" name="q" placeholder="Buscar telefono o nombre" value="${escapeHtml(query || '')}" />
          <button type="submit">Buscar</button>
        </form>
      </div>
      ${helpText}
      ${tableContent}
      ${contacts.length > 0 ? renderPager({
        basePath: '/admin/contacts',
        query: { q: query || '' },
        offset,
        limit,
        hasNext: contacts.length === limit
      }) : ''}
    </section>`;

  return renderLayout({ title: 'Contactos', content, active: 'contacts' });
}

export function renderMessagesPage({ messages, direction, offset, limit }) {
  const helpText = renderHelpText(
    `<strong>Registro de mensajes:</strong> Todos los mensajes inbound (recibidos) y outbound (enviados).
    Los estados son: <strong>received</strong> (inbound recibido), <strong>queued</strong> (en cola),
    <strong>sent</strong> (enviado), <strong>delivered</strong> (entregado), <strong>failed</strong> (falló).
    Usa los filtros para ver solo inbound u outbound.`
  );

  const tableContent = messages.length > 0
    ? renderTable({
        columns: [
          { key: 'created_at', label: 'Fecha', render: (row) => escapeHtml(formatDate(row.created_at)) },
          { key: 'direction', label: 'Direccion', render: (row) => renderBadge(row.direction, statusTone(row.direction)) },
          { key: 'contact_phone', label: 'Telefono' },
          { key: 'contact_name', label: 'Nombre' },
          { key: 'campaign_name', label: 'Campana' },
          { key: 'status', label: 'Status', render: (row) => renderBadge(row.status || 'n/a', statusTone(row.status)) },
          { key: 'body', label: 'Contenido', render: (row) => `<span title="${escapeHtml(row.body || '')}">${escapeHtml(truncate(row.body || '', 80))}</span>` },
          { key: 'actions', label: 'Acciones', render: (row) => `<div class="row-actions">${row.body ? renderCopyButton(row.body, '📋') : ''}</div>` }
        ],
        rows: messages,
        searchable: true,
        sortable: true,
        tableId: 'messages-table'
      })
    : renderEmptyState({
        title: 'Sin mensajes',
        message: direction === 'inbound'
          ? 'Aún no hay mensajes inbound. Los mensajes aparecerán cuando los usuarios escriban al WhatsApp.'
          : direction === 'outbound'
            ? 'Aún no hay mensajes outbound. Se generan al enviar campañas.'
            : 'Aún no hay mensajes registrados en el sistema.',
        ctaText: 'Ver campañas',
        ctaLink: '/admin/campaigns'
      });

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
      ${helpText}
      ${tableContent}
      ${messages.length > 0 ? renderPager({
        basePath: '/admin/messages',
        query: { direction: direction || '' },
        offset,
        limit,
        hasNext: messages.length === limit
      }) : ''}
    </section>`;

  return renderLayout({ title: 'Mensajes', content, active: 'messages' });
}

export function renderCampaignsPage({ campaigns, offset, limit }) {
  const helpText = renderHelpText(
    `<strong>Gestión de campañas:</strong> Campañas de mensajería outbound. Los estados son:
    <strong>draft</strong> (borrador), <strong>active</strong> (en curso), <strong>completed</strong> (finalizada),
    <strong>cancelled</strong> (cancelada). Haz clic en el nombre para ver detalles y destinatarios.`
  );

  const tableContent = campaigns.length > 0
    ? renderTable({
        columns: [
          {
            key: 'name',
            label: 'Nombre',
            render: (row) => `<a href="/admin/campaigns/${row.id}" style="color: var(--accent); font-weight: 600;">${escapeHtml(row.name)}</a>`
          },
          { key: 'status', label: 'Status', render: (row) => renderBadge(row.status, statusTone(row.status)) },
          { key: 'category', label: 'Categoria' },
          { key: 'message_template', label: 'Mensaje', render: (row) => `<span title="${escapeHtml(row.message_template || '')}">${escapeHtml(truncate(row.message_template || '', 60))}</span>` },
          { key: 'recipients_total', label: 'Recipients' },
          { key: 'recipients_sent', label: 'Enviados' },
          { key: 'recipients_failed', label: 'Fallidos' },
          { key: 'recipients_skipped', label: 'Omitidos' },
          { key: 'created_at', label: 'Creada', render: (row) => escapeHtml(formatDate(row.created_at)) }
        ],
        rows: campaigns,
        searchable: true,
        sortable: true,
        tableId: 'campaigns-table'
      })
    : renderEmptyState({
        title: 'Sin campañas',
        message: 'Aún no hay campañas creadas. Las campañas se crean mediante scripts de envío (send-test.js).',
        ctaText: 'Ver documentación',
        ctaLink: '/admin'
      });

  const content = `<section class="panel">
      <div class="panel-header">
        <h1>Campanas</h1>
        <div class="muted">Total: ${campaigns.length}</div>
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
    </section>`;

  return renderLayout({ title: 'Campanas', content, active: 'campaigns' });
}

export function renderCampaignDetailPage({ campaign, recipients, offset, limit }) {
  const helpText = renderHelpText(
    `<strong>Detalle de campaña:</strong> Información completa de la campaña y sus destinatarios.
    Estados de recipients: <strong>pending</strong> (pendiente), <strong>sent</strong> (enviado),
    <strong>delivered</strong> (entregado), <strong>failed</strong> (falló), <strong>skipped</strong> (omitido).`
  );

  const header = `<section class="panel">
      <div class="panel-header">
        <h1>${escapeHtml(campaign.name)}</h1>
        ${renderBadge(campaign.status, statusTone(campaign.status))}
      </div>
      ${helpText}
      <div class="muted"><strong>Categoria:</strong> ${escapeHtml(campaign.category || 'n/a')}</div>
      <div class="muted"><strong>Creada:</strong> ${escapeHtml(formatDate(campaign.created_at))}</div>
      <div class="muted"><strong>Mensaje:</strong> ${escapeHtml(campaign.message_template || 'n/a')}</div>
    </section>`;

  const recipientsContent = recipients.length > 0
    ? renderTable({
        columns: [
          { key: 'phone', label: 'Telefono' },
          { key: 'contact_name', label: 'Nombre' },
          { key: 'status', label: 'Status', render: (row) => renderBadge(row.status, statusTone(row.status)) },
          { key: 'message_sid', label: 'Message ID' },
          { key: 'sent_at', label: 'Enviado', render: (row) => escapeHtml(formatDate(row.sent_at)) },
          { key: 'error_message', label: 'Error', render: (row) => escapeHtml(truncate(row.error_message || '', 50)) },
          { key: 'actions', label: 'Acciones', render: (row) => `<div class="row-actions">${renderCopyButton(row.phone, '📋')}</div>` }
        ],
        rows: recipients,
        searchable: true,
        sortable: true,
        tableId: 'recipients-table'
      })
    : renderEmptyState({
        title: 'Sin destinatarios',
        message: 'Esta campaña aún no tiene destinatarios asignados.',
        ctaText: 'Ver campañas',
        ctaLink: '/admin/campaigns'
      });

  const recipientsTable = `<section class="panel">
      <div class="panel-header">
        <h1>Recipients</h1>
        <div class="muted">Total: ${recipients.length}</div>
      </div>
      ${recipientsContent}
      ${recipients.length > 0 ? renderPager({
        basePath: `/admin/campaigns/${campaign.id}`,
        query: {},
        offset,
        limit,
        hasNext: recipients.length === limit
      }) : ''}
    </section>`;

  return renderLayout({
    title: `Campana ${campaign.id}`,
    content: `${header}${recipientsTable}`,
    active: 'campaigns'
  });
}

export function renderOptOutsPage({ optOuts, offset, limit }) {
  const helpText = renderHelpText(
    `<strong>Gestión de BAJA (Opt-outs):</strong> Usuarios que solicitaron no recibir más mensajes.
    Estos contactos están excluidos de futuras campañas automáticamente. Los motivos son:
    <strong>user_request</strong> (usuario pidió BAJA) o <strong>manual</strong> (añadido manualmente).`
  );

  const tableContent = optOuts.length > 0
    ? renderTable({
        columns: [
          { key: 'phone', label: 'Telefono' },
          { key: 'contact_name', label: 'Nombre' },
          { key: 'reason', label: 'Motivo', render: (row) => renderBadge(row.reason || 'user_request', 'warn') },
          { key: 'created_at', label: 'Fecha', render: (row) => escapeHtml(formatDate(row.created_at)) },
          { key: 'actions', label: 'Acciones', render: (row) => `<div class="row-actions">${renderCopyButton(row.phone, '📋')}</div>` }
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

  const content = `<section class="panel">
      <div class="panel-header">
        <h1>Opt-outs</h1>
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
    </section>`;

  return renderLayout({ title: 'Opt-outs', content, active: 'opt-outs' });
}
