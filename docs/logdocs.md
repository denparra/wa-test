# Change Log Docs

This file is the operational trace of changes applied to the WhatsApp bot and related flows.

## Logging Rule

- Every non-trivial implementation must add one entry here.
- Keep entries practical: what changed, why, where, how validated, and rollback hint.

## Entry Template

### YYYY-MM-DD HH:MM - Short title

- Scope:
- Why:
- Files:
- Runtime impact:
- Validation:
- Rollback:

---

### 2026-04-24 14:05 - Handoff loop and opt-out hardening

- Scope: n8n handoff loop reduction, opt-out propagation, semantic opt-out in wa-test.
- Why: repeated CTA loops after acceptance and need stronger low-friction opt-out detection.
- Files: `server.js`, `scripts/n8n/tune-meta-agent-handoff.js`, `n8n/workflows/META-CONSIGNACION-V1.json`, `docs/roadmap/whatsapp-bot-improvements-2026-04-24.md`.
- Runtime impact: improved handoff confirmation and reduced repeated re-offers.
- Validation: syntax checks, workflow update, manual conversational cases.
- Rollback: use previous workflow backup JSON and revert commit if required.

### 2026-04-24 14:35 - Campaign-first context fix (server + n8n)

- Scope: align server fallback CTA context with n8n handoff detector.
- Why: if first turn uses local fallback, n8n could miss pending CTA context and loop after informal confirmations.
- Files: `server.js`, `scripts/n8n/tune-meta-agent-handoff.js`, `n8n/workflows/META-CONSIGNACION-V1.json`.
- n8n workflow: id `PI8uZo5omcN3576y`, name `META-CONSIGNACION-V1`.
- Backup artifact: `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-server-context-fix.json`.
- Runtime impact:
  - server tracks recent CTA-offer context (`handoff_offer_pending`) for short window.
  - n8n `Detectar Handoff` consumes `raw_input.context.handoff_offer_pending`.
  - confirmations like informal short replies are interpreted with better context.
- Validation: run n8n tune script, update remote workflow, verify no syntax errors.
- Rollback: restore `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-intent-context.json` and remove handoff-offer map logic in `server.js`.
