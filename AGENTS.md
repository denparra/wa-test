# Repository Guidelines

## Project Structure and Module Organization
- `server.js` hosts the Express app and Twilio inbound webhook (`/twilio/inbound`) plus `/health`.
- `send-test.js` is a standalone outbound sender for Twilio Messaging Service.
- `docs/` holds extended project notes and deployment context.
- `Dockerfile` defines the production container build.
- `.env` contains local secrets and must not be committed.

## Build, Test, and Development Commands
- `npm start` runs the Express server locally (uses `server.js`).
- `node send-test.js` sends outbound test messages to recipients in `RECIPIENTS`.
- `docker build -t wa-test .` builds the container for Easypanel or local Docker.
- `docker run -p 3000:3000 --env-file .env wa-test` runs the container with env vars.

### n8n Workflow Management Commands
- `npm run n8n:list` lists workflows from configured n8n instance.
- `npm run n8n:get -- <id>` fetches workflow JSON by id.
- `npm run n8n:create -- <file.json>` creates workflow from local JSON file.
- `npm run n8n:update -- <id> <file.json>` updates existing workflow.
- `npm run n8n:delete -- <id>` deletes workflow by id.
- `npm run n8n:activate -- <id>` activates workflow.
- `npm run n8n:deactivate -- <id>` deactivates workflow.
- `npm run n8n:duplicate -- <id> [new-name]` duplicates workflow.

## n8n Integration Policy (Mandatory)
- This repository has first-class n8n integration for generic workflow CRUD (not limited to campaigns).
- For workflow operations, use local integration first: `scripts/n8n/workflow-manager.js` via `npm run n8n:*`.
- For app-level or module-level integration, use protected admin API endpoints in `server.js` under `/admin/api/n8n/*`.
- Keep workflow JSON files versioned under `n8n/workflows/` when they are project artifacts.
- Standard safe flow: `list` -> `get` backup -> `create/update` -> `activate/deactivate`.
- Never expose or commit `N8N_API_KEY`; credentials must remain only in `.env`.

### Required n8n Environment Variables
- `N8N_API_URL` (example: `https://your-instance/api/v1`).
- `N8N_API_KEY` (n8n Public API key).
- If missing, n8n features are considered disabled while the rest of the app can still run.

## Coding Style and Naming Conventions
- Use ES Modules (`import`/`export`) and keep `"type": "module"` in `package.json`.
- Indent JavaScript with 4 spaces and keep semicolons.
- Prefer descriptive names for webhook payload fields (`from`, `body`).
- Keep TwiML output escaped; use `escapeXml()` for message text.

## Testing Guidelines
- No automated test framework is configured yet; there is no coverage requirement.
- For manual checks, verify `GET /health` and use Twilio or `ngrok` to hit `POST /twilio/inbound`.
- If adding tests, place them under `tests/` and name files `*.test.js`.

## Commit and Pull Request Guidelines
- History uses conventional-style prefixes like `fix:` and `chore:`; follow `type: short summary`.
- Keep subjects short and action-oriented (English or Spanish is acceptable).
- PRs should include a brief summary, testing notes (commands or manual steps), and any Twilio or deployment changes.

## Security and Configuration Notes
- Never commit `.env` or Twilio credentials.
- Ensure webhook responses return `Content-Type: text/xml` with valid TwiML.
