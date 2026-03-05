import React, { useEffect, useMemo, useState } from "react";
import { AppIconT, COLORS, TradesmanBadge } from "./brand/Brand";
import { IconLeads, IconConvos, IconQuotes, IconCalendar } from "./brand/ToolboxIcons";
import logoImg from "./assets/logo.png";
import leadsImg from "./assets/toolboxes/leads.png";
import convosImg from "./assets/toolboxes/conversations.png";
import quotesImg from "./assets/toolboxes/quotes.png";
import calendarImg from "./assets/toolboxes/calendar.png";

const TOOLBOXES = [
  { key: "leads", title: "Leads", subtitle: "New, Needs Call, Waiting", badge: 3, Icon: IconLeads },
  { key: "convos", title: "Conversations", subtitle: "All customer threads", badge: 2, Icon: IconConvos },
  { key: "quotes", title: "Quotes", subtitle: "Draft → Sent → Approved", badge: 1, Icon: IconQuotes },
  { key: "calendar", title: "Calendar", subtitle: "Today + follow-ups", badge: 0, Icon: IconCalendar },
];

const HOME_TOOLBOXES = [
  { key: "leads", title: "Leads", img: leadsImg },
  { key: "convos", title: "Conversations", img: convosImg },
  { key: "quotes", title: "Quotes", img: quotesImg },
  { key: "calendar", title: "Calendar", img: calendarImg },
  { key: "tech-support", title: "Tech Support", img: null },
  { key: "web-support", title: "Web Support", img: null },
];

const SAMPLE_LEADS = [
  { id: "L-1001", name: "Mark D.", trade: "HVAC", status: "New", summary: "AC not cooling • Easley 29640 • this week", time: "3m" },
  { id: "L-1002", name: "Unknown Caller", trade: "Glass", status: "Needs Call", summary: "Cracked window • Greer 29650 • prefers text", time: "22m" },
  { id: "L-1003", name: "Amy R.", trade: "GC", status: "Waiting", summary: "Deck repair • Spartanburg 29301 • flexible", time: "1d" },
];

const SAMPLE_THREADS = [
  {
    id: "C-2001",
    name: "Mark D.",
    last: "Thermostat shows E3.",
    unread: true,
    messages: [
      { from: "system", text: "Missed call → auto-text sent.", t: "2:14pm" },
      { from: "customer", text: "AC not cooling. Thermostat says E3.", t: "2:16pm" },
      { from: "you", text: "Got it. What's the address/zip and best time to call?", t: "2:17pm" },
    ],
  },
  {
    id: "C-2002",
    name: "Unknown Caller",
    last: "I can send photos.",
    unread: false,
    messages: [
      { from: "system", text: "Missed call → auto-text sent.", t: "10:02am" },
      { from: "customer", text: "Cracked window in Greer. I can send photos.", t: "10:05am" },
    ],
  },
];

const SAMPLE_QUOTES = [
  { id: "Q-3001", customer: "Amy R.", status: "Draft", amount: "$1,850", updated: "Today" },
  { id: "Q-3002", customer: "Mark D.", status: "Sent", amount: "$245", updated: "Yesterday" },
];

const SAMPLE_EVENTS = [
  { time: "8:30am", title: "Follow up: Mark D. (HVAC)", note: "Call + schedule visit" },
  { time: "11:00am", title: "Site check: Amy R. (Deck repair)", note: "Bring measurements" },
  { time: "3:15pm", title: "Glass quote: Greer window", note: "Request photos" },
];

import ToolboxGrid from "./components/ToolboxGrid";

function App() {
  return (
    <div className="App">
      <ToolboxGrid />
    </div>
  );
}

export default App;

function Splash() {
  return (
    <div style={stylesSplash.container}>
      <img src={logoImg} alt="Tradesman" style={stylesSplash.logo} />
      <div style={stylesSplash.tagline}>BUILT FOR CONTRACTORS</div>
    </div>
  );
}

const stylesSplash = {
  container: {
    backgroundColor: "#111111",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 280,
    marginBottom: 24,
  },
  tagline: {
    color: "#F0F0F0",
    letterSpacing: "4px",
    fontWeight: 600,
  },
};

