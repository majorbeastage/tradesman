/**
 * Cross-assistant handoffs — platform assistant → specialist UIs (estimate line items, etc.).
 */

import type { EstimateScopeLineSuggestion } from "./estimateScopeAssistant"
import { matchJobTypeNameInText } from "./businessAiVocabulary"
import { normalizeAssistantPhrase } from "./platformAssistantVocabulary"
import type { EstimateLinePresetRow } from "./estimateLinePresets"

export const ASSISTANT_HANDOFF_STORAGE_KEY = "tradesman_assistant_handoff_v1"
export const OPEN_ESTIMATE_LINE_ITEMS_MODAL_KEY = "tradesman_open_estimate_line_items_modal"
export const OPEN_ESTIMATE_JOB_TYPES_MODAL_KEY = "tradesman_open_estimate_job_types_modal"

export type SpecialistAssistantId =
  | "estimate_line_items_library"
  | "estimate_job_types_library"
  | "estimate_quote_scope"

export type AssistantHandoffMode = "line_items_only" | "job_type_with_lines"

export type AssistantHandoffPayload = {
  specialist: SpecialistAssistantId
  scopeText: string
  jobTypeName?: string
  mode: AssistantHandoffMode
  sourcePhrase?: string
  /** Pre-generated lines (optional — specialist may still re-run AI). */
  suggestions?: EstimateScopeLineSuggestion[]
}

export function queueAssistantHandoff(payload: AssistantHandoffPayload): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(ASSISTANT_HANDOFF_STORAGE_KEY, JSON.stringify(payload))
    if (payload.specialist === "estimate_line_items_library") {
      sessionStorage.setItem(OPEN_ESTIMATE_LINE_ITEMS_MODAL_KEY, "1")
    }
    if (payload.specialist === "estimate_job_types_library") {
      sessionStorage.setItem(OPEN_ESTIMATE_JOB_TYPES_MODAL_KEY, "1")
    }
  } catch {
    /* ignore */
  }
}

export function consumeAssistantHandoff(): AssistantHandoffPayload | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(ASSISTANT_HANDOFF_STORAGE_KEY)
    if (!raw?.trim()) return null
    sessionStorage.removeItem(ASSISTANT_HANDOFF_STORAGE_KEY)
    const j = JSON.parse(raw) as AssistantHandoffPayload
    if (!j?.specialist || !j.scopeText?.trim()) return null
    return {
      specialist: j.specialist,
      scopeText: j.scopeText.trim().slice(0, 2000),
      jobTypeName: j.jobTypeName?.trim() || undefined,
      mode: j.mode === "job_type_with_lines" ? "job_type_with_lines" : "line_items_only",
      sourcePhrase: j.sourcePhrase?.trim(),
      suggestions: Array.isArray(j.suggestions) ? j.suggestions : undefined,
    }
  } catch {
    return null
  }
}

