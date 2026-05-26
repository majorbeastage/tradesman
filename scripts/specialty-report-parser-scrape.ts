/**
 * Massive rule-parser scrape for home inspection voice/Apply commands.
 * Run: npm run test:report-parser
 * Report: scripts/output/parser-scrape-latest.txt
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  HOME_INSPECTION_MAJOR_SECTIONS,
  type ConditionRating,
} from "../src/lib/specialtyReports/homeInspectionTemplate"
import {
  parseSpecialtyReportFieldAssignments,
  type SpecialtyReportFieldAssignment,
} from "../src/lib/specialtyReportAssistantParse"

const CTX = {
  accountDisplayName: "Joseph Snyder",
  propertyAddressHint: "742 Evergreen Terrace, Springfield",
  customerLabel: "Homer Simpson",
}

type Expect = {
  /** Must include these field keys (any value). */
  keys?: string[]
  /** fieldKey -> value must contain substring (case-insensitive). */
  valueIncludes?: Record<string, string>
  /** fieldKey -> exact value. */
  valueEquals?: Record<string, string>
  /** cond:sub:* ratings */
  conditions?: Record<string, ConditionRating>
  /** No assignment value may contain this (prevents inspector-name dump). */
  noValueContaining?: string
  minAssignments?: number
  unmatchedMaxLen?: number
  /** Parser may legitimately apply nothing (e.g. header page + narrative-only text). */
  allowEmpty?: boolean
}

type Case = {
  id: string
  group: string
  utterance: string
  preferFindings?: boolean
  expect: Expect
}

function condKey(subId: string): string {
  return `cond:sub:${subId}`
}

function subKey(subId: string): string {
  return `sub:${subId}`
}

function assertCase(c: Case): string | null {
  const r = parseSpecialtyReportFieldAssignments(c.utterance, CTX, {
    allowStructure: true,
    readFieldValue: () => "",
    replaceExisting: true,
    preferFindings: c.preferFindings === true,
  })

  const byKey = new Map<string, SpecialtyReportFieldAssignment[]>()
  for (const a of r.assignments) {
    const list = byKey.get(a.fieldKey) ?? []
    list.push(a)
    byKey.set(a.fieldKey, list)
  }

  const e = c.expect

  if (e.minAssignments != null && r.assignments.length < e.minAssignments) {
    return `expected >=${e.minAssignments} assignments, got ${r.assignments.length}; unmatched=${JSON.stringify(r.unmatched)}`
  }

  if (e.keys) {
    for (const k of e.keys) {
      if (!byKey.has(k)) {
        return `missing key ${k}; got ${[...byKey.keys()].join(", ") || "(none)"}; unmatched=${r.unmatched.join(" | ")}`
      }
    }
  }

  if (e.valueIncludes) {
    for (const [k, sub] of Object.entries(e.valueIncludes)) {
      const a = byKey.get(k)?.[0]
      if (!a) return `missing ${k} for valueIncludes`
      if (!a.value.toLowerCase().includes(sub.toLowerCase())) {
        return `${k} value "${a.value}" does not include "${sub}"`
      }
    }
  }

  if (e.valueEquals) {
    for (const [k, val] of Object.entries(e.valueEquals)) {
      const a = byKey.get(k)?.[0]
      if (!a) return `missing ${k} for valueEquals`
      if (a.value !== val) return `${k}: expected "${val}", got "${a.value}"`
    }
  }

  if (e.conditions) {
    for (const [subId, rating] of Object.entries(e.conditions)) {
      const k = condKey(subId)
      const a = byKey.get(k)?.[0]
      if (!a) return `missing condition ${k}`
      if (a.value !== rating) return `${k}: expected ${rating}, got ${a.value}`
    }
  }

  if (e.noValueContaining) {
    const bad = r.assignments.find((a) => a.value.toLowerCase().includes(e.noValueContaining!.toLowerCase()))
    if (bad) return `${bad.fieldKey} wrongly contains "${e.noValueContaining}": ${bad.value.slice(0, 80)}…`
  }

  if (e.unmatchedMaxLen != null) {
    const u = r.unmatched.join(" ").trim()
    if (u.length > e.unmatchedMaxLen) {
      return `unmatched too long (${u.length}): ${u.slice(0, 120)}…`
    }
  }

  if (
    !e.allowEmpty &&
    !e.keys &&
    !e.valueIncludes &&
    !e.valueEquals &&
    !e.conditions &&
    e.minAssignments == null
  ) {
    if (r.assignments.length === 0 && r.structuredPatches.length === 0) {
      return `no assignments; unmatched=${r.unmatched.join(" | ")}`
    }
  }

  return null
}

