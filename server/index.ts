import express, { type Request, type Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Webhook } from "svix";
import { createServer as createViteServer } from "vite";

const app = express();
const port = Number(process.env.PORT || 5000);
const sender = "rolebolt@founder.rolebolt.tech";
const websiteUrl = "https://www.rolebolt.tech/";
const dataPath = path.resolve("data/messages.json");
const deletedDataPath = path.resolve("data/deleted-messages.json");
const accessCookieName = "founder_mail_access";
const accessCookieMaxAge = 60 * 60 * 24 * 365;
const unlockAttempts = new Map<string, { count: number; resetAt: number }>();

type Mail = {
  id: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  timestamp: string;
  read?: boolean;
  status?: "sent" | "received";
};

type ResendReceivedEmail = {
  id?: string;
  from?: string;
  to?: string[];
  subject?: string;
  text?: string;
  html?: string;
  created_at?: string;
};

function hasResendKey() {
  return Boolean(process.env.RESEND_API_KEY);
}

function hasWebhookSecret() {
  return Boolean(process.env.RESEND_WEBHOOK_SECRET);
}

function hasSitePassword() {
  return Boolean(process.env.SITE_PASSWORD);
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] || character,
  );
}

function textToEmailHtml(value: string) {
  return value
    .trim()
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 18px;color:#4e6782;font-size:16px;line-height:1.75;">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
}

function buildEmailHtml(subject: string, text: string) {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
  <body style="margin:0;background:#f4f8fc;color:#132a43;font-family:Arial,Helvetica,sans-serif;">
    <div style="padding:36px 16px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dce8f3;border-radius:18px;overflow:hidden;box-shadow:0 12px 35px rgba(23,76,128,.08);">
        <div style="height:5px;background:#0d6dcc;"></div>
        <div style="padding:28px 34px 22px;border-bottom:1px solid #e7eef5;">
          <a href="${websiteUrl}" style="color:#132a43;text-decoration:none;font-size:18px;font-weight:700;">
            <span style="display:inline-block;width:30px;height:30px;margin-right:10px;border-radius:9px;background:#0d6dcc;color:#ffffff;line-height:30px;text-align:center;vertical-align:middle;font-size:16px;">R</span>
            <span style="vertical-align:middle;">Rolebolt</span>
          </a>
        </div>
        <div style="padding:34px 34px 26px;">
          <div style="margin-bottom:12px;color:#0d6dcc;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">A note from Rolebolt</div>
          <h1 style="margin:0 0 22px;color:#132a43;font-size:30px;line-height:1.2;letter-spacing:-.7px;">${escapeHtml(subject)}</h1>
          ${textToEmailHtml(text)}
        </div>
        <div style="padding:22px 34px 28px;background:#f7faff;border-top:1px solid #e7eef5;">
          <div style="color:#132a43;font-size:14px;font-weight:700;">Rolebolt</div>
          <div style="margin-top:6px;color:#7189a1;font-size:13px;line-height:1.6;">Thoughtful hiring. Clearer work.</div>
          <a href="${websiteUrl}" style="display:inline-block;margin-top:12px;color:#0d6dcc;font-size:13px;font-weight:700;text-decoration:none;">www.rolebolt.tech&nbsp;→</a>
        </div>
      </div>
      <div style="max-width:640px;margin:16px auto 0;color:#91a4b7;font-size:11px;line-height:1.6;text-align:center;">
        Sent from Founder Mail · Rolebolt
      </div>
    </div>
  </body>
</html>`;
}

function getCookies(req: Request) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, ...value]) => [key, value.join("=")]),
  );
}

function getAccessToken() {
  if (!process.env.SITE_PASSWORD) return null;
  return createHmac("sha256", process.env.SITE_PASSWORD)
    .update("founder-mail-access-v1")
    .digest("hex");
}

function hasAccess(req: Request) {
  const expected = getAccessToken();
  const received = getCookies(req)[accessCookieName];
  if (!expected || !received) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function publicRequest(req: Request) {
  return (
    req.path === "/blocked" ||
    req.path === "/api/auth/unlock" ||
    req.path === "/api/health" ||
    req.path === "/api/webhooks/resend" ||
    req.path === "/favicon.svg" ||
    req.path === "/blocked-art.svg" ||
    req.path.startsWith("/assets/") ||
    req.path.startsWith("/@") ||
    req.path.startsWith("/client/")
  );
}

function siteGate(req: Request, res: Response, next: () => void) {
  if (process.env.NODE_ENV !== "production" || publicRequest(req) || hasAccess(req)) {
    return next();
  }

  if (!hasSitePassword()) {
    return res.status(503).send("Founder Mail access is not configured.");
  }

  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Authentication required.", redirect: "/blocked" });
  }
  return res.redirect("/blocked");
}

function requestIp(req: Request) {
  return req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || "unknown";
}

function canAttemptUnlock(ip: string) {
  const attempt = unlockAttempts.get(ip);
  if (!attempt || attempt.resetAt <= Date.now()) {
    unlockAttempts.delete(ip);
    return true;
  }
  return attempt.count < 5;
}

function recordUnlockFailure(ip: string) {
  const existing = unlockAttempts.get(ip);
  if (!existing || existing.resetAt <= Date.now()) {
    unlockAttempts.set(ip, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
  } else {
    existing.count += 1;
  }
}

function passwordMatches(password: string) {
  const expected = Buffer.from(process.env.SITE_PASSWORD || "");
  const received = Buffer.from(password);
  return expected.length > 0 && expected.length === received.length && timingSafeEqual(expected, received);
}

async function readMessages(): Promise<Mail[]> {
  try {
    return JSON.parse(await fs.readFile(dataPath, "utf8")) as Mail[];
  } catch {
    return [];
  }
}

async function writeMessages(messages: Mail[]) {
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify(messages.slice(0, 100), null, 2));
}

async function readDeletedMessageIds() {
  try {
    const deleted = JSON.parse(await fs.readFile(deletedDataPath, "utf8")) as unknown;
    return new Set(Array.isArray(deleted) ? deleted.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set<string>();
  }
}

async function writeDeletedMessageIds(deletedIds: Set<string>) {
  await fs.mkdir(path.dirname(deletedDataPath), { recursive: true });
  await fs.writeFile(deletedDataPath, JSON.stringify([...deletedIds], null, 2));
}

async function resendRequest<T>(endpoint: string): Promise<T | null> {
  if (!hasResendKey()) return null;

  const response = await fetch(`https://api.resend.com${endpoint}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  if (!response.ok) {
    console.error(`Resend request failed (${response.status})`, endpoint);
    return null;
  }
  return (await response.json()) as T;
}

