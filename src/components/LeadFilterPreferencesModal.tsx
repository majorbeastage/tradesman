import type { Dispatch, SetStateAction } from "react"
import { theme } from "../styles/theme"

export type LeadFilterPrefsState = {
  accepted_job_types: string
  minimum_job_size: string
  service_radius_miles: string
  use_account_service_radius: boolean
  availability: "asap" | "flexible"
  enable_auto_filter: boolean
  use_ai_for_unclear: boolean
}

type Props = {
  open: boolean
  onClose: () => void
  leadFilterPrefs: LeadFilterPrefsState
  setLeadFilterPrefs: Dispatch<SetStateAction<LeadFilterPrefsState>>
  onSave: () => void | Promise<void>
  saveBusy: boolean
  aiAutomationsEnabled: boolean
  t: (key: string) => string
}

export default function LeadFilterPreferencesModal({
  open,
  onClose,
  leadFilterPrefs,
  setLeadFilterPrefs,
  onSave,
  saveBusy,
  aiAutomationsEnabled,
  t,
}: Props) {
  if (!open) return null

  return (
    <>
      <div onClick={() => onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "92%",
          maxWidth: 520,
          maxHeight: "90vh",
          overflow: "auto",
          background: "white",
          borderRadius: 8,
          padding: 24,
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          zIndex: 9999,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, color: theme.text, fontSize: 18 }}>Lead Filter Preferences</h3>
          <button type="button" onClick={() => onClose()} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: theme.text }}>
            ✕
          </button>
        </div>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#4b5563", lineHeight: 1.5 }}>
          Optional automation scores new leads as <strong>Hot</strong>, <strong>Maybe</strong>, or <strong>Bad</strong> using your rules first. Uncertain leads stay{" "}
          <strong>Maybe</strong> — nothing is deleted or auto-rejected.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
            Job types you want (one per line or commas)
            <textarea
              value={leadFilterPrefs.accepted_job_types}
              onChange={(e) => setLeadFilterPrefs((p) => ({ ...p, accepted_job_types: e.target.value }))}
              rows={3}
              placeholder="e.g. roofing, plumbing, HVAC"
              style={{ ...theme.formInput, marginTop: 6, resize: "vertical", width: "100%", boxSizing: "border-box" }}
            />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
            Minimum job size (USD, optional)
            <input
              value={leadFilterPrefs.minimum_job_size}
              onChange={(e) => setLeadFilterPrefs((p) => ({ ...p, minimum_job_size: e.target.value }))}
              placeholder="e.g. 500"
              style={{ ...theme.formInput, marginTop: 6, maxWidth: 200 }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={leadFilterPrefs.use_account_service_radius}
              onChange={(e) => setLeadFilterPrefs((p) => ({ ...p, use_account_service_radius: e.target.checked }))}
            />
            Use service radius from Account (when set)
          </label>
          {!leadFilterPrefs.use_account_service_radius ? (
            <label style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
              Service radius (miles) for filtering
              <input
                value={leadFilterPrefs.service_radius_miles}
                onChange={(e) => setLeadFilterPrefs((p) => ({ ...p, service_radius_miles: e.target.value }))}
                style={{ ...theme.formInput, marginTop: 6, maxWidth: 200 }}
              />
            </label>
          ) : null}
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, display: "block", marginBottom: 6 }}>{t("leads.timingTitle")}</span>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
                cursor: "pointer",
                fontSize: 13,
                color: "#111827",
                fontWeight: 500,
              }}
            >
              <input
                type="radio"
                name="lf_avail_modal"
                checked={leadFilterPrefs.availability === "asap"}
                onChange={() => setLeadFilterPrefs((p) => ({ ...p, availability: "asap" }))}
              />
              {t("leads.asap")}
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                fontSize: 13,
                color: "#111827",
                fontWeight: 500,
              }}
            >
              <input
                type="radio"
                name="lf_avail_modal"
                checked={leadFilterPrefs.availability === "flexible"}
                onChange={() => setLeadFilterPrefs((p) => ({ ...p, availability: "flexible" }))}
              />
              {t("leads.flexible")}
            </label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={leadFilterPrefs.enable_auto_filter}
              onChange={(e) => setLeadFilterPrefs((p) => ({ ...p, enable_auto_filter: e.target.checked }))}
            />
            Enable auto filter on new leads
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={leadFilterPrefs.use_ai_for_unclear}
              onChange={(e) => setLeadFilterPrefs((p) => ({ ...p, use_ai_for_unclear: e.target.checked }))}
              disabled={!aiAutomationsEnabled}
            />
            Use interpretation for unclear leads (never auto-rejects alone; requires OPENAI on server)
          </label>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={saveBusy}
            onClick={() => void onSave()}
            style={{
              padding: "10px 16px",
              background: theme.primary,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: saveBusy ? "wait" : "pointer",
              fontWeight: 600,
            }}
          >
            {saveBusy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => onClose()}
            style={{
              padding: "10px 16px",
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              background: "#fff",
              color: theme.text,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}
