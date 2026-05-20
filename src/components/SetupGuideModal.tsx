import { useCallback, useEffect, useMemo, useState } from "react"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"
import PlatformAssistantField from "./PlatformAssistantField"
import {
  SETUP_GUIDE_PROGRESS_KEY,
  hasCompletedInitialSetup,
  mergeGlobalAssistantMic,
  mergeSetupGuideCompleted,
  parseSetupGuideProgress,
} from "../lib/setupGuideState"
import { parseGlobalAssistantCommand } from "../lib/globalAssistantNav"
import { useGlobalAssistantOptional } from "../contexts/GlobalAssistantContext"

export type SetupGuideStepId =
  | "welcome"
  | "dashboard"
  | "customers"
  | "estimates"
  | "scheduling"
  | "myt"
  | "payments"
  | "finish"

const INITIAL_STEPS: Array<{
  id: SetupGuideStepId
  title: string
  body: string
  page?: string
  question?: string
}> = [
  {
    id: "welcome",
    title: "Welcome",
    body: "This walkthrough sets up the main areas of Tradesman. You can change anything later in Settings or open this guide again from Quick Links.",
  },
  {
    id: "dashboard",
    title: "Dashboard",
    page: "dashboard",
    body: "Your home base shows quick links and the platform assistant. Ask for a tab by name — for example “take me to customers”.",
    question: "Do you want the floating assistant microphone visible on every page? (You can change this at the end.)",
  },
  {
    id: "customers",
    title: "Customers",
    page: "customers",
    body: "Store clients, conversations, and reports. Automatic replies and lead filters live here — we will add wizards inside those panels next.",
    question: "Will you use automatic text or email replies for customers? (You can configure this under Customers → Automatic replies.)",
  },
  {
    id: "estimates",
    title: "Estimates",
    page: "quotes",
    body: "Build quotes, line items, and job types. The Estimates Library holds reusable lines and job types for faster quoting.",
    question: "Do you already have standard line items or job types to add? (Library → Estimate line items / Job types.)",
  },
  {
    id: "scheduling",
    title: "Scheduling",
    page: "calendar",
    body: "Calendar, team management, alerts, and receipt templates. Office managers can assign work from here.",
    question: "Will you schedule jobs yourself or assign them to a team? (Scheduling tools and Team management on this tab.)",
  },
  {
    id: "myt",
    title: "My T",
    page: "account",
    body: "Call forwarding sends your Tradesman number to your cell. Voicemail greeting is what callers hear when you miss a call — record it here with your PIN.",
    question: "Have you set up call forwarding and your voicemail greeting yet? (My T → Call forwarding / Voicemail greeting.)",
  },
  {
    id: "payments",
    title: "Payments",
    page: "payments",
    body: "Subscription billing and customer payment links. Helcim connects when your admin enables it.",
    question: "Do you need to collect payments from customers through Tradesman? (Payments tab when enabled.)",
  },
  {
    id: "finish",
    title: "All set",
    page: "dashboard",
    body: "Initial setup is complete. Use Setup Guide anytime from Quick Links for changes, or ask the dashboard assistant.",
  },
]

type Props = {
  open: boolean
  onClose: () => void
  userId: string | null
  profileMetadata: Record<string, unknown> | null
  onMetadataPatch: (next: Record<string, unknown>) => void
  setPage: (page: string) => void
  forceInitial?: boolean
}

