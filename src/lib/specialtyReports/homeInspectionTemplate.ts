import type { SpecialtyReportTypeKey } from "./reportTypeIds"

export type ConditionRating = "satisfactory" | "marginal" | "deficient" | "not_inspected" | "na"

export const CONDITION_RATING_LABELS: Record<ConditionRating, string> = {
  satisfactory: "Satisfactory",
  marginal: "Marginal / monitor",
  deficient: "Deficient / repair needed",
  not_inspected: "Not inspected",
  na: "N/A",
}

export type HomeInspectionSubsection = {
  id: string
  label: string
  /** Short hint for inspectors */
  hint?: string
}

export type HomeInspectionMajorSection = {
  id: string
  title: string
  subsections: HomeInspectionSubsection[]
}

/**
 * Structure & property oriented residential/commercial inspection outline.
 * Expand anytime — report JSON stores flat `subsections[subsectionId]`.
 */
export const HOME_INSPECTION_MAJOR_SECTIONS: HomeInspectionMajorSection[] = [
  {
    id: "admin_scope",
    title: "Administrative & scope",
    subsections: [
      { id: "report_prepared_for", label: "Prepared for / parties present", hint: "Buyer, seller, agent, tenant…" },
      { id: "inspection_standard", label: "Standard / license / SOP reference", hint: "ASHI, InterNACHI, state SOP…" },
      { id: "limitations_access", label: "Access, locks, utilities & limitations", hint: "What could not be opened or tested." },
    ],
  },
  {
    id: "site_exterior",
    title: "Site & exterior shell",
    subsections: [
      { id: "grading_drainage", label: "Grading & surface drainage" },
      { id: "walkways_drive", label: "Walkways, drives, patios, stoops" },
      { id: "retaining_walls", label: "Retaining / landscape walls" },
      { id: "siding_trim", label: "Siding, trim, penetrations & flashings (visible)" },
      { id: "windows_exterior", label: "Windows & exterior doors (operation sample)" },
      { id: "decks_balconies", label: "Decks, balconies, guards & handrails" },
    ],
  },
  {
    id: "roof",
    title: "Roof covering & drainage",
    subsections: [
      { id: "roof_cover", label: "Covering material & visible wear" },
      { id: "flashing_penetrations", label: "Penetrations, flashing, skylights" },
      { id: "gutters_downspouts", label: "Gutters, downspouts, extensions" },
      { id: "chimney_exterior", label: "Chimney exterior / crown / cap (visible)" },
    ],
  },
  {
    id: "structure",
    title: "Structure",
    subsections: [
      { id: "foundation_visible", label: "Foundation (visible portions)" },
      { id: "floor_structure", label: "Floor structure / sag indicators" },
      { id: "wall_ceiling_framing", label: "Walls & ceilings — framing clues, cracks, movement" },
      { id: "crawl_attic_access", label: "Crawlspace / attic access & moisture clues" },
    ],
  },
  {
    id: "electrical",
    title: "Electrical",
    subsections: [
      { id: "service_equipment", label: "Service equipment & grounding (visual)" },
      { id: "panel_breakers", label: "Panel(s), breakers, labeling sample" },
      { id: "branch_circuits", label: "Receptacles / switches / fixtures (spot sample)" },
      { id: "gfci_afci", label: "GFCI / AFCI where applicable" },
    ],
  },
  {
    id: "plumbing",
    title: "Plumbing",
    subsections: [
      { id: "supply_visible", label: "Supply piping (visible)" },
      { id: "dwv_visible", label: "Drain / waste / vent (visible)" },
      { id: "water_heater", label: "Water heater / tankless (visual + basic op if safe)" },
      { id: "fixtures_leaks", label: "Fixtures & active leak observations" },
    ],
  },
  {
    id: "hvac",
    title: "Heating, cooling & ventilation",
    subsections: [
      { id: "heating_equipment", label: "Heating equipment (visual / basic op)" },
      { id: "cooling_equipment", label: "Cooling equipment (visual / basic op)" },
      { id: "distribution", label: "Distribution — ducts, registers, airflow clues" },
      { id: "ventilation_bath_kitchen", label: "Bath / kitchen ventilation" },
    ],
  },
  {
    id: "interior",
    title: "Interior",
    subsections: [
      { id: "walls_ceilings_finish", label: "Walls & ceilings — finishes, moisture stains" },
      { id: "floors", label: "Floors — slope, damage, trip hazards" },
      { id: "stairs_railings", label: "Stairs & railings" },
      { id: "doors_interior", label: "Interior doors & hardware" },
      { id: "cabinet_built_ins", label: "Cabinets & built-ins (sample)" },
    ],
  },
  {
    id: "insulation_energy",
    title: "Insulation, ventilation & energy clues",
    subsections: [
      { id: "attic_insulation", label: "Attic insulation depth / vapor barriers (visible)" },
      { id: "attic_ventilation", label: "Attic ventilation — soffit / ridge / fans" },
      { id: "crawlspace_moisture", label: "Crawlspace moisture / vapor retarders" },
      { id: "weatherization", label: "Weather-stripping, storm panels, obvious drafts" },
    ],
  },
  {
    id: "built_ins_appliances",
    title: "Built-ins & kitchen appliances",
    subsections: [
      { id: "range_cooktop", label: "Range / cooktop / oven (basic op if safe)" },
      { id: "hood_micro", label: "Hood / microwave / exhaust" },
      { id: "dishwasher_disposal", label: "Dishwasher / disposal" },
      { id: "laundry", label: "Laundry equipment (basic visual)" },
    ],
  },
  {
    id: "garage_carport",
    title: "Garage & vehicle areas",
    subsections: [
      { id: "garage_doors", label: "Vehicle doors & operators" },
      { id: "fire_separation", label: "Fire separation / penetrations (visible)" },
      { id: "gfci_garage", label: "GFCI / receptacles" },
    ],
  },
  {
    id: "life_safety",
    title: "Life safety snapshot",
    subsections: [
      { id: "smoke_co", label: "Smoke / CO alarms (presence / placement sample)" },
      { id: "egress_sleeping", label: "Sleeping room egress (sample)" },
      { id: "handrails_guards", label: "Guards & handrails — critical drops" },
    ],
  },
]