async function getReceivedEmail(emailId: string) {
  return resendRequest<ResendReceivedEmail>(`/emails/receiving/${encodeURIComponent(emailId)}`);
}

function receivedMessageFrom(
  data: Record<string, unknown>,
  content?: ResendReceivedEmail | null,
): Mail {
  const toValue = content?.to || data.to;
  const to = Array.isArray(toValue) ? String(toValue[0] || sender) : String(toValue || sender);
  const from = String(content?.from || data.from || data.sender || "unknown sender");
  const subject = String(content?.subject || data.subject || "(no subject)");
  const text = String(content?.text || data.text || data.body || "");
  const id = String(content?.id || data.email_id || data.id || `received-${Date.now()}`);

  return {
    id,
    direction: "inbound",
    from,
    to,
    subject,
    text,
    html: content?.html || (typeof data.html === "string" ? data.html : undefined),
    timestamp: String(content?.created_at || data.created_at || new Date().toISOString()),
    status: "received",
    read: false,
  };
}

async function saveReceivedMessage(message: Mail) {
  const deletedIds = await readDeletedMessageIds();
  if (deletedIds.has(message.id)) return false;

  const messages = await readMessages();
  const existing = messages.find((item) => item.id === message.id);

  if (existing) {
    Object.assign(existing, {
      ...message,
      read: existing.read,
    });
  } else {
    messages.push(message);
  }
  await writeMessages(messages);
  return true;
}

async function syncReceivedMessages() {
  const result = await resendRequest<{ data?: ResendReceivedEmail[] }>(
    "/emails/receiving?limit=100",
  );
  if (!result?.data) return 0;

  let synced = 0;
  for (const item of result.data) {
    if (!item.id) continue;
    const content = await getReceivedEmail(item.id);
    await saveReceivedMessage(receivedMessageFrom(item as Record<string, unknown>, content));
    synced += 1;
  }
  return synced;
}

// Resend signs the raw request body. This route must be registered before
// express.json() so the payload is not parsed before signature verification.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "founder-mail" });
});

app.get("/api/webhooks/resend", (_req, res) => {
  res.json({
    ok: true,
    method: "POST",
    signed: hasWebhookSecret(),
    message: "Resend should deliver email.received events to this URL with POST.",
  });
});

