import express, { type Request, type Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer as createViteServer } from "vite";

const app = express();
const port = Number(process.env.PORT || 5000);
const sender = "rolebolt@founder.rolebolt.tech";
const dataPath = path.resolve("data/messages.json");

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

function hasResendKey() {
  return Boolean(process.env.RESEND_API_KEY);
}

app.use(express.json({ limit: "2mb" }));

app.get("/api/status", (_req, res) => {
  res.json({
    configured: hasResendKey(),
    address: sender,
    webhookPath: "/api/webhooks/resend",
  });
});

app.get("/api/messages", async (_req, res) => {
  const messages = await readMessages();
  res.json(messages.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
});

app.post("/api/messages/:id/read", async (req, res) => {
  const messages = await readMessages();
  const message = messages.find((item) => item.id === req.params.id);
  if (!message) return res.status(404).json({ error: "Message not found" });
  message.read = true;
  await writeMessages(messages);
  res.json(message);
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

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: sender, to: [to], subject, text }),
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
    timestamp: new Date().toISOString(),
    status: "sent",
    read: true,
  });
  await writeMessages(messages);
  res.json({ ok: true });
});

// Configure a Resend email.received webhook to point to this endpoint.
app.post("/api/webhooks/resend", async (req, res) => {
  const body = req.body as { type?: string; data?: Record<string, unknown> };
  const data = (body.data || body) as Record<string, unknown>;
  const to = Array.isArray(data.to) ? String(data.to[0] || sender) : String(data.to || sender);
  const from = String(data.from || data.sender || "unknown sender");
  const subject = String(data.subject || "(no subject)");
  const text = String(data.text || data.body || "");

  if (body.type && body.type !== "email.received") {
    return res.json({ ok: true, ignored: true });
  }

  const messages = await readMessages();
  const id = String(data.email_id || data.id || `received-${Date.now()}`);
  if (!messages.some((message) => message.id === id)) {
    messages.push({
      id,
      direction: "inbound",
      from,
      to,
      subject,
      text,
      html: typeof data.html === "string" ? data.html : undefined,
      timestamp: String(data.created_at || new Date().toISOString()),
      status: "received",
      read: false,
    });
    await writeMessages(messages);
  }
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