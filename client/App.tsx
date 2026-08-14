import { FormEvent, useEffect, useMemo, useState } from "react";

type Mail = {
  id: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  subject: string;
  text: string;
  timestamp: string;
  read?: boolean;
  status?: "sent" | "received";
};

type Status = {
  configured: boolean;
  webhookConfigured?: boolean;
  receivingConfigured?: boolean;
  address: string;
};

type View = "inbox" | "sent";

const initialCompose = { to: "", subject: "", text: "" };

function Icon({
  name,
}: {
  name:
    | "inbox"
    | "send"
    | "plus"
    | "search"
    | "arrow"
    | "close"
    | "check"
    | "settings"
    | "refresh";
}) {
  const paths: Record<string, string> = {
    inbox: '<path d="M4 4h16v13H4z"/><path d="M4 13h4l2 3h4l2-3h4"/><path d="M8 8h8"/>',
    send: '<path d="m21 3-7.7 17-3.3-7-7-3.3Z"/><path d="M10 13 21 3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    refresh:
      '<path d="M20 11a8 8 0 0 0-14.9-4M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14.9 4M20 19v-4h-4"/>',
    settings:
      '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="m19.4 15 .1.1a2 2 0 1 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.2a2 2 0 1 1-4 0v-.2a2 2 0 0 0-3.4-1.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A2 2 0 0 0 1.6 12a2 2 0 1 1 0-4h.2A2 2 0 0 0 3.2 4.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A2 2 0 0 0 9.4.5V.3a2 2 0 1 1 4 0v.2a2 2 0 0 0 3.4 1.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A2 2 0 0 0 21 8h.2a2 2 0 1 1 0 4H21a2 2 0 0 0-1.6 3Z"/>',
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: paths[name] }} />
  );
}

