import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx"
import {
  CONDITION_RATING_LABELS,
  HOME_INSPECTION_MAJOR_SECTIONS,
  type HomeInspectionReportV1,
} from "./homeInspectionTemplate"

export type HomeInspectionExportMeta = {
  title?: string
  customerLabel?: string
  quoteId?: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function headerRows(home: HomeInspectionReportV1): Array<[string, string]> {
  const h = home.header
  return [
    ["Inspector", h.inspectorName],
    ["License / cert ID", h.licenseId],
    ["Inspection / file ID", h.inspectionReference],
    ["Inspection date", h.inspectionDate],
    ["Weather / site conditions", h.weather],
    ["Property address", h.propertyAddress],
    ["Parties present", h.partiesPresent],
  ]
}

export function buildHomeInspectionReportPlainText(
  home: HomeInspectionReportV1,
  meta: HomeInspectionExportMeta = {},
): string {
  const lines: string[] = []
  const title = meta.title?.trim() || "Structure & property inspection report"
  lines.push(title)
  if (meta.customerLabel?.trim()) lines.push(`Customer: ${meta.customerLabel.trim()}`)
  if (meta.quoteId?.trim()) lines.push(`Estimate ref: ${meta.quoteId.trim().slice(0, 8)}`)
  lines.push("")
  lines.push("HEADER")
  for (const [label, value] of headerRows(home)) {
    if (String(value ?? "").trim()) lines.push(`${label}: ${String(value).trim()}`)
  }
  if (home.scopeLimitations.trim()) {
    lines.push("")
    lines.push("SCOPE & LIMITATIONS")
    lines.push(home.scopeLimitations.trim())
  }
  lines.push("")
  lines.push("FINDINGS BY SECTION")
  for (const sec of HOME_INSPECTION_MAJOR_SECTIONS) {
    const sectionLines: string[] = []
    for (const sub of sec.subsections) {
      const row = home.subsections[sub.id]
      if (!row) continue
      const notes = String(row.notes ?? "").trim()
      const rating = CONDITION_RATING_LABELS[row.condition]
      if (!notes && row.condition === "not_inspected") continue
      sectionLines.push(`  ${sub.label} — ${rating}`)
      if (notes) sectionLines.push(`    ${notes.replace(/\n/g, "\n    ")}`)
    }
    if (sectionLines.length) {
      lines.push("")
      lines.push(sec.title.toUpperCase())
      lines.push(...sectionLines)
    }
  }
  if (home.mediaWorkflowNotes.trim()) {
    lines.push("")
    lines.push("MEDIA / WORKFLOW")
    lines.push(home.mediaWorkflowNotes.trim())
  }
  if (home.droneIntegrationNotes.trim()) {
    lines.push("")
    lines.push("DRONE / INTEGRATIONS")
    lines.push(home.droneIntegrationNotes.trim())
  }
  if (home.summaryFindings.trim()) {
    lines.push("")
    lines.push("EXECUTIVE SUMMARY")
    lines.push(home.summaryFindings.trim())
  }
  return lines.join("\n")
}

export function buildHomeInspectionReportHtml(
  home: HomeInspectionReportV1,
  meta: HomeInspectionExportMeta = {},
): string {
  const title = escapeHtml(meta.title?.trim() || "Structure & property inspection report")
  const subtitle = [
    meta.customerLabel?.trim() ? `Customer: ${escapeHtml(meta.customerLabel.trim())}` : "",
    meta.quoteId?.trim() ? `Estimate: ${escapeHtml(meta.quoteId.trim().slice(0, 8))}…` : "",
  ]
    .filter(Boolean)
    .join(" · ")

  const headerTable = headerRows(home)
    .filter(([, v]) => String(v ?? "").trim())
    .map(
      ([k, v]) =>
        `<tr><th style="text-align:left;padding:6px 10px;border:1px solid #e2e8f0;background:#f8fafc;width:34%">${escapeHtml(k)}</th><td style="padding:6px 10px;border:1px solid #e2e8f0;white-space:pre-wrap">${escapeHtml(String(v))}</td></tr>`,
    )
    .join("")

  const sections = HOME_INSPECTION_MAJOR_SECTIONS.map((sec) => {
    const subs = sec.subsections
      .map((sub) => {
        const row = home.subsections[sub.id]
        if (!row) return ""
        const notes = String(row.notes ?? "").trim()
        if (!notes && row.condition === "not_inspected") return ""
        return `<div style="margin:10px 0 14px;padding-bottom:10px;border-bottom:1px dashed #e2e8f0">
          <div style="font-weight:700;color:#0f172a">${escapeHtml(sub.label)}</div>
          <div style="font-size:12px;color:#475569;margin-top:4px">${escapeHtml(CONDITION_RATING_LABELS[row.condition])}</div>
          ${notes ? `<div style="margin-top:6px;white-space:pre-wrap;font-size:13px">${escapeHtml(notes)}</div>` : ""}
        </div>`
      })
      .filter(Boolean)
      .join("")
    if (!subs) return ""
    return `<section style="margin-top:20px"><h2 style="font-size:16px;margin:0 0 8px;color:#0f172a;border-bottom:2px solid #f97316;padding-bottom:4px">${escapeHtml(sec.title)}</h2>${subs}</section>`
  }).join("")

  const scope = home.scopeLimitations.trim()
    ? `<section style="margin-top:18px"><h2 style="font-size:15px">Scope &amp; limitations</h2><p style="white-space:pre-wrap;line-height:1.5">${escapeHtml(home.scopeLimitations.trim())}</p></section>`
    : ""
  const media = home.mediaWorkflowNotes.trim()
    ? `<section style="margin-top:18px"><h2 style="font-size:15px">Media / workflow</h2><p style="white-space:pre-wrap">${escapeHtml(home.mediaWorkflowNotes.trim())}</p></section>`
    : ""
  const drone = home.droneIntegrationNotes.trim()
    ? `<section style="margin-top:18px"><h2 style="font-size:15px">Drone / integrations</h2><p style="white-space:pre-wrap">${escapeHtml(home.droneIntegrationNotes.trim())}</p></section>`
    : ""
  const summary = home.summaryFindings.trim()
    ? `<section style="margin-top:18px"><h2 style="font-size:15px">Executive summary</h2><p style="white-space:pre-wrap">${escapeHtml(home.summaryFindings.trim())}</p></section>`
    : ""

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${title}</title>
<style>
  @media print { body { margin: 0.6in; } .no-print { display: none; } }
  body { font-family: system-ui, Segoe UI, sans-serif; color: #0f172a; font-size: 13px; line-height: 1.45; max-width: 820px; margin: 24px auto; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  table { border-collapse: collapse; width: 100%; margin-top: 12px; }
</style>
</head>
<body>
<h1>${title}</h1>
${subtitle ? `<p style="color:#64748b;margin:0 0 16px">${subtitle}</p>` : ""}
<table>${headerTable}</table>
${scope}
${sections}
${media}
${drone}
${summary}
<p class="no-print" style="margin-top:28px;font-size:11px;color:#94a3b8">Generated from Tradesman specialty report — use Print to save as PDF.</p>
</body>
</html>`
}

export function printHomeInspectionReport(html: string): void {
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700")
  if (!w) {
    alert("Allow pop-ups to print or save as PDF.")
    return
  }
  w.document.write(html)
  w.document.close()
  w.focus()
  window.setTimeout(() => {
    try {
      w.print()
    } catch {
      /* user can print manually */
    }
  }, 400)
}

export async function buildHomeInspectionReportDocxBlob(
  home: HomeInspectionReportV1,
  meta: HomeInspectionExportMeta = {},
): Promise<Blob> {
  const children: Paragraph[] = []
  const title = meta.title?.trim() || "Structure & property inspection report"
  children.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }))
  if (meta.customerLabel?.trim()) {
    children.push(new Paragraph({ children: [new TextRun({ text: `Customer: ${meta.customerLabel.trim()}`, size: 22 })] }))
  }
  children.push(new Paragraph({ text: "Header", heading: HeadingLevel.HEADING_2 }))
  for (const [label, value] of headerRows(home)) {
    const v = String(value ?? "").trim()
    if (!v) continue
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${label}: `, bold: true, size: 22 }),
          new TextRun({ text: v, size: 22 }),
        ],
      }),
    )
  }
  if (home.scopeLimitations.trim()) {
    children.push(new Paragraph({ text: "Scope & limitations", heading: HeadingLevel.HEADING_2 }))
    for (const line of home.scopeLimitations.trim().split(/\n/)) {
      children.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })] }))
    }
  }
  children.push(new Paragraph({ text: "Findings", heading: HeadingLevel.HEADING_2 }))
  for (const sec of HOME_INSPECTION_MAJOR_SECTIONS) {
    let any = false
    const secParas: Paragraph[] = []
    for (const sub of sec.subsections) {
      const row = home.subsections[sub.id]
      if (!row) continue
      const notes = String(row.notes ?? "").trim()
      if (!notes && row.condition === "not_inspected") continue
      any = true
      secParas.push(
        new Paragraph({
          children: [
            new TextRun({ text: sub.label, bold: true, size: 22 }),
            new TextRun({ text: ` — ${CONDITION_RATING_LABELS[row.condition]}`, size: 22 }),
          ],
        }),
      )
      if (notes) {
        for (const line of notes.split(/\n/)) {
          secParas.push(new Paragraph({ children: [new TextRun({ text: line, size: 20 })] }))
        }
      }
    }
    if (any) {
      children.push(new Paragraph({ text: sec.title, heading: HeadingLevel.HEADING_3 }))
      children.push(...secParas)
    }
  }
  if (home.summaryFindings.trim()) {
    children.push(new Paragraph({ text: "Executive summary", heading: HeadingLevel.HEADING_2 }))
    for (const line of home.summaryFindings.trim().split(/\n/)) {
      children.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })] }))
    }
  }
  const doc = new Document({ sections: [{ properties: {}, children }] })
  return Packer.toBlob(doc)
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
