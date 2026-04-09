import { useState } from "react"
import { theme } from "../styles/theme"
import type { PendingAiConsumerReplyV1 } from "../types/aiOutboundApproval"

type Props = {
  pending: PendingAiConsumerReplyV1
  /** Shown in subtitle (e.g. "Lead" / "Conversation"). */
  contextLabel?: string
  busy?: boolean
  onApprove: (finalBody: string) => void | Promise<void>
  /** Omit to hide “Retry (regenerate AI)” until a tab-specific generator exists. */
  onRetry?: () => void | Promise<void>
  onDiscard: () => void | Promise<void>
}

/**
 * Shown on lead/conversation (etc.) detail when an AI-drafted outbound to the customer is waiting for approval.
 */
export default function AiConsumerReplyApprovalCard({
  pending,
  contextLabel = "Customer message",
  busy = false,
  onApprove,
  onRetry,
  onDiscard,
}: Props) {
  const canRetry = typeof onRetry === "function"
  const [draftBody, setDraftBody] = useState(pending.body)
  const [manualMode, setManualMode] = useState(false)

  return (
    <div
      role="region"
      aria-label="AI draft pending approval"
      style={{
        marginBottom: 16,
        padding: 14,
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: "#f0fdf4",
        boxSizing: "border-box",
      }}
    >
      <h4 style={{ margin: "0 0 6px", fontSize: 15, color: theme.text }}>AI draft — approval required</h4>
      <p style={{ margin: "0 0 10px", fontSize: 12, color: "#166534", lineHeight: 1.45 }}>
        {contextLabel}: review what will be sent to <strong>{pending.to}</strong> via{" "}
        <strong>{pending.channel === "sms" ? "SMS" : "email"}</strong>. Approve to send, retry for a new AI draft, or edit the
        text yourself.
      </p>
      {pending.channel === "email" && pending.subject ? (
        <p style={{ margin: "0 0 8px", fontSize: 12, color: theme.text }}>
          <strong>Subject:</strong> {pending.subject}
        </p>
      ) : null}
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: theme.text, marginBottom: 6 }}>
        {manualMode ? "Message (edit as needed)" : "Preview"}
      </label>
      <textarea
        value={draftBody}
        onChange={(e) => setDraftBody(e.target.value)}
        readOnly={!manualMode}
        rows={pending.channel === "email" ? 8 : 4}
        style={{
          ...theme.formInput,
          width: "100%",
          resize: "vertical",
          opacity: manualMode ? 1 : 0.95,
          background: manualMode ? "#fff" : "#ecfdf5",
          cursor: manualMode ? "text" : "default",
        }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          disabled={busy || !draftBody.trim()}
          onClick={() => void onApprove(draftBody.trim())}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "none",
            background: theme.primary,
            color: "#fff",
            fontWeight: 600,
            fontSize: 13,
            cursor: busy || !draftBody.trim() ? "wait" : "pointer",
          }}
        >
          {busy ? "Sending…" : "Approve & send"}
        </button>
        {canRetry ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onRetry!()}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              border: `1px solid ${theme.border}`,
              background: "#fff",
              color: theme.text,
              fontWeight: 600,
              fontSize: 13,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            Retry (regenerate AI)
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setManualMode(true)
          }}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: `1px solid ${theme.border}`,
            background: "#fff",
            color: theme.text,
            fontWeight: 600,
            fontSize: 13,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          Enter manually
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDiscard()}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid #fca5a5",
            background: "#fff",
            color: "#b91c1c",
            fontWeight: 600,
            fontSize: 13,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
