import {
  CONDITION_RATING_LABELS,
  HOME_INSPECTION_MAJOR_SECTIONS,
  type ConditionRating,
} from "./specialtyReports/homeInspectionTemplate"

export type SpecialtyReportFillContext = {
  accountDisplayName: string
  propertyAddressHint: string
  customerLabel: string
}

export type SpecialtyReportFieldAssignment = {
  fieldKey: string
  value: string
}

export type SpecialtyReportStructuredPatch = {
  fieldKey?: string
  value?: string
  setCondition?: { subId: string; condition: ConditionRating }
  openMajorSection?: string
  focusSubId?: string
}

export type SpecialtyReportParseResult = {
  assignments: SpecialtyReportFieldAssignment[]
  skippedExisting: number
  unmatched: string[]
  /** Navigation-only patches (open section, focus) — conditions map to assignments as cond:sub: */
  structuredPatches: SpecialtyReportStructuredPatch[]
  /** First navigation patch, if any (legacy) */
  structured: SpecialtyReportStructuredPatch | null
  structuredSummary: string | null
}

export function normAssistantPhrase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^(please|ok|okay)\s+/, "")
}

const MAJOR_SECTION_ALIASES: Record<string, string> = {
  admin: "admin_scope",
  administrative: "admin_scope",
  scope: "admin_scope",
  site: "site_exterior",
  exterior: "site_exterior",
  shell: "site_exterior",
  roof: "roof",
  structure: "structure",
  structural: "structure",
  electrical: "electrical",
  electric: "electrical",
  plumbing: "plumbing",
  hvac: "hvac",
  heating: "hvac",
  cooling: "hvac",
  interior: "interior",
  insulation: "insulation_energy",
  energy: "insulation_energy",
  attic: "insulation_energy",
}

export function resolveMajorSectionIdFromPhrase(raw: string): string | null {
  const p = normAssistantPhrase(raw).replace(/\b(the|section|tab)\b/g, "").trim()
  if (!p) return null
  if (MAJOR_SECTION_ALIASES[p]) return MAJOR_SECTION_ALIASES[p]
  for (const sec of HOME_INSPECTION_MAJOR_SECTIONS) {
    if (sec.id === p || p === normAssistantPhrase(sec.title)) return sec.id
    const t = normAssistantPhrase(sec.title)
    if (t.includes(p) || p.includes(t.slice(0, 10))) return sec.id
  }
  return null
}

export function majorIdContainingSubsection(subId: string): string | null {
  for (const sec of HOME_INSPECTION_MAJOR_SECTIONS) {
    if (sec.subsections.some((s) => s.id === subId)) return sec.id
  }
  return null
}

/** Short voice phrases → subsection id (checked before full label scan). */
const SUBSECTION_SHORT_ALIASES: Record<string, string> = {
  gutters: "gutters_downspouts",
  gutter: "gutters_downspouts",
  downspouts: "gutters_downspouts",
  roof: "roof_cover",
  "roof covering": "roof_cover",
  foundation: "foundation_visible",
  electrical: "service_equipment",
  electric: "service_equipment",
  panel: "panel_breakers",
  plumbing: "supply_visible",
  hvac: "heating_equipment",
  heating: "heating_equipment",
  cooling: "cooling_equipment",
  attic: "crawl_attic_access",
  insulation: "attic_insulation",
  siding: "siding_trim",
  windows: "windows_exterior",
  deck: "decks_balconies",
  driveway: "walkways_drive",
  grading: "grading_drainage",
  water: "water_heater",
  "water heater": "water_heater",
  "crawl space": "crawl_attic_access",
  crawlspace: "crawl_attic_access",
  "under the house": "crawl_attic_access",
  underneath: "crawl_attic_access",
  basement: "foundation_visible",
  "electrical panel": "panel_breakers",
  breaker: "panel_breakers",
  breakers: "panel_breakers",
  chimney: "chimney_exterior",
  flashing: "flashing_penetrations",
  skylight: "flashing_penetrations",
}

/** Phrases that may appear anywhere in spoken findings narrative (longest match wins). */
const SUBSECTION_NARRATIVE_HINTS: Array<{ re: RegExp; subId: string; weight: number }> = [
  { re: /\bcrawl\s*space|\bcrawlspace|under(?:neath)?\s+(?:the\s+)?house|under\s+the\s+floor\b/i, subId: "crawl_attic_access", weight: 14 },
  { re: /\bcrawl\s*space\s+moisture|vapor\s+retard|ground\s+moisture\s+barrier/i, subId: "crawlspace_moisture", weight: 16 },
  { re: /\bfoundation|underpinning|slab|footing|stem\s+wall/i, subId: "foundation_visible", weight: 12 },
  { re: /\broof\s+cover|shingle|roofing\b/i, subId: "roof_cover", weight: 12 },
  { re: /\bgutter|downspout/i, subId: "gutters_downspouts", weight: 12 },
  { re: /\belectrical\s+panel|breaker\s+panel|main\s+panel/i, subId: "panel_breakers", weight: 11 },
  { re: /\bwater\s+heater|hot\s+water\s+tank/i, subId: "water_heater", weight: 11 },
  { re: /\bhvac|furnace|air\s+handler|condenser/i, subId: "heating_equipment", weight: 10 },
  { re: /\battic\s+insulation|blown\s+in\s+insulation/i, subId: "attic_insulation", weight: 11 },
  { re: /\battic\s+vent|soffit\s+vent|ridge\s+vent/i, subId: "attic_ventilation", weight: 11 },
]