export type HomeInspectionSubsectionEntry = {
  condition: ConditionRating
  notes: string
}

export type HomeInspectionReportV1 = {
  version: 1
  specialtyKey: Extract<SpecialtyReportTypeKey, "home_inspection">
  header: {
    inspectorName: string
    licenseId: string
    inspectionDate: string
    weather: string
    propertyAddress: string
    partiesPresent: string
  }
  scopeLimitations: string
  subsections: Record<string, HomeInspectionSubsectionEntry>
  summaryFindings: string
  /** Freeform — link to quote attachments, shared folders, etc. */
  mediaWorkflowNotes: string
  /** Future: Drone API ingestion — flight IDs, partner links */
  droneIntegrationNotes: string
  updatedAt: string
}

export function allHomeInspectionSubsectionIds(): string[] {
  const ids: string[] = []
  for (const sec of HOME_INSPECTION_MAJOR_SECTIONS) {
    for (const sub of sec.subsections) ids.push(sub.id)
  }
  return ids
}

export function emptyHomeInspectionReport(addressFallback: string): HomeInspectionReportV1 {
  const subsections: Record<string, HomeInspectionSubsectionEntry> = {}
  for (const id of allHomeInspectionSubsectionIds()) {
    subsections[id] = { condition: "not_inspected", notes: "" }
  }
  return {
    version: 1,
    specialtyKey: "home_inspection",
    header: {
      inspectorName: "",
      licenseId: "",
      inspectionDate: new Date().toISOString().slice(0, 10),
      weather: "",
      propertyAddress: addressFallback,
      partiesPresent: "",
    },
    scopeLimitations:
      "This is a visual inspection of readily accessible components. Destructive testing, engineering certification, and concealed defects are outside the scope unless contracted separately.",
    subsections,
    summaryFindings: "",
    mediaWorkflowNotes: "",
    droneIntegrationNotes: "",
    updatedAt: new Date().toISOString(),
  }
}

export function parseHomeInspectionReport(raw: unknown): HomeInspectionReportV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Partial<HomeInspectionReportV1>
  if (o.version !== 1 || o.specialtyKey !== "home_inspection") return null
  if (!o.header || typeof o.header !== "object") return null
  if (!o.subsections || typeof o.subsections !== "object") return null
  return o as HomeInspectionReportV1
}
