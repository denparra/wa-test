import {
  escapeHtml,
  formatDate,
  renderBadge,
  renderCopyButton,
  renderEmptyState,
  renderHelpText, // Quick Win #9
  renderLayout,
  renderPager,
  renderTable,
  truncate
} from './render.js';

function statusTone(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'active' || text === 'sent' || text === 'delivered' || text === 'completed') {
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
    `<strong>Gestión de campañas:</strong> Campañas de mensajería outbound. Estados: draft, active, paused, completed, cancelled. 
        <a href="/admin/campaigns/new" class="action-btn" style="float: right; margin-top: -5px;">+ Nueva Campaña</a>`
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
        { key: 'type', label: 'Tipo' },
        { key: 'message_template', label: 'Mensaje', render: (row) => `<span title="${escapeHtml(row.message_template || '')}">${escapeHtml(truncate(row.message_template || '', 40))}</span>` },
        { key: 'recipients_total', label: 'Total' },
        { key: 'recipients_sent', label: 'Enviados' },
        { key: 'created_at', label: 'Creada', render: (row) => escapeHtml(formatDate(row.created_at)) },
        {
          key: 'actions',
          label: 'Acciones',
          render: (row) => {
            if (row.status === 'draft') return `<a href="/admin/campaigns/${row.id}/edit" class="action-btn">Editar</a>`;
            if (row.status === 'sending') return `<button onclick="pauseCampaign(${row.id})" class="action-btn">Pausar</button>`;
            if (row.status === 'paused') return `<button onclick="resumeCampaign(${row.id})" class="action-btn">Reanudar</button>`; // Resume logic usually implies update status to sending
            return '';
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
      <div class="panel-header">
        <h1>Campañas</h1>
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
    </section>
    <script>
    async function pauseCampaign(id) {
        if(!confirm('¿Pausar campaña?')) return;
        const res = await fetch('/admin/api/campaigns/'+id+'/pause', {method: 'POST'});
        if(res.ok) window.location.reload();
        else alert('Error al pausar');
    }
    // resume logic implementation pending in API, conceptually simple update
    </script>
    `;

  return renderLayout({ title: 'Campañas', content, active: 'campaigns' });
}

export function renderCampaignDetailPage({ campaign, recipients, offset, limit }) {
  const isDraft = campaign.status === 'draft';
  const isSending = campaign.status === 'sending' || campaign.status === 'active';

  // Progress bar calculation
  const total = campaign.total_recipients || 0;
  const sent = campaign.sent_count || 0; // Assuming sent_count is updated directly on campaign or sum from recipients
  // Note: In previous schema sent_count was added.
  const percent = total > 0 ? Math.round((sent / total) * 100) : 0;

  const progressBar = total > 0 ? `
    <div style="margin: 10px 0;">
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
            <span>Progreso: ${sent} / ${total}</span>
            <span>${percent}%</span>
        </div>
        <div style="background:#eee; border-radius:4px; height:8px; overflow:hidden;">
            <div style="background:var(--accent); width:${percent}%; height:100%;"></div>
        </div>
    </div>` : '';

  const actions = isDraft ? `
        <div style="margin-top: 15px; display:flex; gap:10px;">
            <a href="/admin/campaigns/${campaign.id}/edit" class="action-btn">Editar Configuración</a>
            <button onclick="openAssignModal()" class="action-btn">Asignar Destinatarios</button>
            <button onclick="startCampaign()" class="action-btn" style="background:var(--accent); color:white; border-color:var(--accent)">Iniciar Campaña</button>
        </div>
    ` : '';

  const pauseCancel = isSending ? `
        <div style="margin-top: 15px; display:flex; gap:10px;">
             <button onclick="pauseCampaign()" class="action-btn">Pausar</button>
             <button onclick="cancelCampaign()" class="action-btn" style="background:var(--bad); color:white;">Cancelar</button>
        </div>
    ` : '';

  const header = `<section class="panel">
      <div class="panel-header">
        <h1>${escapeHtml(campaign.name)}</h1>
        ${renderBadge(campaign.status, statusTone(campaign.status))}
      </div>
      <div class="muted"><strong>Tipo:</strong> ${escapeHtml(campaign.type)}</div>
      <div class="muted"><strong>Mensaje:</strong> ${escapeHtml(campaign.message_template || 'N/A')}</div>
      ${progressBar}
      ${actions}
      ${pauseCancel}
    </section>`;

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
      message: 'Esta campaña aún no tiene destinatarios asignados.',
      ctaText: isDraft ? 'Asignar ahora' : null,
      ctaLink: isDraft ? `javascript:openAssignModal()` : null
    });

  const script = `
    <script>
      async function startCampaign() {
          // Placeholder: in real world this calls an endpoint that triggers the sending process
          alert('Iniciar campaña: Esta funcionalidad requiere un "Campaign Runner" (Worker) corriendo en background. Por ahora marca la campaña como active.');
          // Just update status to 'active' for MVP via patch
          await fetch('/admin/api/campaigns/${campaign.id}', {
              method: 'PATCH',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({status: 'active'})
          });
          window.location.reload();
      }
      function openAssignModal() {
          const make = prompt('Filtrar por Marca (opcional):');
          const year = prompt('Filtrar por Año Mínimo (opcional):');
          // Simple prompt implementation for MVP
          fetch('/admin/api/campaigns/${campaign.id}/assign-recipients', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ filters: { make: make || null, yearMin: year || null } })
          }).then(res => res.json()).then(data => {
              alert('Asignados: ' + data.assigned);
              window.location.reload();
          });
      }
    </script>
    `;

  return renderLayout({
    title: `Campaña ${campaign.id}`,
    content: header + `<section class="panel"><h3>Destinatarios</h3>${recipientsContent}</section>` + script,
    active: 'campaigns'
  });
}

export function renderCampaignFormPage({ campaign = {} }) {
  const isNew = !campaign.id;
  const title = isNew ? 'Nueva Campaña' : 'Editar Campaña';
  const action = isNew ? 'Crear' : 'Guardar';

  const form = `
    <form id="campaignForm" class="panel">
        <div class="panel-header"><h1>${title}</h1></div>
        
        <div style="margin-bottom:15px;">
            <label style="display:block; font-weight:600; margin-bottom:5px;">Nombre</label>
            <input type="text" name="name" value="${escapeHtml(campaign.name || '')}" required style="width:100%;" />
        </div>

        <div style="margin-bottom:15px;">
            <label style="display:block; font-weight:600; margin-bottom:5px;">Plantilla de Mensaje</label>
            <textarea name="messageTemplate" rows="4" style="width:100%; border-radius:10px; border:1px solid var(--line); padding:10px;" required>${escapeHtml(campaign.message_template || '')}</textarea>
            <div class="muted" style="font-size:12px; margin-top:5px;">Variables disponibles: {{name}}, {{make}}, {{model}}</div>
        </div>
        
        <div style="margin-bottom:15px;">
             <label style="display:block; font-weight:600; margin-bottom:5px;">Tipo</label>
             <select name="type" style="width:100%;">
                 <option value="twilio_template" ${campaign.type === 'twilio_template' ? 'selected' : ''}>Twilio Template</option>
                 <option value="custom_message" ${campaign.type === 'custom_message' ? 'selected' : ''}>Mensaje Libre</option>
             </select>
        </div>

        <div style="margin-top:20px;">
            <button type="submit">${action}</button>
            <a href="/admin/campaigns" style="margin-left:10px; color:var(--muted); text-decoration:none;">Cancelar</a>
        </div>
    </form>
    <script>
    document.getElementById('campaignForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        
        const url = ${isNew ? "'/admin/api/campaigns'" : `'/admin/api/campaigns/${campaign.id}'`};
        const method = ${isNew ? "'POST'" : "'PATCH'"};
        
        const res = await fetch(url, {
            method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        
        if(res.ok) {
            window.location.href = '/admin/campaigns';
        } else {
            alert('Error al guardar');
        }
    });
    </script>
    `;

  return renderLayout({ title, content: form, active: 'campaigns' });
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
