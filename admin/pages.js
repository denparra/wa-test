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
        {
          key: 'actions', label: 'Acciones', render: (row) => `<div class="row-actions">
          <a href="/admin/contacts/${row.id}/edit" class="action-btn" title="Editar contacto">✏️</a>
          <button onclick="deleteContact(${row.id}, '${escapeHtml(row.phone)}')" class="action-btn" title="Eliminar contacto">🗑️</button>
          ${renderCopyButton(row.phone, '📋')}
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

  const content = `<section class="panel">
      <div class="panel-header">
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <h1>Contactos</h1>
          <a href="/admin/contacts/new" class="action-btn" style="background:var(--accent); color:white; border-color:var(--accent); padding:10px 20px; text-decoration:none;">+ Agregar Contacto</a>
        </div>
        <form class="inline" method="get" action="/admin/contacts" style="margin-top:10px;">
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
    </section>${script}`;

  return renderLayout({ title: 'Contactos', content, active: 'contacts' });
}

export function renderContactEditPage({ contact = null, error = null }) {
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
      ` : ''}

      <div style="margin-top:20px; display:flex; gap:10px;">
        <button type="submit">${action}</button>
        <a href="/admin/contacts" class="action-btn">Cancelar</a>
      </div>
    </form>
  `;

  return renderLayout({ title, content: form, active: 'contacts' });
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
            <option value="user_request" ${optOut?.reason === 'user_request' ? 'selected' : ''}>Solicitud de usuario (STOP/BAJA)</option>
            <option value="manual" ${optOut?.reason === 'manual' ? 'selected' : ''}>Manual (Admin)</option>
            <option value="complaint" ${optOut?.reason === 'complaint' ? 'selected' : ''}>Queja / Spam</option>
            <option value="invalid" ${optOut?.reason === 'invalid' ? 'selected' : ''}>Número inválido / Reciclado</option>
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
        { key: 'scheduled_at', label: 'Programada', render: (row) => escapeHtml(formatDate(row.scheduled_at || '')) },
        {
          key: 'actions',
          label: 'Acciones',
          render: (row) => {
            if (row.status === 'draft') {
              return `<a href="/admin/campaigns/${row.id}/edit" class="action-btn">Editar</a>
                      <button onclick="deleteCampaign(${row.id})" class="action-btn">Eliminar</button>`;
            }
            if (row.status === 'scheduled') {
              return `<button onclick="cancelCampaign(${row.id})" class="action-btn">Cancelar</button>`;
            }
            if (row.status === 'sending') {
              return `<button onclick="pauseCampaign(${row.id})" class="action-btn">Pausar</button>`;
            }
            if (row.status === 'paused') {
              return `<button onclick="resumeCampaign(${row.id})" class="action-btn">Reanudar</button>
                      <button onclick="cancelCampaign(${row.id})" class="action-btn">Cancelar</button>`;
            }
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

export function renderCampaignFormPage({ campaign = {} }) {
  const isNew = !campaign.id;
  const title = isNew ? 'Nueva Campaña' : 'Editar Campaña';
  const action = isNew ? 'Crear' : 'Guardar';

  const scheduledValue = formatDateTimeLocal(campaign.scheduled_at || '');

  const form = `
    <form id="campaignForm" class="panel">
        <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
             <h1>${title}</h1>
             <div id="campaign-clock" style="font-family:monospace; font-size:1.2rem; font-weight:bold; color:var(--accent);">--:--:--</div>
        </div>
        <div id="campaignFormError" class="muted" style="color:var(--bad); margin-bottom:10px;"></div>
        
        <div style="margin-bottom:15px;">
            <label style="display:block; font-weight:600; margin-bottom:5px;">Nombre</label>
            <input type="text" name="name" value="${escapeHtml(campaign.name || '')}" required style="width:100%;" />
        </div>

        <div style="margin-bottom:15px;">
            <label style="display:block; font-weight:600; margin-bottom:5px;">Plantilla de Mensaje (Content SID)</label>
            <input type="text" name="contentSid" value="${escapeHtml(campaign.content_sid || '')}" style="width:100%;" />
            <div class="muted" style="font-size:12px; margin-top:5px;">Pega el CONTENT_SID aprobado por Twilio. Deja vacio si usas mensaje libre.</div>
        </div>

        <div style="margin-bottom:15px;">
            <label style="display:block; font-weight:600; margin-bottom:5px;">Mensaje (body libre)</label>
            <textarea name="messageTemplate" rows="4" style="width:100%; border-radius:10px; border:1px solid var(--line); padding:10px;">${escapeHtml(campaign.message_template || '')}</textarea>
            <div class="muted" style="font-size:12px; margin-top:5px;">Variables disponibles: {{name}}, {{make}}, {{model}}</div>
        </div>
        
        <div style="margin-bottom:15px;">
             <label style="display:block; font-weight:600; margin-bottom:5px;">Tipo</label>
            <select name="type" style="width:100%;">
                <option value="twilio_template"${campaign.type === 'twilio_template' || !campaign.type ? ' selected' : ''}>Twilio Template</option>
            </select>
        </div>

        <div style="margin-bottom:15px;">
            <label style="display:block; font-weight:600; margin-bottom:5px;">Programar envio</label>
            <input type="datetime-local" name="scheduledAt" value="${escapeHtml(scheduledValue)}" style="width:100%;" />
            <div class="muted" style="font-size:12px; margin-top:5px;">Dejar vacio para iniciar manualmente.</div>
        </div>

        <div style="margin-bottom:15px;">
            <label style="display:block; font-weight:600; margin-bottom:5px;">Preview (1-3 destinatarios)</label>
            <div class="muted" style="font-size:12px; margin-top:5px;">Usa datos reales segun la fuente seleccionada.</div>
            <div class="inline" style="margin-top:8px;">
                <label for="previewSource" class="muted">Fuente:</label>
                <select id="previewSource">
                    <option value="vehicles">Por vehiculos</option>
                    <option value="contacts">Por contactos</option>
                </select>
                <button type="button" id="previewBtn">Previsualizar</button>
            </div>
            <div id="previewVehicleFilters" style="margin-top:10px;">
                <div class="inline">
                    <input type="text" id="previewMake" placeholder="Marca (opcional)" />
                    <input type="text" id="previewModel" placeholder="Modelo (opcional)" />
                    <input type="number" id="previewYearMin" placeholder="Ano min" />
                    <input type="number" id="previewYearMax" placeholder="Ano max" />
                </div>
            </div>
            <div id="previewContactFilters" class="hidden" style="margin-top:10px;">
                <div class="inline">
                    <input type="text" id="previewQuery" placeholder="Telefono o nombre" />
                </div>
            </div>
            <div id="previewResults" class="muted" style="margin-top:8px;"></div>
        </div>

        <div style="margin-bottom:15px;">
            <label style="display:flex; align-items:center; gap:8px; font-weight:600;">
                <input type="checkbox" id="testModeToggle" />
                Modo Test (seleccion manual)
            </label>
            <div class="muted" style="font-size:12px; margin-top:5px;">Previsualiza contactos y envia solo a los seleccionados.</div>
            <div id="testModePanel" class="hidden" style="margin-top:10px;">
                <div class="inline" style="margin-bottom:8px;">
                    <input type="text" id="testQuery" placeholder="Telefono o nombre" />
                    <button type="button" id="testPreviewBtn">Previsualizar</button>
                    <button type="button" id="testSendBtn">Enviar a seleccionados</button>
                </div>
                <div id="testModeHint" class="muted" style="font-size:12px; margin-bottom:6px;"></div>
                <div id="testContactsWrapper"></div>
            </div>
        </div>

        <div style="margin-bottom:15px; padding:15px; border:2px solid var(--accent); border-radius:10px; background:#f8f5f1;">
            <h3 style="margin-top:0;">Destinatarios para campaña programada</h3>
            <div class="muted" style="margin-bottom:10px;">
                ⚠️ <strong>Importante:</strong> Si programas el envío, debes asignar destinatarios AHORA.
                De lo contrario, la campaña se completará sin enviar mensajes.
            </div>

            <div class="inline" style="margin-bottom:10px;">
                <label for="recipientSource" class="muted">Fuente:</label>
                <select id="recipientSource">
                    <option value="">No asignar ahora (crear como draft)</option>
                    <option value="vehicles">Por vehiculos</option>
                    <option value="contacts">Por contactos</option>
                </select>
                <button type="button" id="loadRecipientsBtn">Cargar destinatarios</button>
            </div>

            <div id="recipientVehicleFilters" class="hidden" style="margin-top:10px;">
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

            <div id="recipientCount" class="muted" style="margin-top:10px;"></div>
            <div id="recipientPreview" style="margin-top:10px; max-height:200px; overflow-y:auto;"></div>
        </div>

        <div style="margin-top:20px;">
            <button type="submit">${action}</button>
            <a href="/admin/campaigns" style="margin-left:10px; color:var(--muted); text-decoration:none;">Cancelar</a>
        </div>
    </form>
    <script>
    console.log('Campaign form script loaded');

    function updateClock() {
        const clock = document.getElementById('campaign-clock');
        if (clock) {
            const now = new Date();
            clock.textContent = now.toLocaleTimeString('es-CL');
        }
    }
    setInterval(updateClock, 1000);
    updateClock();

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function maskPhone(phone) {
        const text = String(phone || '');
        if (text.length <= 4) return text;
        const visible = text.slice(-4);
        return text.slice(0, -4).replace(/\d/g, '*') + visible;
    }

    const campaignId = ${campaign.id ? Number(campaign.id) : 'null'};
    console.log('Campaign ID:', campaignId);

    function setFormError(message) {
        const errorEl = document.getElementById('campaignFormError');
        if (!errorEl) return;
        errorEl.textContent = message || '';
    }

    function setTestHint(message, isError = false) {
        const hint = document.getElementById('testModeHint');
        if (!hint) return;
        hint.textContent = message || '';
        hint.style.color = isError ? 'var(--bad)' : 'var(--muted)';
    }

    function togglePreviewFilters() {
        const sourceEl = document.getElementById('previewSource');
        if (!sourceEl) return;
        const vehicleFilters = document.getElementById('previewVehicleFilters');
        const contactFilters = document.getElementById('previewContactFilters');
        if (sourceEl.value === 'contacts') {
            if (vehicleFilters) vehicleFilters.classList.add('hidden');
            if (contactFilters) contactFilters.classList.remove('hidden');
        } else {
            if (vehicleFilters) vehicleFilters.classList.remove('hidden');
            if (contactFilters) contactFilters.classList.add('hidden');
        }
    }

    async function runPreview() {
        const results = document.getElementById('previewResults');
        if (!results) return;
        const template = document.querySelector('textarea[name="messageTemplate"]')?.value?.trim() || '';
        if (!template) {
            results.textContent = 'Ingresa un mensaje libre para previsualizar.';
            return;
        }

        const source = document.getElementById('previewSource')?.value || 'vehicles';
        const filters = {};
        if (source === 'contacts') {
            filters.query = document.getElementById('previewQuery')?.value?.trim() || '';
        } else {
            const make = document.getElementById('previewMake')?.value?.trim() || null;
            const model = document.getElementById('previewModel')?.value?.trim() || null;
            const yearMinRaw = document.getElementById('previewYearMin')?.value || '';
            const yearMaxRaw = document.getElementById('previewYearMax')?.value || '';
            const yearMin = yearMinRaw ? Number(yearMinRaw) : null;
            const yearMax = yearMaxRaw ? Number(yearMaxRaw) : null;
            filters.make = make || null;
            filters.model = model || null;
            filters.yearMin = Number.isNaN(yearMin) ? null : yearMin;
            filters.yearMax = Number.isNaN(yearMax) ? null : yearMax;
        }

        const res = await fetch('/admin/api/campaigns/preview-samples', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source, filters, limit: 3 })
        });

        if (!res.ok) {
            results.textContent = 'Error al cargar ejemplos.';
            return;
        }

        const data = await res.json();
        const samples = data.samples || [];
        if (!samples.length) {
            results.textContent = 'No hay destinatarios para previsualizar.';
            return;
        }

        const previews = [];
        for (const sample of samples) {
            const previewRes = await fetch('/admin/api/campaigns/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template, variableSource: sample })
            });
            const previewData = await previewRes.json();
            previews.push({ sample, preview: previewData.preview || '' });
        }

        results.innerHTML = previews.map((item) => {
            const phone = maskPhone(item.sample.phone || '');
            return '<div style="margin-top:6px;"><strong>' + escapeHtml(phone) + '</strong> ' + escapeHtml(item.preview) + '</div>';
        }).join('');
    }

    function toggleTestMode() {
        console.log('toggleTestMode called');
        const panel = document.getElementById('testModePanel');
        const toggle = document.getElementById('testModeToggle');
        console.log('Test mode panel:', panel, 'toggle:', toggle);
        if (!panel || !toggle) {
            console.error('Panel or toggle not found');
            return;
        }
        console.log('Toggle checked:', toggle.checked);
        if (toggle.checked) {
            panel.classList.remove('hidden');
            console.log('Panel shown, campaignId:', campaignId);

            // Disable send button if campaign not saved
            const sendBtn = document.getElementById('testSendBtn');
            if (sendBtn) {
                if (!campaignId) {
                    sendBtn.disabled = true;
                    sendBtn.style.opacity = '0.5';
                    sendBtn.style.cursor = 'not-allowed';
                    sendBtn.title = 'Debes guardar la campaña primero';
                } else {
                    sendBtn.disabled = false;
                    sendBtn.style.opacity = '1';
                    sendBtn.style.cursor = 'pointer';
                    sendBtn.title = 'Enviar mensajes a contactos seleccionados';
                }
            }

            if (!campaignId) {
                setTestHint('⚠️ Para enviar mensajes de prueba, primero guarda la campaña haciendo clic en "Crear" abajo. Puedes previsualizar contactos ahora.', true);
            } else {
                setTestHint('Puedes previsualizar y enviar mensajes a los contactos seleccionados.', false);
            }
        } else {
            panel.classList.add('hidden');
            setTestHint('');
        }
    }

    function renderTestContacts(contacts = []) {
        const wrapper = document.getElementById('testContactsWrapper');
        if (!wrapper) return;
        if (!contacts.length) {
            wrapper.textContent = 'No hay contactos para mostrar.';
            return;
        }
        const rows = contacts.map((contact) => {
            return '<tr>'
                + '<td><input type="checkbox" class="test-contact" data-contact-id="' + contact.id + '" /></td>'
                + '<td>' + escapeHtml(contact.phone || '') + '</td>'
                + '<td>' + escapeHtml(contact.name || '') + '</td>'
                + '<td>' + escapeHtml(contact.status || '') + '</td>'
                + '</tr>';
        }).join('');
        wrapper.innerHTML = ''
            + '<table id="testContactsTable">'
            + '  <thead>'
            + '    <tr>'
            + '      <th><input type="checkbox" id="selectAllContacts" /></th>'
            + '      <th>Telefono</th>'
            + '      <th>Nombre</th>'
            + '      <th>Status</th>'
            + '    </tr>'
            + '  </thead>'
            + '  <tbody>' + rows + '</tbody>'
            + '</table>';
        const selectAll = document.getElementById('selectAllContacts');
        if (selectAll) {
            selectAll.addEventListener('change', (e) => {
                const checked = e.target.checked;
                document.querySelectorAll('.test-contact').forEach((input) => {
                    input.checked = checked;
                });
            });
        }
    }

    function getSelectedContactIds() {
        const selected = [];
        document.querySelectorAll('.test-contact:checked').forEach((input) => {
            const id = Number(input.dataset.contactId);
            if (Number.isInteger(id)) {
                selected.push(id);
            }
        });
        return selected;
    }

    async function loadTestContacts() {
        const wrapper = document.getElementById('testContactsWrapper');
        if (!wrapper) return;
        const query = document.getElementById('testQuery')?.value?.trim() || '';
        wrapper.textContent = 'Cargando contactos...';
        try {
            const res = await fetch('/admin/api/contacts?q=' + encodeURIComponent(query) + '&limit=200');
            if (!res.ok) {
                const errorText = await res.text();
                wrapper.textContent = 'Error al cargar contactos: ' + (errorText || res.statusText);
                console.error('Failed to load contacts:', res.status, errorText);
                return;
            }
            const data = await res.json();
            renderTestContacts(data.contacts || []);
        } catch (error) {
            wrapper.textContent = 'Error de conexion: ' + error.message;
            console.error('Error loading contacts:', error);
        }
    }

    async function sendTestSelection() {
        console.log('sendTestSelection called, campaignId:', campaignId);
        if (!campaignId) {
            const message = \`Debes guardar la campaña primero antes de enviar mensajes de prueba.

1. Haz clic en "Crear" al final del formulario
2. Luego edita la campaña guardada
3. Entonces podrás usar el modo test\`;
            alert(message);
            setTestHint('Guarda la campana primero haciendo clic en "Crear" abajo.', true);
            console.log('Cannot send: campaign not saved yet');
            return;
        }
        const selected = getSelectedContactIds();
        console.log('Selected contact IDs:', selected);
        if (!selected.length) {
            setTestHint('Selecciona al menos un contacto.', true);
            return;
        }
        setTestHint('Enviando...', false);
        try {
            const url = '/admin/api/campaigns/' + campaignId + '/test-send';
            console.log('Sending test to:', url, 'with contactIds:', selected);
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contactIds: selected })
            });
            console.log('Response status:', res.status);
            if (!res.ok) {
                const errorText = await res.text();
                console.error('Error sending test:', res.status, errorText);
                setTestHint('Error al enviar: ' + (errorText || res.statusText), true);
                return;
            }
            const data = await res.json();
            console.log('Send result:', data);
            setTestHint('Enviados: ' + (data.sent || 0) + ' | Omitidos: ' + (data.skipped || 0) + ' | Fallidos: ' + (data.failed || 0), false);
        } catch (error) {
            console.error('Exception sending test:', error);
            setTestHint('Error de conexion: ' + error.message, true);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOMContentLoaded fired');

        // Form submit handler
        const campaignForm = document.getElementById('campaignForm');
        console.log('Campaign form element:', campaignForm);
        if (campaignForm) {
            campaignForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                setFormError('');
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());
                const messageTemplate = String(data.messageTemplate || '').trim();
                const contentSid = String(data.contentSid || '').trim();
                if (!messageTemplate && !contentSid) {
                    setFormError('Debes ingresar Content SID o mensaje libre.');
                    return;
                }

                // Validate recipients for scheduled campaigns
                if (data.scheduledAt && (!window.selectedRecipients || window.selectedRecipients.length === 0)) {
                    if (!confirm('⚠️ ADVERTENCIA: Estás programando una campaña SIN destinatarios.\\n\\n' +
                                 'La campaña se completará automáticamente sin enviar mensajes.\\n\\n' +
                                 '¿Deseas continuar de todos modos?')) {
                        return;
                    }
                }

                // Include recipient IDs in payload
                if (window.selectedRecipients && window.selectedRecipients.length > 0) {
                    data.recipientIds = window.selectedRecipients.map(r => r.id);
                }

                let url, method;
                if (${isNew ? 'true' : 'false'}) {
                    url = '/admin/api/campaigns';
                    method = 'POST';
                } else {
                    url = '/admin/api/campaigns/' + ${campaign.id ? campaign.id : 'null'};
                    method = 'PATCH';
                }

                const res = await fetch(url, {
                    method,
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(data)
                });

                if(res.ok) {
                    window.location.href = '/admin/campaigns';
                } else {
                    setFormError('Error al guardar.');
                }
            });
        }

        // Preview source toggle
        const sourceEl = document.getElementById('previewSource');
        if (sourceEl) {
            sourceEl.addEventListener('change', togglePreviewFilters);
            togglePreviewFilters();
        }

        // Preview button
        const previewBtn = document.getElementById('previewBtn');
        if (previewBtn) previewBtn.addEventListener('click', runPreview);

        // Recipient assignment handlers
        const recipientSourceEl = document.getElementById('recipientSource');
        if (recipientSourceEl) {
            recipientSourceEl.addEventListener('change', () => {
                const source = recipientSourceEl.value;
                const vehicleFilters = document.getElementById('recipientVehicleFilters');
                const contactFilters = document.getElementById('recipientContactFilters');

                if (source === 'vehicles') {
                    vehicleFilters?.classList.remove('hidden');
                    contactFilters?.classList.add('hidden');
                } else if (source === 'contacts') {
                    vehicleFilters?.classList.add('hidden');
                    contactFilters?.classList.remove('hidden');
                } else {
                    vehicleFilters?.classList.add('hidden');
                    contactFilters?.classList.add('hidden');
                }

                // Clear preview
                document.getElementById('recipientCount').textContent = '';
                document.getElementById('recipientPreview').innerHTML = '';
            });
        }

        const loadRecipientsBtn = document.getElementById('loadRecipientsBtn');
        if (loadRecipientsBtn) {
            loadRecipientsBtn.addEventListener('click', async () => {
                const source = document.getElementById('recipientSource')?.value;
                if (!source) {
                    alert('Selecciona una fuente de destinatarios');
                    return;
                }

                const filters = {};
                if (source === 'contacts') {
                    filters.query = document.getElementById('filterQuery')?.value?.trim() || '';
                } else {
                    filters.make = document.getElementById('filterMake')?.value?.trim() || null;
                    filters.model = document.getElementById('filterModel')?.value?.trim() || null;
                    filters.yearMin = document.getElementById('filterYearMin')?.value || null;
                    filters.yearMax = document.getElementById('filterYearMax')?.value || null;
                }

                try {
                    const res = await fetch('/admin/api/campaigns/preview-samples', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ source, filters, limit: 100 })
                    });

                    if (!res.ok) {
                        alert('Error al cargar destinatarios');
                        return;
                    }

                    const data = await res.json();
                    const recipients = data.samples || [];

                    document.getElementById('recipientCount').textContent =
                        recipients.length + ' destinatarios encontrados';

                    // Show preview
                    const previewHtml = recipients.slice(0, 10).map(r =>
                        '<div style="padding:4px; border-bottom:1px solid #eee;">' +
                            maskPhone(r.phone) + ' - ' + escapeHtml(r.name || 'Sin nombre') +
                        '</div>'
                    ).join('');

                    document.getElementById('recipientPreview').innerHTML =
                        previewHtml +
                        (recipients.length > 10 ? '<div class="muted" style="padding:8px;">...y ' + (recipients.length - 10) + ' más</div>' : '');

                    // Save recipients to global variable for submit
                    window.selectedRecipients = recipients;

                } catch (error) {
                    alert('Error: ' + error.message);
                }
            });
        }

        // Test mode toggle
        const testToggle = document.getElementById('testModeToggle');
        if (testToggle) {
            testToggle.addEventListener('change', toggleTestMode);
        }

        // Test preview button
        const testPreviewBtn = document.getElementById('testPreviewBtn');
        console.log('Test preview button element:', testPreviewBtn);
        if (testPreviewBtn) {
            console.log('Attaching click listener to test preview button');
            testPreviewBtn.addEventListener('click', () => {
                console.log('Test preview button clicked!');
                loadTestContacts();
            });
        }

        // Test send button
        const testSendBtn = document.getElementById('testSendBtn');
        console.log('Test send button element:', testSendBtn);
        if (testSendBtn) {
            console.log('Attaching click listener to test send button');
            testSendBtn.addEventListener('click', () => {
                console.log('Test send button clicked!');
                sendTestSelection();
            });
        } else {
            console.error('Test send button NOT FOUND in DOM');
        }
    });
</script>
    `;

  return renderLayout({ title, content: form, active: 'campaigns' });
}

export function renderOptOutsPage({ optOuts, offset, limit }) {
  const helpText = renderHelpText(
    `<strong>Gestión de Bajas (Opt-outs):</strong> Usuarios que solicitaron no recibir más mensajes.
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
        {
          key: 'actions', label: 'Acciones', render: (row) => `<div class="row-actions">
            <a href="/admin/opt-outs/${encodeURIComponent(row.phone)}/edit" class="action-btn" title="Editar razón">✏️</a>
            <button onclick="deleteOptOut('${escapeHtml(row.phone)}')" class="action-btn" title="Eliminar (Reactivar)">🗑️</button>
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
    </script>
  `;

  const content = `<section class="panel">
      <div class="panel-header">
        <h1>Opt-outs</h1>
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
    </section>${script}`;

  return renderLayout({ title: 'Opt-outs', content, active: 'opt-outs' });
}

export function renderImportPage({ preview = null, result = null }) {
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

  const content = `
    <section class="panel">
      <div class="panel-header"><h1>Importar Contactos desde CSV</h1></div>
      ${helpText}
    </section>
    ${uploadForm}
    ${previewSection}
    ${resultSection}
  `;

  return renderLayout({ title: 'Importar', content, active: 'import' });
}

// ============================================================
// Phase 1: Campaign Follow-Up Tracking Pages
// ============================================================

export function renderCampaignFollowUpPage({ campaign, stats, recipients, offset, limit }) {
  const kpisHtml = `
    <div class="panel">
      <div class="panel-header">
        <h1>📊 Seguimiento: ${escapeHtml(campaign.name)}</h1>
        <a href="/admin/campaigns/${campaign.id}" class="action-btn">← Volver a Campaña</a>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 1rem 0;">
        <div style="background: #f8f9fa; padding: 1rem; border-radius: 4px;">
          <div style="font-size: 0.875rem; color: #6c757d;">Total Recipients</div>
          <div style="font-size: 1.5rem; font-weight: bold;">${stats.total_recipients || 0}</div>
        </div>
        <div style="background: #d4edda; padding: 1rem; border-radius: 4px;">
          <div style="font-size: 0.875rem; color: #155724;">✅ Enviados OK</div>
          <div style="font-size: 1.5rem; font-weight: bold;">${stats.sent_ok || 0} (${stats.sent_ok ? ((stats.sent_ok / stats.total_recipients) * 100).toFixed(1) : 0}%)</div>
        </div>
        <div style="background: #f8d7da; padding: 1rem; border-radius: 4px;">
          <div style="font-size: 0.875rem; color: #721c24;">❌ Fallidos</div>
          <div style="font-size: 1.5rem; font-weight: bold;">${stats.failed || 0} (${stats.failed ? ((stats.failed / stats.total_recipients) * 100).toFixed(1) : 0}%)</div>
        </div>
        <div style="background: #d1ecf1; padding: 1rem; border-radius: 4px;">
          <div style="font-size: 0.875rem; color: #0c5460;">💬 Replies Recibidos</div>
          <div style="font-size: 1.5rem; font-weight: bold;">${stats.total_replies || 0}</div>
        </div>
        <div style="background: #fff3cd; padding: 1rem; border-radius: 4px;">
          <div style="font-size: 0.875rem; color: #856404;">⏱️ Respuesta 24h</div>
          <div style="font-size: 1.5rem; font-weight: bold;">${stats.replies_24h || 0} (${stats.sent_ok ? ((stats.replies_24h / stats.sent_ok) * 100).toFixed(1) : 0}%)</div>
        </div>
        <div style="background: #e2e3e5; padding: 1rem; border-radius: 4px;">
          <div style="font-size: 0.875rem; color: #383d41;">📈 Respuesta 7d</div>
          <div style="font-size: 1.5rem; font-weight: bold;">${stats.recipients_with_replies || 0} (${stats.sent_ok ? ((stats.recipients_with_replies / stats.sent_ok) * 100).toFixed(1) : 0}%)</div>
        </div>
      </div>
      ${stats.last_reply_at ? `<p style="margin: 0.5rem 0; color: #6c757d; font-size: 0.875rem;">Último reply: ${formatDate(stats.last_reply_at)}</p>` : ''}
    </div>
  `;

  const recipientsTable = recipients.length > 0
    ? renderTable({
      columns: [
        { key: 'phone', label: 'Teléfono' },
        { key: 'contact_name', label: 'Nombre', render: (row) => escapeHtml(row.contact_name || '-') },
        { key: 'send_status', label: 'Estado Envío', render: (row) => renderBadge(row.send_status, statusTone(row.send_status)) },
        { key: 'sent_at', label: 'Fecha Envío', render: (row) => escapeHtml(formatDate(row.sent_at)) },
        { key: 'total_replies', label: '# Replies', render: (row) => `<strong>${row.total_replies || 0}</strong>` },
        { key: 'last_reply_at', label: 'Último Reply', render: (row) => escapeHtml(row.last_reply_at ? formatDate(row.last_reply_at) : '-') },
        { key: 'last_reply_preview', label: 'Preview', render: (row) => escapeHtml(truncate(row.last_reply_preview || '', 40)) },
        { key: 'actions', label: 'Acciones', render: (row) => `<a href="/admin/campaigns/${campaign.id}/conversation/${encodeURIComponent(row.phone)}" class="action-btn">💬 Ver</a>` }
      ],
      rows: recipients,
      searchable: true,
      sortable: true,
      tableId: 'follow-up-table'
    })
    : renderEmptyState({
      title: 'Sin destinatarios',
      message: 'Esta campaña aún no tiene destinatarios asignados.'
    });

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
  `;

  return renderLayout({ title: `Seguimiento - ${campaign.name}`, content, active: 'campaigns' });
}

export function renderConversationPage({ campaign, phone, contactName, messages }) {
  const messagesHtml = messages.length > 0
    ? messages.map(msg => {
      const isOutbound = msg.direction === 'outbound';
      const alignment = isOutbound ? 'left' : 'right';
      const bgColor = isOutbound ? '#e3f2fd' : '#f1f8e9';
      const label = isOutbound ? '📤 ENVIADO POR SISTEMA' : '💬 RECIBIDO DEL CONTACTO';

      return `
        <div style="margin: 1.5rem 0; text-align: ${alignment};">
          <div style="font-size: 0.75rem; color: #6c757d; margin-bottom: 0.25rem;">${label}</div>
          <div style="font-size: 0.75rem; color: #6c757d; margin-bottom: 0.5rem;">${formatDate(msg.created_at)}</div>
          <div style="display: inline-block; max-width: 70%; text-align: left; background: ${bgColor}; padding: 1rem; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
            <div style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(msg.body || '')}</div>
          </div>
          ${isOutbound && msg.status ? `<div style="font-size: 0.75rem; color: #6c757d; margin-top: 0.25rem;">Estado: ${renderBadge(msg.status, statusTone(msg.status))} ${msg.message_sid ? `| SID: ${escapeHtml(msg.message_sid.substring(0, 15))}...` : ''}</div>` : ''}
        </div>
      `;
    }).join('')
    : renderEmptyState({
      title: 'Sin mensajes',
      message: 'No hay mensajes en esta conversación.'
    });

  const content = `
    <div class="panel">
      <div class="panel-header">
        <h1>💬 Conversación con ${escapeHtml(phone)} ${contactName ? `(${escapeHtml(contactName)})` : ''}</h1>
        <a href="/admin/campaigns/${campaign.id}/seguimiento" class="action-btn">← Volver a Seguimiento</a>
      </div>
      <div style="background: #f8f9fa; padding: 0.75rem 1rem; border-radius: 4px; margin-bottom: 1rem;">
        <strong>Campaña:</strong> ${escapeHtml(campaign.name)}
      </div>
      <div style="background: white; padding: 1rem; border-radius: 4px; min-height: 300px;">
        ${messagesHtml}
      </div>
    </div>
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
        <a href="/admin/templates/new" class="action-btn" style="background:var(--accent); color:white; border-color:var(--accent); padding:10px 20px; text-decoration:none;">+ Nueva Plantilla</a>
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



