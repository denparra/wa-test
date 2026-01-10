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
