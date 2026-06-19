import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { theme } from "../styles/theme"
import { parseSandboxMeta, isSandboxProfile } from "../lib/sandboxEnvironment"
import {
  injectSandboxLead,
  resetSandboxWorkspace,
  sandboxTrafficTick,
  seedSandboxWorkspace,
  setSandboxLiveTraffic,
} from "../lib/sandboxApi"
import { onSandboxTraffic } from "../lib/sandboxTrafficEvents"

type Props = {
  profileUserId: string | null
  profileMetadata: Record<string, unknown> | null | undefined
  portalConfig?: { sandbox_account?: boolean } | null
  authRole?: string | null
}

export default function SandboxControlPanel({ profileUserId, profileMetadata, portalConfig, authRole }: Props) {
  const { user } = useAuth()
  const active = isSandboxProfile(portalConfig, profileMetadata ?? null, authRole)
  const sandboxMeta = useMemo(() => parseSandboxMeta(profileMetadata?.sandbox_workspace_v1), [profileMetadata])
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")
  const [liveTraffic, setLiveTraffic] = useState(sandboxMeta?.liveTrafficEnabled !== false)
  const [intervalMin, setIntervalMin] = useState(sandboxMeta?.liveTrafficIntervalMinutes ?? 3)
  const [seeded, setSeeded] = useState(Boolean(sandboxMeta?.seededAt))

  const ctaSlug = sandboxMeta?.embedLeadSlug ?? ""
  const ctaUrl =
    typeof window !== "undefined" && ctaSlug
      ? `${window.location.origin}/cta/${encodeURIComponent(ctaSlug)}`
      : ""

  useEffect(() => {
    if (!active || !profileUserId || profileUserId !== user?.id) return
    if (seeded) return
    let cancelled = false
    void (async () => {
      setBusy(true)
      try {
        await seedSandboxWorkspace(false)
        if (!cancelled) {
          setSeeded(true)
          setNote("Training workspace seeded with sample customers, leads, and jobs.")
        }
      } catch (e) {
        if (!cancelled) setNote(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [active, profileUserId, user?.id, seeded])

  useEffect(() => {
    if (!active || !liveTraffic || !profileUserId) return
    const tick = () => void sandboxTrafficTick()
    tick()
    const id = window.setInterval(tick, Math.max(1, intervalMin) * 60_000)
    return () => window.clearInterval(id)
  }, [active, liveTraffic, intervalMin, profileUserId])

  const run = useCallback(async (fn: () => Promise<void>, success: string) => {
    setBusy(true)
    setNote("")
    try {
      await fn()
      setNote(success)
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  if (!active || !profileUserId) return null

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 9000,
        width: open ? 320 : 48,
        maxWidth: "calc(100vw - 24px)",
        transition: "width 0.2s ease",
      }}
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Training sandbox controls"
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            border: "none",
            background: "#0ea5e9",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(14,165,233,0.45)",
          }}
        >
          🎓
        </button>
      ) : (
        <div
          style={{
            background: "#fff",
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            boxShadow: "0 12px 40px rgba(15,23,42,0.18)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              background: "linear-gradient(135deg,#e0f2fe,#bae6fd)",
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            <strong style={{ fontSize: 13, color: "#0c4a6e" }}>Training sandbox</strong>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16 }}
              aria-label="Minimize"
            >
              −
            </button>
          </div>
          <div style={{ padding: 12, fontSize: 12, lineHeight: 1.5, color: "#334155" }}>
            <p style={{ margin: "0 0 10px" }}>
              Fictional customers only. Texts and emails are simulated — watch new leads arrive while you work.
            </p>
            {ctaUrl ? (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Your live CTA link</div>
                <input
                  readOnly
                  value={ctaUrl}
                  onFocus={(e) => e.target.select()}
                  style={{ width: "100%", fontSize: 11, padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}` }}
                />
              </div>
            ) : null}
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={liveTraffic}
                onChange={(e) => {
                  const on = e.target.checked
                  setLiveTraffic(on)
                  void setSandboxLiveTraffic(on, intervalMin)
                }}
              />
              Auto incoming leads every {intervalMin} min
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {[2, 3, 5, 8].map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setIntervalMin(m)
                    void setSandboxLiveTraffic(liveTraffic, m)
                  }}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: intervalMin === m ? "2px solid #0ea5e9" : `1px solid ${theme.border}`,
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {m}m
                </button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const r = await injectSandboxLead()
                    setNote(`New lead: ${r.scenario} (${r.channel})`)
                  }, "Lead injected")
                }
                style={btnPrimary}
              >
                Simulate new lead now
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => seedSandboxWorkspace(true), "Workspace re-seeded")}
                style={btnSecondary}
              >
                Re-seed sample data
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Reset sandbox? Removes injected data and re-seeds defaults.")) return
                  void run(() => resetSandboxWorkspace(), "Sandbox reset")
                }}
                style={btnSecondary}
              >
                Reset sandbox
              </button>
            </div>
            {busy ? <div style={{ marginTop: 8, color: "#64748b" }}>Working…</div> : null}
            {note ? <div style={{ marginTop: 8, color: note.startsWith("New") || note.includes("seed") ? "#059669" : "#b91c1c" }}>{note}</div> : null}
          </div>
        </div>
      )}
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
}

const btnSecondary: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
}

/** Hook for list pages to refresh when sandbox traffic arrives. */
export function useSandboxTrafficRefresh(refresh: () => void): void {
  useEffect(() => onSandboxTraffic(refresh), [refresh])
}
