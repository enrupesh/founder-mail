# Founder Mail

A focused email dashboard for `rolebolt@founder.rolebolt.tech`.

## Run locally

```bash
npm run dev
```

The app runs on port 5000. Add `RESEND_API_KEY` as a Replit Secret to enable sending.

## Deploy on Render

- **Service type:** Web Service
- **Build command:** `npm install --registry=https://registry.npmjs.org --no-audit --no-fund && npm run build`
- **Start command:** `npm start`
- **Environment variable:** `RESEND_API_KEY`
- Render provides the `PORT` value automatically.

## Resend setup

1. Verify `founder.rolebolt.tech` in Resend and use `rolebolt@founder.rolebolt.tech` as the sender.
2. Add the `RESEND_API_KEY` secret to this Repl.
3. Configure a Resend `email.received` webhook to `https://<your-replit-domain>/api/webhooks/resend`.

The app stores the latest messages in `data/messages.json`; no database is required. Incoming mail is delivered to the inbox through the Resend webhook. Because Resend's `email.received` webhook contains metadata only, the app also retrieves the full received email from the Receiving API and can backfill messages when the inbox is refreshed.

Set both `RESEND_API_KEY` and the webhook signing secret from Resend (`RESEND_WEBHOOK_SECRET`). The webhook endpoint only processes signed `POST` requests; a `GET` request is only a health check.