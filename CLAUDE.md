# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WhatsApp messaging service for Queirolo Autos using Twilio API. The system handles:
- **Inbound messages**: Receives WhatsApp messages via Twilio webhooks and responds with automated replies using TwiML
- **Outbound messages**: Sends bulk WhatsApp messages using Twilio's Messaging Service and approved content templates

**Tech Stack**: Node.js (ES Modules), Express, Twilio API
**Deployment**: Docker container on Hostinger VPS managed through Easypanel

## Development Commands

### Running Locally
```bash
npm start                    # Start Express server (runs server.js)
node send-test.js           # Test outbound message sending
```

### Testing Inbound Webhook Locally
Use **ngrok** to expose local port:
```bash
ngrok http 3000
# Configure the ngrok URL in Twilio Messaging Service → Integration → Incoming Messages
```

### Docker Build (for Easypanel deployment)
```bash
docker build -t wa-test .
docker run -p 3000:3000 --env-file .env wa-test
```

## Environment Variables

Required in `.env` (never commit this file):
```
TWILIO_ACCOUNT_SID=AC...           # Twilio account identifier
TWILIO_AUTH_TOKEN=...              # Twilio authentication token
MESSAGING_SERVICE_SID=MG...        # Messaging Service for outbound
CONTENT_SID=HX...                  # Twilio Content template (optional)
PORT=3000                          # Server port (Easypanel may override)
```

## Architecture & Key Files

### server.js - Main Express Application
- **Inbound webhook**: `POST /twilio/inbound` receives messages from Twilio
  - Parses form-urlencoded data (`From`, `Body`)
  - Implements conversational logic with case-insensitive matching
  - Responds with TwiML XML format (required by Twilio)
  - **Critical**: Must return `Content-Type: text/xml` with proper XML structure
- **Health check**: `GET /health` for monitoring
- **Port handling**: Uses `process.env.PORT || 3000` (Easypanel assigns PORT=80)

### send-test.js - Outbound Message Script
- Sends messages to multiple recipients using `Promise.allSettled` for concurrent execution
- Uses Twilio Messaging Service (`MESSAGING_SERVICE_SID`)
- Supports content templates with variables (`contentSid` + `contentVariables`)
- **Recipient format**: Must use E.164 format with `whatsapp:` prefix (e.g., `whatsapp:+56975400946`)

### Dockerfile - Container Build
- Base: `node:20-alpine`
- Production build: `npm install --omit=dev`
- **Important**: Easypanel uses this Dockerfile (NOT buildpacks) due to Docker API version compatibility

## Twilio Integration

### Webhook Configuration
In Twilio Console → Messaging Services → [Your Service] → Integration:
- **Incoming Messages**: "Send a webhook"
- **Request URL**: `https://[your-domain]/twilio/inbound`
- **Method**: HTTP POST
- **Format**: application/x-www-form-urlencoded

### TwiML Response Format
All webhook responses MUST follow this structure:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Your message here</Message>
</Response>
```

**Critical**: Escape XML special characters (`&`, `<`, `>`, `"`, `'`) in message content using `escapeXml()` function (already implemented in server.js:39-46).

### Conversational Logic
Current implementation (server.js:16-28):
1. Convert user input to uppercase for case-insensitive matching
2. Check for exact matches (`BAJA`, `3`) or substring matches (`.includes()`)
3. Return appropriate response based on menu option
4. Default response shows main menu with 3 options

**Note**: The variable `upper` is defined but not consistently used - some comparisons use `body` instead of `upper`. This should be standardized.

## Deployment Architecture

**Current Setup**: Hostinger VPS → Easypanel → Docker Container

### Easypanel Configuration
- **Source**: GitHub repository (this repo)
- **Build method**: Dockerfile (not buildpacks)
- **Domain**: Auto-generated HTTPS domain (`*.easypanel.host`)
- **Port mapping**: Easypanel assigns `PORT=80` to container

### Deployment Logs
- Check for `Listening on [PORT]` to confirm server started
- Look for `INBOUND: { from: ..., body: ... }` to verify webhook reception
- `SIGTERM` during deployment is normal (process restart)

## Common Issues & Solutions

### Problem: "package.json missing" during build
**Cause**: Easypanel build context not pointing to repository
**Solution**: Verify GitHub source is correctly configured in Easypanel

### Problem: Webhook not receiving messages
**Checklist**:
1. Verify webhook URL in Twilio Messaging Service → Integration
2. Check Easypanel logs for incoming requests
3. Ensure HTTPS is enabled (required by Twilio)
4. Test `/health` endpoint to confirm server is accessible

### Problem: Messages not sent (outbound)
**Common causes**:
- Incorrect phone number format (must be E.164 with `whatsapp:` prefix)
- Missing or invalid `MESSAGING_SERVICE_SID`
- Template variables don't match template definition
- Phone number not registered in Twilio sandbox (for testing)

## Code Patterns

### ES Modules
Project uses `"type": "module"` in package.json:
- Use `import` instead of `require`
- Use `import 'dotenv/config'` instead of `require('dotenv').config()`
- File extensions may be required for relative imports

### Error Handling
`send-test.js` demonstrates proper async error handling:
- `Promise.allSettled()` for parallel operations without fail-fast
- Individual result checking with `status === 'fulfilled'`
- Extracting error details from Twilio error objects

## Future Enhancements (Not Yet Implemented)

**Opt-out persistence**: Currently replies "BAJA" but doesn't persist opt-out status. Will need:
- Database or file storage for opt-out numbers
- Filtering logic in outbound campaigns

**Bulk campaigns**: Scale `send-test.js` to handle CSV imports with 1500+ contacts

**Interactive buttons**: Requires WhatsApp approved templates with quick replies or call-to-action buttons