function formatDate(date: string) {
  const value = new Date(date);
  return value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(date: string) {
  return new Date(date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function initials(value: string) {
  return (value.replace(/[^a-z]/gi, "").slice(0, 2) || "??").toUpperCase();
}

function App() {
  const [messages, setMessages] = useState<Mail[]>([]);
  const [status, setStatus] = useState<Status>({
    configured: false,
    address: "rolebolt@founder.rolebolt.tech",
  });
  const [view, setView] = useState<View>("inbox");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState(initialCompose);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = async (sync = false) => {
    setSyncing(sync);
    try {
      const [messageResponse, statusResponse] = await Promise.all([
        fetch("/api/messages"),
        fetch("/api/status"),
      ]);
      setMessages(await messageResponse.json());
      const nextStatus = await statusResponse.json();
      setStatus(nextStatus);
      if (sync && nextStatus.configured) {
        await fetch("/api/sync", { method: "POST" });
        setMessages(await (await fetch("/api/messages")).json());
      }
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void load(true);
  }, []);

  const inbound = messages.filter((message) => message.direction === "inbound");
  const outbound = messages.filter((message) => message.direction === "outbound");
  const unread = inbound.filter((message) => !message.read).length;
  const visibleMessages = view === "inbox" ? inbound : outbound;
  const filtered = useMemo(
    () =>
      visibleMessages.filter((message) => {
        const text = `${message.subject} ${message.from} ${message.to} ${message.text}`.toLowerCase();
        return text.includes(query.toLowerCase());
      }),
    [visibleMessages, query],
  );
  const active = messages.find((message) => message.id === activeId) || null;
  const viewTitle = view === "inbox" ? "Inbox" : "Sent";

  const selectMessage = async (message: Mail) => {
    setActiveId(message.id);
    if (!message.read && message.direction === "inbound") {
      setMessages((current) =>
        current.map((item) => (item.id === message.id ? { ...item, read: true } : item)),
      );
      await fetch(`/api/messages/${message.id}/read`, { method: "POST" });
    }
  };

  const openCompose = (values = initialCompose) => {
    setCompose(values);
    setComposeOpen(true);
    setNotice("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setNotice("");
    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(compose),
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Could not send the email.");
        return;
      }
      setCompose(initialCompose);
      setComposeOpen(false);
      setNotice("Email sent successfully.");
      setView("sent");
      await load();
    } finally {
      setSending(false);
    }
  };

  const selectView = (nextView: View) => {
    setView(nextView);
    setActiveId(null);
    setQuery("");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">R</div>
          <div>
            <strong>Founder Mail</strong>
            <span>Rolebolt workspace</span>
          </div>
        </div>

        <button className="compose-button" onClick={() => openCompose()}>
          <Icon name="plus" /> Compose
        </button>

        <div className="nav-label">MAILBOX</div>
        <nav className="nav" aria-label="Mailbox">
          <button
            className={`nav-item ${view === "inbox" ? "active" : ""}`}
            onClick={() => selectView("inbox")}
          >
            <Icon name="inbox" />
            <span>Inbox</span>
            {unread > 0 && <b>{unread}</b>}
          </button>
          <button
            className={`nav-item ${view === "sent" ? "active" : ""}`}
            onClick={() => selectView("sent")}
          >
            <Icon name="send" />
            <span>Sent</span>
            {outbound.length > 0 && <b>{outbound.length}</b>}
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className={`connection-card ${status.configured && status.webhookConfigured ? "connected" : ""}`}>
            <div className="status-dot" />
            <div>
              <strong>
                {status.configured && status.webhookConfigured ? "Receiving is live" : "Setup required"}
              </strong>
              <span>
                {status.configured && status.webhookConfigured
                  ? "Resend connected"
                  : "Check Resend secrets"}
              </span>
            </div>
            <Icon name="settings" />
          </div>
          <div className="user-row">
            <div className="avatar">RB</div>
            <div>
              <strong>Rolebolt</strong>
              <span>{status.address}</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="eyebrow">
            MAILBOX <span>/</span> {view.toUpperCase()}
          </div>
          <div className="top-actions">
            <span className={`live-pill ${status.configured ? "ready" : ""}`}>
              <i />
              {status.configured ? "Resend connected" : "Not connected"}
            </span>
            <button className="icon-button" aria-label="Settings">
              <Icon name="settings" />
            </button>
          </div>
        </header>

        <section className="content">
          <div className="page-heading">
            <div>
              <div className="heading-kicker">
                {view === "inbox" ? "RECEIVED MAIL" : "OUTGOING MAIL"} <span>·</span>{" "}
                {formatDate(new Date().toISOString()).toUpperCase()}
              </div>
              <h1>
                {view === "inbox" ? (
                  <>
                    Your <em>inbox.</em>
                  </>
                ) : (
                  <>
                    Messages you <em>sent.</em>
                  </>
                )}
              </h1>
              <p>{view === "inbox" ? "Everything received at your Rolebolt address." : "A clear record of every outgoing message."}</p>
            </div>
            <button className="refresh-button" onClick={() => void load(true)} disabled={syncing}>
              <span>{syncing ? "Syncing…" : "Sync inbox"}</span>
              <Icon name="refresh" />
            </button>
          </div>

          {(!status.configured || !status.webhookConfigured) && (
            <div className="setup-banner">
              <div className="setup-icon"><Icon name="settings" /></div>
              <div>
                <strong>Receiving needs two Resend settings</strong>
                <p>
                  Add <code>RESEND_API_KEY</code> and <code>RESEND_WEBHOOK_SECRET</code>, then point
                  the <code>email.received</code> webhook to this app.
                </p>
              </div>
              <span className="setup-step">CHECK SETUP</span>
            </div>
          )}
          {notice && (
            <div className={`notice ${notice.includes("successfully") ? "success" : ""}`}>
              <Icon name={notice.includes("successfully") ? "check" : "close"} />
              {notice}
            </div>
          )}

          <div className="metrics">
            <div className="metric">
              <span>UNREAD</span>
              <strong>{String(unread).padStart(2, "0")}</strong>
              <small>in your inbox</small>
            </div>
            <div className="metric">
              <span>{view === "inbox" ? "RECEIVED" : "SENT"}</span>
              <strong>{String(visibleMessages.length).padStart(2, "0")}</strong>
              <small>{view === "inbox" ? "messages received" : "messages sent"}</small>
            </div>
            <div className="metric mailbox-metric">
              <span>MAILBOX</span>
              <strong>{status.address.split("@")[0]}</strong>
              <small>{status.address.split("@")[1]}</small>
            </div>
          </div>

          <div className="inbox-toolbar">
            <div className="section-title">
              <h2>{viewTitle}</h2>
              <span>{visibleMessages.length} {visibleMessages.length === 1 ? "message" : "messages"}</span>
            </div>
            <label className="search">
              <Icon name="search" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${viewTitle.toLowerCase()}`}
              />
            </label>
          </div>

          <div className="mail-layout">
            <div className="message-list">
              {filtered.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon"><Icon name={view === "inbox" ? "inbox" : "send"} /></div>
                  <h3>{query ? "No matching messages" : view === "inbox" ? "Your inbox is clear" : "Nothing sent yet"}</h3>
                  <p>
                    {query
                      ? "Try a different search."
                      : view === "inbox"
                        ? "New mail will appear here after the Resend webhook syncs."
                        : "Messages you send will be listed here."}
                  </p>
                </div>
              ) : (
                filtered.map((message) => (
                  <button
                    key={message.id}
                    className={`message-row ${activeId === message.id ? "selected" : ""} ${!message.read ? "unread" : ""}`}
                    onClick={() => void selectMessage(message)}
                  >
                    <div className={`mail-avatar ${message.direction}`}>{initials(message.from)}</div>
                    <div className="message-copy">
                      <div className="message-meta">
                        <strong>{message.direction === "inbound" ? message.from : `To ${message.to}`}</strong>
                        <time>{formatDate(message.timestamp)}</time>
                      </div>
                      <h3>{message.subject}</h3>
                      <p>{message.text || "No preview available yet — sync inbox to retrieve the message."}</p>
                    </div>
                    {!message.read && <span className="unread-dot" />}
                  </button>
                ))
              )}
            </div>

            <div className={`message-detail ${active ? "has-message" : ""}`}>
              {active ? (
                <>
                  <div className="detail-header">
                    <div className={`mail-avatar large ${active.direction}`}>{initials(active.from)}</div>
                    <div>
                      <span className="detail-label">
                        {active.direction === "inbound" ? "RECEIVED" : "SENT"} · {formatDate(active.timestamp)} · {formatTime(active.timestamp)}
                      </span>
                      <h2>{active.subject}</h2>
                    </div>
                    <button className="close-detail" onClick={() => setActiveId(null)} aria-label="Close message">
                      <Icon name="close" />
                    </button>
                  </div>
                  <div className="detail-address">
                    <span>From</span><strong>{active.from}</strong>
                    <span>To</span><strong>{active.to}</strong>
                  </div>
                  <div className="detail-body">
                    {active.text
                      ? active.text.split("\n").map((line, index) => <p key={index}>{line || "\u00a0"}</p>)
                      : <p className="detail-muted">The email was received by Resend. Use “Sync inbox” to fetch its full content.</p>}
                  </div>
                  <div className="detail-footer">
                    {active.direction === "inbound" && (
                      <button onClick={() => openCompose({ to: active.from, subject: `Re: ${active.subject}`, text: "" })}>
                        Reply <Icon name="arrow" />
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="detail-placeholder">
                  <div className="placeholder-line" />
                  <div className="placeholder-line short" />
                  <p>Select a message to read it</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {composeOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setComposeOpen(false);
          }}
        >
          <form className="compose-modal" onSubmit={submit}>
            <div className="modal-head">
              <div>
                <span className="detail-label">NEW MESSAGE</span>
                <h2>Compose email</h2>
              </div>
              <button type="button" className="close-detail" onClick={() => setComposeOpen(false)} aria-label="Close compose">
                <Icon name="close" />
              </button>
            </div>
            <div className="from-line"><span>From</span><strong>{status.address}</strong></div>
            <label>TO<input type="email" required value={compose.to} onChange={(event) => setCompose({ ...compose, to: event.target.value })} placeholder="recipient@example.com" /></label>
            <label>SUBJECT<input required value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} placeholder="What's this about?" /></label>
            <label>MESSAGE<textarea required rows={7} value={compose.text} onChange={(event) => setCompose({ ...compose, text: event.target.value })} placeholder="Write your message…" /></label>
            <div className="modal-actions">
              <span>{status.configured ? "Sent securely via Resend" : "Resend API key required"}</span>
              <button className="send-button" type="submit" disabled={sending}>
                {sending ? "Sending…" : "Send message"} <Icon name="arrow" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;