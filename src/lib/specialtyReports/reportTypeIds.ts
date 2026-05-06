/** Keys stored in profiles.metadata.estimate_template_specialty_report_types and used by the specialty report wizard. */
export const SPECIALTY_REPORT_TYPE_KEYS = [
  "home_inspection",
  "pest_inspection",
  "survey_report",
  "body_shop_repair",
] as const

export type SpecialtyReportTypeKey = (typeof SPECIALTY_REPORT_TYPE_KEYS)[number]

/** Portal form item id → persistence key */
export const ESTIMATE_TEMPLATE_REPORT_CHECKBOX_TO_KEY: Record<string, SpecialtyReportTypeKey> = {
  estimate_template_report_home: "home_inspection",
  estimate_template_report_pest: "pest_inspection",
  estimate_template_report_survey: "survey_report",
  estimate_template_report_body_shop: "body_shop_repair",
}

export const SPECIALTY_REPORT_TYPE_LABELS: Record<SpecialtyReportTypeKey, string> = {
  home_inspection: "Home Inspection Report (structure & property)",
  pest_inspection: "Pest Inspection Report",
  survey_report: "Survey Report",
  body_shop_repair: "Body Shop Repair documentation",
}

export function enabledSpecialtyTypesFromFormValues(
  form: Record<string, string>,
  masterOn: boolean,
): SpecialtyReportTypeKey[] {
  if (!masterOn) return []
  const out: SpecialtyReportTypeKey[] = []
  for (const [itemId, key] of Object.entries(ESTIMATE_TEMPLATE_REPORT_CHECKBOX_TO_KEY)) {
    if (form[itemId] === "checked") out.push(key)
  }
  return out
}

export function specialtyReportTypesFromMetadata(meta: Record<string, unknown>): SpecialtyReportTypeKey[] {
  const raw = meta.estimate_template_specialty_report_types
  if (!Array.isArray(raw)) return []
  const allowed = new Set<string>(SPECIALTY_REPORT_TYPE_KEYS)
  return raw.filter((x): x is SpecialtyReportTypeKey => typeof x === "string" && allowed.has(x))
}
