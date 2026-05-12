import { useCallback, useEffect, useRef, useState } from "react"
import { theme } from "../styles/theme"
import { platformToolsFetchOrigins, platformToolsJsonBody, readPlatformToolsJsonBody } from "../lib/platformToolsJsonBody"
import { supabase } from "../lib/supabase"

type Suggestion = {
  description: string
  quantity: number
  unit_price: number
  rationale?: string
}

type Props = {
  quoteId: string
  accessToken: string | null | undefined
  tradeHint?: string
  existingLines: { description: string; quantity: number; unit_price: number }[]
  onApproveLine: (s: Suggestion) => Promise<void>
  /** When set with onLinkedScopeChange, uses the same text as the Job Details field (single source of truth). */
  linkedScopeText?: string
  onLinkedScopeChange?: (next: string) => void
  /** When false, scope analysis is disabled until earlier wizard context is complete. */
  scopeAnalysisEnabled?: boolean
  /** Merged job context for the model (conversations, attachments, notes, etc.); used when non-empty. */
  mergedScopeForAnalysis?: string
  /** Lighter chrome when nested under Job details. */
  nested?: boolean
}

function storageDraftKey(quoteId: string): string {
  return `tradesman_estimate_scope_draft_${quoteId}`
}

export default function EstimateScopeAssistantPanel({
  quoteId,
  accessToken,
  tradeHint,
  existingLines,
  onApproveLine,
  linkedScopeText,
  onLinkedScopeChange,
  scopeAnalysisEnabled = true,
  mergedScopeForAnalysis = "",
  nested = false,
}: Props) {
  const isLinkedScope = typeof onLinkedScopeChange === "function"
  const [draft, setDraft] = useState("")
  const [listening, setListening] = useState(false)
  const [analyzeBusy, setAnalyzeBusy] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [clarifications, setClarifications] = useState<string[]>([])
  const [analyzeNote, setAnalyzeNote] = useState<string | null>(null)
  const [approvingIdx, setApprovingIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!isLinkedScope) {
      try {
        setDraft(localStorage.getItem(storageDraftKey(quoteId)) ?? "")
      } catch {
        setDraft("")
      }
    }
    setSuggestions([])
    setClarifications([])
    setAnalyzeNote(null)
  }, [quoteId, isLinkedScope])

  const persistDraft = useCallback(
    (v: string) => {
      if (isLinkedScope) {
        onLinkedScopeChange?.(v)
        return
      }
      setDraft(v)
      try {
        localStorage.setItem(storageDraftKey(quoteId), v)
      } catch {
        /* ignore */
      }
    },
    [quoteId, isLinkedScope, onLinkedScopeChange],
  )

  const scopeDraft = isLinkedScope ? (linkedScopeText ?? "") : draft
  const scopeDraftRef = useRef(scopeDraft)
  useEffect(() => {
    scopeDraftRef.current = scopeDraft
  }, [scopeDraft])

  const startVoice = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string
        continuous: boolean
        interimResults: boolean
        start: () => void
        onresult: ((ev: Event) => void) | null
        onerror: (() => void) | null
        onend: (() => void) | null
      }
      webkitSpeechRecognition?: new () => {
        lang: string
        continuous: boolean
        interimResults: boolean
        start: () => void
        onresult: ((ev: Event) => void) | null
        onerror: (() => void) | null
        onend: (() => void) | null
      }
    }
    const Rec = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Rec) {
      alert("Voice input is not supported in this browser.")
      return
    }
    const rec = new Rec()
    rec.lang = navigator.language || "en-US"
    rec.continuous = false
    rec.interimResults = false
    rec.onresult = (ev: Event) => {
      const r = ev as unknown as { results?: Array<Array<{ transcript?: string }>> }
      const chunk = r.results?.[0]?.[0]?.transcript?.trim()
      if (chunk) {
        const base = scopeDraftRef.current.trim()
        persistDraft(base ? `${base} ${chunk}` : chunk)
      }
      setListening(false)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    setListening(true)
    rec.start()
  }

  const analyzeScope = async () => {
    let tok = accessToken?.trim() ?? ""
    if (supabase) {
      const { data: refreshed } = await supabase.auth.refreshSession()
      if (refreshed.session?.access_token) {
        tok = refreshed.session.access_token.trim()
      } else {
        const { data: snap } = await supabase.auth.getSession()
        if (snap.session?.access_token) tok = snap.session.access_token.trim()
      }
    }
    if (!tok) tok = accessToken?.trim() ?? ""
    if (!tok) {
      alert("Sign in again to use scope analysis.")
      return
    }
    const merged = mergedScopeForAnalysis.trim()
    const scopeText = (scopeAnalysisEnabled && merged ? merged : (isLinkedScope ? scopeDraft : draft).trim())
    if (!scopeText) {
      alert(
        scopeAnalysisEnabled && merged
          ? "Merged scope was empty. Add notes in Job details or complete earlier steps."
          : "Describe the job scope first (text or voice).",
      )
      return
    }
    setAnalyzeBusy(true)
    setAnalyzeNote(null)
    try {
      const bases = platformToolsFetchOrigins()
      const body = platformToolsJsonBody({
        scopeText,
        tradeHint: tradeHint ?? "",
        existingLines,
      })
      const clientDeadlineMs = 58_000
      let lastErr = ""
      let res: Response | null = null
      for (let i = 0; i < bases.length; i++) {
        const base = bases[i]
        const ac = new AbortController()
        const kill = window.setTimeout(() => ac.abort(), clientDeadlineMs)
        try {
          res = await fetch(`${base}/api/platform-tools?__route=estimate-scope-lines`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${tok}`,
            },
            body,
            signal: ac.signal,
          })
        } catch (err) {
          clearTimeout(kill)
          lastErr =
            err instanceof Error && err.name === "AbortError" ? "Request timed out — try again." : err instanceof Error ? err.message : String(err)
          if (i < bases.length - 1) continue
          throw new Error(lastErr)
        }
        clearTimeout(kill)
        const parsed = await readPlatformToolsJsonBody<{
          ok?: boolean
          suggestions?: Suggestion[]
          clarifications?: string[]
          note?: string
          fallback?: boolean
          error?: string
        }>(res)
        const j = parsed.data
        if (!res.ok && res.status === 404 && i < bases.length - 1) continue
        if (!res.ok) {
          const errMsg =
            j?.error ||
            (parsed.rawEmpty
              ? res.status === 404
                ? `Request failed (HTTP 404) with an empty response. For local dev run \`vercel dev\` or set VITE_PUBLIC_APP_ORIGIN to your deployed app URL.`
                : `Request failed (HTTP ${res.status}) with an empty response.`
              : parsed.jsonInvalid
                ? `Request failed (HTTP ${res.status}) with a non-JSON response.`
                : `Request failed (HTTP ${res.status}).`)
          lastErr = errMsg
          if (res.status === 404 && i < bases.length - 1) continue
          throw new Error(errMsg)
        }
        if (!j) {
          setSuggestions([])
          setClarifications([])
          setAnalyzeNote("The server returned an empty response. Try again.")
          return
        }
        setSuggestions(Array.isArray(j.suggestions) ? j.suggestions : [])
        setClarifications(Array.isArray(j.clarifications) ? j.clarifications : [])
        setAnalyzeNote(typeof j.note === "string" ? j.note : null)
        return
      }
      throw new Error(lastErr || "Could not reach the AI scope API.")
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
      setSuggestions([])
      setClarifications([])
    } finally {
      setAnalyzeBusy(false)
    }
  }

  const approve = async (idx: number, s: Suggestion) => {
    setApprovingIdx(idx)
    try {
      await onApproveLine(s)
      setSuggestions((prev) => prev.filter((_, i) => i !== idx))
    } finally {
      setApprovingIdx(null)
    }
  }

  const surfaceStyle = nested
    ? ({
        marginBottom: 0,
        padding: 0,
        borderRadius: 0,
        border: "none",
        background: "transparent",
      } as const)
    : ({
        marginBottom: 18,
        padding: 14,
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)",
      } as const)

  return (
    <div style={surfaceStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: theme.text }}>
            {isLinkedScope ? "AI line suggestions" : "Job details"}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#334155", lineHeight: 1.45 }}>
            {isLinkedScope
              ? "Uses the Job Details field above. Analyze scope to preview suggested rows — approve to add them to your estimate."
              : "Describe the job in plain language (or tap Voice). Analyze scope to preview suggested rows — approve to add them to your spreadsheet."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={startVoice}
            disabled={listening}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid #94a3b8",
              background: "#f8fafc",
              color: "#0f172a",
              fontWeight: 700,
              fontSize: 12,
              cursor: listening ? "wait" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {listening ? "Listening…" : "Voice"}
          </button>
          <button
            type="button"
            disabled={analyzeBusy || !scopeAnalysisEnabled}
            onClick={() => void analyzeScope()}
            title={!scopeAnalysisEnabled ? "Complete customer, template, conversations, files, and job notes steps first." : undefined}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "none",
              background: scopeAnalysisEnabled ? theme.primary : "#94a3b8",
              color: "#fff",
              fontWeight: 700,
              fontSize: 12,
              cursor: analyzeBusy || !scopeAnalysisEnabled ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {analyzeBusy ? "Analyzing…" : "Analyze scope"}
          </button>
        </div>
      </div>
      {!scopeAnalysisEnabled ? (
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "#b45309", lineHeight: 1.45 }}>
          Finish the earlier Start quote steps (or skip them) to unlock scope analysis. The model will use your conversation summary, files, and job notes
          together.
        </p>
      ) : null}
      {isLinkedScope ? (
        <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
          Scope text is edited in <strong style={{ color: "#334155" }}>Job Details</strong> above; voice adds to that field.
          {mergedScopeForAnalysis.trim() ? " Analyze scope sends your full saved context (not only this box) to the assistant." : null}
        </p>
      ) : (
        <textarea
          value={scopeDraft}
          onChange={(e) => persistDraft(e.target.value)}
          rows={4}
          placeholder="Example: Replace water heater, drain pan, expansion tank; haul away old unit; permit if city requires…"
          style={{
            ...theme.formInput,
            width: "100%",
            boxSizing: "border-box",
            resize: "vertical",
            fontSize: 14,
            lineHeight: 1.45,
          }}
        />
      )}
      {analyzeNote ? (
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "#64748b" }}>{analyzeNote}</p>
      ) : null}
      {clarifications.length > 0 ? (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>Quick clarifications</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#78350f", lineHeight: 1.5 }}>
            {clarifications.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {suggestions.length > 0 ? (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Suggested rows</div>
          {suggestions.map((s, idx) => (
            <div
              key={`${s.description}-${idx}`}
              style={{
                padding: 12,
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 4 }}>{s.description}</div>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>
                Qty {s.quantity} · ${s.unit_price.toFixed(2)} ea
                {s.rationale ? <span style={{ display: "block", marginTop: 4, fontStyle: "italic" }}>{s.rationale}</span> : null}
              </div>
              <button
                type="button"
                disabled={approvingIdx !== null}
                onClick={() => void approve(idx, s)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: "#15803d",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: approvingIdx !== null ? "wait" : "pointer",
                }}
              >
                {approvingIdx === idx ? "Adding…" : "Approve → add line"}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
