import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
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
import { miniWizardsForSetupStep, type SetupMiniWizardDef } from "../lib/setupGuideWizards"
import { parseGlobalAssistantCommand } from "../lib/globalAssistantNav"
import { useGlobalAssistantOptional } from "../contexts/GlobalAssistantContext"
import { useSetupWizardOptional } from "../contexts/SetupWizardContext"

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
  bullets?: string[]
  question?: string
}> = [
  {
    id: "welcome",
    title: "Welcome",
    body: "This walkthrough introduces the main areas of Tradesman and points you to focused setup wizards inside each tab. You can reopen Setup Guide anytime from Dashboard → Quick Links.",
    bullets: [
      "We open each tab behind this panel so you can see where settings live.",
      "Short wizards inside Customers, Estimates, Scheduling, and My T will handle detailed choices (voice + AI where noted).",
      "Nothing here locks you in — change settings anytime.",
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    page: "dashboard",
    body: "Your home base: quick links, today’s work, and the platform assistant (“What would you like to do today?”). Use voice or type to jump to a tab or task.",
    bullets: [
      "Quick Links use the paper tile style; Setup Guide stays here for later changes.",
      "The indigo microphone (bottom-right) talks to the same assistant from any page when enabled.",
    ],
    question: "Do you want the floating assistant microphone visible on every page? (You choose at the end of this walkthrough.)",
  },
  {
    id: "customers",
    title: "Customers",
    page: "customers",
    body: "Clients, conversation history, SMS/email from the contact card, and specialty reports. Lead fit and urgency also show on this tab.",
    bullets: [
      "Automatic replies — wizard will ask simple questions and map answers to your reply templates.",
      "Lead filter preferences & Alerts — separate wizards for who you hear from and how you get notified.",
      "First outbound texts include a compliance footer; the composer shows what will be appended.",
    ],
    question: "Will you use automatic text or email replies? (Use the Automatic replies wizard below when it is available.)",
  },
  {
    id: "estimates",
    title: "Estimates",
    page: "quotes",
    body: "Quotes, PDF/email send, scope assistant, and the Estimates Library for reusable content.",
    bullets: [
      "Estimate line items — speak or type; AI fills title, description, and cost from what you say.",
      "Job types — step-by-step wizard (criteria, linked line items, defaults).",
      "Start Quote guide on new estimates walks job details and customer copy options.",
    ],
    question: "Do you already have standard prices or job types to import? (Line items and job type wizards below.)",
  },
  {
    id: "scheduling",
    title: "Scheduling",
    page: "calendar",
    body: "Calendar views, job completion, team assignment (office managers), and customer notifications tied to events.",
    bullets: [
      "Alerts wizard — push, email, and SMS preferences for calendar events.",
      "Receipt template wizard — intro text, logo, and line layout for completion receipts.",
      "Team management is optional; solo contractors can use Scheduling tools only.",
    ],
    question: "Will you schedule jobs yourself or assign work to a team?",
  },
  {
    id: "myt",
    title: "My T",
    page: "account",
    body: "Your Tradesman phone identity: forwarding, voicemail, push/GPS prefs, and profile photo on the mobile app.",
    bullets: [
      "Call forwarding — wizard explains forwarding your business line to your cell in plain language.",
      "Voicemail greeting — record or upload what callers hear; PIN flow for phone updates.",
      "Push notifications and location sync from My T when you use the native app.",
    ],
    question: "Have you set call forwarding and a voicemail greeting yet?",
  },
  {
    id: "payments",
    title: "Payments",
    page: "payments",
    body: "Subscription billing for your Tradesman account and (when enabled) Helcim links to collect from customers.",
    bullets: [
      "Payments tab visibility depends on your role and admin configuration.",
      "Customer payment requests are created from the customer record when collections are enabled.",
    ],
    question: "Do you need to collect payments from customers through Tradesman?",
  },
  {
    id: "finish",
    title: "All set",
    page: "dashboard",
    body: "Initial setup is marked complete. Reopen Setup Guide from Quick Links for changes, or use adjustment mode with the AI assistant.",
    bullets: [
      "Per-area setup wizards will appear inside each settings panel as we ship them.",
      "Dashboard assistant and Setup Guide share the same navigation map.",
    ],
  },
]

const BTN_SECONDARY: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #94a3b8",
  background: "#f1f5f9",
  color: "#0f172a",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
}

const BTN_CLOSE: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 8,
  border: "1px solid #94a3b8",
  background: "#f1f5f9",
  color: "#0f172a",
  fontSize: 20,
  lineHeight: 1,
  fontWeight: 800,
  cursor: "pointer",
  flexShrink: 0,
}

type Props = {
  open: boolean
  onClose: () => void
  userId: string | null
  profileMetadata: Record<string, unknown> | null
  onMetadataPatch: (next: Record<string, unknown>) => void
  setPage: (page: string) => void
  forceInitial?: boolean
}

