import { useCallback, useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import AttachmentStrip, { type AttachmentStripItem } from "./AttachmentStrip"
import {
  CUSTOMER_SIGNED_ESTIMATE_LABEL,
  saveInboundFileAsCustomerSignedEstimate,
} from "../lib/estimatePdfArchive"
import { formatAppError } from "../lib/formatAppError"
import { sandboxTrainingAlert, useSandboxTrainingMode } from "../lib/sandboxTrainingUi"

type QuotePick = {
  id: string
  title: string
  updatedAt: string | null
}

function quoteTitleFromMetadata(metadata: unknown, quoteId: string): string {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const m = metadata as Record<string, unknown>
    const job = typeof m.job_title === "string" ? m.job_title.trim() : ""
    if (job) return job
    const title = typeof m.title === "string" ? m.title.trim() : ""
    if (title) return title
  }
  return `Estimate ${quoteId.slice(0, 8).toUpperCase()}`
}

async function loadQuotesForCustomer(userId: string, customerId: string): Promise<QuotePick[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from("quotes")
    .select("id, metadata, updated_at, created_at")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .is("removed_at", null)
    .order("updated_at", { ascending: false })
    .limit(40)
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: String((row as { id: string }).id),
    title: quoteTitleFromMetadata((row as { metadata?: unknown }).metadata, String((row as { id: string }).id)),
    updatedAt:
      typeof (row as { updated_at?: string }).updated_at === "string"
        ? (row as { updated_at: string }).updated_at
        : typeof (row as { created_at?: string }).created_at === "string"
          ? (row as { created_at: string }).created_at
          : null,
  }))
}

type SaveModalProps = {
  item: AttachmentStripItem
  userId: string
  customerId: string
  onClose: () => void
  onSaved: () => void
}

function SaveAttachmentModal({ item, userId, customerId, onClose, onSaved }: SaveModalProps) {
  const sandboxTraining = useSandboxTrainingMode()
  const [quotes, setQuotes] = useState<QuotePick[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [quoteId, setQuoteId] = useState("")
  const [markApproved, setMarkApproved] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void loadQuotesForCustomer(userId, customerId)
      .then((rows) => {
        if (cancelled) return
        setQuotes(rows)
        setQuoteId(rows[0]?.id ?? "")
      })
      .catch((e) => {
        if (!cancelled) setLoadError(formatAppError(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId, customerId])

  async function handleSave() {
    if (!supabase || !quoteId) return
    if (sandboxTraining) {
      sandboxTrainingAlert(sandboxTraining, "Saving attachments is disabled in sandbox training mode.", "communication")
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await saveInboundFileAsCustomerSignedEstimate(supabase, {
        userId,
        quoteId,
        sourceUrl: item.public_url,
        fileName: item.file_name,
        contentType: item.content_type,
        communicationAttachmentId: item.id,
        markApproved,
      })
      onSaved()
      onClose()
    } catch (e) {
      setSaveError(formatAppError(e))
    } finally {
      setSaving(false)
    }
  }

  const fileLabel = (item.file_name || "Attachment").trim()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-att-est-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12000,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          padding: "18px 20px",
          boxShadow: "0 12px 40px rgba(15,23,42,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="save-att-est-title" style={{ margin: "0 0 8px", fontSize: 17, color: theme.text }}>
          Save to estimate
        </h3>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
          File <strong style={{ color: theme.text }}>{fileLabel}</strong> will be stored as{" "}
          <strong style={{ color: theme.text }}>{CUSTOMER_SIGNED_ESTIMATE_LABEL}</strong> on the estimate you choose.
        </p>

        {loading ? <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Loading estimates…</p> : null}
        {loadError ? <p style={{ margin: 0, fontSize: 13, color: "#b91c1c" }}>{loadError}</p> : null}

        {!loading && !loadError && quotes.length === 0 ? (
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b" }}>
            No estimates for this customer yet. Create one in Quotes first.
          </p>
        ) : null}

        {!loading && quotes.length > 0 ? (
          <label style={{ display: "block", marginBottom: 12, fontSize: 13, fontWeight: 600, color: theme.text }}>
            Estimate
            <select
              value={quoteId}
              onChange={(e) => setQuoteId(e.target.value)}
              style={{ ...theme.formInput, display: "block", width: "100%", marginTop: 6, fontSize: 13 }}
            >
              {quotes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title}
                  {q.updatedAt
                    ? ` · ${new Date(q.updatedAt).toLocaleDateString([], { dateStyle: "short" })}`
                    : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {quotes.length > 0 ? (
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: theme.text, marginBottom: 14 }}>
            <input
              type="checkbox"
              checked={markApproved}
              onChange={(e) => setMarkApproved(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>Mark estimate as approved by customer (shows in Work Orders and customer profile)</span>
          </label>
        ) : null}

        {saveError ? <p style={{ margin: "0 0 10px", fontSize: 13, color: "#b91c1c" }}>{saveError}</p> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={onClose} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer" }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !quoteId || quotes.length === 0}
            onClick={() => void handleSave()}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 700,
              cursor: saving || !quoteId ? "wait" : "pointer",
              opacity: saving || !quoteId ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Save to estimate"}
          </button>
        </div>
      </div>
    </div>
  )
}

type Props = {
  items: AttachmentStripItem[]
  userId: string | null | undefined
  customerId: string | null | undefined
  compact?: boolean
  allowSaveToEstimate?: boolean
  onSaved?: () => void
}

export default function SaveInboundAttachmentToEstimate({
  items,
  userId,
  customerId,
  compact,
  allowSaveToEstimate = true,
  onSaved,
}: Props) {
  const [activeItem, setActiveItem] = useState<AttachmentStripItem | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  const markSaved = useCallback(
    (id: string) => {
      setSavedIds((prev) => new Set(prev).add(id))
      onSaved?.()
    },
    [onSaved],
  )

  if (!items?.length) return null

  const canSave = Boolean(userId && customerId && allowSaveToEstimate)

  return (
    <div style={{ marginTop: compact ? 6 : 10 }}>
      <AttachmentStrip items={items} compact={compact} />
      {canSave ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {items.map((item) => {
            const label = (item.file_name || "Attachment").replace(/\s+/g, " ").trim()
            const alreadySaved = savedIds.has(item.id)
            return (
              <div key={`save-${item.id}`} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#64748b", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {label}
                </span>
                {alreadySaved ? (
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#0f766e" }}>Saved to estimate</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveItem(item)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: `1px solid ${theme.primary}`,
                      background: "#eff6ff",
                      color: theme.primary,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Save as signed estimate…
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : null}
      {activeItem && userId && customerId ? (
        <SaveAttachmentModal
          item={activeItem}
          userId={userId}
          customerId={customerId}
          onClose={() => setActiveItem(null)}
          onSaved={() => markSaved(activeItem.id)}
        />
      ) : null}
    </div>
  )
}
