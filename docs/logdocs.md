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

### 2026-04-24 15:10 - Persistent post-handoff lock to prevent CTA re-open

- Scope: harden post-derivation behavior so phatic replies never reopen executive CTA.
- Why: real conversation showed `Ok gracias` after confirmed handoff could still trigger a new CTA.
- Files: `scripts/n8n/tune-meta-agent-handoff.js`, `n8n/workflows/META-CONSIGNACION-V1.json`, `server.js`.
- n8n workflow: id `PI8uZo5omcN3576y`, name `META-CONSIGNACION-V1`.
- Runtime impact:
  - new persistent flags in memory: `handoff_status`, `suppress_executive_offer_until`.
  - output guard in fusion: if already derived, force concise closure and block CTA reopen.
  - `Detectar Handoff` now treats `handoff_status`/suppression window as derived context.
  - server forwards `handoff_active` context and broadens short phatic ack recognition.
- Validation: `node --check` for modified files, regenerate workflow from tune script, update remote n8n workflow.
- Rollback: restore `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-server-context-fix.json` and revert commit.

### 2026-04-24 18:40 - Stability fix for fallback quality and informal handoff confirmations

- Scope: reduce n8n fallback frequency and improve confirmation detection for phrases like `ok enviame`.
- Why: production flow still showed fallback at first turn and CTA loops after informal acceptance.
- Files: `server.js`, `scripts/n8n/tune-meta-agent-handoff.js`, `n8n/workflows/META-CONSIGNACION-V1.json`.
- n8n workflow: id `PI8uZo5omcN3576y`, name `META-CONSIGNACION-V1`.
- Backup artifact: `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-stability-fix.json`.
- Runtime impact:
  - n8n bridge timeout increased to 8s with one retry for transient failures.
  - enriched n8n bridge logs (`timeout`, `non-2xx`, `invalid json`, `empty reply`).
  - fallback copy for initial consignation changed to value + CTA (avoids cold data-collection prompt).
  - `Detectar Handoff` now treats action-style confirmations (`ok enviame`, `mandame`, `si espero`, etc.) as handoff confirmation in CTA context.
- Validation: syntax checks, workflow regenerate, remote workflow update.
- Rollback: restore remote backup above and revert this change set in `server.js` and tune script.

### 2026-04-24 18:48 - Coherence fix for direct contact requests and post-acceptance behavior

- Scope: strengthen handoff intent detection so direct contact phrases derive immediately and avoid incoherent CTA/email loops.
- Why: real chat showed `si por favor que me contacten` and `ok enviame` did not reliably trigger derivation, causing repeated CTA prompts.
- Files: `scripts/n8n/tune-meta-agent-handoff.js`, `n8n/workflows/META-CONSIGNACION-V1.json`.
- n8n workflow: id `PI8uZo5omcN3576y`, name `META-CONSIGNACION-V1`.
- Backup artifact: `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-coherence-fix.json`.
- Runtime impact:
  - `Detectar Handoff` now derives on explicit direct-contact requests even without prior CTA context.
  - CTA-context detector expanded to include conjugations like `contacte/contacten` in prior assistant output.
  - Fusion now treats affirmative non-question statements like `te contacto un ejecutivo...` as effective handoff confirmation state.
  - Prompt guardrail updated to avoid asking for email before confirming derivation once contact intent is accepted.
- Validation: syntax check on tune script, regenerate workflow JSON, update remote workflow.
- Rollback: restore remote backup above and re-run update.

### 2026-04-24 18:58 - Chat regression harness for faster QA

- Scope: add local scripted conversation testing harness to validate WhatsApp bot behavior without real WhatsApp sends.
- Why: repeated conversational regressions required faster deterministic testing before production validation.
- Files: `scripts/harness/chat-regression.js`, `scenarios/harness/chat-regression.default.json`, `docs/ops/chat-harness.md`, `package.json`.
- Runtime impact: new command `npm run harness:chat` executes multi-turn conversation checks with assertions and conversation-level anti-loop rules.
- Validation: script syntax check and dry-run invocation documented.
- Rollback: remove harness files and npm script entry.

### 2026-04-24 19:00 - Harness-driven hardening for post-handoff email turn