function MiniWizardButtons({
  wizards,
  onOpen,
}: {
  wizards: SetupMiniWizardDef[]
  onOpen: (w: SetupMiniWizardDef) => void
}) {
  if (wizards.length === 0) return null
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", letterSpacing: "0.03em" }}>SETUP WIZARDS ON THIS TAB</div>
      {wizards.map((w) => (
        <button
          key={w.id}
          type="button"
          onClick={() => onOpen(w)}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            background: "#fff",
            color: "#0f172a",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {w.label}
          <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#64748b", marginTop: 4 }}>
            {w.summary}
          </span>
        </button>
      ))}
    </div>
  )
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
  const setupWizard = useSetupWizardOptional()
  const completed = hasCompletedInitialSetup(profileMetadata)
  const [mode, setMode] = useState<"pick" | "initial" | "adjust">("pick")
  const [stepIndex, setStepIndex] = useState(0)
  const [adjustText, setAdjustText] = useState("")
  const [adjustNote, setAdjustNote] = useState<string | null>(null)
  const [adjustBusy, setAdjustBusy] = useState(false)
  const [showGlobalMic, setShowGlobalMic] = useState(true)
  const [saving, setSaving] = useState(false)
  const [stepHint, setStepHint] = useState<string | null>(null)

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
    setStepHint(null)
    setShowGlobalMic(true)
  }, [open, completed, forceInitial])

  const step = INITIAL_STEPS[stepIndex]
  const stepMiniWizards = step ? miniWizardsForSetupStep(step.id) : []

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

  function openMiniWizard(w: SetupMiniWizardDef) {
    setPage(w.page)
    setupWizard?.launchWizard(w.id, { fromSetupGuide: true })
    setStepHint(`Opening ${w.label} wizard — ${w.locationHint}`)
  }

  async function runAdjustCommand(text: string) {
    setAdjustBusy(true)
    setAdjustNote(null)
    setAdjustText("")
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
      if (action.type === "open_mini_wizard") {
        setupWizard?.launchWizard(action.wizardId, { fromSetupGuide: true })
        setAdjustNote(action.message)
        return
      }
      if (action.type === "navigate") {
        setPage(action.page)
        setAdjustNote(`${action.message} The tab is open behind this guide.`)
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", letterSpacing: "0.06em" }}>SETUP GUIDE</div>
            <h2 style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{headerTitle}</h2>
            {mode === "initial" && step && step.id !== "welcome" && step.id !== "finish" ? (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
                Step {stepIndex + 1} of {INITIAL_STEPS.length}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={BTN_CLOSE}>
            ✕
          </button>
        </div>

        {mode === "pick" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: "#334155", lineHeight: 1.55 }}>
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
                border: "1px solid #94a3b8",
                background: "#f8fafc",
                color: "#0f172a",
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
            <p style={{ margin: 0, fontSize: 14, color: "#1e293b", lineHeight: 1.55 }}>{step.body}</p>
            {step.bullets && step.bullets.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                {step.bullets.map((b) => (
                  <li key={b} style={{ marginBottom: 6 }}>
                    {b}
                  </li>
                ))}
              </ul>
            ) : null}
            {step.question ? (
              <p style={{ margin: 0, fontSize: 13, color: "#334155", lineHeight: 1.5, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, border: `1px solid ${theme.border}` }}>
                <strong style={{ color: "#0f172a" }}>Quick question: </strong>
                {step.question}
              </p>
            ) : null}
            <MiniWizardButtons wizards={stepMiniWizards} onOpen={openMiniWizard} />
            {stepHint ? (
              <p style={{ margin: 0, fontSize: 12, color: "#0369a1", lineHeight: 1.45, padding: "8px 10px", background: "#e0f2fe", borderRadius: 6 }}>
                {stepHint}
              </p>
            ) : null}
            {step.id === "finish" ? (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#0f172a", fontWeight: 600 }}>
                <input type="checkbox" checked={showGlobalMic} onChange={(e) => setShowGlobalMic(e.target.checked)} />
                Show floating assistant microphone on all pages (indigo button, bottom-right)
              </label>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
              <button
                type="button"
                disabled={stepIndex === 0}
                onClick={() => {
                  const next = Math.max(0, stepIndex - 1)
                  setStepIndex(next)
                  setStepHint(null)
                  goToStepPage(INITIAL_STEPS[next]?.page)
                }}
                style={{
                  ...BTN_SECONDARY,
                  cursor: stepIndex === 0 ? "not-allowed" : "pointer",
                  opacity: stepIndex === 0 ? 0.45 : 1,
                }}
              >
                ← Back
              </button>
              {stepIndex < INITIAL_STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    const next = stepIndex + 1
                    setStepIndex(next)
                    setStepHint(null)
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
                  style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontWeight: 700, cursor: saving ? "wait" : "pointer" }}
                >
                  {saving ? "Saving…" : "Finish setup"}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMode("adjust")}
              style={{ border: "none", background: "none", color: theme.primary, fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "left", padding: 0 }}
            >
              Switch to adjustment mode (AI assistant)
            </button>
          </div>
        ) : null}

        {mode === "adjust" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: "#334155", lineHeight: 1.55 }}>
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
              autoApplyOnVoiceEnd
              clearVoiceOnStart
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[
                "customers",
                "automatic replies",
                "estimate line items",
                "scheduling alerts",
                "call forwarding",
                "voicemail greeting",
              ].map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  disabled={adjustBusy}
                  onClick={() => void runAdjustCommand(phrase)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: `1px solid ${theme.border}`,
                    background: "#f8fafc",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#334155",
                    cursor: adjustBusy ? "wait" : "pointer",
                  }}
                >
                  {phrase}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setMode("initial")
                setStepIndex(0)
                setStepHint(null)
                goToStepPage("dashboard")
              }}
              style={{ border: "none", background: "none", color: theme.primary, fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "left", padding: 0 }}
            >
              Switch to Initial Setup Guide
            </button>
          </div>
        ) : null}
      </div>
    </>
  )
}
