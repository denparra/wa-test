# Chat Harness

This harness lets you run scripted conversations without sending real WhatsApp messages.

## Goal

- Simulate chat turns quickly.
- Catch regressions (handoff loops, repeated CTA, weak confirmations).
- Build confidence before production tests.

## Command

```bash
npm run harness:chat
```

Default scenario file:

- `scenarios/harness/chat-regression.default.json`

You can pass a custom scenario path:

```bash
node scripts/harness/chat-regression.js scenarios/harness/my-case.json
```

## Modes

### 1) `twilio_inbound` (default)

Sends form-urlencoded requests to:

- `POST /twilio/inbound`

Uses local fallback + n8n bridge exactly as server behavior.

### 2) `n8n_webhook`

Sends JSON directly to `N8N_CHAT_WEBHOOK_URL` (or scenario `n8nWebhookUrl`) to isolate workflow behavior.

## Environment overrides

- `HARNESS_MODE` -> `twilio_inbound` or `n8n_webhook`
- `HARNESS_BASE_URL` -> default `http://localhost:3000`
- `HARNESS_N8N_WEBHOOK_URL` -> direct n8n webhook URL
- `HARNESS_PHONE` -> default phone in scenario
- `HARNESS_FROM` -> Twilio style sender (`whatsapp:+56...`)
- `HARNESS_NAME` -> default contact name for n8n payload mode

Example:

```bash
HARNESS_MODE=n8n_webhook HARNESS_N8N_WEBHOOK_URL="https://..." npm run harness:chat
```

## Scenario format

Top-level fields:

- `name`
- `mode`
- `baseUrl` / `n8nWebhookUrl`
- `defaultPhone`
- `steps[]`
- `conversationRules[]`

Per step:

- `user` (required)
- `expect.containsAny`
- `expect.containsAll`
- `expect.notContainsAny`
- `expect.equals`
- `pauseMs` (optional)

Conversation rules currently supported:

- `max_substring_occurrences`
- `forbid_after_trigger`

## Practical workflow

1. Run harness locally.
2. Fix regressions.
3. Re-run until `PASSED`.
4. Deploy.
5. Validate with 1-2 real WhatsApp smoke tests.
