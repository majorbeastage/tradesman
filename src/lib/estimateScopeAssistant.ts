/** AI scope line suggestion from estimate-scope-lines API. */
export type EstimateScopeLineSuggestion = {
  description: string
  quantity: number
  unit_price: number
  line_kind?: "labor" | "material" | "travel" | "misc"
  rationale?: string
}

const LINE_KINDS = new Set(["labor", "material", "travel", "misc"])

export function normalizeScopeLineKind(raw: unknown): EstimateScopeLineSuggestion["line_kind"] {
  const k = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (LINE_KINDS.has(k)) return k as EstimateScopeLineSuggestion["line_kind"]
  if (/labor|hour|crew|install|service call/i.test(k)) return "labor"
  if (/material|supply|part|fixture/i.test(k)) return "material"
  if (/travel|trip|mile|fuel|dispatch/i.test(k)) return "travel"
  return "misc"
}

const SPECULATIVE_PATTERNS =
  /\b(permit|hazardous|hazmat|asbestos|lead paint|mold abatement|job approval|customer approval|sign[- ]?off|disposal fee|environmental|licensing fee|insurance rider|bond fee|admin fee)\b/i

/** Drop lines that invent permits/hazmat/approvals unless scope mentions them. */
export function filterEstimateScopeSuggestions(
  suggestions: EstimateScopeLineSuggestion[],
  scopeText: string,
  existingLines: { description: string }[],
): EstimateScopeLineSuggestion[] {
  const scope = scopeText.toLowerCase()
  const scopeAllowsSpeculative = SPECULATIVE_PATTERNS.test(scope)
  const existingNorm = existingLines.map((l) => l.description.trim().toLowerCase()).filter(Boolean)

  const out: EstimateScopeLineSuggestion[] = []
  const seen = new Set<string>()

  for (const row of suggestions) {
    const desc = row.description.trim()
    if (!desc) continue
    const norm = desc.toLowerCase()
    if (seen.has(norm)) continue
    if (existingNorm.some((e) => e === norm || (e.length > 12 && norm.includes(e)) || (norm.length > 12 && e.includes(norm)))) {
      continue
    }
    if (!scopeAllowsSpeculative && SPECULATIVE_PATTERNS.test(desc)) continue
    seen.add(norm)
    out.push({
      ...row,
      description: desc,
      line_kind: row.line_kind ? normalizeScopeLineKind(row.line_kind) : inferLineKindFromDescription(desc),
    })
    if (out.length >= 8) break
  }
  return out
}

function inferLineKindFromDescription(description: string): EstimateScopeLineSuggestion["line_kind"] {
  const d = description.toLowerCase()
  if (/\b(travel|trip fee|mileage|fuel surcharge|dispatch)\b/.test(d)) return "travel"
  if (/\b(labor|hour|hrs|installation labor|service call)\b/.test(d)) return "labor"
  if (/\b(material|supply|fixture|unit|panel|pipe|wire|shingle|board|paint)\b/.test(d)) return "material"
  return "misc"
}

export const ESTIMATE_LINE_KIND_LABELS: Record<NonNullable<EstimateScopeLineSuggestion["line_kind"]>, string> = {
  labor: "Labor",
  material: "Materials",
  travel: "Travel",
  misc: "Misc",
}
