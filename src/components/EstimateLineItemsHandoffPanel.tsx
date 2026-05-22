import { useCallback, useEffect, useState } from "react"
import { theme } from "../styles/theme"
import type { AssistantHandoffPayload } from "../lib/assistantHandoff"
import { specialistLabel } from "../lib/assistantHandoff"
import {
  ESTIMATE_LINE_KIND_LABELS,
  filterEstimateScopeSuggestions,
  normalizeScopeLineKind,
  type EstimateScopeLineSuggestion,
} from "../lib/estimateScopeAssistant"
import type { EstimateLinePresetRow } from "../lib/estimateLinePresets"
import { platformToolsFetchOrigins, platformToolsJsonBody, readPlatformToolsJsonBody } from "../lib/platformToolsJsonBody"
import { supabase } from "../lib/supabase"

type Props = {
  handoff: AssistantHandoffPayload
  existingLines: { description: string }[]
  onAddPresets: (rows: EstimateLinePresetRow[]) => void
  onDismiss: () => void
  /** After lines saved — create/link job type when mode is job_type_with_lines. */
  onJobTypeFollowUp?: (jobTypeName: string, presetIds: string[]) => void
}

export default function EstimateLineItemsHandoffPanel({
  handoff,
  existingLines,
  onAddPresets,
  onDismiss,
  onJobTypeFollowUp,
}: Props) {
  const [scopeText, setScopeText] = useState(handoff.scopeText)
  const [analyzeBusy, setAnalyzeBusy] = useState(false)
  const [suggestions, setSuggestions] = useState<EstimateScopeLineSuggestion[]>(handoff.suggestions ?? [])
  const [clarifications, setClarifications] = useState<string[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<string[]>([])
  const [jobTypePromptOpen, setJobTypePromptOpen] = useState(false)

  const runAnalyze = useCallback(async () => {
    const text = scopeText.trim()
    if (!text) return
    if (!supabase) {
      setNote("Not connected.")
      return
    }
    const { data: sessionData } = await supabase.auth.getSession()
    const tok = sessionData.session?.access_token
    if (!tok) {
      setNote("Sign in to use the line items assistant.")
      return
    }
    setAnalyzeBusy(true)
    setNote(null)
    try {
      const bases = platformToolsFetchOrigins()
      const body = platformToolsJsonBody({
        scopeText: text,
        tradeHint: handoff.jobTypeName ? `${handoff.jobTypeName} trade` : "",
        existingLines,
      })
      let res: Response | null = null
      for (let i = 0; i < bases.length; i++) {
        const base = bases[i]
        res = await fetch(`${base}/api/platform-tools?__route=estimate-scope-lines`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
          body,
        })
        const parsed = await readPlatformToolsJsonBody<{
          suggestions?: EstimateScopeLineSuggestion[]
          clarifications?: string[]
          note?: string
          error?: string
        }>(res)
        const j = parsed.data
        if (!res.ok && res.status === 404 && i < bases.length - 1) continue
        if (!res.ok) throw new Error(j?.error ?? `Request failed (${res.status})`)
        const raw: EstimateScopeLineSuggestion[] = []
        if (Array.isArray(j?.suggestions)) {
          for (const row of j.suggestions) {
            if (!row?.description?.trim()) continue
            raw.push({
              description: row.description.trim(),
              quantity: Math.max(0, Number(row.quantity) || 1),
              unit_price: Math.max(0, Number(row.unit_price) || 0),
              line_kind: normalizeScopeLineKind(row.line_kind),
              ...(row.rationale?.trim() ? { rationale: row.rationale.trim() } : {}),
            })
          }
        }
        setSuggestions(filterEstimateScopeSuggestions(raw, text, existingLines))
        setClarifications(Array.isArray(j?.clarifications) ? j.clarifications.slice(0, 3) : [])
        setNote(typeof j?.note === "string" ? j.note : null)
        return
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not analyze scope.")
      setSuggestions([])
    } finally {
      setAnalyzeBusy(false)
    }
  }, [scopeText, handoff.jobTypeName, existingLines])

  useEffect(() => {
    if (suggestions.length > 0 || analyzeBusy) return
    void runAnalyze()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- run once on handoff open

  const addAll = () => {
    if (!suggestions.length) return
    const rows: EstimateLinePresetRow[] = suggestions.map((s) => {
      const kind = s.line_kind ?? "misc"
      const unit_basis = kind === "material" ? "each" : kind === "travel" ? "miles" : "hours"
      return {
        id: crypto.randomUUID(),
        description: s.description.trim().slice(0, 500),
        quantity: Math.max(0, s.quantity) || 1,
        unit_price: Math.max(0, s.unit_price),
        linked_job_type_ids: [],
        line_kind: kind,
        unit_basis,
      }
    })
    onAddPresets(rows)
    const ids = rows.map((r) => r.id)
    setAddedIds(ids)
    setSuggestions([])
    if (handoff.mode === "job_type_with_lines" && handoff.jobTypeName?.trim() && onJobTypeFollowUp) {
      setJobTypePromptOpen(true)
    } else {
      setNote(`Added ${rows.length} saved line(s). Review below, then Save & close.`)
    }
  }

  return (
    <div
      style={{
        marginBottom: 18,
        padding: 14,
        borderRadius: 10,
        border: `2px solid ${theme.primary}`,
        background: "linear-gradient(180deg, #eef2ff 0%, #fff 100%)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#312e81" }}>
            {specialistLabel(handoff.specialist)}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
            Handed off from the platform assistant — review AI lines before saving.
          </div>
        </div>
        <button type="button" onClick={onDismiss} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18 }}>
          ×
        </button>
      </div>

      {handoff.jobTypeName ? (
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "#475569" }}>
          Job type context: <strong>{handoff.jobTypeName}</strong>
          {handoff.mode === "job_type_with_lines" ? " — link lines after you confirm." : ""}
        </p>
      ) : null}

      <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Scope (edit if needed)</label>
      <textarea
        rows={3}
        value={scopeText}
        onChange={(e) => setScopeText(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", fontSize: 12, padding: 8, borderRadius: 6, border: `1px solid ${theme.border}` }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          disabled={analyzeBusy}
          onClick={() => void runAnalyze()}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "none",
            background: theme.primary,
            color: "#fff",
            fontWeight: 600,
            fontSize: 12,
            cursor: analyzeBusy ? "wait" : "pointer",
          }}
        >
          {analyzeBusy ? "Analyzing…" : "Regenerate lines"}
        </button>
        {suggestions.length > 0 ? (
          <button
            type="button"
            onClick={addAll}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: "none",
              background: "#059669",
              color: "#fff",
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Add all {suggestions.length} to saved lines
          </button>
        ) : null}
      </div>

      {note ? <p style={{ margin: "10px 0 0", fontSize: 12, color: "#475569" }}>{note}</p> : null}

      {clarifications.length > 0 ? (
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, color: "#64748b" }}>
          {clarifications.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      ) : null}

      {suggestions.length > 0 ? (
        <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {suggestions.map((s, idx) => (
            <li
              key={`${s.description}-${idx}`}
              style={{
                padding: 10,
                borderRadius: 8,
                background: "#fff",
                border: `1px solid ${theme.border}`,
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 600 }}>{s.description}</div>
              <div style={{ color: "#64748b", marginTop: 4 }}>
                {s.line_kind ? ESTIMATE_LINE_KIND_LABELS[s.line_kind] : "Line"} · {s.quantity} × ${s.unit_price.toFixed(2)}
                {s.rationale ? ` — ${s.rationale}` : ""}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {jobTypePromptOpen && handoff.jobTypeName && onJobTypeFollowUp ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            background: "#fff7ed",
            border: "1px solid #fdba74",
          }}
        >
          <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#9a3412" }}>
            Create or link job type “{handoff.jobTypeName}” with these {addedIds.length} line(s)?
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                onJobTypeFollowUp(handoff.jobTypeName!, addedIds)
                setJobTypePromptOpen(false)
                onDismiss()
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "none",
                background: "#ea580c",
                color: "#fff",
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Yes — open job types
            </button>
            <button
              type="button"
              onClick={() => {
                setJobTypePromptOpen(false)
                onDismiss()
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