function subsectionLabel(subId: string): string {
  return HOME_INSPECTION_MAJOR_SECTIONS.flatMap((s) => s.subsections).find((s) => s.id === subId)?.label ?? subId
}

function inferConditionFromNarrative(text: string): ConditionRating | null {
  const t = text.toLowerCase()
  if (
    /\b(deficient|repair|replace|hazard|unsafe|failing|failed|serious|significant|major)\b/.test(t) ||
    /\b(problems?|issues?|damage|damaged|leak|leaking|leaks|mold|moisture|rot|crack|cracks|broken)\b/.test(t) ||
    /\b(needs?\s+to\s+be\s+(?:re)?placed|needs?\s+(?:more|repair|attention|work))\b/.test(t) ||
    /\b(curled|curling|missing\s+shingles?|recommend(?:ed)?\s+(?:repair|evaluation|contractor))\b/.test(t)
  ) {
    return "deficient"
  }
  if (/\b(monitor|marginal|fair|aging|worn)\b/.test(t)) return "marginal"
  if (/\b(satisfactory|good|ok|fine|no\s+(?:major\s+)?issues|acceptable)\b/.test(t)) return "satisfactory"
  return null
}

/** Match a findings subsection mentioned anywhere in free-form dictation. */
export function matchSubsectionIdInText(text: string): string | null {
  const norm = normAssistantPhrase(text)
  if (!norm) return null

  let best: { subId: string; weight: number } | null = null
  for (const hint of SUBSECTION_NARRATIVE_HINTS) {
    if (hint.re.test(text) || hint.re.test(norm)) {
      if (!best || hint.weight > best.weight) best = { subId: hint.subId, weight: hint.weight }
    }
  }

  const aliasEntries = Object.entries(SUBSECTION_SHORT_ALIASES).sort((a, b) => b[0].length - a[0].length)
  for (const [phrase, subId] of aliasEntries) {
    if (phrase.includes(" ")) {
      if (norm.includes(phrase) && (!best || phrase.length >= 6)) {
        best = { subId, weight: 8 + phrase.length }
      }
    } else {
      const re = new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i")
      if (re.test(norm)) {
        const w = 7 + phrase.length
        if (!best || w > best.weight) best = { subId, weight: w }
      }
    }
  }

  for (const sec of HOME_INSPECTION_MAJOR_SECTIONS) {
    for (const sub of sec.subsections) {
      const L = normAssistantPhrase(sub.label)
      const tokens = L.split(/[\s/&]+/).filter((w) => w.length >= 5)
      const hits = tokens.filter((w) => norm.includes(w))
      if (hits.length >= 2 || (tokens.length === 1 && hits.length === 1 && tokens[0]!.length >= 7)) {
        const w = 6 + hits.length
        if (!best || w > best.weight) best = { subId: sub.id, weight: w }
      }
    }
  }

  return best?.subId ?? null
}

function tryParseNarrativeFindings(
  segment: string,
  opts: { readFieldValue: (fieldKey: string) => string; replaceExisting?: boolean },
): { assignments: SpecialtyReportFieldAssignment[]; summary: string } | null {
  const text = segment.trim()
  if (text.length < 12) return null
  if (/^(?:set|fill|put|change|mark)\s+/i.test(text)) return null

  const subId = matchSubsectionIdInText(text)
  if (!subId) return null

  const fieldKey = `sub:${subId}`
  let notes = text
  const cur = opts.readFieldValue(fieldKey).trim()
  if (cur && !opts.replaceExisting) {
    notes = `${cur}\n${text}`
  } else if (cur && opts.replaceExisting) {
    notes = text
  }

  const assignments: SpecialtyReportFieldAssignment[] = [{ fieldKey, value: notes }]
  const rating = inferConditionFromNarrative(text)
  if (rating) {
    assignments.unshift({ fieldKey: `cond:sub:${subId}`, value: rating })
  }

  const label = subsectionLabel(subId)
  const summary = rating
    ? `Recorded ${CONDITION_RATING_LABELS[rating]} and notes for ${label}.`
    : `Recorded findings notes for ${label}.`
  return { assignments, summary }
}