export function consumeOpenEstimateJobTypesModalFlag(): boolean {
  if (typeof window === "undefined") return false
  try {
    const v = sessionStorage.getItem(OPEN_ESTIMATE_JOB_TYPES_MODAL_KEY)
    if (v) {
      sessionStorage.removeItem(OPEN_ESTIMATE_JOB_TYPES_MODAL_KEY)
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

export function consumeOpenEstimateLineItemsModalFlag(): boolean {
  if (typeof window === "undefined") return false
  try {
    const v = sessionStorage.getItem(OPEN_ESTIMATE_LINE_ITEMS_MODAL_KEY)
    if (v) {
      sessionStorage.removeItem(OPEN_ESTIMATE_LINE_ITEMS_MODAL_KEY)
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

/** User wants saved estimate line items / library AI (not an open-quote scope panel only). */
export function parseEstimateLineItemsHandoffIntent(
  raw: string,
  knownJobTypeNames: string[] = [],
): {
  scopeText: string
  jobTypeName?: string
  needsClarification: boolean
} | null {
  const text = normalizeAssistantPhrase(raw)
  if (!text) return null

  const mentionsLineItems =
    /\b(line\s*items?|saved\s+lines?|estimate\s+lines?|pricing\s+lines?)\b/i.test(text) ||
    (/\b(shingle|material|labor)\b/i.test(text) && /\b(costs?|pricing|items?)\b/i.test(text))

  const mentionsJobType = /\bjob\s*types?\b/i.test(text)
  const mentionsBuild =
    /\b(create|build|add|need|set\s+up|make|generate|draft|write)\b/i.test(text) ||
    /\bhave\s+to\s+do\s+with\b/i.test(text)

  if (!mentionsLineItems && !(mentionsJobType && mentionsBuild)) return null
  if (!mentionsBuild && !/\b(line\s*items?|saved\s+lines?)\b/i.test(text)) return null

  let jobTypeName: string | undefined = matchJobTypeNameInText(text, knownJobTypeNames)
  if (!jobTypeName) {
    const jtPatterns = [
      /\bjob\s*type\s+(?:is\s+)?(?:going\s+to\s+be|will\s+be|called|named)\s+(.+?)(?:\s+and\b|\s*,|\s*\.|$)/i,
      /\bfor\s+(?:a\s+)?([a-z][a-z0-9\s-]{1,36})\s+job\b/i,
      /\b(roofing|plumbing|hvac|electrical|landscaping|painting|remodel|siding|gutters?)\b/i,
    ]
    for (const p of jtPatterns) {
      const m = text.match(p)
      if (m?.[1]) {
        const name = m[1].replace(/\b(the|a|an)\b/gi, "").trim()
        if (name.length >= 2 && name.length <= 48) {
          jobTypeName = name.charAt(0).toUpperCase() + name.slice(1)
          break
        }
      }
    }
  }

  const lineItemsOnlyHint = /\b(line\s*items?\s+only|just\s+(?:the\s+)?lines?|lines?\s+first|job\s*type\s+later)\b/i.test(text)
  const jobTypeWithLinesHint = /\b(job\s*type\s+with|with\s+these\s+lines?|bundle|link\s+to\s+job\s*type)\b/i.test(text)

  const needsClarification =
    Boolean(jobTypeName || mentionsJobType) &&
    mentionsLineItems &&
    !lineItemsOnlyHint &&
    !jobTypeWithLinesHint

  return {
    scopeText: text,
    jobTypeName,
    needsClarification,
  }
}

export function scopeSuggestionToPresetRow(s: EstimateScopeLineSuggestion): EstimateLinePresetRow {
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
}

export function specialistLabel(id: SpecialistAssistantId): string {
  switch (id) {
    case "estimate_line_items_library":
      return "Estimate line items assistant"
    case "estimate_job_types_library":
      return "Job types assistant"
    case "estimate_quote_scope":
      return "Quote scope assistant"
    default:
      return "Specialist assistant"
  }
}

export function buildAssistantSpecialistsCatalogSection(): string {
  return [
    "## Specialist assistants (hand off from platform assistant)",
    "",
    "When the user describes **saved line items**, **job types**, and trade scope (e.g. roofing + shingles + material costs), use **handoff_specialist_assistant** — not navigate alone.",
    "",
    "| Specialist | When |",
    "|------------|------|",
    "| estimate_line_items_library | Build saved line templates on Estimates tab; AI generates lines from scope |",
    "| estimate_job_types_library | Create/manage job types (use after line items if they only want job type) |",
    "| estimate_quote_scope | Line suggestions inside an open quote wizard (needs active quote) |",
    "",
    "Fields: specialist, scopeText (user's full request), jobTypeName (if stated), mode: line_items_only | job_type_with_lines.",
    "If both job type and line items are mentioned and unclear, return clarify with alternatives — do not guess.",
  ].join("\n")
}