function Toolbox({ image, badge }) {
  return (
    <div className="toolbox">
      {badge && <div className="badge">{badge}</div>}
      <div className="toolbox-inner">
        <img src={image} style={{ width: "100%", display: "block" }} />
      </div>
    </div>
  );
}

function ToolboxScreen({ onOpenToolbox }) {
  const items = [
    { key: "leads", title: "LEADS", badge: 3, image: leadsImg },
    { key: "convos", title: "CONVERSATIONS", badge: 2, image: convosImg },
    { key: "quotes", title: "QUOTES", image: quotesImg },
    { key: "calendar", title: "CALENDAR", image: calendarImg },
    { key: "tech-support", title: "TECH SUPPORT", image: "/toolboxes/tech.png" },
    { key: "web-support", title: "WEB SUPPORT", image: "/toolboxes/web.png" },
  ];
  return (
    <div className="screen">
      <div className="header">
        <img src={logoImg} height="28" alt="Tradesman" />
      </div>

      <div className="toolbox-grid">
        {items.map((item) => (
          <div
            key={item.key}
            role="button"
            tabIndex={0}
            onClick={onOpenToolbox ? () => onOpenToolbox(item.key) : undefined}
            onKeyDown={onOpenToolbox ? (e) => e.key === "Enter" && onOpenToolbox(item.key) : undefined}
            style={onOpenToolbox ? { cursor: "pointer" } : undefined}
          >
            <Toolbox image={item.image} badge={item.badge} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Header({ title, onBack, isHome }) {
  return (
    <div
      style={{
        background: isHome ? "transparent" : COLORS.charcoal,
        borderBottom: `3px solid ${COLORS.orange}`,
        padding: "12px 14px",
      }}
    >
      <div style={{ maxWidth: 520, margin: "0 auto", display: "flex", gap: 10, alignItems: "center" }}>
        {onBack ? (
          <button
            onClick={onBack}
            style={{
              background: "transparent",
              color: COLORS.white,
              border: `2px solid rgba(255,255,255,0.25)`,
              borderRadius: 12,
              padding: "8px 10px",
              fontWeight: 800,
            }}
          >
            ←
          </button>
        ) : (
          <div style={{ width: 44 }} />
        )}

        <div style={{ flex: 1 }}>
          <div style={{ color: COLORS.white, fontWeight: 900, fontSize: 18, letterSpacing: 0.4 }}>
            {title}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ transform: "scale(0.78)", transformOrigin: "right center" }}>
            <TradesmanBadge size="sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolboxImage({ src, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        marginBottom: 28,
        cursor: "pointer",
        transition: "transform 0.15s ease",
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <img
        src={src}
        alt="toolbox"
        style={{
          width: "100%",
          display: "block",
          borderRadius: 16,
        }}
      />
    </div>
  );
}

function ToolboxHome({ onOpen }) {
  return (
    <div
      style={{
        background: "#0d0d0d",
        minHeight: "100vh",
        padding: "24px 16px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
        }}
      >
        {HOME_TOOLBOXES.map((tb) =>
          tb.img ? (
            <ToolboxImage
              key={tb.key}
              src={tb.img}
              onClick={() => onOpen({ key: tb.key })}
            />
          ) : (
            <ToolboxCardPlaceholder
              key={tb.key}
              title={tb.title}
              onClick={() => onOpen({ key: tb.key })}
            />
          )
        )}
      </div>
    </div>
  );
}

function ToolboxCardPlaceholder({ title, onClick }) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      style={{
        marginBottom: 28,
        cursor: "pointer",
        transition: "transform 0.15s ease",
        background: COLORS.charcoal,
        border: `3px solid ${COLORS.orange}`,
        borderRadius: 16,
        padding: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 100,
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <span style={{ color: COLORS.white, fontWeight: 800, fontSize: 16, letterSpacing: "0.5px" }}>
        {title}
      </span>
    </div>
  );
}

function ToolboxCard({ tb, onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{
        textAlign: "left",
        border: "0",
        padding: 0,
        background: "transparent",
      }}
    >
      <div
        style={{
          background: COLORS.charcoal,
          borderRadius: 18,
          border: `3px solid ${COLORS.orange}`,
          overflow: "hidden",
          boxShadow: "0 14px 30px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                background: COLORS.orange,
                display: "grid",
                placeItems: "center",
                border: "2px solid rgba(0,0,0,0.25)",
              }}
            >
              <div style={{ color: COLORS.charcoal }}>
                <tb.Icon size={28} />
              </div>
            </div>
            <div>
              <div style={{ color: COLORS.white, fontWeight: 1000, fontSize: 16 }}>{tb.title}</div>
              <div style={{ color: "rgba(255,255,255,0.72)", fontWeight: 800, fontSize: 12 }}>
                {tb.subtitle}
              </div>
            </div>
          </div>

          {tb.badge > 0 && (
            <div
              style={{
                background: COLORS.orange,
                color: COLORS.charcoal,
                fontWeight: 1000,
                borderRadius: 999,
                padding: "6px 10px",
                border: "2px solid rgba(0,0,0,0.25)",
              }}
            >
              {tb.badge}
            </div>
          )}
        </div>

        <div style={{ height: 10, background: COLORS.orange }} />
      </div>
    </button>
  );
}

function tbToScreen(tb) {
  const map = {
    leads: { view: "leads", title: "Leads Toolbox" },
    convos: { view: "convos", title: "Conversations Toolbox" },
    quotes: { view: "quotes", title: "Quotes Toolbox" },
    calendar: { view: "calendar", title: "Calendar Toolbox" },
    "tech-support": { view: "tech-support", title: "Tech Support" },
    "web-support": { view: "web-support", title: "Web Support" },
  };
  return map[tb.key];
}

function PlaceholderScreen({ title }) {
  return (
    <div style={{ padding: 16, color: COLORS.white, fontWeight: 700 }}>
      <div style={{ fontSize: 18, marginBottom: 8 }}>{title}</div>
      <div style={{ opacity: 0.8, fontSize: 14 }}>Coming soon.</div>
    </div>
  );
}

/* ---------- Demo Screens ---------- */

function Panel({ children }) {
  return (
    <div style={{ background: COLORS.white, borderRadius: 16, padding: 14, boxShadow: "0 10px 22px rgba(0,0,0,0.08)", marginBottom: 12 }}>
      {children}
    </div>
  );
}

function Chip({ text }) {
  return (
    <span style={{ background: COLORS.offwhite, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 999, padding: "8px 12px", fontWeight: 900, fontSize: 12, marginRight: 8 }}>
      {text}
    </span>
  );
}

function ActionBtn({ text, kind = "dark", onClick }) {
  const bg = kind === "orange" ? COLORS.orange : kind === "light" ? COLORS.offwhite : COLORS.charcoal;
  const fg = kind === "orange" ? COLORS.charcoal : kind === "light" ? COLORS.charcoal : COLORS.white;
  return (
    <button onClick={onClick} style={{ background: bg, color: fg, border: "0", borderRadius: 14, padding: "12px 12px", fontWeight: 1000, flex: 1 }}>
      {text}
    </button>
  );
}

function LeadsDemo() {
  return (
    <>
      <Panel>
        <div style={{ fontWeight: 1000, fontSize: 16 }}>Pipeline</div>
        <div style={{ marginTop: 10, display: "flex", overflowX: "auto", paddingBottom: 4 }}>
          <Chip text="New" />
          <Chip text="Needs Call" />
          <Chip text="Waiting" />
          <Chip text="Closed" />
        </div>
      </Panel>

      {SAMPLE_LEADS.map((l) => (
        <Panel key={l.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 1000, fontSize: 16 }}>{l.name}</div>
              <div style={{ fontWeight: 900, opacity: 0.75 }}>{l.trade} • {l.status}</div>
              <div style={{ marginTop: 6, fontWeight: 800 }}>{l.summary}</div>
            </div>
            <div style={{ fontWeight: 1000, color: COLORS.orange }}>{l.time}</div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <ActionBtn text="Call" onClick={() => alert("Demo: start call")} />
            <ActionBtn text="Text" kind="light" onClick={() => alert("Demo: open text thread")} />
            <ActionBtn text="Close" kind="orange" onClick={() => alert("Demo: close as won/lost")} />
          </div>
        </Panel>
      ))}
    </>
  );
}

function ConvosDemo() {
  const [openId, setOpenId] = useState(null);
  const openThread = useMemo(() => SAMPLE_THREADS.find((t) => t.id === openId) || null, [openId]);

  if (!openThread) {
    return (
      <>
        {SAMPLE_THREADS.map((t) => (
          <Panel key={t.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 1000, fontSize: 16 }}>{t.name}</div>
                <div style={{ fontWeight: 800, opacity: 0.75 }}>{t.last}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {t.unread && (
                  <div style={{ background: COLORS.orange, color: COLORS.charcoal, fontWeight: 1000, borderRadius: 999, padding: "6px 10px" }}>
                    NEW
                  </div>
                )}
                <ActionBtn text="Open" kind="dark" onClick={() => setOpenId(t.id)} />
              </div>
            </div>
          </Panel>
        ))}
      </>
    );
  }

  return (
    <>
      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 1000, fontSize: 16 }}>{openThread.name}</div>
            <div style={{ fontWeight: 800, opacity: 0.75 }}>Customer thread</div>
          </div>
          <button
            onClick={() => setOpenId(null)}
            style={{ background: COLORS.offwhite, border: "0", borderRadius: 14, padding: "10px 12px", fontWeight: 1000 }}
          >
            Back
          </button>
        </div>
      </Panel>

      <Panel>
        {openThread.messages.map((m, idx) => (
          <div key={idx} style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 1000, fontSize: 12, opacity: 0.6 }}>
              {m.from.toUpperCase()} • {m.t}
            </div>
            <div style={{ fontWeight: 850 }}>{m.text}</div>
          </div>
        ))}
      </Panel>

      <Panel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {[
            "What's the address/zip?",
            "Can you send a photo?",
            "Best time to call?",
            "What service do you need?",
          ].map((q) => (
            <button
              key={q}
              onClick={() => alert(`Demo: insert quick reply\n\n${q}`)}
              style={{ background: COLORS.offwhite, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 999, padding: "10px 12px", fontWeight: 900 }}
            >
              {q}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <input
            placeholder="Type message…"
            style={{ flex: 1, borderRadius: 14, border: "1px solid rgba(0,0,0,0.2)", padding: 12, fontWeight: 800 }}
          />
          <ActionBtn text="Send" kind="orange" onClick={() => alert("Demo: send message")} />
        </div>
      </Panel>
    </>
  );
}

function QuotesDemo() {
  return (
    <>
      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 1000, fontSize: 16 }}>Quotes</div>
            <div style={{ fontWeight: 800, opacity: 0.75 }}>Draft • Sent • Approved</div>
          </div>
          <ActionBtn text="+ New Quote" kind="orange" onClick={() => alert("Demo: create quote")} />
        </div>
      </Panel>

      {SAMPLE_QUOTES.map((q) => (
        <Panel key={q.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 1000, fontSize: 16 }}>{q.customer}</div>
              <div style={{ fontWeight: 900, opacity: 0.75 }}>{q.status} • {q.updated}</div>
            </div>
            <div style={{ fontWeight: 1000, color: COLORS.orange }}>{q.amount}</div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <ActionBtn text="Open" onClick={() => alert("Demo: open quote")} />
            <ActionBtn text="Send" kind="orange" onClick={() => alert("Demo: send quote")} />
          </div>
        </Panel>
      ))}
    </>
  );
}

function CalendarDemo() {
  return (
    <>
      <Panel>
        <div style={{ fontWeight: 1000, fontSize: 16 }}>Today</div>
        <div style={{ fontWeight: 800, opacity: 0.75, marginTop: 4 }}>
          Simple schedule blocks (beta demo)
        </div>
      </Panel>

      {SAMPLE_EVENTS.map((e, i) => (
        <Panel key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 1000, fontSize: 16 }}>{e.title}</div>
              <div style={{ fontWeight: 850, opacity: 0.75 }}>{e.note}</div>
            </div>
            <div style={{ fontWeight: 1000, color: COLORS.orange }}>{e.time}</div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <ActionBtn text="Mark Done" kind="orange" onClick={() => alert("Demo: mark event done")} />
            <ActionBtn text="Add Note" kind="light" onClick={() => alert("Demo: add note")} />
          </div>
        </Panel>
      ))}
    </>
  );
}
