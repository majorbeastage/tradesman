import { useCallback, useEffect, useMemo, useState, createContext, useContext, type ReactNode } from "react"
import { useAuth } from "../contexts/AuthContext"
import { theme } from "../styles/theme"
import { parseSandboxMeta, isSandboxProfile } from "../lib/sandboxEnvironment"
import {
  injectSandboxLead,
  repairSandboxProfile,
  resetSandboxWorkspace,
  sandboxTrafficTick,
  seedSandboxWorkspace,
  setSandboxLiveTraffic,
} from "../lib/sandboxApi"
import { onSandboxTraffic } from "../lib/sandboxTrafficEvents"
import ConversationAutoRepliesModal from "./ConversationAutoRepliesModal"
import { useEffectivePortalConfig, useEffectiveUserId, usePortalViewOptional } from "../contexts/PortalViewContext"
import { useScopedAiAutomationsEnabled } from "../hooks/useScopedAiAutomationsEnabled"
import {
  isSandboxDemoUserId,
  parseSandboxDemoTeam,
  type SandboxDemoTeamMember,
} from "../lib/sandboxDemoTeam"
import { labelForProfileRole } from "../lib/profileRoles"
import { supabase } from "../lib/supabase"

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
    let cancelled = false
    void (async () => {
      try {
        const repaired = await repairSandboxProfile()
        if (repaired && !cancelled) await refetchProfile()
      } catch {
        /* best effort */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [active, profileUserId, user?.id, refetchProfile])

  useEffect(() => {
    if (!active || !profileUserId || profileUserId !== user?.id) return
    let cancelled = false
    void (async () => {
      setBusy(true)
      try {
        let customerCount = 0
        if (supabase) {
          const { count } = await supabase
            .from("customers")
            .select("id", { count: "exact", head: true })
            .eq("user_id", profileUserId)
          customerCount = count ?? 0
        }
        const needsSeed = !seeded || customerCount === 0
        if (!needsSeed) return

        const result = await seedSandboxWorkspace(customerCount === 0 && seeded)
        if (!cancelled) {
          setSeeded(true)
          setCustomerHint(result.customerCount ?? 12)
          setNote(
            result.customerCount
              ? `Loaded ${result.customerCount} sample customers plus leads and calendar jobs.`
              : "Loaded sample customers plus leads and calendar jobs.",
          )
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

type SandboxTrainingState = ReturnType<typeof useSandboxTrainingControls> & {
  profileMetadata?: Record<string, unknown> | null
}

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
  return (
    <SandboxTrainingContext.Provider value={{ ...state, profileMetadata }}>
      {children}
    </SandboxTrainingContext.Provider>
  )
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

type SandboxBannerTab = "traffic" | "intake" | "team"

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: "6px 12px",
  borderRadius: 999,
  border: active ? "2px solid #0284c7" : `1px solid ${theme.border}`,
  background: active ? "#fff" : "rgba(255,255,255,0.55)",
  color: active ? "#0c4a6e" : "#475569",
  fontWeight: active ? 800 : 600,
  fontSize: 12,
  cursor: "pointer",
})

function SandboxDemoTeamPanel({
  team,
  activeDemoId,
  onPreview,
  onResetSelf,
}: {
  team: SandboxDemoTeamMember[]
  activeDemoId: string | null
  onPreview: (member: SandboxDemoTeamMember) => void
  onResetSelf: () => void
}) {
  return (
    <div>
      <p style={{ margin: "0 0 10px", fontSize: 12, lineHeight: 1.5, color: "#334155" }}>
        Fictional team members for training — preview how the portal looks for office managers and field staff. Your
        sample customer data stays the same; only the layout and tabs change.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {team.map((member) => {
          const active = activeDemoId === member.id
          return (
            <div
              key={member.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 8,
                border: active ? "2px solid #0284c7" : `1px solid ${theme.border}`,
                background: active ? "#f0f9ff" : "#fff",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 13 }}>{member.label}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                  {member.title ?? labelForProfileRole(member.role)} · {member.email}
                </div>
              </div>
              <button type="button" style={active ? btnPrimary : btnSecondary} onClick={() => onPreview(member)}>
                {active ? "Previewing" : "Preview as"}
              </button>
            </div>
          )
        })}
      </div>
      {activeDemoId ? (
        <button type="button" style={{ ...btnSecondary, marginTop: 10 }} onClick={onResetSelf}>
          Back to corporate manager (you)
        </button>
      ) : null}
    </div>
  )
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
        <span style={{ fontWeight: 700, color: "#1e293b", fontSize: 13 }}>Interval:</span>
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
              padding: "6px 12px",
              borderRadius: 8,
              border: intervalMin === m ? "2px solid #0284c7" : "1px solid #94a3b8",
              background: intervalMin === m ? "#e0f2fe" : "#fff",
              cursor: busy ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 800,
              color: intervalMin === m ? "#0c4a6e" : "#1e293b",
              minWidth: 40,
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
  const { userId } = useAuth()
  const portalConfig = useEffectivePortalConfig()
  const effectiveUserId = useEffectiveUserId()
  const aiAutomationsEnabled = useScopedAiAutomationsEnabled(effectiveUserId || userId)
  const portalView = usePortalViewOptional()
  const [tab, setTab] = useState<SandboxBannerTab>("traffic")
  const [showAutoReplies, setShowAutoReplies] = useState(false)

  const demoTeam = useMemo(
    () => parseSandboxDemoTeam(state?.profileMetadata?.sandbox_demo_team),
    [state?.profileMetadata?.sandbox_demo_team],
  )

  if (!state?.active) return null

  const activeDemoId =
    portalView?.targetUserId && isSandboxDemoUserId(portalView.targetUserId) ? portalView.targetUserId : null

  const previewDemoMember = (member: SandboxDemoTeamMember) => {
    if (!portalView) return
    if (portalView.viewRoleOptions.includes(member.role)) {
      portalView.setViewRole(member.role)
    }
    portalView.setTargetUserId(member.id)
  }

  const resetDemoPreview = () => {
    if (!portalView || !userId) return
    portalView.setViewRole("corporate_management")
    portalView.setTargetUserId(userId)
  }

  return (
    <>
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
          <strong style={{ fontSize: 15 }}>Training sandbox</strong>
          <span style={{ fontSize: 11, color: "#0369a1" }}>Corporate manager · full Operations access</span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          <button type="button" style={tabBtn(tab === "traffic")} onClick={() => setTab("traffic")}>
            Live traffic
          </button>
          <button
            type="button"
            style={tabBtn(tab === "intake")}
            onClick={() => {
              setTab("intake")
              setShowAutoReplies(true)
            }}
          >
            Intake &amp; auto-replies
          </button>
          <button type="button" style={tabBtn(tab === "team")} onClick={() => setTab("team")}>
            Demo team
          </button>
        </div>

        {tab === "traffic" ? <SandboxControlsBody {...state} setPage={setPage} /> : null}
        {tab === "intake" ? (
          <div style={{ fontSize: 12, lineHeight: 1.55, color: "#334155" }}>
            <p style={{ margin: "0 0 10px" }}>
              Set what happens when customers <strong>call</strong>, <strong>text</strong>, or <strong>email</strong> — including
              missed-call text-back and SMS opt-in on inbound calls.
            </p>
            <button type="button" style={btnPrimary} onClick={() => setShowAutoReplies(true)}>
              Open intake settings
            </button>
            <button type="button" style={{ ...btnSecondary, marginLeft: 8 }} onClick={() => setPage?.("customers")}>
              Go to Customers
            </button>
          </div>
        ) : null}
        {tab === "team" ? (
          <SandboxDemoTeamPanel
            team={demoTeam}
            activeDemoId={activeDemoId}
            onPreview={previewDemoMember}
            onResetSelf={resetDemoPreview}
          />
        ) : null}
      </div>

      <ConversationAutoRepliesModal
        open={showAutoReplies}
        onClose={() => setShowAutoReplies(false)}
        userId={effectiveUserId || userId || null}
        portalConfig={portalConfig}
        aiAutomationsEnabled={aiAutomationsEnabled}
        hideCarryOverToQuotes
      />
    </>
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
