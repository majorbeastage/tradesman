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

export function matchSubsectionIdFromPhrase(rest: string): string | null {
  const cleaned = normAssistantPhrase(rest)
  const words = cleaned.split(/\s+/).filter(Boolean)
  for (let take = Math.min(8, words.length); take >= 1; take -= 1) {
    const phrase = words.slice(0, take).join(" ")
    if (phrase.length < 3) continue
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

export function matchHeaderOrSubFieldKey(fieldPhrase: string): string | null {
  const f = normAssistantPhrase(fieldPhrase).replace(/^the\s+/, "").trim()
  const headerPairs: Array<[string[], string]> = [
    [["inspector name", "inspector", "inspectors name", "inspector's name"], "header.inspectorName"],
    [
      ["inspection id", "inspection number", "file id", "report id", "file number", "reference number", "trec id"],
      "header.inspectionReference",
    ],
    [["license id", "license number", "license", "cert id", "certification"], "header.licenseId"],
    [["inspection date", "report date", "date of inspection"], "header.inspectionDate"],
    [["weather", "site conditions", "site condition", "weather conditions"], "header.weather"],
    [["property address", "job address", "site address", "address of property"], "header.propertyAddress"],
    [["address"], "header.propertyAddress"],
    [["parties present", "parties", "attendees", "people present"], "header.partiesPresent"],
    [["scope and limitations", "scope limitations", "limitations", "scope"], "scopeLimitations"],
    [["executive summary", "summary", "summary findings"], "summaryFindings"],
    [["media notes", "workflow notes", "media workflow"], "mediaWorkflowNotes"],
    [["drone notes", "drone integration"], "droneIntegrationNotes"],
  ]
  for (const [hints, key] of headerPairs) {
    for (const h of hints) {
      if (f === h || f.includes(h) || (h.length >= 6 && h.includes(f))) return key
    }
  }
  const subId = matchSubsectionIdFromPhrase(f)
  return subId ? `sub:${subId}` : null
}

/** Voice-friendly: "set X to Y", "X is Y", "put Y in X", "for X use Y". */
export function tryImplicitFieldKeyValue(line: string): { left: string; valueRaw: string } | null {
  const t = line.trim()
  if (!t) return null

  const setTo = t.match(/^(?:please\s+)?(?:set|change)\s+(?:the\s+)?(.+?)\s+to\s+(.+)$/is)
  if (setTo?.[1]?.trim() && setTo[2]?.trim()) return { left: setTo[1].trim(), valueRaw: setTo[2].trim() }

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
    if (matchHeaderOrSubFieldKey(left)) return { left, valueRaw: isForm[2].trim() }
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

  const commandStarts =
    /(?:^|[.;])\s*(?=(?:please\s+)?(?:set|fill|put|use|change|copy|open|go\s+to|weather\s+is|inspector\b|license\b|property\s+address)\b)/gi
  const chunks: string[] = []
  let last = 0
  let m: RegExpExecArray | null
  const re = new RegExp(commandStarts.source, "gi")
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[0].length - m[0].trimStart().length
    if (start > last) {
      const piece = text.slice(last, start).trim()
      if (piece) chunks.push(piece)
    }
    last = start
  }
  const tail = text.slice(last).trim()
  if (tail) chunks.push(tail)
  if (chunks.length > 1) return chunks

  const andSplit = text.split(
    /\s+(?:and|also|then)\s+(?=(?:please\s+)?(?:set|fill|put|use|change|mark|weather\b|inspector\b|license\b|gutters\b|roof\b|condition\b))/i,
  )
  if (andSplit.length > 1) return andSplit.map((s) => s.trim()).filter(Boolean)

  const multiSet = text.split(/(?=\b(?:please\s+)?set\s+(?:the\s+)?)/i).map((s) => s.trim()).filter(Boolean)
  if (multiSet.length > 1) return multiSet

  return [text]
}

function parseLineToAssignment(
  line: string,
  ctx: SpecialtyReportFillContext,
): SpecialtyReportFieldAssignment | null {
  const colon = line.indexOf(":")
  let left = ""
  let valueRaw = ""
  if (colon > 0) {
    left = line.slice(0, colon).trim()
    valueRaw = line.slice(colon + 1).trim()
  } else {
    const implicit = tryImplicitFieldKeyValue(line)
    if (implicit) {
      left = implicit.left
      valueRaw = implicit.valueRaw
    } else {
      const md = line.match(/^(.+?)\s*[–—]\s*(.+)$/)
      if (!md?.[1] || !md[2]) return null
      left = md[1].trim()
      valueRaw = md[2].trim()
    }
  }
  const fieldKey = matchHeaderOrSubFieldKey(left)
  if (!fieldKey) return null
  const rating = parseConditionRating(valueRaw)
  if (fieldKey.startsWith("sub:") && rating) {
    return { fieldKey: `cond:${fieldKey}`, value: rating }
  }
  const value = (resolveFillLiteral(valueRaw, ctx) || valueRaw).trim()
  if (!value) return null
  return { fieldKey, value }
}

export function parseStructuredFillAndNavCommands(
  raw: string,
  ctx: SpecialtyReportFillContext,
  allowStructure: boolean,
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
    const fieldKey = matchHeaderOrSubFieldKey(useMyNameFor[1].trim())
    if (fieldKey?.startsWith("header.")) {
      return {
        summary: `Set ${fieldKey.replace("header.", "").replaceAll(".", " ")} to your account name.`,
        patch: { fieldKey, value: ctx.accountDisplayName.trim() },
      }
    }
  }

  let fillM = text.match(/^(?:please\s+)?(?:fill\s+in\s+|fill\s+|set\s+|put\s+)(?:the\s+)?(.+?)\s+(?:with)\s+(.+)$/is)
  if (!fillM) {
    fillM = text.match(/^(?:please\s+)?(?:fill\s+in\s+|fill\s+|put\s+)(?:the\s+)?(.+?)\s+to\s+(.+)$/is)
  }
  const m = fillM ?? text.match(/^(?:please\s+)?set\s+(?:the\s+)?(.+?)\s+to\s+(.+)$/is)
  if (m?.[1] && m[2]) {
    const left = normAssistantPhrase(m[1])
    if (!left.includes("condition") && !/^condition\b/.test(left)) {
      const fieldKey = matchHeaderOrSubFieldKey(m[1])
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
    const subId = matchSubsectionIdFromPhrase(subRated[1].trim())
    const rating = parseConditionRating(subRated[2].trim())
    if (subId && rating) {
      return {
        summary: `Set ${CONDITION_RATING_LABELS[rating]} for ${HOME_INSPECTION_MAJOR_SECTIONS.flatMap((s) => s.subsections).find((s) => s.id === subId)?.label ?? subId}.`,
        patch: { setCondition: { subId, condition: rating } },
      }
    }
  }

  const condM = text.match(/\b(?:set|change)\s+condition\s+(?:for|on)?\s*(.+?)\s+to\s+(.+)$/i)
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

export function parseSpecialtyReportFieldAssignments(
  raw: string,
  ctx: SpecialtyReportFillContext,
  opts: { allowStructure: boolean; readFieldValue: (fieldKey: string) => string },
): SpecialtyReportParseResult {
  const assignments: SpecialtyReportFieldAssignment[] = []
  const structuredPatches: SpecialtyReportStructuredPatch[] = []
  const unmatched: string[] = []
  let skippedExisting = 0
  const seen = new Set<string>()
  const summaries: string[] = []

  const segments = splitCompoundAssistantUtterance(raw)
  for (const segment of segments) {
    const structuredSeg = parseStructuredFillAndNavCommands(segment, ctx, opts.allowStructure)
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
    const lineAssignment = parseLineToAssignment(segment, ctx)
    if (lineAssignment) {
      const cur = opts.readFieldValue(lineAssignment.fieldKey).trim()
      if (cur && cur !== lineAssignment.value) {
        skippedExisting += 1
        continue
      }
      if (!seen.has(lineAssignment.fieldKey)) {
        seen.add(lineAssignment.fieldKey)
        assignments.push(lineAssignment)
      }
      continue
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
