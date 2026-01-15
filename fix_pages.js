import fs from 'fs';

const filePath = 'admin/pages.js';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Lines to remove: 1142 to 1285 (1-based) -> 1141 to 1284 (0-based)
// But to be safe, we look for the start and end markers.

const startMarker = "// Phase 1: Campaign Follow-Up Page";
const endMarker = "    return renderLayout('Seguimiento: ' + campaign.name, `";
// Actually the end is the closing brace of the function.

let startIndex = -1;
let endIndex = -1;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(startMarker)) {
        startIndex = i;
    }
    // We look for the closing brace of the function. 
    // Based on my view, it ends at line 1285. 
    // The line 1285 contains just '}' indented.
    // And 1286 starts '    function toggleTestMode() {'
    if (startIndex !== -1 && i > startIndex && lines[i].trim() === '}' && lines[i + 1] && lines[i + 1].trim().startsWith('function toggleTestMode')) {
        endIndex = i;
        break;
    }
    // Fallback detection
    if (startIndex !== -1 && i > startIndex && lines[i].trim() === '}' && i == 1284) { // Line 1285 1-based is index 1284
        endIndex = i;
        break;
    }
}

if (startIndex === -1 || endIndex === -1) {
    console.error('Could not find block to remove', startIndex, endIndex);
    process.exit(1);
}

console.log(`Removing lines ${startIndex + 1} to ${endIndex + 1}`);
lines.splice(startIndex, endIndex - startIndex + 1);

