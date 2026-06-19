import { useCallback, useEffect, useMemo, useState, createContext, useContext, type ReactNode } from "react"
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

function useSandboxTrainingControls(
  profileUserId: string | null,
  profileMetadata: Record<string, unknown> | null | undefined,
  portalConfig?: { sandbox_account?: boolean } | null,
  authRole?: string | null,
) {
  const { user, refetchProfile } = useAuth()
  const active = isSandboxProfile(portalConfig, profileMetadata ?? null, authRole)
  const sandboxMeta = useMemo(() => parseSandboxMeta(profileMetadata?.sandbox_workspace_v1), [profileMetadata])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")
  const [liveTraffic, setLiveTraffic] = useState(sandboxMeta?.liveTrafficEnabled !== false)
  const [intervalMin, setIntervalMin] = useState(sandboxMeta?.liveTrafficIntervalMinutes ?? 2)
  const [seeded, setSeeded] = useState(Boolean(sandboxMeta?.seededAt))
  const [customerHint, setCustomerHint] = useState<number | null>(null)

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
        const result = await seedSandboxWorkspace(false)
        if (!cancelled) {
          setSeeded(true)
          setCustomerHint(result.customerCount ?? 12)
          setNote("Loaded sample customers plus leads and calendar jobs.")
          if (result.profileRepaired) await refetchProfile()
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
  }, [active, profileUserId, user?.id, seeded, refetchProfile])

  useEffect(() => {
    if (!active || !liveTraffic || !profileUserId) return
    const tick = () => void sandboxTrafficTick()
    tick()
    const id = window.setInterval(tick, Math.max(1, intervalMin) * 60_000)
    return () => window.clearInterval(id)
  }, [active, liveTraffic, intervalMin, profileUserId])

  const run = useCallback(async (fn: () => Promise<string | void>, fallbackSuccess = "") => {
    setBusy(true)
    setNote("")
    try {
      const msg = await fn()
      setNote(msg || fallbackSuccess)
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  return {
    active,
    busy,
    note,
    liveTraffic,
    setLiveTraffic,
    intervalMin,
    setIntervalMin,
    seeded,
    customerHint,
    ctaUrl,
    run,
  }
}

type SandboxTrainingState = ReturnType<typeof useSandboxTrainingControls>

const SandboxTrainingContext = createContext<SandboxTrainingState | null>(null)

function useSandboxTrainingContext(): SandboxTrainingState | null {
  return useContext(SandboxTrainingContext)
}

type ProviderProps = {
  profileUserId: string | null
  profileMetadata: Record<string, unknown> | null | undefined
  portalConfig?: { sandbox_account?: boolean } | null
  authRole?: string | null
  children: ReactNode
}

export function SandboxTrainingProvider({
  profileUserId,
  profileMetadata,
  portalConfig,
  authRole,
  children,
}: ProviderProps) {
  const state = useSandboxTrainingControls(profileUserId, profileMetadata, portalConfig, authRole)
  return <SandboxTrainingContext.Provider value={state}>{children}</SandboxTrainingContext.Provider>
}

const btnPrimary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
}

const btnSecondary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
}