app.post("/api/webhooks/resend", express.raw({ type: "application/json", limit: "2mb" }), async (req, res) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ error: "RESEND_WEBHOOK_SECRET is not configured." });
  }

  const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
  let body: { type?: string; data?: Record<string, unknown> };
  try {
    body = new Webhook(secret).verify(payload, {
      "svix-id": String(req.header("svix-id") || ""),
      "svix-timestamp": String(req.header("svix-timestamp") || ""),
      "svix-signature": String(req.header("svix-signature") || ""),
    }) as { type?: string; data?: Record<string, unknown> };
  } catch {
    return res.status(400).json({ error: "Invalid webhook signature." });
  }

  if (body.type && body.type !== "email.received") {
    return res.json({ ok: true, ignored: true });
  }

  const data = (body.data || body) as Record<string, unknown>;
  const emailId = String(data.email_id || data.id || "");
  const content = emailId ? await getReceivedEmail(emailId) : null;
  await saveReceivedMessage(receivedMessageFrom(data, content));
  res.json({ ok: true });
});

// The unlock endpoint is intentionally public; all other app APIs/pages are
// gated below. Password values never get logged or sent back to the browser.
app.use(express.json({ limit: "2mb" }));

app.post("/api/auth/unlock", (req, res) => {
  const ip = requestIp(req);
  if (!hasSitePassword()) {
    return res.status(503).json({ error: "Site access is not configured." });
  }
  if (!canAttemptUnlock(ip)) {
    return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  }

  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!passwordMatches(password)) {
    recordUnlockFailure(ip);
    return res.status(401).json({ error: "That password is not correct." });
  }

  unlockAttempts.delete(ip);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${accessCookieName}=${getAccessToken()}; Max-Age=${accessCookieMaxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`,
  );
  res.json({ ok: true, redirect: "/" });
});

app.use(siteGate);

app.get("/api/status", (_req, res) => {
  res.json({
    configured: hasResendKey(),
    webhookConfigured: hasWebhookSecret(),
    receivingConfigured: hasResendKey(),
    address: sender,
    webhookPath: "/api/webhooks/resend",
  });
});

app.get("/api/messages", async (_req, res) => {
  const messages = await readMessages();
  res.json(messages.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
});

app.post("/api/sync", async (_req, res) => {
  if (!hasResendKey()) {
    return res.status(503).json({
      error: "Resend is not configured yet. Add RESEND_API_KEY in Replit Secrets.",
    });
  }

  const synced = await syncReceivedMessages();
  res.json({ ok: true, synced });
});

app.post("/api/messages/:id/read", async (req, res) => {
  const messages = await readMessages();
  const message = messages.find((item) => item.id === req.params.id);
  if (!message) return res.status(404).json({ error: "Message not found" });
  message.read = true;
  await writeMessages(messages);
  res.json(message);
});

app.delete("/api/messages/:id", async (req, res) => {
  const id = req.params.id;
  const messages = await readMessages();
  const message = messages.find((item) => item.id === id);
  if (!message) return res.status(404).json({ error: "Message not found" });

  const deletedIds = await readDeletedMessageIds();
  deletedIds.add(id);
  await writeDeletedMessageIds(deletedIds);
  await writeMessages(messages.filter((item) => item.id !== id));
  res.json({ ok: true, id });
});

app.post("/api/send", async (req, res) => {
  const { to, subject, text } = req.body as {
    to?: string;
    subject?: string;
    text?: string;
  };

  if (!to || !subject || !text) {
    return res.status(400).json({ error: "To, subject, and message are required." });
  }
  if (!hasResendKey()) {
    return res.status(503).json({
      error: "Resend is not configured yet. Add RESEND_API_KEY in Replit Secrets.",
    });
  }

  const html = buildEmailHtml(subject, text);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: sender, to: [to], subject, text, html }),
  });

  const payload = (await response.json()) as { id?: string; message?: string };
  if (!response.ok) {
    return res.status(response.status).json({
      error: payload.message || "Resend could not send this email.",
    });
  }

  const messages = await readMessages();
  messages.push({
    id: payload.id || `sent-${Date.now()}`,
    direction: "outbound",
    from: sender,
    to,
    subject,
    text,
    html,
    timestamp: new Date().toISOString(),
    status: "sent",
    read: true,
  });
  await writeMessages(messages);
  res.json({ ok: true });
});

async function start() {
  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve("dist");
    app.use(express.static(distPath));
    app.use((req, res, next) => {
      if (req.method === "GET" && !req.path.startsWith("/api")) {
        return res.sendFile(path.join(distPath, "index.html"));
      }
      next();
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: "0.0.0.0" },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`Founder Mail running on port ${port}`);
  });
}

void start();