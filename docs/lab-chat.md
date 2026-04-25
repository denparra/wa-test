# Lab Chat — Guía de Referencia

> **Última actualización**: 2026-04-25
> **Archivo de verdad** · Reemplaza notas dispersas en `logdocs.md` sobre el lab

---

## Qué es

**Lab Chat** (`/admin/lab/chat`) es un entorno de pruebas aislado integrado en el panel admin de wa-test. Permite enviar mensajes al bot conversacional WhatsApp sin enviar ni recibir mensajes reales por WhatsApp.

Accede desde: `http://localhost:3000/admin/lab/chat`

---

## Para qué sirve

- **Probar conversaciones** con el bot IA antes de deployar cambios al n8n.
- **Regression testing** automático con el runner de escenarios integrados (suite `smoke` y `regression`).
- **Aislar el teléfono real** de pruebas que podrían generar opt-outs accidentales.
- **Guardar sesiones** como transcripción markdown para documentar casos edge.

---

## Cómo funciona internamente

### Flujo compartido con WhatsApp real

Lab Chat usa exactamente la misma función que procesa mensajes entrantes de Twilio:

```
server.js: processInboundMessage({ ..., source: 'lab' })
```

Esto significa:
- El mismo menú inicial (opciones 1/2/3)
- La misma lógica de handoff a ejecutivos
- La misma detección de opt-out
- La **misma llamada a n8n** (`N8N_CHAT_WEBHOOK_URL`)
- El mismo parsing de respuesta del workflow (`reply_text`, `needs_human`, `handoff_reason`, `optout_requested`)

### Diferencias clave vs WhatsApp real

| Aspecto | WhatsApp real (`/twilio/inbound`) | Lab Chat (`/admin/lab/chat`) |
|---------|-----------------------------------|------------------------------|
| Canal | Twilio WhatsApp real |模拟 (simulado) |
| Persistencia en DB | `persist: true` — se guardan mensajes en `messages` | `persist: false` — no se toca la DB |
| Creación de contactos | Sí, crea/actualiza en `contacts` | No (solo lookup de contexto de vehículos si existe) |
| Opt-out real | Sí, registra en `opt_outs` | No (el flujo funciona, pero no persiste) |
| SID del mensaje | Twilio MessageSid real | Generado como `SMLAB{timestamp}` |
| Webhook n8n | Exactamente el mismo | Exactamente el mismo |
| Respuesta IA | Exactamente la misma | Exactamente la misma |
| Timeout de n8n | 8s con retry 1 vez | 8s con retry 1 vez |

### El flag `lab_mode` en el payload a n8n

En `server.js:2377` el payload incluye:

```javascript
context: {
    // ...
    lab_mode: source === 'lab'   // true para Lab Chat
}
```

El workflow de n8n puede leer este flag para alterar su comportamiento (por ejemplo, no registrar analytics externos, usar respuestas más verbose para debugging, etc.).

---

## ¿Las respuestas son las mismas?

**Sí, en el flujo IA son equivalentes.** Lab Chat llama al mismo endpoint de n8n con el mismo payload (salvo `lab_mode` en context). Si el workflow n8n no diferencia por `lab_mode`, la respuesta del bot IA es idéntica.

Donde **NO son equivalentes**:
- El menú fallback local (`processInboundMessage` tiene lógica de menú antes de llamar a n8n).
- Los mensajes del menú (opciones 1/2/3) se generan localmente en `server.js:2319-2331` y son iguales.
- El handoff local (respuestas "Perfecto, quedaste derivado") se generan en `server.js` directamente; estas SÍ son exactamente las mismas porque usan el mismo código.

---

## Runner de escenarios (QA automatizado)

Lab Chat incluye un harness de pruebas integrado accesible desde la UI (`/admin/lab/chat`).

### Suites disponibles

| Suite | Descripción | Escenarios |
|-------|-------------|------------|
| `smoke` | Caminos happy-path y edge críticos | 4 escenarios |
| `regression` | Casos edge de IA, handoff, opt-out | 7 escenarios |

### Escenarios