- Scope: fix incoherent follow-up after confirmed handoff when user sends email in next turn.
- Why: harness exposed loop where assistant re-opened executive CTA after already derived.
- Files: `server.js`, `scripts/n8n/tune-meta-agent-handoff.js`, `n8n/workflows/META-CONSIGNACION-V1.json`, `scenarios/harness/chat-regression.n8n.json`.
- n8n workflow: id `PI8uZo5omcN3576y`, name `META-CONSIGNACION-V1`.
- Backup artifact: `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-harness-hardening.json`.
- Runtime impact:
  - server applies a deterministic post-handoff guard: if handoff is active and user provides email, closes with derived confirmation instead of reopening CTA.
  - server blocks CTA re-open when handoff is active and AI outputs another executive offer.
  - fusion logic now treats `handoff_active` context and persistent handoff flags as derived state source.
- Validation:
  - `npm run harness:chat` (twilio_inbound) -> `PASSED`.
  - direct n8n scenario available in `scenarios/harness/chat-regression.n8n.json`.
- Rollback: restore remote backup above and revert server/tune changes.

### 2026-04-24 19:18 - Admin Lab Chat mirror for rapid conversational QA

- Scope: add admin chat playground to simulate WhatsApp conversation behavior in a browser UI.
- Why: run faster iterative testing and evaluate response coherence without sending real WhatsApp messages.
- Files: `server.js`, `admin/pages.js`, `admin/render.js`.
- Runtime impact:
  - new page `GET /admin/lab/chat` with chat-style interface and quick scenarios.
  - new API `POST /admin/api/lab/chat/send` (non-persistent mirror of inbound logic).
  - new API `POST /admin/api/lab/chat/reset` to isolate sessions and clear handoff transient state.
  - shared inbound processor now powers both Twilio webhook and lab mirror path.
- Validation:
  - syntax checks for `server.js`, `admin/pages.js`, `admin/render.js`.
  - `npm run harness:chat` with local server -> `PASSED`.
- Rollback: remove lab routes/page/nav item and revert to direct `/twilio/inbound` handler block.

### 2026-04-24 19:26 - Lab Chat default phone fixed and editable

- Scope: set deterministic Lab Chat default phone with UI edit support.
- Why: keep repeatable context for QA while still allowing quick number switches during tests.
- Files: `server.js`, `admin/pages.js`.
- Runtime impact:
  - default lab phone is now `+56935229766` (or `LAB_CHAT_DEFAULT_PHONE` env override).
  - lab phone can be edited directly in UI and is used immediately by send/reset actions.
- Validation: syntax checks on modified files.
- Rollback: revert to random lab phone generator behavior.

### 2026-04-24 19:40 - Expanded Lab scenarios and markdown pass/fail reports

- Scope: broaden QA scenario coverage and add report/export workflow directly from `/admin/lab/chat`.
- Why: enable iterative bot tuning with reproducible scenario execution and documented fail/pass trace.
- Files: `server.js`, `admin/pages.js`, `docs/ops/chat-harness.md`.
- Runtime impact:
  - added multi-scenario catalog (`smoke` + `regression`) for lab execution.
  - added APIs:
    - `GET /admin/api/lab/chat/scenarios`
    - `POST /admin/api/lab/chat/run-scenarios`
    - `POST /admin/api/lab/chat/save-session`
  - lab UI now supports running suites, running specific scenario, and saving markdown outputs.
  - markdown artifacts are generated in `docs/qa/` with per-step pass/fail details.
- Validation:
  - `node --check server.js`
  - `node --check admin/pages.js`
  - `npm run harness:chat` (local) -> `PASSED`.
- Rollback: remove new lab endpoints and restore previous single-scenario UI behavior.

### 2026-04-24 19:45 - Targeted regression fix for informal/action affirmatives

- Scope: fix persistent failures in `informal_affirmative` and `action_affirmative` without changing stable passing flows.
- Why: repeated regression runs showed deterministic failures (`oka porfa`, `ok enviame`) after executive CTA offer.
- Files: `server.js`, `scripts/n8n/tune-meta-agent-handoff.js`, `n8n/workflows/META-CONSIGNACION-V1.json`.
- n8n workflow: id `PI8uZo5omcN3576y`, name `META-CONSIGNACION-V1`.
- Backup artifact: `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-targeted-regression-fix.json`.
- Runtime impact:
  - expanded CTA-offer detection patterns in server and n8n (contactar/contacten/llamen/agendar variants).
  - broadened affirmative intent matching (`me contacte`, `que me contacte`, `ok porfa`, `oka porfa`, `dale porfa`).
  - added deterministic server guard: if offer is pending and reply is short affirmative, confirm handoff directly.
- Validation:
  - targeted inbound simulation with fresh phones shows handoff confirmation for both failing cases.
  - `npm run harness:chat` -> `PASSED`.
- Rollback: restore backup artifact above and revert the server/tune changes.