function SandboxControlsBody({
  busy,
  note,
  liveTraffic,
  setLiveTraffic,
  intervalMin,
  setIntervalMin,
  seeded,
  customerHint,
  ctaUrl,
  run,
  setPage,
  compact,
}: ReturnType<typeof useSandboxTrainingControls> & { setPage?: (page: string) => void; compact?: boolean }) {
  return (
    <div style={{ fontSize: 12, lineHeight: 1.5, color: "#334155" }}>
      <p style={{ margin: compact ? "0 0 8px" : "0 0 10px" }}>
        Fictional customers only — texts and emails are simulated. Turn on auto-incoming below and watch new people
        appear in <strong>Customers</strong> and <strong>Leads</strong>.
      </p>

      {seeded ? (
        <div style={{ marginBottom: 8, color: "#059669", fontWeight: 600 }}>
          {customerHint != null ? `${customerHint}+ sample customers loaded.` : "Sample workspace loaded."}
        </div>
      ) : busy ? (
        <div style={{ marginBottom: 8, color: "#64748b" }}>Loading sample customers…</div>
      ) : null}

      {setPage ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          <button type="button" style={btnSecondary} onClick={() => setPage("customers")}>
            Open Customers
          </button>
          <button type="button" style={btnSecondary} onClick={() => setPage("leads")}>
            Open Leads
          </button>
          <button type="button" style={btnSecondary} onClick={() => setPage("calendar")}>
            Open Calendar
          </button>
          <button type="button" style={btnSecondary} onClick={() => setPage("operations-work_orders")}>
            Open Operations
          </button>
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
        Auto incoming customers/leads every {intervalMin} min
      </label>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
        <span style={{ fontWeight: 600, color: "#64748b" }}>Interval:</span>
        {[1, 2, 3, 5, 8].map((m) => (
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

      {ctaUrl ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Your live CTA link (also creates leads)</div>
          <input
            readOnly
            value={ctaUrl}
            onFocus={(e) => e.target.select()}
            style={{ width: "100%", fontSize: 11, padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}` }}
          />
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: compact ? "row" : "column", flexWrap: "wrap", gap: 6 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const r = await injectSandboxLead()
              return `New lead: ${r.scenario} (${r.channel})`
            })
          }
          style={btnPrimary}
        >
          Add customer / lead now
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => seedSandboxWorkspace(true).then(() => "Workspace re-seeded with sample data"))}
          style={btnSecondary}
        >
          Re-load sample data
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!window.confirm("Reset sandbox? Removes injected data and re-loads defaults.")) return
            void run(() => resetSandboxWorkspace().then(() => "Sandbox reset"))
          }}
          style={btnSecondary}
        >
          Reset sandbox
        </button>
      </div>

      {busy ? <div style={{ marginTop: 8, color: "#64748b" }}>Working…</div> : null}
      {note ? (
        <div
          style={{
            marginTop: 8,
            color:
              note.startsWith("New") || note.includes("sample") || note.includes("Loaded") || note.includes("seed")
                ? "#059669"
                : "#b91c1c",
          }}
        >
          {note}
        </div>
      ) : null}
    </div>
  )
}

/** Full-width training controls — always visible at top of the app shell. */
export function SandboxTrainingBanner({
  setPage,
}: {
  setPage?: (page: string) => void
}) {
  const state = useSandboxTrainingContext()
  if (!state?.active) return null

  return (
    <div
      style={{
        marginBottom: 12,
        padding: "12px 14px",
        borderRadius: 10,
        background: "linear-gradient(135deg,#e0f2fe,#f0f9ff)",
        border: "1px solid #7dd3fc",
        color: "#0c4a6e",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <strong style={{ fontSize: 15 }}>Training sandbox controls</strong>
        <span style={{ fontSize: 11, color: "#0369a1" }}>Corporate manager · full Operations access</span>
      </div>
      <SandboxControlsBody {...state} setPage={setPage} />
    </div>
  )
}

export default function SandboxControlPanel() {
  const state = useSandboxTrainingContext()
  const [open, setOpen] = useState(false)

  if (!state?.active) return null

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
          title="Training sandbox controls (also at top of page)"
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
            <strong style={{ fontSize: 13, color: "#0c4a6e" }}>Quick controls</strong>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16 }}
              aria-label="Minimize"
            >
              −
            </button>
          </div>
          <div style={{ padding: 12 }}>
            <SandboxControlsBody {...state} compact />
          </div>
        </div>
      )}
    </div>
  )
}

/** Hook for list pages to refresh when sandbox traffic arrives. */
export function useSandboxTrafficRefresh(refresh: () => void): void {
  useEffect(() => onSandboxTraffic(refresh), [refresh])
}