export default function SetupGuideModal({
  open,
  onClose,
  userId,
  profileMetadata,
  onMetadataPatch,
  setPage,
  forceInitial = false,
}: Props) {
  const ga = useGlobalAssistantOptional()
  const completed = hasCompletedInitialSetup(profileMetadata)
  const [mode, setMode] = useState<"pick" | "initial" | "adjust">("pick")
  const [stepIndex, setStepIndex] = useState(0)
  const [adjustText, setAdjustText] = useState("")
  const [adjustNote, setAdjustNote] = useState<string | null>(null)
  const [adjustBusy, setAdjustBusy] = useState(false)
  const [showGlobalMic, setShowGlobalMic] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (forceInitial || !completed) {
      setMode("pick")
      setStepIndex(0)
    } else {
      setMode("adjust")
    }
    setAdjustText("")
    setAdjustNote(null)
    setShowGlobalMic(true)
  }, [open, completed, forceInitial])

  const step = INITIAL_STEPS[stepIndex]

  const persistMeta = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!userId || !supabase) return
      const base = profileMetadata ?? {}
      const next = { ...base, ...patch }
      const { error } = await supabase.from("profiles").update({ metadata: next }).eq("id", userId)
      if (!error) onMetadataPatch(next)
    },
    [userId, profileMetadata, onMetadataPatch],
  )

  async function finishInitialSetup() {
    setSaving(true)
    try {
      const progress = parseSetupGuideProgress(profileMetadata?.[SETUP_GUIDE_PROGRESS_KEY])
      const steps = [...(progress.steps_completed ?? []), ...INITIAL_STEPS.map((s) => s.id)]
      await persistMeta(
        mergeSetupGuideCompleted(
          {
            ...(profileMetadata ?? {}),
            [SETUP_GUIDE_PROGRESS_KEY]: { ...progress, steps_completed: [...new Set(steps)] },
          },
          new Date().toISOString(),
        ),
      )
      await persistMeta(mergeGlobalAssistantMic(profileMetadata ?? {}, showGlobalMic))
      ga?.setMicFabVisible(showGlobalMic)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function goToStepPage(page?: string) {
    if (page) setPage(page)
  }

  async function runAdjustCommand(text: string) {
    setAdjustBusy(true)
    setAdjustNote(null)
    try {
      const action = parseGlobalAssistantCommand(text)
      if (action.type === "open_setup_guide") {
        setMode("pick")
        setAdjustNote("Choose initial setup or continue below.")
        return
      }
      if (action.type === "clarify") {
        setAdjustNote(action.message)
        return
      }
      if (action.type === "navigate") {
        setPage(action.page)
        setAdjustNote(`${action.message} The relevant tab is open behind this guide.`)
        return
      }
    } finally {
      setAdjustBusy(false)
    }
  }

  const headerTitle = useMemo(() => {
    if (mode === "pick") return "Setup Guide"
    if (mode === "adjust") return "Adjust your setup"
    return step?.title ?? "Setup Guide"
  }, [mode, step])

  if (!open) return null

  return (
    <>
      <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 10062 }} />
      <div
        role="dialog"
        aria-modal
        style={{
          position: "fixed",
          zIndex: 10063,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(640px, calc(100vw - 24px))",
          maxHeight: "min(90vh, 820px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 14,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 24px 56px rgba(15,23,42,0.22)",
          padding: "20px 20px 16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: "0.06em" }}>SETUP GUIDE</div>
            <h2 style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 800, color: theme.text }}>{headerTitle}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${theme.border}`, background: "#f8fafc", cursor: "pointer", fontWeight: 800 }}>
            ✕
          </button>
        </div>

        {mode === "pick" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: "#475569", lineHeight: 1.55 }}>
              {completed
                ? "You have already completed initial setup. Start the full walkthrough again, or make targeted changes."
                : "It looks like you have not finished initial setup yet. We recommend starting with your profile and core tabs."}
            </p>
            <button
              type="button"
              onClick={() => {
                setMode("initial")
                setStepIndex(0)
                goToStepPage("dashboard")
              }}
              style={{
                padding: "14px 18px",
                borderRadius: 10,
                border: "none",
                background: theme.primary,
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              Set up your profile &amp; workspace
              <span style={{ display: "block", fontSize: 12, fontWeight: 500, opacity: 0.9, marginTop: 4 }}>
                Walk through Dashboard, Customers, Estimates, Scheduling, My T, and Payments.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode("adjust")}
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                border: `1px solid ${theme.border}`,
                background: "#f8fafc",
                color: "#334155",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              I have already made my initial settings, and want to make some changes
            </button>
          </div>
        ) : null}

        {mode === "initial" && step ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: "#334155", lineHeight: 1.55 }}>{step.body}</p>
            {step.question ? (
              <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5, fontStyle: "italic" }}>{step.question}</p>
            ) : null}
            {step.id === "finish" ? (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text }}>
                <input type="checkbox" checked={showGlobalMic} onChange={(e) => setShowGlobalMic(e.target.checked)} />
                Show floating assistant microphone on all pages (indigo button, bottom-right)
              </label>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
              <button
                type="button"
                disabled={stepIndex === 0}
                onClick={() => {
                  const next = Math.max(0, stepIndex - 1)
                  setStepIndex(next)
                  goToStepPage(INITIAL_STEPS[next]?.page)
                }}
                style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff", cursor: stepIndex === 0 ? "not-allowed" : "pointer", opacity: stepIndex === 0 ? 0.5 : 1 }}
              >
                Back
              </button>
              {stepIndex < INITIAL_STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    const next = stepIndex + 1
                    setStepIndex(next)
                    goToStepPage(INITIAL_STEPS[next]?.page)
                  }}
                  style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: theme.primary, color: "#fff", fontWeight: 700, cursor: "pointer" }}
                >
                  Continue →
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void finishInitialSetup()}
                  style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontWeight: 700, cursor: "pointer" }}
                >
                  {saving ? "Saving…" : "Finish setup"}
                </button>
              )}
            </div>
            <button type="button" onClick={() => setMode("adjust")} style={{ border: "none", background: "none", color: "#6366f1", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left", padding: 0 }}>
              Switch to adjustment mode (AI assistant)
            </button>
          </div>
        ) : null}

        {mode === "adjust" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: "#475569", lineHeight: 1.55 }}>
              Describe what you want to change. We will open the right tab behind this guide. Example: “automatic replies for customers” or “estimate line items”.
            </p>
            <PlatformAssistantField
              value={adjustText}
              onChange={setAdjustText}
              onApply={runAdjustCommand}
              placeholder="e.g. take me to automatic replies · scheduling alerts · estimate line items"
              applyLabel="Find setting"
              busy={adjustBusy}
              note={adjustNote}
            />
            <button
              type="button"
              onClick={() => {
                setMode("initial")
                setStepIndex(0)
                goToStepPage("dashboard")
              }}
              style={{ border: "none", background: "none", color: "#6366f1", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left", padding: 0 }}
            >
              Switch to Initial Setup Guide
            </button>
          </div>
        ) : null}
      </div>
    </>
  )
}
