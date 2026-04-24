# Adaptacion flujo n8n (Twilio campañas + IA conversacional)

## Contexto

Se reutilizara como base el flujo `n8n/workflows/AI Whatsapp Ventas - EJEMPLO.json`, pero con un cambio de arquitectura:

- **Campañas outbound** se mantienen en `wa-test` via **Twilio** (flujo actual).
- **Conversacion inbound y respuesta inteligente** se apoyan en **n8n + IA**.
- **Persistencia operativa y compliance** (mensajes, contactos, opt-outs) permanecen en `wa-test` (SQLite).

Esto evita romper el sistema de campañas ya estable y permite evolucionar IA sin perder trazabilidad local.

## Objetivo

Habilitar un flujo de respuesta post-campaña que:

1. Entregue informacion concreta y util.
2. Detecte interes real y derive a ejecutivo cuando corresponda.
3. Gestione BAJA/opt-out de forma segura y auditable.
4. Mantenga historico en `wa-test` para dashboard y seguimiento.

## Decisiones cerradas (alineadas)

- **Rol del bot**: asesor post-campana que informa, califica interes y deriva.
- **Estilo de avance**: no insistente (evitar friccion del flujo ejemplo).
- **Datos disponibles de base**: telefono y vehiculo ya existen en `wa-test`.
- **Dato deseable**: correo, pero no bloquea derivacion.
- **SLA de derivacion comunicado al cliente**: 15-30 minutos.
- **Modelo inicial**: `gpt-4.1-mini`.
- **Memoria**: minima en n8n; operacion principal en `wa-test`.
- **Workflow base oficial para ajustes**: `META-CONSIGNACION-V1` (ID `PI8uZo5omcN3576y`).

## Workflow objetivo de trabajo

Para esta linea de implementacion, todas las modificaciones se realizaran sobre el workflow:

- **Nombre**: `META-CONSIGNACION-V1`
- **ID**: `PI8uZo5omcN3576y`

Regla operativa: los cambios solicitados por negocio/operacion se aplican sobre este workflow como base de evolucion.

### Estado actual aplicado

- Trigger cambiado de `whatsAppTrigger` a `Webhook` (modo puente con Twilio).
- Nodo de envio WhatsApp cambiado a `Respond to Webhook` para devolver JSON a `wa-test`.
- Path webhook configurado: `wa-test-twilio-inbound-ai-v2`.
- `wa-test` consume este webhook desde `/twilio/inbound` mediante `N8N_CHAT_WEBHOOK_URL`.

## Diferencia clave respecto al flujo ejemplo

El flujo ejemplo usa `whatsAppTrigger` en n8n para recibir directamente WhatsApp.

En este proyecto, el numero esta conectado a Twilio, por lo que el inbound entra por:

- `POST /twilio/inbound` en `server.js`.

Por eso se requiere un paso adicional de integracion (puente `wa-test -> n8n`).

## Arquitectura objetivo (recomendada)

1. Twilio envia inbound a `wa-test` (`/twilio/inbound`).
2. `wa-test` normaliza entrada y aplica validaciones base (incluye BAJA inmediata).
3. `wa-test` llama un webhook de n8n con el contexto del mensaje.
4. n8n ejecuta IA, clasifica intencion y devuelve respuesta estructurada.
5. `wa-test` persiste eventos y responde Twilio con TwiML usando el texto sugerido por n8n.

## Contrato de integracion propuesto

### Request `wa-test -> n8n` (MVP)

```json
{
  "source": "twilio",
  "phone": "+569XXXXXXXX",
  "message_text": "texto del cliente",
  "message_sid": "SMxxxxxxxx",
  "campaign_id": 123,
  "received_at": "2026-04-23T12:34:56.000Z",
  "contact": {
    "id": 456,
    "name": "Nombre"
  },
  "context": {
    "is_opted_out": false,
    "last_messages": [],
    "vehicle_summary": "Toyota Corolla 2018",
    "campaign_name": "Campana Abril",
    "campaign_type": "twilio_template"
  }
}
```

### Response `n8n -> wa-test` (MVP)

```json
{
  "reply_text": "respuesta para WhatsApp",
  "intent": "info|interes|objecion|baja|humano|otro",
  "needs_human": false,
  "handoff_reason": "",
  "optout_requested": false,
  "lead_score": 0.72,
  "notify_agent": false,
  "agent_summary": "",
  "extracted_fields": {
    "name": "",
    "vehicle": "",
    "email": ""
  }
}
```

## Adaptacion del flujo ejemplo en n8n

### Cambios obligatorios

- Reemplazar nodo inicial `whatsAppTrigger` por `Webhook`.
- Reemplazar nodo final de envio WhatsApp por `Respond to Webhook`.
- Mantener nodos de IA, extraccion de datos, handoff y guardas de seguridad.

### Cambios recomendados

- Evitar que la decision de opt-out dependa solo de IA; BAJA debe validarse primero en `wa-test`.
- Si se mantiene memoria avanzada en n8n, tratarla como complementaria; fuente principal de operacion sigue en SQLite.
- Incluir timeout y fallback (si n8n no responde, `wa-test` envia respuesta segura por defecto).

## Reglas de negocio iniciales (MVP)

- **BAJA/opt-out**: palabras clave directas (`BAJA`, `STOP`, `UNSUBSCRIBE`, etc.) priorizadas en `wa-test`.
- **Opt-out persistente**: si cliente pide BAJA, debe quedar marcado en `wa-test` para excluirlo de campanas futuras.
- **Derivacion a ejecutivo**: activar cuando `needs_human=true`, casos sensibles o interes alto.
- **Respuesta concreta**: mensajes cortos, claros y orientados a avance.
- **No re-pedir datos**: usar contexto disponible antes de solicitar informacion.

