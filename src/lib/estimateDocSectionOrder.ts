/** Ordered blocks on customer-facing estimate PDF / DOCX / HTML. */
export type EstimateDocSectionId =
  | "intro"
  | "job_description"
  | "line_items"
  | "photos"
  | "footer"
  | "legal"

export const DEFAULT_ESTIMATE_DOC_SECTION_ORDER: EstimateDocSectionId[] = [
  "intro",
  "job_description",
  "line_items",
  "photos",
  "footer",
  "legal",
]

export const ESTIMATE_DOC_SECTION_LABELS: Record<EstimateDocSectionId, string> = {
  intro: "Intro / header text",
  job_description: "Job description",
  line_items: "Line items & total",
  photos: "Photos & files",
  footer: "Footer text",
  legal: "Legal / signatures",
}

const ALL = new Set<string>(DEFAULT_ESTIMATE_DOC_SECTION_ORDER)

export function parseEstimateDocSectionOrder(raw: unknown): EstimateDocSectionId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_ESTIMATE_DOC_SECTION_ORDER]
  const seen = new Set<string>()
  const out: EstimateDocSectionId[] = []
  for (const item of raw) {
    if (typeof item !== "string" || !ALL.has(item) || seen.has(item)) continue
    seen.add(item)
    out.push(item as EstimateDocSectionId)
  }
  for (const id of DEFAULT_ESTIMATE_DOC_SECTION_ORDER) {
    if (!seen.has(id)) out.push(id)
  }
  return out
}

/** Sections that can appear given current template toggles. */
export function estimateDocSectionsForTemplate(opts: {
  includeJobDescription: boolean
  hasIntro: boolean
  hasFooter: boolean
  includeLegal: boolean
  hasPhotos: boolean
}): EstimateDocSectionId[] {
  const all = [...DEFAULT_ESTIMATE_DOC_SECTION_ORDER]
  return all.filter((id) => {
    if (id === "intro") return opts.hasIntro
    if (id === "job_description") return opts.includeJobDescription
    if (id === "footer") return opts.hasFooter
    if (id === "legal") return opts.includeLegal
    if (id === "photos") return opts.hasPhotos
    return true
  })
}

export function orderedEstimateDocSections(
  storedOrder: EstimateDocSectionId[],
  available: EstimateDocSectionId[],
): EstimateDocSectionId[] {
  const avail = new Set(available)
  const out: EstimateDocSectionId[] = []
  for (const id of storedOrder) {
    if (avail.has(id)) out.push(id)
  }
  for (const id of available) {
    if (!out.includes(id)) out.push(id)
  }
  return out
}
