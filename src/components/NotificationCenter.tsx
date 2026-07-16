import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import {
  loadUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  deleteNotification,
  type UserNotification,
} from "../lib/userNotifications"
import { queueCustomerFocus } from "../lib/customerNavigation"
import { queueQuotesOpenQuote, queueSchedulingEventView } from "../lib/workflowNavigation"

type Props = {
  userId: string
  setPage: (page: string) => void
}

const POLL_MS = 30_000

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ""
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 60) return "just now"
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

export default function NotificationCenter({ userId, setPage }: Props) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<UserNotification[]>([])
  const lastMaxCreatedRef = useRef<number>(0)
  const initializedRef = useRef(false)

  const refresh = useCallback(async () => {
    const rows = await loadUserNotifications(supabase, userId, 40)
    setItems(rows)

    // Native OS popups for rows newer than the last poll (skip the initial load).
    const maxCreated = rows.reduce((max, r) => Math.max(max, new Date(r.created_at).getTime() || 0), 0)
    if (initializedRef.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
      const fresh = rows.filter(
        (r) => !r.read_at && (new Date(r.created_at).getTime() || 0) > lastMaxCreatedRef.current,
      )
      for (const r of fresh.slice(0, 3)) {
        try {
          new Notification(r.title, { body: r.body ?? undefined })
        } catch {
          /* ignore */
        }
      }
    }
    lastMaxCreatedRef.current = maxCreated
    initializedRef.current = true
  }, [userId])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), POLL_MS)
    const onFocus = () => void refresh()
    window.addEventListener("focus", onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener("focus", onFocus)
    }
  }, [refresh])

  const unread = items.filter((i) => !i.read_at).length

  function navigateTo(n: UserNotification) {
    const page = typeof n.metadata?.page === "string" ? (n.metadata.page as string) : null
    if (n.customer_id) {
      queueCustomerFocus(n.customer_id)
      setPage("customers")
      return
    }
    if (n.quote_id) {
      queueQuotesOpenQuote(n.quote_id)
      setPage("quotes")
      return
    }
    if (n.calendar_event_id) {
      queueSchedulingEventView(n.calendar_event_id)
      setPage("calendar")
      return
    }
    if (page) setPage(page)
  }

  async function onClickItem(n: UserNotification) {
    setOpen(false)
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
      void markNotificationRead(supabase, n.id)
    }
    navigateTo(n)
  }

  async function onToggleOpen() {
    const next = !open
    setOpen(next)
    if (next) {
      // Ask for OS notification permission the first time the tray is opened.
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        try {
          await Notification.requestPermission()
        } catch {
          /* ignore */
        }
      }
      void refresh()
    }
  }

  return (
    <div style={{ position: "fixed", right: 18, bottom: 18, zIndex: 12000 }}>
      {open ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: 58,
            width: 360,
            maxWidth: "calc(100vw - 36px)",
            maxHeight: "min(70vh, 560px)",
            display: "flex",
            flexDirection: "column",
            background: "#fff",
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            boxShadow: "0 18px 48px rgba(15,23,42,0.28)",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: `1px solid ${theme.border}` }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: theme.text }}>Notifications</span>
            <div style={{ display: "flex", gap: 8 }}>
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })))
                    void markAllNotificationsRead(supabase, userId)
                  }}
                  style={{ border: "none", background: "transparent", color: theme.primary, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                >
                  Mark all read
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                style={{ border: "none", background: "transparent", color: "#6b7280", fontSize: 16, cursor: "pointer", lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          </div>
          <div style={{ overflowY: "auto" }}>
            {items.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>You&apos;re all caught up.</div>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    padding: "10px 12px",
                    borderBottom: `1px solid ${theme.border}`,
                    background: n.read_at ? "#fff" : "#eff6ff",
                    cursor: "pointer",
                  }}
                  onClick={() => void onClickItem(n)}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 6, background: n.read_at ? "transparent" : theme.primary, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{n.title}</div>
                    {n.body ? <div style={{ fontSize: 12, color: "#475569", marginTop: 2, lineHeight: 1.4 }}>{n.body}</div> : null}
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{timeAgo(n.created_at)}</div>
                  </div>
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={(e) => {
                      e.stopPropagation()
                      setItems((prev) => prev.filter((x) => x.id !== n.id))
                      void deleteNotification(supabase, n.id)
                    }}
                    style={{ border: "none", background: "transparent", color: "#cbd5e1", fontSize: 16, cursor: "pointer", lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void onToggleOpen()}
        aria-label="Notifications"
        title="Notifications"
        style={{
          position: "relative",
          width: 48,
          height: 48,
          borderRadius: "50%",
          border: "none",
          background: theme.primary,
          color: "#fff",
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(15,23,42,0.28)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 ? (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              minWidth: 20,
              height: 20,
              padding: "0 5px",
              borderRadius: 10,
              background: "#dc2626",
              color: "#fff",
              fontSize: 11,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #fff",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
    </div>
  )
}