function headerCases(): Case[] {
  const out: Case[] = []
  const fields: Array<{ key: string; phrases: string[]; sample: string }> = [
    { key: "header.inspectorName", phrases: ["inspector name", "inspector"], sample: "Joseph Snyder" },
    { key: "header.licenseId", phrases: ["license number", "license"], sample: "HI-88421" },
    { key: "header.inspectionReference", phrases: ["inspection id", "file number"], sample: "TREC-2026-0412" },
    { key: "header.inspectionDate", phrases: ["inspection date"], sample: "2026-05-26" },
    { key: "header.weather", phrases: ["weather", "site conditions"], sample: "clear, 72°F, light wind" },
    { key: "header.propertyAddress", phrases: ["property address", "job address"], sample: "742 Evergreen Terrace" },
    { key: "header.partiesPresent", phrases: ["parties present"], sample: "Buyer, seller, listing agent" },
    { key: "scopeLimitations", phrases: ["scope and limitations", "scope"], sample: "Visual inspection per SOP." },
  ]

  const templates = [
    (p: string, s: string) => `set ${p} to ${s}`,
    (p: string, s: string) => `${p}: ${s}`,
    (p: string, s: string) => `${p} is ${s}`,
    (p: string, s: string) => `fill ${p} with ${s}`,
  ]

  for (const f of fields) {
    for (const phrase of f.phrases) {
      for (let i = 0; i < templates.length; i++) {
        const utterance = templates[i]!(phrase, f.sample)
        out.push({
          id: `hdr-${f.key}-${phrase.replace(/\s+/g, "_")}-t${i}`,
          group: "header-single",
          utterance,
          expect: { keys: [f.key], valueIncludes: { [f.key]: f.sample.slice(0, 8) } },
        })
      }
    }
  }

  out.push(
    {
      id: "hdr-compound-is-chain",
      group: "header-compound",
      utterance:
        "the inspector is Joseph Snyder and the weather is clear, 72 degrees and license number is HI-88421",
      expect: {
        keys: ["header.inspectorName", "header.weather", "header.licenseId"],
        valueIncludes: {
          "header.inspectorName": "Joseph",
          "header.weather": "clear",
          "header.licenseId": "HI-88421",
        },
        noValueContaining: "weather is clear",
      },
    },
    {
      id: "hdr-compound-set-and",
      group: "header-compound",
      utterance:
        "set inspector name to Joseph Snyder and set weather to clear 72 and set license number to HI-88421",
      expect: {
        keys: ["header.inspectorName", "header.weather", "header.licenseId"],
        minAssignments: 3,
      },
    },
    {
      id: "hdr-compound-colon-lines",
      group: "header-compound",
      utterance: "inspector name: Joseph Snyder; weather: overcast 65; license: HI-99",
      expect: {
        keys: ["header.inspectorName", "header.weather", "header.licenseId"],
        minAssignments: 3,
      },
    },
    {
      id: "hdr-literals-my-name",
      group: "header-literals",
      utterance: "set inspector name to my name",
      expect: { valueEquals: { "header.inspectorName": CTX.accountDisplayName } },
    },
    {
      id: "hdr-literals-today",
      group: "header-literals",
      utterance: "inspection date is today",
      expect: { keys: ["header.inspectionDate"] },
    },
    {
      id: "hdr-literals-estimate-address",
      group: "header-literals",
      utterance: "set property address to the estimate address",
      expect: { valueEquals: { "header.propertyAddress": CTX.propertyAddressHint } },
    },
    {
      id: "hdr-copy-estimate-address",
      group: "header-literals",
      utterance: "copy the estimate address into the property address",
      expect: { valueEquals: { "header.propertyAddress": CTX.propertyAddressHint } },
    },
    {
      id: "hdr-use-my-name-for",
      group: "header-literals",
      utterance: "use my name for inspector name",
      expect: { valueEquals: { "header.inspectorName": CTX.accountDisplayName } },
    },
    {
      id: "hdr-no-dump-long-inspector",
      group: "header-regression",
      utterance:
        "set inspector name to Joseph Snyder and weather is clear and license is HI-1 and parties present buyer agent",
      expect: {
        keys: ["header.inspectorName", "header.weather"],
        noValueContaining: "parties present buyer",
      },
    },
  )

  return out
}

