import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

export type QuotePdfLineItem = { description: string; quantity: number; unitPrice: number; total: number }

export async function buildQuotePdfBytes(params: {
  title: string
  businessLabel: string
  customerName: string
  items: QuotePdfLineItem[]
  /** Optional header note from profile template (plain text). */
  templateHeader?: string | null
  /** Optional footer note from profile template (plain text). */
  templateFooter?: string | null
  /** Default true: show "Prepared: &lt;date&gt;" under the title. */
  includePreparedDate?: boolean
  /** Number line items in the left margin of each row. */
  showLineNumbers?: boolean
  /** Optional logo above the business name (PNG or JPEG bytes). */
  logo?: { bytes: Uint8Array; kind: "png" | "jpeg" } | null
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const { height } = page.getSize()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  let y = height - 50
  const left = 50
  const lineH = 14

  const draw = (text: string, size = 11, bold = false, gray = 0) => {
    page.drawText(text.slice(0, 500), {
      x: left,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(gray, gray, gray),
    })
    y -= lineH + (size > 11 ? 4 : 0)
  }

  const includeDate = params.includePreparedDate !== false
  const showNums = params.showLineNumbers === true

  if (params.logo?.bytes?.length) {
    try {
      const embedded =
        params.logo.kind === "png" ? await doc.embedPng(params.logo.bytes) : await doc.embedJpg(params.logo.bytes)
      const maxW = 220
      const maxH = 72
      const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1)
      const w = embedded.width * scale
      const h = embedded.height * scale
      const marginFromTop = 40
      const targetUpperY = height - marginFromTop
      const lowerLeftY = targetUpperY - h
      page.drawImage(embedded, { x: left, y: lowerLeftY, width: w, height: h })
      y = lowerLeftY - 18
    } catch {
      /* ignore bad image data */
    }
  }

  draw(params.businessLabel || "Quote", 16, true, 0.15)
  y -= 6
  draw(`Customer: ${params.customerName}`, 11, false, 0.25)
  draw(params.title, 12, true, 0.2)
  if (includeDate) {
    const d = new Date().toLocaleDateString(undefined, { dateStyle: "medium" })
    draw(`Prepared: ${d}`, 10, false, 0.4)
  }
  y -= 8

  if (params.templateHeader?.trim()) {
    for (const para of params.templateHeader.trim().split(/\n+/).slice(0, 12)) {
      draw(para, 10, false, 0.35)
    }
    y -= 6
  }

  draw("Line items", 11, true, 0.2)
  y -= 4
  params.items.forEach((row, idx) => {
    const prefix = showNums ? `${idx + 1}. ` : ""
    const line = `${prefix}${row.description.slice(0, 72)}  ×${row.quantity}  @ $${row.unitPrice.toFixed(2)}  = $${row.total.toFixed(2)}`
    draw(line, 10, false, 0.3)
  })
  const grand = params.items.reduce((s, r) => s + r.total, 0)
  y -= 6
  draw(`Total: $${grand.toFixed(2)}`, 13, true, 0.1)

  if (params.templateFooter?.trim()) {
    y -= 12
    for (const para of params.templateFooter.trim().split(/\n+/).slice(0, 12)) {
      draw(para, 9, false, 0.45)
    }
  }

  return doc.save()
}

export async function buildReceiptPdfBytes(params: {
  businessLabel: string
  customerName: string
  jobTitle: string
  completedAtLabel: string
  amountLabel?: string | null
  templateFooter?: string | null
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const { height } = page.getSize()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  let y = height - 50
  const left = 50
  const lineH = 15

  const draw = (text: string, size = 11, bold = false, gray = 0) => {
    page.drawText(text.slice(0, 600), { x: left, y, size, font: bold ? fontBold : font, color: rgb(gray, gray, gray) })
    y -= lineH + (size > 12 ? 6 : 2)
  }

  draw("Receipt / job complete", 18, true, 0.12)
  draw(params.businessLabel, 11, false, 0.35)
  y -= 8
  draw(`Customer: ${params.customerName}`, 12, true, 0.2)
  draw(`Job: ${params.jobTitle}`, 11, false, 0.25)
  draw(`Completed: ${params.completedAtLabel}`, 11, false, 0.25)
  if (params.amountLabel) draw(params.amountLabel, 12, true, 0.15)
  y -= 10
  draw("Thank you for your business.", 11, false, 0.35)
  if (params.templateFooter?.trim()) {
    y -= 12
    for (const para of params.templateFooter.trim().split(/\n+/).slice(0, 15)) {
      draw(para, 9, false, 0.45)
    }
  }

  return doc.save()
}

export function downloadPdfBlob(bytes: Uint8Array, filename: string) {
  const buf = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buf).set(bytes)
  const blob = new Blob([buf], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