## Comportamiento conversacional deseado

### Principios

- Responder primero la pregunta del cliente en forma directa.
- Mantener mensajes de 1-3 lineas y maximo 1 emoji.
- No pedir de nuevo telefono ni datos de vehiculo que ya existen en contexto.
- Pedir correo de forma natural como valor agregado, no como barrera.

### Estrategia de persuasion (suave y comprobada)

Se aplicara una secuencia de baja friccion antes de derivar:

1. **Micro-confirmacion de valor**: "Perfecto, te explico breve..."
2. **Beneficio concreto**: "Asi evitas perder tiempo y te orientamos segun tu caso."
3. **Pregunta de permiso (CTA suave)**: "Si quieres, te contacta un ejecutivo en 15-30 min. Te sirve?"

Notas:

- Hacer 1-2 turnos utiles antes de derivar, salvo que el cliente pida humano directo.
- Si hay intencion positiva clara, responder breve y pasar a handoff sin sobre conversar.

### Plantillas base (borrador)

- **Interes positivo post-campana**:
  - "Buenisimo, gracias por responder 🙌\nTe puedo orientar altiro con los pasos y costos.\nSi te parece, te contacta un ejecutivo en 15-30 min para verlo en detalle."
- **Solicitud de mas info**:
  - "Claro, te cuento breve: revisamos tu caso y te guiamos con la mejor opcion segun tu vehiculo.\nSi quieres, un ejecutivo te llama en 15-30 min y lo aterriza contigo."
- **Pedir correo (opcional)**:
  - "Si te acomoda, dejame un correo y te enviamos el resumen por escrito."
- **Derivacion confirmada**:
  - "Perfecto, ya te derivo con un ejecutivo.\nTe contactamos en 15-30 min."

## Notificacion al agente humano

### Canal recomendado

- **V1 (mas facil)**: WhatsApp a numero interno (`notify_phone`).
- **V2 (extendido)**: WhatsApp + email (ambos).

### Datos cerrados para notificacion

- **WhatsApp agente**: `+56975400946`
- **Email agente**: `infoautorecente@gmail.com`

Implementacion esperada por fases:

- V1: notificacion por WhatsApp al numero definido.
- V2: agregar notificacion por email al correo definido.

### Contenido minimo de notificacion

- telefono cliente,
- nombre si existe,
- resumen corto de intencion,
- indicador de urgencia (`lead_score` o `needs_human`),
- ultimo mensaje cliente.

## Supabase y memoria conversacional

Es posible reutilizar la misma BD Supabase del flujo ejemplo, con estas condiciones:

- usarla como **memoria auxiliar IA**, no como fuente principal de campanas/opt-out;
- separar tablas por prefijo o esquema (ejemplo: `ai_conversation_*`);
- mantener `wa-test` (SQLite) como fuente oficial operativa.

Recomendacion: arrancar con memoria minima (o incluso sin Supabase en MVP) y agregar persistencia avanzada en fase 3.

## Opciones evaluadas

1. **Hibrido (recomendado)**: Twilio + `wa-test` + n8n IA por webhook.
   - Pros: menor riesgo, trazabilidad unica, evolutivo.
   - Contras: requiere contrato y control de timeout.
2. n8n full owner conversacional con sync posterior.
   - Pros: flexibilidad total en n8n.
   - Contras: mayor complejidad de consistencia.
3. Solo clasificacion/handoff en n8n.
   - Pros: implementacion rapida.
   - Contras: menos impacto en calidad conversacional.

## Fases sugeridas

### Fase 1 - Documento + contrato (actual)

- Definir alcance y payloads.
- Establecer reglas MVP y fallback.

### Fase 2 - MVP tecnico

- Crear workflow n8n de webhook conversacional.
- Conectar `server.js` para invocar n8n y usar `reply_text`.
- Registrar intent/handoff/optout en logs y DB.
- Implementar notificacion por WhatsApp al agente cuando `notify_agent=true`.

### Fase 3 - Operacion y calidad

- Alertas de derivacion.
- Mejoras de prompt y cobertura de intenciones.
- KPIs de conversion, handoff y opt-out.

## Riesgos y mitigaciones

- **Latencia n8n**: timeout estricto + respuesta fallback en `wa-test`.
- **Desalineacion de datos**: `wa-test` como fuente de verdad operativa.
- **Falsos positivos de BAJA**: prioridad a reglas deterministicas + auditoria.

## Checklist para implementacion

- [ ] Definir URL webhook n8n en `.env` (nuevo env sugerido: `N8N_CHAT_WEBHOOK_URL`).
- [ ] Crear workflow base en `n8n/workflows/` orientado a webhook.
- [ ] Implementar llamada desde `POST /twilio/inbound` a n8n.
- [ ] Agregar timeout/fallback y manejo de errores.
- [ ] Persistir metadata de respuesta (intent, handoff, score) en `wa-test`.
- [ ] Configurar numero interno para notificaciones: `N8N_NOTIFY_PHONE=+56975400946`.
- [ ] Configurar email interno para notificaciones: `N8N_NOTIFY_EMAIL=infoautorecente@gmail.com`.
- [ ] Validar casos: interes, objecion, humano, baja, no-texto.

## Estado

Documento inicial para alineacion. Se ira puliendo antes de implementar el flujo definitivo.