function findingsCases(): Case[] {
  const out: Case[] = []
  const ratings: Array<{ word: string; rating: ConditionRating }> = [
    { word: "satisfactory", rating: "satisfactory" },
    { word: "marginal", rating: "marginal" },
    { word: "deficient", rating: "deficient" },
    { word: "not inspected", rating: "not_inspected" },
  ]

  const subs = [
    "gutters",
    "roof",
    "gutters downspouts",
    "roof covering",
    "foundation",
    "electrical panel",
    "water heater",
    "crawl space",
    "attic insulation",
    "grading",
    "siding",
    "hvac",
    "heating",
  ]

  for (const sub of subs) {
    for (const { word, rating } of ratings) {
      out.push(
        {
          id: `find-colon-${sub.replace(/\s+/g, "_")}-${rating}`,
          group: "findings-condition",
          preferFindings: true,
          utterance: `${sub}: ${word}`,
          expect: { minAssignments: 1 },
        },
        {
          id: `find-set-cond-${sub.replace(/\s+/g, "_")}-${rating}`,
          group: "findings-condition",
          preferFindings: true,
          utterance: `set condition for ${sub} to ${word}`,
          expect: { minAssignments: 1 },
        },
        {
          id: `find-mark-${sub.replace(/\s+/g, "_")}-${rating}`,
          group: "findings-condition",
          preferFindings: true,
          utterance: `mark ${sub} as ${word}`,
          expect: { minAssignments: 1 },
        },
      )
    }
  }

  out.push(
    {
      id: "find-gutters-deficient-phrase",
      group: "findings-condition",
      preferFindings: true,
      utterance: "gutters are deficient",
      expect: { conditions: { gutters_downspouts: "deficient" } },
    },
    {
      id: "find-roof-satisfactory",
      group: "findings-condition",
      preferFindings: true,
      utterance: "set roof covering to satisfactory",
      expect: { conditions: { roof_cover: "satisfactory" } },
    },
    {
      id: "find-multi-set",
      group: "findings-compound",
      preferFindings: true,
      utterance: "set condition for gutters to deficient and set condition for roof to marginal",
      expect: {
        conditions: { gutters_downspouts: "deficient", roof_cover: "marginal" },
        minAssignments: 2,
      },
    },
    {
      id: "find-narrative-crawl",
      group: "findings-narrative",
      preferFindings: true,
      utterance:
        "In the crawl space we observed moisture on the vapor barrier and mold on the floor joists. Recommend further evaluation by a licensed contractor.",
      expect: {
        keys: [subKey("crawl_attic_access")],
        conditions: { crawl_attic_access: "deficient" },
        unmatchedMaxLen: 0,
      },
    },
    {
      id: "find-narrative-gutters",
      group: "findings-narrative",
      preferFindings: true,
      utterance: "The gutters were full of debris and downspouts discharged too close to the foundation. Deficient.",
      expect: {
        keys: [subKey("gutters_downspouts"), condKey("gutters_downspouts")],
        conditions: { gutters_downspouts: "deficient" },
        valueIncludes: { [subKey("gutters_downspouts")]: "debris" },
      },
    },
    {
      id: "find-notes-colon",
      group: "findings-notes",
      preferFindings: true,
      utterance: "panel breakers: double-tapped neutrals observed in subpanel",
      expect: {
        keys: [subKey("panel_breakers")],
        valueIncludes: { [subKey("panel_breakers")]: "double-tapped" },
      },
    },
  )

  return out
}

function generatedAliasCases(): Case[] {
  const out: Case[] = []
  for (const sec of HOME_INSPECTION_MAJOR_SECTIONS) {
    for (const sub of sec.subsections) {
      const label = sub.label.toLowerCase()
      const short = label.split(/[\s/&]+/).filter((w) => w.length >= 5)[0]
      if (!short) continue
      out.push({
        id: `gen-label-${sub.id}`,
        group: "findings-generated",
        preferFindings: true,
        utterance: `set condition for ${label} to satisfactory`,
        expect: { conditions: { [sub.id]: "satisfactory" } },
      })
    }
  }
  return out
}