```
smoke:
  happy_handoff        Happy Path Handoff
  post_handoff_lock    Post-Handoff No Reopen
  email_after_handoff  Email After Handoff
  optout_keyword        Opt-out Keyword
  optout_semantic       Opt-out Semantic

regression:
  known_vehicle_context   Known Vehicle Context (no pide datos ya en DB)
  informal_affirmative    Informal Affirmative (oka porfa)
  action_affirmative      Action-style Affirmative (ok enviame)
  decline_handoff         Decline Handoff
  faq_process             FAQ Process Question
  faq_costs               FAQ Costs Question
  legal_sensitive         Legal Sensitive Case
```

Los reportes se guardan en `docs/qa/lab-chat-report-{timestamp}.md`.

---

## Variables de entorno relacionadas

```env
# Teléfono de laboratorio (aislado de contactos reales)
LAB_CHAT_DEFAULT_PHONE=+56935229766

# Mismo webhook que usa /twilio/inbound para WhatsApp real
N8N_CHAT_WEBHOOK_URL=https://tu-n8n/webhook/wa-test-twilio-inbound-ai-v2
```

Si `N8N_CHAT_WEBHOOK_URL` no está configurada, Lab Chat usa la respuesta local fallback del menú.

---

## Endpoints API de Lab Chat

Todos protegidos por `adminAuth`:

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/admin/api/lab/chat/send` | Enviar un mensaje y obtener respuesta |
| `GET` | `/admin/api/lab/chat/scenarios` | Listar escenarios disponibles |
| `POST` | `/admin/api/lab/chat/run-scenarios` | Ejecutar suite de escenarios (smoke/regression) |
| `POST` | `/admin/api/lab/chat/save-session` | Guardar transcripción de sesión como markdown |
| `POST` | `/admin/api/lab/chat/reset` | Limpiar estado de handoff del teléfono en memoria |

### Ejemplo: POST /admin/api/lab/chat/send

```bash
curl -X POST http://localhost:3000/admin/api/lab/chat/send \
  -u admin:password \
  -H "Content-Type: application/json" \
  -d '{"message":"me interesa consignar","phone":"+56935229766"}'
```

Respuesta:
```json
{
  "ok": true,
  "phone": "+56935229766",
  "reply": "Perfecto. Ya tengo registrado tu vehiculo (...). Si quieres, te contacta un ejecutivo en 15-30 min para orientarte mejor.",
  "is_baja": false,
  "meta": {
    "used_ai": true,
    "needs_human": false,
    "handoff_reason": ""
  }
}
```

---

## Cuándo usar Lab Chat vs WhatsApp real

| Situación | Usar |
|-----------|------|
| Probar cambios en el workflow n8n | Lab Chat |
| Probar cambios en la lógica local del menú/handoff (server.js) | Lab Chat |
| Regression testing de flujos de conversación | Lab Chat (suite smoke/regression) |
| Probar opt-out flow sin afectar contactos reales | Lab Chat |
| Probar integración real de Twilio (delivery status, SID) | WhatsApp real (ngrok + Twilio sandbox o número real) |
| Probar timing real de mensajes | WhatsApp real |
| Validar que el webhook de Twilio está bien configurado | WhatsApp real |

---

## Estructura de archivos relacionada

```
admin/pages.js              renderChatLabPage() — UI completa del lab
server.js                   processInboundMessage() — lógica compartida
                            POST /admin/api/lab/chat/send|run-scenarios|save-session|reset
                            LAB_SCENARIOS — definición de escenarios QA
                            LAB_CHAT_DEFAULT_PHONE — config de teléfono
docs/qa/                    Reportes del runner de escenarios
```

---

## Notas operativas

- El estado de handoff (`recentHandoffByPhone`, `recentHandoffOfferByPhone`) vive en memoria del proceso Node.js. Se pierde al reiniciar el servidor. Lab Chat puede reiniciarlo con `/admin/api/lab/chat/reset`.
- El teléfono de lab (`LAB_CHAT_DEFAULT_PHONE`) se puede cambiar desde la UI del lab.
- Los escenarios usan números de teléfono derivados del base con el último dígito modificado por escenario para evitar colisiones de estado.
- Si n8n no responde, Lab Chat recibe `null` y usa la respuesta local fallback (menú), igual que WhatsApp real.