// Append the function at the end
const newFunction = `
// Phase 1: Campaign Follow-Up Page
export function renderCampaignFollowUpPage(data) {
    const { campaign, stats, recipients, limit, offset } = data;

    // Helper to calculate percentages
    const calcPct = (val, total) => {
        if (!total) return '0%';
        return Math.round((val / total) * 100) + '%';
    };

    // Calculate failure rate for alert
    const failRate = stats.total_recipients > 0 ? (stats.failed / stats.total_recipients) * 100 : 0;
    const isHighFailure = failRate > 10;

    const rows = recipients.map(r => {
        const replyCount = r.reply_count || 0;
        const lastReply = r.last_reply_at ? new Date(r.last_reply_at).toLocaleString('es-CL') : '-';
        const sentAt = r.sent_at ? new Date(r.sent_at).toLocaleString('es-CL') : (r.status === 'pending' ? 'Pendiente' : '-');
        
        // Fix: Use simple strings for badge status/classes to avoid nested backtick issues if any
        let statusBadge = '<span class="badge badge-secondary">' + r.status + '</span>';
        if (r.status === 'sent') statusBadge = '<span class="badge badge-primary">Enviado</span>';
        if (r.status === 'delivered') statusBadge = '<span class="badge badge-success">Entregado</span>';
        if (r.status === 'failed') statusBadge = '<span class="badge badge-danger">Fallido</span>';
        if (r.status === 'skipped') statusBadge = '<span class="badge badge-warning">Omitido</span>';

        return \`
        <tr>
            <td>\${r.phone}</td>
            <td>\${r.name || '-'}</td>
            <td>\${statusBadge}</td>
            <td>\${sentAt}</td>
            <td style="text-align:center;">\${replyCount > 0 ? \`<span class="badge badge-success">\${replyCount}</span>\` : '0'}</td>
            <td>\${lastReply}</td>
            <td>
                <a href="/admin/campaigns/\${campaign.id}/conversation/\${encodeURIComponent(r.phone)}" class="action-btn">💬 Ver</a>
            </td>
        </tr>
        \`;
    }).join('');

    // Pagination logic
    const prevOffset = Math.max(0, offset - limit);
    const nextOffset = offset + limit;
    const hasMore = recipients.length === limit; 

    // Note: renderLayout is imported from render.js
    // We assume this code is appended at the end of module, so it has access to imports.
    
    // We use concatenated strings to avoid nested backtick hell if possible, 
    // but here we are at top level so backticks are fine.
    
    return renderLayout('Seguimiento: ' + campaign.name, \`
        <div class="header-actions">
            <h1>📊 Seguimiento: \${campaign.name}</h1>
            <a href="/admin/campaigns/\${campaign.id}" class="action-btn">← Volver a Campaña</a>
        </div>

        <div id="failureAlert" style="display: \${isHighFailure ? 'block' : 'none'}; background: #ffebee; color: #c62828; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #ef9a9a;">
            <strong>⚠️ Alerta: Tasa de fallo alta detectada (\${failRate.toFixed(1)}%)</strong>. Revisa los mensajes fallidos para diagnosticar problemas.
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <h3>Total Destinatarios</h3>
                <div class="stat-value" id="kpi-total">\${stats.total_recipients}</div>
            </div>
            <div class="stat-card success">
                <h3>Enviados OK</h3>
                <div class="stat-value" id="kpi-sent-ok">\${stats.sent_ok}</div>
                <div class="stat-sub" id="kpi-sent-pct">\${calcPct(stats.sent_ok, stats.total_recipients)}</div>
            </div>
            <div class="stat-card danger">
                <h3>Fallidos</h3>
                <div class="stat-value" id="kpi-failed">\${stats.failed}</div>
                <div class="stat-sub" id="kpi-failed-pct">\${calcPct(stats.failed, stats.total_recipients)}</div>
            </div>
            <div class="stat-card info">
                <h3>Replies Recibidos</h3>
                <div class="stat-value" id="kpi-replies">\${stats.replies_received}</div>
            </div>
            <div class="stat-card">
                <h3>Respuesta 24h</h3>
                 <div class="stat-value" id="kpi-response-24h">\${stats.response_rate_24h}</div>
                 <div class="stat-sub" id="kpi-response-24h-pct">\${calcPct(stats.response_rate_24h, stats.sent_ok)}</div>
            </div>
        </div>

        <div class="card">
            <h3>Destinatarios</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Teléfono</th>
                        <th>Nombre</th>
                        <th>Estado Envío</th>
                        <th>Fecha Envío</th>
                        <th># Replies</th>
                        <th>Último Reply</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    \${rows}
                </tbody>
            </table>
            
            <div class="pagination" style="margin-top:20px;">
                \${offset > 0 ? \`<a href="?offset=\${prevOffset}&limit=\${limit}" class="action-btn">← Anterior</a>\` : ''}
                \${hasMore ? \`<a href="?offset=\${nextOffset}&limit=\${limit}" class="action-btn">Siguiente →</a>\` : ''}
            </div>
        </div>

        <script>
            const campaignId = \${campaign.id};
            
            async function updateStats() {
                try {
                    const res = await fetch('/admin/api/campaigns/' + campaignId + '/follow-up-stats');
                    if (!res.ok) return;
                    const stats = await res.json();
                    
                    document.getElementById('kpi-total').textContent = stats.total_recipients;
                    document.getElementById('kpi-sent-ok').textContent = stats.sent_ok;
                    document.getElementById('kpi-failed').textContent = stats.failed;
                    document.getElementById('kpi-replies').textContent = stats.replies_received;
                    document.getElementById('kpi-response-24h').textContent = stats.response_rate_24h;

                    const total = stats.total_recipients || 1;
                    const sentOk = stats.sent_ok || 1;
                    
                    document.getElementById('kpi-sent-pct').textContent = Math.round((stats.sent_ok/total)*100) + '%';
                    document.getElementById('kpi-failed-pct').textContent = Math.round((stats.failed/total)*100) + '%';
                    document.getElementById('kpi-response-24h-pct').textContent = Math.round((stats.response_rate_24h/sentOk)*100) + '%';

                    const failRate = (stats.failed / total) * 100;
                    const alertDiv = document.getElementById('failureAlert');
                    if (failRate > 10 && stats.failed > 0) {
                        alertDiv.style.display = 'block';
                        alertDiv.querySelector('strong').textContent = '⚠️ Alerta: Tasa de fallo alta detectada (' + failRate.toFixed(1) + '%)';
                    } else {
                        alertDiv.style.display = 'none';
                    }

                } catch (e) { console.error('Error polling stats:', e); }
            }

            setInterval(updateStats, 5000);
        <\/script>
    \`);
}
`;

lines.push(newFunction);

fs.writeFileSync(filePath, lines.join('\n'));
console.log('Fixed admin/pages.js');