function voiceRealismCases(): Case[] {
  const fillers = ["um ", "okay ", "please "]
  const base = [
    "set inspector name to Joseph Snyder",
    "weather is clear seventy two",
    "gutters are deficient",
    "set condition for roof covering to marginal",
  ]
  const out: Case[] = []
  for (const b of base) {
    for (const f of fillers) {
      out.push({
        id: `voice-${f.trim()}-${b.slice(0, 12).replace(/\s+/g, "_")}`,
        group: "voice-realism",
        utterance: f + b,
        preferFindings: b.includes("gutter") || b.includes("roof"),
        expect: { minAssignments: 1 },
      })
    }
  }
  out.push(
    {
      id: "voice-header-rapid-fire",
      group: "voice-realism",
      utterance:
        "inspector name Joseph Snyder license HI-44201 weather overcast 58 property address 100 Oak Street parties present buyer and agent",
      expect: { minAssignments: 3 },
    },
    {
      id: "voice-findings-roof-narrative",
      group: "voice-realism",
      preferFindings: true,
      utterance:
        "On the roof covering there are curled shingles at the south slope and previous repairs visible. Recommend a qualified roofing contractor.",
      expect: {
        keys: [subKey("roof_cover")],
        conditions: { roof_cover: "deficient" },
      },
    },
    {
      id: "voice-summary-exec",
      group: "voice-realism",
      utterance: "set executive summary to Overall satisfactory with minor maintenance items noted.",
      expect: {
        keys: ["summaryFindings"],
        valueIncludes: { summaryFindings: "satisfactory" },
      },
    },
    {
      id: "voice-scope-limitation",
      group: "voice-realism",
      utterance: "scope and limitations is Standard visual inspection. Attic not accessed due to safety.",
      expect: {
        keys: ["scopeLimitations"],
        valueIncludes: { scopeLimitations: "visual" },
      },
    },
    {
      id: "voice-panel-double-tap",
      group: "voice-realism",
      preferFindings: true,
      utterance: "electrical panel: double tapped neutrals in subpanel. Deficient.",
      expect: {
        keys: [subKey("panel_breakers"), condKey("panel_breakers")],
        conditions: { panel_breakers: "deficient" },
      },
    },
    {
      id: "voice-water-heater-set",
      group: "voice-realism",
      preferFindings: true,
      utterance: "set water heater to satisfactory",
      expect: { conditions: { water_heater: "satisfactory" } },
    },
    {
      id: "voice-hvac-heating",
      group: "voice-realism",
      preferFindings: true,
      utterance: "heating equipment is marginal",
      expect: { conditions: { heating_equipment: "marginal" } },
    },
    {
      id: "voice-copy-customer-parties",
      group: "voice-realism",
      utterance: "copy customer name into parties present",
      expect: { valueEquals: { "header.partiesPresent": CTX.customerLabel } },
    },
  )
  return out
}

function regressionCases(): Case[] {
  return [
    {
      id: "reg-header-no-narrative-crawl",
      group: "regression",
      utterance:
        "In the crawl space we observed moisture on the vapor barrier and mold on the floor joists.",
      preferFindings: false,
      expect: { allowEmpty: true, unmatchedMaxLen: 200 },
    },
    {
      id: "reg-inspector-not-whole-paragraph",
      group: "regression",
      utterance: "the inspector is Joseph Snyder and the weather is clear",
      expect: {
        valueIncludes: { "header.inspectorName": "Joseph Snyder" },
        noValueContaining: "weather is clear",
      },
    },
  ]
}

const ALL_CASES: Case[] = [
  ...headerCases(),
  ...findingsCases(),
  ...generatedAliasCases(),
  ...voiceRealismCases(),
  ...regressionCases(),
]

function main() {
  const byGroup = new Map<string, { pass: number; fail: number; fails: string[] }>()
  let pass = 0
  let fail = 0
  const failLines: string[] = []

  for (const c of ALL_CASES) {
    const err = assertCase(c)
    const g = byGroup.get(c.group) ?? { pass: 0, fail: 0, fails: [] }
    if (err) {
      fail++
      g.fail++
      g.fails.push(`${c.id}: ${err}`)
      failLines.push(`[FAIL] ${c.group} / ${c.id}\n  say: ${c.utterance.slice(0, 100)}${c.utterance.length > 100 ? "…" : ""}\n  ${err}`)
    } else {
      pass++
      g.pass++
    }
    byGroup.set(c.group, g)
  }

  const total = pass + fail
  const pct = total ? ((pass / total) * 100).toFixed(1) : "0"

  const lines: string[] = [
    "═".repeat(72),
    "  HOME INSPECTION REPORT PARSER — MASS SCRAPE",
    `  ${new Date().toISOString()}`,
    "═".repeat(72),
    "",
    `  TOTAL: ${pass}/${total} passed (${pct}%)`,
    "",
    "  By category:",
  ]

  for (const [group, stats] of [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const t = stats.pass + stats.fail
    const p = t ? ((stats.pass / t) * 100).toFixed(0) : "0"
    lines.push(`    ${group.padEnd(22)} ${stats.pass}/${t} (${p}%)`)
  }

  if (failLines.length > 0) {
    lines.push("", "─".repeat(72), "  FAILURES (first 40):", "")
    lines.push(...failLines.slice(0, 40))
    if (failLines.length > 40) lines.push(`  … and ${failLines.length - 40} more`)
  }

  lines.push("", "═".repeat(72))

  const report = lines.join("\n")
  console.log(report)

  const outDir = join(dirname(fileURLToPath(import.meta.url)), "output")
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, "parser-scrape-latest.txt")
  writeFileSync(outPath, report, "utf8")
  console.log(`\n  Wrote ${outPath}\n`)

  if (fail > 0) {
    process.exitCode = 1
  }
}

main()
