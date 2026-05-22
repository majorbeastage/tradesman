import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { theme } from "../styles/theme"
import { TAB_ID_LABELS, USER_PORTAL_TAB_IDS } from "../types/portal-builder"
import { SETUP_MINI_WIZARDS } from "../lib/setupGuideWizards"
import { ADMIN_PANEL_LABELS, type AdminPanelId } from "../lib/platformAssistantRegistry"
import {
  ASSISTANT_VOCABULARY_ACTION_OPTIONS,
  type AssistantCustomActionPayload,
  type AssistantCustomVocabularyEntry,
  type AssistantVocabularyMatchMode,
} from "../lib/platformAssistantCustomVocabulary"

const AMBER = "#d97706"
const TEXT = "#0f172a"
const TEXT_MUTED = "#475569"
const INPUT_STYLE: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  fontSize: 13,
  color: TEXT,
  background: "#fff",
  boxSizing: "border-box",
}
const LABEL_STYLE: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: TEXT,
  lineHeight: 1.35,
}

type Props = {
  open: boolean
  onClose: () => void
  initialPhrase?: string
  selectedCustomerName?: string | null
  entries: AssistantCustomVocabularyEntry[]
  saveBusy: boolean
  saveError: string | null
  onSave: (entry: Omit<AssistantCustomVocabularyEntry, "id" | "createdAt" | "createdBy">) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function defaultPayload(type: AssistantCustomActionPayload["type"]): AssistantCustomActionPayload {
  switch (type) {
    case "navigate":
      return { type: "navigate", page: "customers" }
    case "find_customer":
      return { type: "find_customer", query: "" }
    case "create_estimate":
      return { type: "create_estimate", useSelectedCustomer: true }
    case "focus_customer_sms":
      return { type: "focus_customer_sms", useSelectedCustomer: true }
    case "open_mini_wizard":
      return { type: "open_mini_wizard", wizardId: "customers_auto_replies" }
    case "open_admin":
      return { type: "open_admin", panel: "portal" }
    default:
      return { type }
  }
}

export default function AssistantVocabularyTrainPanel({
  open,
  onClose,
  initialPhrase = "",
  selectedCustomerName,
  entries,
  saveBusy,
  saveError,
  onSave,
  onDelete,
}: Props) {
  const [phrase, setPhrase] = useState(initialPhrase)
  const [match, setMatch] = useState<AssistantVocabularyMatchMode>("contains")
  const [actionType, setActionType] = useState<AssistantCustomActionPayload["type"]>("create_estimate")
  const [payload, setPayload] = useState<AssistantCustomActionPayload>(() => defaultPayload("create_estimate"))
  const [note, setNote] = useState("")

  useEffect(() => {
    if (open) setPhrase(initialPhrase)
  }, [open, initialPhrase])

  const onTypeChange = useCallback((t: AssistantCustomActionPayload["type"]) => {
    setActionType(t)
    setPayload(defaultPayload(t))
  }, [])

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)).slice(0, 12),
    [entries],
  )

  if (!open) return null

  const handleSave = () => {
    const p = phrase.trim()
    if (p.length < 2) return
    void onSave({
      phrase: p,
      match,
      action: payload,
      enabled: true,
      note: note.trim() || undefined,
    }).then(() => {
      setPhrase("")
      setNote("")
    })
  }

  return (
    <div
      role="dialog"
      aria-label="Train platform assistant"
      style={{
        position: "fixed",
        zIndex: 10051,
        right: 12,
        bottom: "max(88px, calc(80px + env(safe-area-inset-bottom, 0px)))",
        width: "min(360px, calc(100vw - 24px))",
        maxHeight: "min(70vh, 520px)",
        overflow: "auto",
        padding: 14,
        borderRadius: 12,
        border: `2px solid ${AMBER}`,
        background: "#ffffff",
        color: TEXT,
        boxShadow: "0 12px 40px rgba(15,23,42,0.22)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>Train assistant</div>
          <div style={{ fontSize: 12, color: TEXT_MUTED, lineHeight: 1.4, marginTop: 4 }}>
            Saved phrases apply for all users after you save.
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            border: "none",
            background: "transparent",
            fontSize: 20,
            lineHeight: 1,
            cursor: "pointer",
            color: TEXT,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>

      <label style={{ ...LABEL_STYLE, marginBottom: 4 }}>When a user says…</label>
      <textarea
        rows={2}
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        placeholder='e.g. "create an estimate for this customer"'
        style={{
          ...INPUT_STYLE,
          marginBottom: 10,
          resize: "vertical",
        }}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <label style={{ ...LABEL_STYLE, flex: 1 }}>
          Match
          <select
            value={match}
            onChange={(e) => setMatch(e.target.value as AssistantVocabularyMatchMode)}
            style={INPUT_STYLE}
          >
            <option value="contains">Contains phrase</option>
            <option value="exact">Exact phrase</option>
            <option value="starts_with">Starts with</option>
          </select>
        </label>
        <label style={{ ...LABEL_STYLE, flex: 2 }}>
          Do this
          <select
            value={actionType}
            onChange={(e) => onTypeChange(e.target.value as AssistantCustomActionPayload["type"])}
            style={INPUT_STYLE}
          >
            {ASSISTANT_VOCABULARY_ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {payload.type === "navigate" ? (
        <label style={{ ...LABEL_STYLE, marginBottom: 10 }}>
          Tab
          <select
            value={payload.page}
            onChange={(e) => setPayload({ ...payload, page: e.target.value })}
            style={INPUT_STYLE}
          >
            {USER_PORTAL_TAB_IDS.map((id) => (
              <option key={id} value={id}>
                {TAB_ID_LABELS[id] ?? id}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {payload.type === "find_customer" ? (
        <label style={{ ...LABEL_STYLE, marginBottom: 10 }}>
          Customer name contains
          <input
            value={payload.query}
            onChange={(e) => setPayload({ ...payload, query: e.target.value })}
            style={INPUT_STYLE}
          />
        </label>
      ) : null}

      {payload.type === "create_estimate" || payload.type === "focus_customer_sms" ? (
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            marginBottom: 10,
            padding: "10px 12px",
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            background: "#f8fafc",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={Boolean(payload.useSelectedCustomer)}
            onChange={(e) => setPayload({ ...payload, useSelectedCustomer: e.target.checked })}
            style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0, accentColor: AMBER }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, lineHeight: 1.4 }}>
            Use customer open on screen
            {selectedCustomerName ? (
              <span style={{ display: "block", fontWeight: 500, color: TEXT_MUTED, marginTop: 2 }}>{selectedCustomerName}</span>
            ) : null}
          </span>
        </label>
      ) : null}

      {payload.type === "create_estimate" && !payload.useSelectedCustomer ? (
        <label style={{ ...LABEL_STYLE, marginBottom: 10 }}>
          Or customer name
          <input
            value={payload.customerQuery ?? ""}
            onChange={(e) => setPayload({ ...payload, customerQuery: e.target.value })}
            style={INPUT_STYLE}
            placeholder="e.g. Smith"
          />
        </label>
      ) : null}

      {payload.type === "open_mini_wizard" ? (
        <label style={{ ...LABEL_STYLE, marginBottom: 10 }}>
          Wizard
          <select
            value={payload.wizardId}
            onChange={(e) => setPayload({ ...payload, wizardId: e.target.value as typeof payload.wizardId })}
            style={INPUT_STYLE}
          >
            {SETUP_MINI_WIZARDS.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {payload.type === "open_admin" ? (
        <label style={{ ...LABEL_STYLE, marginBottom: 10 }}>
          Admin panel
          <select
            value={payload.panel}
            onChange={(e) => setPayload({ ...payload, panel: e.target.value as AdminPanelId })}
            style={INPUT_STYLE}
          >
            {(Object.keys(ADMIN_PANEL_LABELS) as AdminPanelId[]).map((id) => (
              <option key={id} value={id}>
                {ADMIN_PANEL_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label style={{ ...LABEL_STYLE, marginBottom: 10 }}>
        Note (optional)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={INPUT_STYLE}
          placeholder="Internal reminder for your team"
        />
      </label>

      {saveError ? (
        <p style={{ fontSize: 11, color: "#b91c1c", margin: "0 0 8px" }}>{saveError}</p>
      ) : null}

      <button
        type="button"
        disabled={saveBusy || phrase.trim().length < 2}
        onClick={handleSave}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 8,
          border: "none",
          background: saveBusy ? "#fcd34d" : AMBER,
          color: "#fff",
          fontWeight: 600,
          fontSize: 13,
          cursor: saveBusy ? "wait" : "pointer",
          marginBottom: 12,
        }}
      >
        {saveBusy ? "Saving…" : "Save training phrase"}
      </button>

      {sortedEntries.length > 0 ? (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 6 }}>Saved ({entries.length})</div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 12, color: TEXT }}>
            {sortedEntries.map((e) => (
              <li
                key={e.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "6px 0",
                  borderTop: `1px solid ${theme.border}`,
                }}
              >
                <span style={{ flex: 1, lineHeight: 1.35 }}>
                  <strong>{e.phrase}</strong>
                  <span style={{ color: TEXT_MUTED }}> → {e.action.type}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void onDelete(e.id)}
                  disabled={saveBusy}
                  style={{ fontSize: 10, color: "#b91c1c", border: "none", background: "none", cursor: "pointer" }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
