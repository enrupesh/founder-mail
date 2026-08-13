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

type Status = { configured: boolean; address: string };

const initialCompose = { to: "", subject: "", text: "" };

function Icon({ name }: { name: "inbox" | "send" | "plus" | "search" | "arrow" | "close" | "check" | "settings" }) {
  const paths: Record<string, string> = {
    inbox: '<path d="M4 4h16v13H4z"/><path d="M4 13h4l2 3h4l2-3h4"/><path d="M8 8h8"/>',
    send: '<path d="m21 3-7.7 17-3.3-7-7-3.3Z"/><path d="M10 13 21 3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="m19.4 15 .1.1a2 2 0 1 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.2a2 2 0 1 1-4 0v-.2a2 2 0 0 0-3.4-1.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A2 2 0 0 0 1.6 12a2 2 0 1 1 0-4h.2A2 2 0 0 0 3.2 4.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A2 2 0 0 0 9.4.5V.3a2 2 0 1 1 4 0v.2a2 2 0 0 0 3.4 1.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A2 2 0 0 0 21 8h.2a2 2 0 1 1 0 4H21a2 2 0 0 0-1.6 3Z"/>',
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: paths[name] }} />;
}

function formatDate(date: string) {
  const value = new Date(date);
  return value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(date: string) {
  return new Date(date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function App() {
  const [messages, setMessages] = useState<Mail[]>([]);
  const [status, setStatus] = useState<Status>({ configured: false, address: "rolebolt@founder.rolebolt.tech" });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState(initialCompose);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    const [messageResponse, statusResponse] = await Promise.all([fetch("/api/messages"), fetch("/api/status")]);
    setMessages(await messageResponse.json());
    setStatus(await statusResponse.json());
  };

  useEffect(() => { void load(); }, []);

  const unread = messages.filter((message) => message.direction === "inbound" && !message.read).length;
  const inbound = messages.filter((message) => message.direction === "inbound");
  const filtered = useMemo(() => messages.filter((message) => {
    const text = `${message.subject} ${message.from} ${message.to} ${message.text}`.toLowerCase();
    return text.includes(query.toLowerCase());
  }), [messages, query]);
  const active = messages.find((message) => message.id === activeId) || null;

  const selectMessage = async (message: Mail) => {
    setActiveId(message.id);
    if (!message.read && message.direction === "inbound") {
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, read: true } : item));
      await fetch(`/api/messages/${message.id}/read`, { method: "POST" });
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setNotice("");
    const response = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(compose),
    });
    const result = await response.json();
    setSending(false);
    if (!response.ok) {
      setNotice(result.error || "Could not send the email.");
      return;
    }
    setCompose(initialCompose);
    setComposeOpen(false);
    setNotice("Email sent successfully.");
    await load();
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">R</div>
          <div><strong>Founder Mail</strong><span>Rolebolt workspace</span></div>
        </div>
        <button className="compose-button" onClick={() => { setComposeOpen(true); setNotice(""); }}>
          <Icon name="plus" /> Compose
        </button>
        <nav className="nav">
          <button className="nav-item active"><Icon name="inbox" /><span>Inbox</span><b>{unread || ""}</b></button>
          <button className="nav-item" onClick={() => setComposeOpen(true)}><Icon name="send" /><span>Sent</span><b>{messages.filter((m) => m.direction === "outbound").length || ""}</b></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="connection-card">
            <div className={`status-dot ${status.configured ? "online" : ""}`} />
            <div><strong>{status.configured ? "Resend connected" : "Setup required"}</strong><span>{status.configured ? "Ready to send" : "Add your API key"}</span></div>
            <Icon name="settings" />
          </div>
          <div className="user-row"><div className="avatar">RB</div><div><strong>Rolebolt</strong><span>{status.address}</span></div><span className="user-more">•••</span></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="eyebrow">MAILBOX / <span>INBOX</span></div>
          <div className="top-actions"><span className={`live-pill ${status.configured ? "ready" : ""}`}><i />{status.configured ? "Live" : "Not connected"}</span><button className="icon-button" aria-label="Settings"><Icon name="settings" /></button></div>
        </header>
        <section className="content">
          <div className="page-heading">
            <div><div className="heading-kicker">ROLEBOLT INBOX <span>·</span> {formatDate(new Date().toISOString()).toUpperCase()}</div><h1>Good morning, <em>founder.</em></h1><p>Your inbox, without the noise.</p></div>
            <button className="refresh-button" onClick={() => void load()}><span>Refresh inbox</span><Icon name="arrow" /></button>
          </div>

          {!status.configured && <div className="setup-banner"><div className="setup-icon"><Icon name="send" /></div><div><strong>Connect Resend to send and receive</strong><p>Add <code>RESEND_API_KEY</code> to Replit Secrets, then verify <code>founder.rolebolt.tech</code> in Resend.</p></div><span className="setup-step">1 / 2</span></div>}
          {notice && <div className={`notice ${notice.includes("successfully") ? "success" : ""}`}><Icon name={notice.includes("successfully") ? "check" : "close"} />{notice}</div>}

          <div className="metrics">
            <div className="metric"><span>UNREAD</span><strong>{String(unread).padStart(2, "0")}</strong><small>in your inbox</small></div>
            <div className="metric"><span>ALL MESSAGES</span><strong>{String(inbound.length).padStart(2, "0")}</strong><small>received total</small></div>
            <div className="metric"><span>MAILBOX</span><strong className="metric-address">{status.address.split("@")[0]}</strong><small>{status.address.split("@")[1]}</small></div>
          </div>

          <div className="inbox-toolbar"><div className="section-title"><h2>Inbox</h2><span>{inbound.length} {inbound.length === 1 ? "message" : "messages"}</span></div><label className="search"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search messages" /></label></div>

          <div className="mail-layout">
            <div className="message-list">
              {filtered.length === 0 ? <div className="empty-state"><div className="empty-icon"><Icon name="inbox" /></div><h3>{query ? "No matching messages" : "Your inbox is clear"}</h3><p>{query ? "Try a different search." : "Messages sent to your Rolebolt address will appear here."}</p></div> : filtered.map((message) => (
                <button key={message.id} className={`message-row ${activeId === message.id ? "selected" : ""} ${!message.read ? "unread" : ""}`} onClick={() => void selectMessage(message)}>
                  <div className={`mail-avatar ${message.direction}`}>{(message.from.replace(/[^a-z]/gi, "").slice(0, 2) || "??").toUpperCase()}</div>
                  <div className="message-copy"><div className="message-meta"><strong>{message.direction === "inbound" ? message.from : `To ${message.to}`}</strong><time>{formatDate(message.timestamp)}</time></div><h3>{message.subject}</h3><p>{message.text}</p></div>
                  {!message.read && <span className="unread-dot" />}
                </button>
              ))}
            </div>
            <div className={`message-detail ${active ? "has-message" : ""}`}>
              {active ? <><div className="detail-header"><div className={`mail-avatar large ${active.direction}`}>{(active.from.replace(/[^a-z]/gi, "").slice(0, 2) || "??").toUpperCase()}</div><div><span className="detail-label">{active.direction === "inbound" ? "RECEIVED" : "SENT"} · {formatDate(active.timestamp)}</span><h2>{active.subject}</h2></div><button className="close-detail" onClick={() => setActiveId(null)}><Icon name="close" /></button></div><div className="detail-address"><span>From</span><strong>{active.from}</strong><span>To</span><strong>{active.to}</strong></div><div className="detail-body">{active.text.split("\n").map((line, index) => <p key={index}>{line || "\u00a0"}</p>)}</div><div className="detail-footer"><button onClick={() => { setCompose({ to: active.from, subject: `Re: ${active.subject}`, text: "" }); setComposeOpen(true); }}>Reply <Icon name="arrow" /></button></div></> : <div className="detail-placeholder"><div className="placeholder-line" /><div className="placeholder-line short" /><p>Select a message to read it</p></div>}
            </div>
          </div>
        </section>
      </main>

      {composeOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposeOpen(false); }}><form className="compose-modal" onSubmit={submit}><div className="modal-head"><div><span className="detail-label">NEW MESSAGE</span><h2>Compose email</h2></div><button type="button" className="close-detail" onClick={() => setComposeOpen(false)}><Icon name="close" /></button></div><div className="from-line"><span>From</span><strong>{status.address}</strong></div><label>To<input type="email" required value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} placeholder="recipient@example.com" /></label><label>Subject<input required value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} placeholder="What's this about?" /></label><label>Message<textarea required rows={7} value={compose.text} onChange={(e) => setCompose({ ...compose, text: e.target.value })} placeholder="Write your message..." /></label><div className="modal-actions"><span>{status.configured ? "Sent securely via Resend" : "Resend API key required"}</span><button className="send-button" type="submit" disabled={sending}>{sending ? "Sending…" : "Send message"} <Icon name="arrow" /></button></div></form></div>}
    </div>
  );
}

export default App;