export function matchSubsectionIdFromPhrase(rest: string): string | null {
  const cleaned = normAssistantPhrase(rest).replace(/^the\s+/, "").trim()
  if (!cleaned) return null
  if (SUBSECTION_SHORT_ALIASES[cleaned]) return SUBSECTION_SHORT_ALIASES[cleaned]

  const labelEntries = HOME_INSPECTION_MAJOR_SECTIONS.flatMap((sec) =>
    sec.subsections.map((sub) => ({ L: normAssistantPhrase(sub.label), id: sub.id })),
  ).sort((a, b) => b.L.length - a.L.length)
  for (const { L, id } of labelEntries) {
    if (cleaned === L || cleaned.includes(L) || (cleaned.length >= 8 && L.includes(cleaned))) return id
  }

  const aliasEntries = Object.entries(SUBSECTION_SHORT_ALIASES).sort((a, b) => b[0].length - a[0].length)
  for (const [phrase, subId] of aliasEntries) {
    if (phrase.includes(" ")) {
      if (cleaned.includes(phrase)) return subId
    } else {
      const re = new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i")
      if (re.test(cleaned)) return subId
    }
  }

  const words = cleaned.split(/\s+/).filter(Boolean)
  for (let take = Math.min(6, words.length); take >= 1; take -= 1) {
    const phrase = words.slice(0, take).join(" ")
    if (phrase.length < 3) continue
    if (SUBSECTION_SHORT_ALIASES[phrase]) return SUBSECTION_SHORT_ALIASES[phrase]
    for (const sec of HOME_INSPECTION_MAJOR_SECTIONS) {
      for (const sub of sec.subsections) {
        const L = normAssistantPhrase(sub.label)
        if (phrase === L || (phrase.length >= 4 && (L.includes(phrase) || phrase.includes(L)))) {
          return sub.id
        }
      }
    }
  }
  return null
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Avoid mapping long free-form dictation into a header when a short hint appears as a substring. */
function fieldPhraseMatchesHint(fieldNorm: string, hint: string): boolean {
  const h = hint.trim()
  if (!h || !fieldNorm) return false
  if (fieldNorm === h) return true
  if (h.includes(" ")) {
    if (fieldNorm.includes(h)) return true
    if (h.length >= 14 && fieldNorm.length <= 72 && h.includes(fieldNorm)) return true
    return false
  }
  if (fieldNorm.length > 96) return false
  const re = new RegExp(`\\b${escapeRegex(h)}\\b`, "i")
  return re.test(fieldNorm)
}

export function matchHeaderOrSubFieldKey(fieldPhrase: string, preferFindings = false): string | null {
  const f = normAssistantPhrase(fieldPhrase).replace(/^the\s+/, "").trim()
  if (preferFindings) {
    const subFirst = matchSubsectionIdFromPhrase(f)
    if (subFirst) return `sub:${subFirst}`
  }
  const headerPairs: Array<[string[], string]> = [
    [["inspector name", "inspectors name", "inspector's name", "inspector"], "header.inspectorName"],
    [
      ["inspection id", "inspection number", "file id", "report id", "file number", "reference number", "trec id"],
      "header.inspectionReference",
    ],
    [["license id", "license number", "license", "cert id", "certification"], "header.licenseId"],
    [["inspection date", "report date", "date of inspection"], "header.inspectionDate"],
    [["weather", "site conditions", "site condition", "weather conditions"], "header.weather"],
    [["property address", "job address", "site address", "address of property", "address"], "header.propertyAddress"],
    [["parties present", "parties", "attendees", "people present"], "header.partiesPresent"],
    [["scope and limitations", "scope limitations", "limitations", "scope"], "scopeLimitations"],
    [["executive summary", "summary findings", "summary"], "summaryFindings"],
    [["media notes", "workflow notes", "media workflow"], "mediaWorkflowNotes"],
    [["drone notes", "drone integration"], "droneIntegrationNotes"],
  ]
  for (const [hints, key] of headerPairs) {
    for (const h of hints) {
      if (fieldPhraseMatchesHint(f, h)) return key
    }
  }
  const subId = matchSubsectionIdFromPhrase(f)
  return subId ? `sub:${subId}` : null
}

function normalizeIsFormLeft(leftRaw: string): string {
  return normAssistantPhrase(leftRaw).replace(/^(the|a|an)\s+/, "").trim()
}

/** Reject "the inspector is … and weather is …" style false positives on long left phrases. */
function isFormLeftLooksLikeFieldLabel(leftRaw: string, preferFindings = false): boolean {
  const f = normalizeIsFormLeft(leftRaw)
  if (!f || f.length > 42) return false
  const words = f.split(/\s+/).filter(Boolean)
  if (words.length > 5) return false
  return Boolean(matchHeaderOrSubFieldKey(f, preferFindings))
}

/** Voice-friendly: "set X to Y", "X is Y", "put Y in X", "for X use Y". */
export function tryImplicitFieldKeyValue(
  line: string,
  preferFindings = false,
): { left: string; valueRaw: string } | null {
  const t = line.trim()
  if (!t) return null

  const setTo = t.match(/^(?:please\s+)?(?:set|change)\s+(?:the\s+)?(.+?)\s+to\s+(.+)$/is)
  if (setTo?.[1]?.trim() && setTo[2]?.trim()) {
    let valueRaw = setTo[2].trim()
    const valueTail = valueRaw.split(
      /\s+and\s+(?=(?:the\s+)?(?:weather|license(?:\s+number|\s+id)?|inspector(?:'s)?\s+name|inspector|property\s+address|parties(?:\s+present)?|scope|summary)\s+is\s+)/i,
    )
    if (valueTail.length > 1) valueRaw = valueTail[0]!.trim()
    return { left: setTo[1].trim(), valueRaw }
  }

  const fillWith = t.match(/^(?:please\s+)?(?:fill|put)\s+(?:the\s+)?(.+?)\s+(?:with|as)\s+(.+)$/is)
  if (fillWith?.[1]?.trim() && fillWith[2]?.trim()) return { left: fillWith[1].trim(), valueRaw: fillWith[2].trim() }

  const fillTo = t.match(/^(?:please\s+)?(?:fill|put)\s+(?:the\s+)?(.+?)\s+to\s+(.+)$/is)
  if (fillTo?.[1]?.trim() && fillTo[2]?.trim()) return { left: fillTo[1].trim(), valueRaw: fillTo[2].trim() }

  const putIn = t.match(/^(?:please\s+)?put\s+(.+?)\s+in(?:to)?\s+(?:the\s+)?(.+)$/is)
  if (putIn?.[1]?.trim() && putIn[2]?.trim()) return { left: putIn[2].trim(), valueRaw: putIn[1].trim() }

  const forUse = t.match(/^(?:for|on)\s+(?:the\s+)?(.+?)\s+(?:use|put|set)\s+(.+)$/is)
  if (forUse?.[1]?.trim() && forUse[2]?.trim()) return { left: forUse[1].trim(), valueRaw: forUse[2].trim() }

  const isForm = t.match(/^(.+?)\s+is\s+(.+)$/is)
  if (isForm?.[1]?.trim() && isForm[2]?.trim()) {
    const left = isForm[1].trim()
    if (!isFormLeftLooksLikeFieldLabel(left, preferFindings)) return null
    if (!matchHeaderOrSubFieldKey(normalizeIsFormLeft(left), preferFindings)) return null
    let valueRaw = isForm[2].trim()
    const valueTail = valueRaw.split(
      /\s+and\s+(?=(?:the\s+)?(?:weather|license(?:\s+number|\s+id)?|inspector(?:'s)?\s+name|inspector|property\s+address|parties(?:\s+present)?|scope|summary)\s+is\s+)/i,
    )
    if (valueTail.length > 1) valueRaw = valueTail[0]!.trim()
    if (valueRaw) return { left, valueRaw }
  }

  const eq = t.match(/^(.+?)\s*=\s*(.+)$/)
  if (eq?.[1]?.trim() && eq[2]?.trim()) {
    const L = eq[1].trim()
    const R = eq[2].trim()
    if (L.length >= 2 && L.length <= 72 && !/^https?:\/\//i.test(R)) return { left: L, valueRaw: R }
  }

  return null
}

export function parseConditionRating(word: string): ConditionRating | null {
  const w = normAssistantPhrase(word).replace(/[^a-z0-9/\s_-]/g, "")
  const map: Record<string, ConditionRating> = {
    satisfactory: "satisfactory",
    marginal: "marginal",
    monitor: "marginal",
    deficient: "deficient",
    repair: "deficient",
    na: "na",
    "n/a": "na",
    none: "na",
    "not inspected": "not_inspected",
    unchecked: "not_inspected",
  }
  return map[w] ?? null
}

export function resolveFillLiteral(valueRaw: string, ctx: SpecialtyReportFillContext): string {
  const v = valueRaw.trim().replace(/^["']|["']$/g, "").trim()
  const n = normAssistantPhrase(v)
  if (
    n === "my name" ||
    n === "me" ||
    n === "myself" ||
    n === "account name" ||
    n === "the account name" ||
    (n.includes("my name") && n.length < 24)
  ) {
    return ctx.accountDisplayName
  }
  if (n === "today's date" || n === "todays date" || n === "today" || n === "today date") {
    return new Date().toISOString().slice(0, 10)
  }
  if (
    n === "estimate address" ||
    n === "job address" ||
    n === "service address" ||
    n === "from estimate" ||
    n === "the estimate address"
  ) {
    return ctx.propertyAddressHint.trim()
  }
  if (n === "customer name" || n === "client name" || n === "the customer name" || n === "linked customer") {
    return ctx.customerLabel.trim()
  }
  return v
}

/** Split compound voice commands: "set A to X and set B to Y". */
export function splitCompoundAssistantUtterance(raw: string): string[] {
  const text = raw.trim()
  if (!text) return []
  const byNewline = text
    .split(/\r?\n|;\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (byNewline.length > 1) return byNewline

  const headerIsChain = text.split(
    /\s+and\s+(?=(?:the\s+)?(?:inspector(?:'s)?\s+name|inspector|license(?:\s+number|\s+id)?|weather|property\s+address|parties(?:\s+present)?|scope|summary)\s+is\s+)/i,
  )
  if (headerIsChain.length > 1) return headerIsChain.map((s) => s.trim()).filter(Boolean)

  const headerFieldAnd = text.split(
    /\s+and\s+(?=(?:the\s+)?(?:weather|license(?:\s+number|\s+id)?|inspector(?:'s)?\s+name|inspector|property\s+address|parties(?:\s+present)?|scope|summary)\b)/i,
  )
  if (headerFieldAnd.length > 1) return headerFieldAnd.map((s) => s.trim()).filter(Boolean)

  const andSplit = text.split(
    /\s+(?:and|also|then)\s+(?=(?:please\s+)?(?:set|fill|put|use|change|mark|gutters\b|roof\b|condition\b))/i,
  )
  if (andSplit.length > 1) return andSplit.map((s) => s.trim()).filter(Boolean)

  const multiSet = text.split(/(?=\b(?:please\s+)?set\s+(?:the\s+)?)/i).map((s) => s.trim()).filter(Boolean)
  if (multiSet.length > 1) return multiSet

  const periodSplit = text.split(
    /\.\s+(?=(?:please\s+)?(?:set|fill|put|weather|inspector|license|scope|summary|address|gutters|roof|condition|mark)\b)/i,
  )
  if (periodSplit.length > 1) return periodSplit.map((s) => s.trim()).filter(Boolean)

  const colonChunks = text.match(/(?:^|[.;]\s*)(?:[a-z][\w\s,'-]{1,48}):\s*[^.;]+/gi)
  if (colonChunks && colonChunks.length > 1) {
    return colonChunks.map((s) => s.replace(/^[.;]\s*/, "").trim()).filter(Boolean)
  }

  return [text]
}

function parseLineToAssignment(
  line: string,
  ctx: SpecialtyReportFillContext,
  preferFindings = false,
): SpecialtyReportFieldAssignment[] {
  const colon = line.indexOf(":")
  let left = ""
  let valueRaw = ""
  if (colon > 0) {
    left = line.slice(0, colon).trim()
    valueRaw = line.slice(colon + 1).trim()
  } else {
    const implicit = tryImplicitFieldKeyValue(line, preferFindings)
    if (implicit) {
      left = implicit.left
      valueRaw = implicit.valueRaw
    } else {
      const md = line.match(/^(.+?)\s*[–—]\s*(.+)$/)
      if (!md?.[1] || !md[2]) return []
      left = md[1].trim()
      valueRaw = md[2].trim()
    }
  }
  const partiesTail = line.match(/^parties present\s+(.+)$/i)
  if (partiesTail?.[1]?.trim()) {
    return [{ fieldKey: "header.partiesPresent", value: partiesTail[1].trim() }]
  }

  const licenseTail = line.match(/^license(?:\s+number|\s+id)?\s+is\s+(.+)$/i)
  if (licenseTail?.[1]?.trim()) {
    let v = licenseTail[1].trim()
    const chop = v.split(/\s+and\s+parties\s+present\b/i)
    if (chop.length > 1) v = chop[0]!.trim()
    return [{ fieldKey: "header.licenseId", value: v }]
  }

  const fieldKey = matchHeaderOrSubFieldKey(left, preferFindings)
  if (!fieldKey) return []
  const rating = parseConditionRating(valueRaw)
  if (fieldKey.startsWith("sub:") && rating) {
    return [{ fieldKey: `cond:${fieldKey}`, value: rating }]
  }
  const value = (resolveFillLiteral(valueRaw, ctx) || valueRaw).trim()
  if (!value) return []
  return [{ fieldKey, value }]
}

function parseLineToAssignmentOrRatingTail(
  line: string,
  ctx: SpecialtyReportFillContext,
  preferFindings = false,
): SpecialtyReportFieldAssignment[] {
  const ratingOnly = line.match(/^(satisfactory|marginal|deficient|not\s+inspected|n\/a|na)$/i)
  if (ratingOnly?.[1]) return []
  const base = parseLineToAssignment(line, ctx, preferFindings)
  if (base.length === 0) return base
  const tail = line.match(/^(.+?):\s*(.+?)\.\s*(satisfactory|marginal|deficient|not\s+inspected|n\/a|na)\s*\.?$/i)
  if (tail?.[1] && tail[2] && tail[3]) {
    const subId = matchHeaderOrSubFieldKey(tail[1].trim(), preferFindings)
    const rating = parseConditionRating(tail[3].trim())
    if (subId?.startsWith("sub:") && rating) {
      const notes = tail[2].trim()
      return [
        { fieldKey: subId, value: notes },
        { fieldKey: `cond:${subId}`, value: rating },
      ]
    }
  }
  return base
}

export function parseStructuredFillAndNavCommands(
  raw: string,
  ctx: SpecialtyReportFillContext,
  allowStructure: boolean,
  preferFindings = false,
): { summary: string; patch: SpecialtyReportStructuredPatch } | null {
  const text = raw.trim()
  if (!text || !allowStructure) return null

  const copyEstimateAddress = /\b(copy|pull|fill|use)\s+(?:the\s+)?(?:estimate|job)\s+address\s+(?:into|to|for)\s+(?:the\s+)?(?:property\s+)?address\b/i.test(raw)
  if (copyEstimateAddress && ctx.propertyAddressHint.trim()) {
    return {
      summary: "Property address filled from estimate service address.",
      patch: { fieldKey: "header.propertyAddress", value: ctx.propertyAddressHint.trim() },
    }
  }

  const copyCustomerToParties =
    /\b(copy|pull|fill|use)\s+(?:the\s+)?(?:customer|client)\s+name\s+(?:into|to|for)\s+(?:parties\s+present|parties)\b/i.test(raw)
  if (copyCustomerToParties && ctx.customerLabel.trim()) {
    return {
      summary: 'Parties present filled with customer name from estimate.',
      patch: { fieldKey: "header.partiesPresent", value: ctx.customerLabel.trim() },
    }
  }

  const useMyNameFor = text.match(/\b(?:use|put|apply)\s+my\s+name\s+(?:for|on|in|as)\s+(.+)$/i)
  if (useMyNameFor?.[1] && ctx.accountDisplayName.trim()) {
    const fieldKey = matchHeaderOrSubFieldKey(useMyNameFor[1].trim(), preferFindings)
    if (fieldKey?.startsWith("header.")) {
      return {
        summary: `Set ${fieldKey.replace("header.", "").replaceAll(".", " ")} to your account name.`,
        patch: { fieldKey, value: ctx.accountDisplayName.trim() },
      }
    }
  }

  let fillM = text.match(/^(?:please\s+)?(?:fill\s+in\s+|fill\s+|put\s+)(?:the\s+)?(.+?)\s+(?:with)\s+(.+)$/is)
  if (!fillM) {
    fillM = text.match(/^(?:please\s+)?(?:fill\s+in\s+|fill\s+|put\s+)(?:the\s+)?(.+?)\s+to\s+(.+)$/is)
  }
  const m = fillM ?? text.match(/^(?:please\s+)?set\s+(?:the\s+)?(.+?)\s+to\s+(.+)$/is)
  if (m?.[1] && m[2]) {
    const left = normAssistantPhrase(m[1])
    if (!left.includes("condition") && !/^condition\b/.test(left)) {
      const fieldKey = matchHeaderOrSubFieldKey(m[1], preferFindings)
      const rating = parseConditionRating(m[2].trim())
      if (fieldKey?.startsWith("sub:") && rating) {
        const subId = fieldKey.slice(4)
        return {
          summary: `Set ${CONDITION_RATING_LABELS[rating]} for ${HOME_INSPECTION_MAJOR_SECTIONS.flatMap((s) => s.subsections).find((s) => s.id === subId)?.label ?? subId}.`,
          patch: { setCondition: { subId, condition: rating } },
        }
      }
      const value = resolveFillLiteral(m[2], ctx)
      if (fieldKey && value) {
        return {
          summary: `Updated ${fieldKey.startsWith("sub:") ? "findings" : "header"} field.`,
          patch: { fieldKey, value },
        }
      }
    }
  }

  const subRated = text.match(
    /^(?:please\s+)?(?:mark\s+)?(.+?)\s+(?:as\s+|to\s+|rated\s+)?(satisfactory|marginal|deficient|not\s+inspected|n\/a|na|unchecked)\.?$/i,
  )
  if (subRated?.[1] && subRated[2]) {
    const left = subRated[1].trim()
    const looksLikeNarrativeTail =
      left.includes(":") ||
      (!/\bmark\b/i.test(text) && (/\.\s/.test(left) || left.length > 56 || left.split(/\s+/).length > 10))
    if (!looksLikeNarrativeTail) {
    const subId = matchSubsectionIdFromPhrase(left)
    const rating = parseConditionRating(subRated[2].trim())
    if (subId && rating) {
      return {
        summary: `Set ${CONDITION_RATING_LABELS[rating]} for ${HOME_INSPECTION_MAJOR_SECTIONS.flatMap((s) => s.subsections).find((s) => s.id === subId)?.label ?? subId}.`,
        patch: { setCondition: { subId, condition: rating } },
      }
    }
    }
  }

  const condM = text.match(/\b(?:set|change)\s+condition\s+(?:for|on)\s+(.+)\s+to\s+(.+)$/i)
  if (condM?.[1] && condM[2]) {
    const subId = matchSubsectionIdFromPhrase(condM[1].trim())
    const rating = parseConditionRating(condM[2].trim())
    if (subId && rating) {
      return {
        summary: `Set findings condition (${subId}) to ${CONDITION_RATING_LABELS[rating]}.`,
        patch: { setCondition: { subId, condition: rating } },
      }
    }
  }

  const openMajor =
    text.match(/\b(?:open|show|expand)\s+(?:the\s+)?(.+?)(?:\s+section|\s+tab)?$/i) ??
    text.match(/\b(?:go\s+to|jump\s+to)\s+(?:the\s+)?(.+?)\s+(?:section|category)\s*$/i)
  if (openMajor?.[1]) {
    const mid = resolveMajorSectionIdFromPhrase(openMajor[1])
    if (mid) {
      return {
        summary: `Opened ${HOME_INSPECTION_MAJOR_SECTIONS.find((s) => s.id === mid)?.title ?? "findings"} section.`,
        patch: { openMajorSection: mid },
      }
    }
  }

  const goSub = text.match(/\b(?:go\s+to|open|show)\s+(?:subsection\s+)?(.+)$/i)
  if (goSub?.[1]) {
    const rest = goSub[1].trim()
    const restTab = normAssistantPhrase(rest)
    if (
      ["header", "findings", "media", "review", "summary", "scope", "notes", "the header", "the findings"].some(
        (w) => restTab === w || restTab.startsWith(`${w} `),
      )
    ) {
      /* wizard tab navigation handled elsewhere */
    } else if (!/\b(findings|header|media|review)\b/i.test(rest) || rest.length > 14) {
      const subId = matchSubsectionIdFromPhrase(rest)
      if (subId) {
        return {
          summary: `Findings → ${HOME_INSPECTION_MAJOR_SECTIONS.flatMap((s) => s.subsections).find((s) => s.id === subId)?.label ?? subId}`,
          patch: { openMajorSection: majorIdContainingSubsection(subId) ?? undefined, focusSubId: subId },
        }
      }
    }
  }

  return null
}

/** Voice dump: "inspector name Joe license 123 weather clear …" without set/colon/is. */
function tryParseHeaderRapidFire(text: string): SpecialtyReportFieldAssignment[] | null {
  const t = text.trim()
  if (t.length < 24 || /^(?:set|fill|put|change|mark)\s+/i.test(t)) return null
  const markers: Array<{ re: RegExp; key: string }> = [
    { re: /\binspector(?:'s)?\s+name\b/i, key: "header.inspectorName" },
    { re: /\blicense(?:\s+number|\s+id)?\b/i, key: "header.licenseId" },
    { re: /\bweather\b/i, key: "header.weather" },
    { re: /\bproperty\s+address\b/i, key: "header.propertyAddress" },
    { re: /\bparties\s+present\b/i, key: "header.partiesPresent" },
  ]
  type Hit = { index: number; key: string; len: number }
  const hits: Hit[] = []
  for (const m of markers) {
    const match = m.re.exec(t)
    if (match?.index != null) hits.push({ index: match.index, key: m.key, len: match[0].length })
  }
  if (hits.length < 2) return null
  hits.sort((a, b) => a.index - b.index)

  const out: SpecialtyReportFieldAssignment[] = []
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i]!.index + hits[i]!.len
    const end = i + 1 < hits.length ? hits[i + 1]!.index : t.length
    const value = t.slice(start, end).trim().replace(/^(?:is|:)\s*/i, "").trim()
    if (value) out.push({ fieldKey: hits[i]!.key, value })
  }
  return out.length >= 2 ? out : null
}

export function parseSpecialtyReportFieldAssignments(
  raw: string,
  ctx: SpecialtyReportFillContext,
  opts: {
    allowStructure: boolean
    readFieldValue: (fieldKey: string) => string
    /** When true (Apply / Stop), overwrite fields that already have different text. */
    replaceExisting?: boolean
    /** Prefer findings subsection labels over header aliases (e.g. “scope” on findings page). */
    preferFindings?: boolean
  },
): SpecialtyReportParseResult {
  const assignments: SpecialtyReportFieldAssignment[] = []
  const structuredPatches: SpecialtyReportStructuredPatch[] = []
  const unmatched: string[] = []
  let skippedExisting = 0
  const seen = new Set<string>()
  const summaries: string[] = []

  const segments = splitCompoundAssistantUtterance(raw)
  for (const segment of segments) {
    const structuredSeg = parseStructuredFillAndNavCommands(segment, ctx, opts.allowStructure, opts.preferFindings === true)
    if (structuredSeg?.patch.setCondition) {
      const { subId, condition } = structuredSeg.patch.setCondition
      const key = `cond:sub:${subId}`
      if (!seen.has(key)) {
        seen.add(key)
        assignments.push({ fieldKey: key, value: condition })
      }
      summaries.push(structuredSeg.summary)
      continue
    }
    if (structuredSeg?.patch.fieldKey && structuredSeg.patch.value) {
      const key = structuredSeg.patch.fieldKey
      if (!seen.has(key)) {
        seen.add(key)
        assignments.push({ fieldKey: key, value: structuredSeg.patch.value })
      }
      summaries.push(structuredSeg.summary)
      continue
    }
    if (structuredSeg?.patch.openMajorSection || structuredSeg?.patch.focusSubId) {
      structuredPatches.push(structuredSeg.patch)
      summaries.push(structuredSeg.summary)
      continue
    }
    if (opts.preferFindings !== true) {
      const rapid = tryParseHeaderRapidFire(segment)
      if (rapid) {
        for (const a of rapid) {
          if (seen.has(a.fieldKey)) continue
          const cur = opts.readFieldValue(a.fieldKey).trim()
          if (cur && cur !== a.value && !opts.replaceExisting) {
            skippedExisting += 1
            continue
          }
          seen.add(a.fieldKey)
          assignments.push(a)
        }
        summaries.push(`Filled ${rapid.length} header field(s) from spoken labels.`)
        continue
      }
    }

    const lineAssignments = parseLineToAssignmentOrRatingTail(segment, ctx, opts.preferFindings === true)
    if (lineAssignments.length > 0) {
      for (const lineAssignment of lineAssignments) {
        const cur = opts.readFieldValue(lineAssignment.fieldKey).trim()
        if (cur && cur !== lineAssignment.value && !opts.replaceExisting) {
          skippedExisting += 1
          continue
        }
        if (!seen.has(lineAssignment.fieldKey)) {
          seen.add(lineAssignment.fieldKey)
          assignments.push(lineAssignment)
        }
      }
      continue
    }

    if (opts.allowStructure && opts.preferFindings === true) {
      const narrative = tryParseNarrativeFindings(segment, {
        readFieldValue: opts.readFieldValue,
        replaceExisting: opts.replaceExisting,
      })
      if (narrative) {
        for (const a of narrative.assignments) {
          if (seen.has(a.fieldKey)) continue
          const cur = opts.readFieldValue(a.fieldKey).trim()
          if (cur && cur !== a.value && !opts.replaceExisting) {
            skippedExisting += 1
            continue
          }
          seen.add(a.fieldKey)
          assignments.push(a)
        }
        const maj = narrative.assignments.find((a) => a.fieldKey.startsWith("sub:") || a.fieldKey.startsWith("cond:sub:"))
        if (maj) {
          const subId = maj.fieldKey.replace(/^cond:sub:/, "").replace(/^sub:/, "")
          const mid = majorIdContainingSubsection(subId)
          if (mid) structuredPatches.push({ openMajorSection: mid, focusSubId: subId })
        }
        summaries.push(narrative.summary)
        continue
      }
    }

    unmatched.push(segment)
  }

  return {
    assignments,
    skippedExisting,
    unmatched,
    structuredPatches,
    structured: structuredPatches[0] ?? null,
    structuredSummary: summaries.length > 0 ? summaries.join(" ") : null,
  }
}

export type SpecialtyReportFieldCatalogEntry = { fieldKey: string; label: string; group: string }

export function buildSpecialtyReportFieldCatalog(): SpecialtyReportFieldCatalogEntry[] {
  const out: SpecialtyReportFieldCatalogEntry[] = [
    { fieldKey: "header.inspectorName", label: "Inspector name", group: "header" },
    { fieldKey: "header.licenseId", label: "License / cert ID", group: "header" },
    { fieldKey: "header.inspectionReference", label: "Inspection / file ID", group: "header" },
    { fieldKey: "header.inspectionDate", label: "Inspection date", group: "header" },
    { fieldKey: "header.weather", label: "Weather / site conditions", group: "header" },
    { fieldKey: "header.propertyAddress", label: "Property address", group: "header" },
    { fieldKey: "header.partiesPresent", label: "Parties present", group: "header" },
    { fieldKey: "scopeLimitations", label: "Scope & limitations", group: "header" },
    { fieldKey: "summaryFindings", label: "Executive summary", group: "review" },
    { fieldKey: "mediaWorkflowNotes", label: "Media workflow notes", group: "media" },
    { fieldKey: "droneIntegrationNotes", label: "Drone / integration notes", group: "media" },
  ]
  for (const sec of HOME_INSPECTION_MAJOR_SECTIONS) {
    for (const sub of sec.subsections) {
      out.push({ fieldKey: `sub:${sub.id}`, label: `${sub.label} (notes)`, group: sec.title })
      out.push({
        fieldKey: `cond:sub:${sub.id}`,
        label: `${sub.label} (condition)`,
        group: sec.title,
      })
    }
  }
  return out
}

export function utteranceLooksLikeFieldCommands(raw: string): boolean {
  return /\b(set|fill|put|use|change|copy|inspector|license|weather|address|parties|condition|scope|summary|satisfactory|marginal|deficient|not\s+inspected|rated|mark)\b/i.test(
    raw,
  )
}
