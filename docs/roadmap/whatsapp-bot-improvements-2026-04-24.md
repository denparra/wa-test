# WhatsApp Bot Improvements - 2026-04-24

## Context

This update was made after a real post-campaign conversation showed a repetition loop:

- Customer accepted executive contact multiple times.
- Bot kept asking the same handoff question.

Goal of this update:

1. Remove repetitive handoff loops.
2. Keep handoff behavior deterministic after CTA confirmation.
3. Improve opt-out detection while keeping wa-test as final authority.

## What Was Implemented

### 1) Handoff confirmation hardening (n8n)

Implemented stronger acceptance detection in `Detectar Handoff`:

- Accept phrases after CTA: `si`, `ok`, `dale`, `quiero`, `que me contacten`, etc.
- If customer already derived and replies with phatic ack (`gracias`, `ok`, etc.), answer with short closure.
- Keep immediate handoff for explicit human/legal/sensitive requests.

Files:

- `n8n/workflows/META-CONSIGNACION-V1.json`
- `scripts/n8n/tune-meta-agent-handoff.js`

### 2) Conversation state for handoff stage (n8n)

Added and maintained memory key facts:

- `awaiting_handoff_confirmation`
- `last_handoff_offer_at`

Behavior:

- Set `awaiting_handoff_confirmation=true` when assistant offers executive CTA.
- Set `awaiting_handoff_confirmation=false` once handoff is confirmed/derived.
- Prevent re-offering executive once `derivado_agente_humano=true`.

Files:

- `n8n/workflows/META-CONSIGNACION-V1.json`
- `scripts/n8n/tune-meta-agent-handoff.js`

### 3) Anti-repeat reinforcement (n8n)

Improved repeat guard in memory fusion:

- If assistant output repeats and `assistant_repeat_count >= 2`, switch to `ultra_concise` response style.

Files:

- `n8n/workflows/META-CONSIGNACION-V1.json`
- `scripts/n8n/tune-meta-agent-handoff.js`

### 4) optout_requested propagation fix (n8n -> wa-test)

Ensured `optout_requested` is carried through `Preparar Outbound Persistencia` so `Responder HTTP` and wa-test can consume it consistently.

Files:

- `n8n/workflows/META-CONSIGNACION-V1.json`
- `scripts/n8n/tune-meta-agent-handoff.js`

### 5) Deterministic + semantic opt-out in wa-test (server)

Inbound opt-out now detects both keyword and semantic requests.

Added keyword support:

- `baja`, `stop`, `unsubscribe`, `cancelar`, `remover`, `salir`, and menu `3`.

Added semantic phrase patterns:

- `no me escriban/contacten/llamen`
- `sacame/saquenme/eliminame/borrame`
- `sacarme/eliminarme/borrarme de la lista`
- `no quiero recibir mas mensajes`
- `dame de baja`

Important policy preserved:

- wa-test remains final opt-out authority (persist + contact status updates).
- AI can assist via `optout_requested`, but deterministic server checks still run first.

File:

- `server.js`

## Deploy / Sync Actions Performed

1. Updated local workflow JSON via script.
2. Backed up remote workflow metadata to:
   - `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424.json`
3. Updated active n8n workflow:
   - ID: `PI8uZo5omcN3576y`
   - Name: `META-CONSIGNACION-V1`
   - Status after update: `active=true`

## Validation Done

- Syntax check:
  - `node --check server.js`
  - `node --check scripts/n8n/tune-meta-agent-handoff.js`

## Suggested QA Cases (manual)

Run these in WhatsApp with a test contact:

1. Interest + CTA + `si` -> should confirm derivation once.
2. Interest + CTA + `ok` -> should confirm derivation once.
3. After derivation, send `gracias` -> should reply short closure only.
4. Send `BAJA` -> immediate opt-out confirmation.
5. Send `no me escriban mas` -> opt-out confirmation (semantic path).
6. Normal product question -> informative answer, no forced handoff.

## Notes for Future Conversations

If behavior drifts again, inspect first:

1. `Detectar Handoff` node logic in workflow JSON.
2. `Fusionar Memoria Incremental` keys:
   - `derivado_agente_humano`
   - `awaiting_handoff_confirmation`
   - `assistant_repeat_count`
3. `server.js` inbound opt-out block under `/twilio/inbound`.

This document is the operational baseline for handoff + opt-out behavior as of 2026-04-24.
