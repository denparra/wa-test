# Current Workflow Snapshot

This file is the single pointer for the currently active WhatsApp bot workflow and its tracked JSON in this repository.

## Active Workflow (n8n)

- Workflow name: `META-CONSIGNACION-V1`
- Workflow id: `PI8uZo5omcN3576y`
- Webhook path: `wa-test-twilio-inbound-ai-v2`
- Remote status: `active=true`
- Last remote sync to repo JSON: `2026-04-24T23:38:20.158Z`

## Source of Truth

1. Runtime truth: active remote workflow in n8n (`PI8uZo5omcN3576y`).
2. Versioned artifact in repo: `n8n/workflows/META-CONSIGNACION-V1.json`.

When in doubt, fetch remote and resync this JSON before making workflow edits.

## Workflow File In Repo

- `n8n/workflows/META-CONSIGNACION-V1.json`

This JSON is kept as the current working definition used by `npm run n8n:update`.

## Backup Chain (Today)

Backups created during the hardening session:

- `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-vehicle-memory.json`
- `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-handoff-polish.json`
- `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-intent-context.json`
- `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-server-context-fix.json`
- `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-post-handoff-lock.json`
- `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-stability-fix.json`
- `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-coherence-fix.json`
- `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-harness-hardening.json`
- `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-post-handoff-generalization.json`
- `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-targeted-regression-fix.json`

## How It Connects

- App inbound entrypoint: `POST /twilio/inbound` in `server.js`.
- n8n bridge call: `N8N_CHAT_WEBHOOK_URL`.
- n8n workflow response node returns `reply_text`, `needs_human`, `handoff_reason`, `optout_requested` consumed by wa-test.

## Session Close Notes

- Commit with final hardening + lab workflow: `152a9a8`.
- Regression focus addressed: `informal_affirmative` and `action_affirmative`.
- Operational trace remains in `docs/logdocs.md`.
