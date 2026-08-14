# Founder Mail

A focused email dashboard for `rolebolt@founder.rolebolt.tech`.

## Run locally

```bash
npm run dev
```

The app runs on port 5000. Add `RESEND_API_KEY` as a Replit Secret to enable sending.

## Progressive Web App

The production build is installable as a PWA from a supported browser. It includes the Rolebolt app icon, standalone display mode, and an offline application shell. Email data and send/sync actions still require a connection and are never cached by the service worker.

## Deploy on Render

- **Service type:** Web Service
- **Build command:** `npm ci --registry=https://registry.npmjs.org --no-audit --no-fund && npm run build`
- **Start command:** `npm start`
- **Environment variable:** `RESEND_API_KEY`
- Render provides the `PORT` value automatically.

## Resend setup

1. Verify `founder.rolebolt.tech` in Resend and use `rolebolt@founder.rolebolt.tech` as the sender.
2. Add the `RESEND_API_KEY` secret to this Repl.
3. Configure a Resend `email.received` webhook to `https://<your-replit-domain>/api/webhooks/resend`.

The app stores the latest messages in `data/messages.json`; no database is required. Incoming mail is delivered to the inbox through the Resend webhook. Because Resend's `email.received` webhook contains metadata only, the app also retrieves the full received email from the Receiving API and can backfill messages when the inbox is refreshed.

The Rolebolt logo is used throughout the mailbox UI for the sender identity and sent-message avatars. Recipient inbox profile images are controlled by the receiving mail provider; showing the logo there requires domain-level BIMI and DMARC configuration.

Outgoing mail is sent with both a plain-text fallback and a responsive HTML wrapper: Rolebolt branding, a restrained founder-style layout, and a footer link to `https://www.rolebolt.tech/`.

Set both `RESEND_API_KEY` and the webhook signing secret from Resend (`RESEND_WEBHOOK_SECRET`). The webhook endpoint only processes signed `POST` requests; a `GET` request is only a health check.

## Private workspace gate

In production, the app protects the mailbox behind a server-side password gate. Set `SITE_PASSWORD` as a secret. Visitors without the access cookie are redirected to `/blocked`; successful access is remembered in an HttpOnly, Secure cookie for one year. Webhook and health endpoints remain available for Resend and monitoring.