import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib"

export type QuotePdfLineItem = { description: string; quantity: number; unitPrice: number; total: number }

/** Optional photos/files for the customer-facing estimate PDF (from entity_attachments + metadata). */
export type QuotePdfCustomerCopyAttachment = {
  publicUrl: string
  fileName: string
  contentType: string | null
  /** From saved “Write description” when enabled */
  description: string
}

/** Fetch PNG/JPEG bytes for embedding in PDF/DOCX (browser or Node). WebP and others return null. */
export async function fetchImageBytesForQuotePdf(url: string): Promise<{ bytes: Uint8Array; kind: "png" | "jpeg" } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.length < 4) return null
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { bytes: buf, kind: "png" }
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { bytes: buf, kind: "jpeg" }
    return null
  } catch {
    return null
  }
}

/** Break a paragraph into lines that fit within maxWidth (points), using PDF font metrics. */
function wrapParagraphToLines(text: string, font: PDFFont, maxWidth: number, size: number): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const words = trimmed.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""
  const pushCurrent = () => {
    if (current) {
      lines.push(current)
      current = ""
    }
  }
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
      continue
    }
    pushCurrent()
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word
      continue
    }
    let chunk = ""
    for (const ch of word) {
      const next = chunk + ch
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        chunk = next
      } else {
        if (chunk) lines.push(chunk)
        chunk = ch
        if (font.widthOfTextAtSize(chunk, size) > maxWidth) {
          lines.push(chunk)
          chunk = ""
        }
      }
    }
    if (chunk) {
      current = chunk
    }
  }
  pushCurrent()
  return lines
}

export async function buildQuotePdfBytes(params: {
  title: string
  businessLabel: string
  customerName: string
  /** Shown on its own line so archived PDFs are searchable by surname. */
  customerLastName?: string | null
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
  /** Optional legal / lite-contract block and signature lines (after footer text). */
  legal?: {
    body: string
    cancellation?: string | null
    showSignatures: boolean
  } | null
  /** Photos/files marked for customer copy (shown after footer, before legal). */
  customerCopyAttachments?: QuotePdfCustomerCopyAttachment[]
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  let page = doc.addPage([612, 792])
  const pageHeight = 792
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  let y = pageHeight - 50
  const left = 50
  const rightMargin = 50
  const maxTextWidth = 612 - left - rightMargin
  const lineH = 14

  const newPageIfNeeded = (minY: number) => {
    if (y >= minY) return
    page = doc.addPage([612, pageHeight])
    y = pageHeight - 50
  }

  const draw = (text: string, size = 11, bold = false, gray = 0) => {
    newPageIfNeeded(56)
    page.drawText(text.slice(0, 500), {
      x: left,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(gray, gray, gray),
    })
    y -= lineH + (size > 11 ? 4 : 0)
  }

  /** Multi-line draw with word wrap (and hard breaks inside the string). */
  const drawWrappedParagraph = (text: string, size = 9, gray = 0.28) => {
    const f = font
    const lh = size + 3
    for (const segment of text.trim().split(/\n+/)) {
      const t = segment.trim()
      if (!t) {
        y -= lh * 0.5
        continue
      }
      const visualLines = wrapParagraphToLines(t, f, maxTextWidth, size)
      for (const vl of visualLines) {
        newPageIfNeeded(56)
        page.drawText(vl.length > 500 ? `${vl.slice(0, 497)}…` : vl, {
          x: left,
          y,
          size,
          font: f,
          color: rgb(gray, gray, gray),
        })
        y -= lh
      }
    }
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
      const targetUpperY = pageHeight - marginFromTop
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
  const ln = params.customerLastName?.trim()
  if (ln) {
    draw(`Customer last name (search): ${ln}`, 10, false, 0.32)
  }
  draw(params.title, 12, true, 0.2)
  if (includeDate) {
    const d = new Date().toLocaleDateString(undefined, { dateStyle: "medium" })
    draw(`Prepared: ${d}`, 10, false, 0.4)
  }
  y -= 8

  if (params.templateHeader?.trim()) {
    for (const para of params.templateHeader.trim().split(/\n+/).slice(0, 12)) {
      drawWrappedParagraph(para, 10, 0.35)
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
      drawWrappedParagraph(para, 9, 0.45)
    }
  }

  const copyAtts = params.customerCopyAttachments?.filter((a) => a.publicUrl?.trim()) ?? []
  if (copyAtts.length > 0) {
    y -= 16
    newPageIfNeeded(140)
    draw("Photos & files (customer copy)", 11, true, 0.12)
    y -= 8
    for (const att of copyAtts.slice(0, 15)) {
      if (att.description.trim()) {
        drawWrappedParagraph(att.description.trim(), 9, 0.32)
        y -= 4
      }
      const fetched = await fetchImageBytesForQuotePdf(att.publicUrl.trim())
      if (fetched) {
        try {
          const embedded =
            fetched.kind === "png" ? await doc.embedPng(fetched.bytes) : await doc.embedJpg(fetched.bytes)
          const maxImgW = maxTextWidth
          const maxImgH = 220
          const scale = Math.min(maxImgW / embedded.width, maxImgH / embedded.height, 1)
          const iw = embedded.width * scale
          const ih = embedded.height * scale
          const gap = 14
          newPageIfNeeded(ih + gap + 56)
          const imgLowerLeftY = y - gap - ih
          page.drawImage(embedded, { x: left, y: imgLowerLeftY, width: iw, height: ih })
          y = imgLowerLeftY - 16
        } catch {
          drawWrappedParagraph(`${att.fileName || "Image"} (could not embed in PDF)`, 9, 0.38)
        }
      } else {
        const label = att.fileName?.trim() || "Attachment"
        drawWrappedParagraph(label, 10, 0.34)
        if (att.publicUrl.trim().startsWith("https://")) {
          drawWrappedParagraph(att.publicUrl.trim(), 8, 0.48)
        }
        y -= 6
      }
    }
  }

  if (params.legal?.body?.trim()) {
    y -= 18
    newPageIfNeeded(120)
    draw("Terms and acknowledgment", 11, true, 0.12)
    y -= 4
    for (const para of params.legal.body.trim().split(/\n+/).slice(0, 28)) {
      if (!para.trim()) continue
      drawWrappedParagraph(para.trim(), 9, 0.28)
    }
    if (params.legal.cancellation?.trim()) {
      y -= 6
      for (const para of params.legal.cancellation.trim().split(/\n+/).slice(0, 10)) {
        if (!para.trim()) continue
        drawWrappedParagraph(para.trim(), 9, 0.32)
      }
    }
    if (params.legal.showSignatures) {
      y -= 20
      newPageIfNeeded(80)
      for (const line of wrapParagraphToLines(
        "Customer signature: _____________________________  Date: ______________",
        font,
        maxTextWidth,
        9,
      )) {
        newPageIfNeeded(56)
        page.drawText(line, { x: left, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) })
        y -= lineH + 2
      }
      for (const line of wrapParagraphToLines(
        "Authorized representative: ______________________  Date: ______________",
        font,
        maxTextWidth,
        9,
      )) {
        newPageIfNeeded(56)
        page.drawText(line, { x: left, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) })
        y -= lineH + 2
      }
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
  /** Plain text below the title (from receipt template intro). */
  templateHeader?: string | null
  /** Optional logo above the title (PNG or JPEG). */
  logo?: { bytes: Uint8Array; kind: "png" | "jpeg" } | null
  /** Calendar block duration (start → end). */
  scheduledDurationLabel?: string | null
  /** Labor, materials, misc, etc. from quote + event extras. */
  quoteLineItems?: string[]
  /** When true, draw materialsChecklistLines (event/job-type checklist or quote material lines). */
  includeMaterialsChecklist?: boolean
  materialsChecklistLines?: string[]
  /** Sum of quoteLineItems totals (if computed). */
  lineSubtotalLabel?: string | null
  mileageLabel?: string | null
  /** When true, first block is titled "Itemized charges"; checklist block is "Supplies checklist". */
  receiptItemizeMode?: boolean
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const { height, width } = page.getSize()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  let y = height - 50
  const left = 50
  const maxW = width - left - 50
  const lineH = 15

  const draw = (text: string, size = 11, bold = false, gray = 0) => {
    page.drawText(text.slice(0, 600), { x: left, y, size, font: bold ? fontBold : font, color: rgb(gray, gray, gray) })
    y -= lineH + (size > 12 ? 6 : 2)
  }

  if (params.logo?.bytes?.length) {
    try {
      const embedded =
        params.logo.kind === "png" ? await doc.embedPng(params.logo.bytes) : await doc.embedJpg(params.logo.bytes)
      const maxLogoW = 220
      const maxLogoH = 72
      const scale = Math.min(maxLogoW / embedded.width, maxLogoH / embedded.height, 1)
      const w = embedded.width * scale
      const h = embedded.height * scale
      const marginFromTop = 40
      const targetUpperY = height - marginFromTop
      const lowerLeftY = targetUpperY - h
      page.drawImage(embedded, { x: left, y: lowerLeftY, width: w, height: h })
      y = lowerLeftY - 14
    } catch {
      /* ignore bad image */
    }
  }

  /** Wrap long strings into visual lines (~chars per line estimated from width). */
  const drawWrapped = (text: string, size = 10, gray = 0.3) => {
    const approxChars = Math.max(24, Math.floor(maxW / (size * 0.52)))
    const words = text.split(/\s+/)
    let line = ""
    const flush = () => {
      if (line.trim()) {
        page.drawText(line.trim().slice(0, 500), { x: left, y, size, font, color: rgb(gray, gray, gray) })
        y -= lineH
      }
      line = ""
    }
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (next.length > approxChars) {
        flush()
        line = w
      } else {
        line = next
      }
    }
    flush()
  }

  draw("Receipt / job complete", 18, true, 0.12)
  draw(params.businessLabel, 11, false, 0.35)
  y -= 8
  if (params.templateHeader?.trim()) {
    for (const para of params.templateHeader.trim().split(/\n+/).slice(0, 10)) {
      if (!para.trim()) continue
      drawWrapped(para.trim(), 10, 0.32)
    }
    y -= 4
  }
  draw(`Customer: ${params.customerName}`, 12, true, 0.2)
  draw(`Job: ${params.jobTitle}`, 11, false, 0.25)
  draw(`Completed: ${params.completedAtLabel}`, 11, false, 0.25)
  if (params.scheduledDurationLabel?.trim()) draw(params.scheduledDurationLabel.trim(), 11, false, 0.24)
  if (params.mileageLabel?.trim()) draw(params.mileageLabel.trim(), 11, false, 0.22)
  if (params.amountLabel) draw(params.amountLabel, 12, true, 0.15)

  const quoteItems = params.quoteLineItems?.filter((s) => s.trim()) ?? []
  if (quoteItems.length > 0) {
    y -= 6
    draw("Line items (quote & receipt)", 12, true, 0.15)
    y -= 2
    for (const raw of quoteItems.slice(0, 45)) {
      const t = raw.trim()
      if (!t) continue
      drawWrapped(`• ${t}`, 10, 0.28)
    }
    if (params.lineSubtotalLabel?.trim()) {
      y -= 2
      draw(params.lineSubtotalLabel.trim(), 11, true, 0.18)
    }
  }

  const checklist = params.materialsChecklistLines?.filter((s) => s.trim()) ?? []
  if (params.includeMaterialsChecklist && checklist.length > 0) {
    y -= 6
    draw(params.receiptItemizeMode ? "Supplies checklist" : "Materials checklist", 12, true, 0.15)
    y -= 2
    for (const raw of checklist.slice(0, 40)) {
      const t = raw.trim()
      if (!t) continue
      drawWrapped(`• ${t}`, 10, 0.28)
    }
  }

  y -= 10
  draw("Thank you for your business.", 11, false, 0.35)
  if (params.templateFooter?.trim()) {
    y -= 12
    for (const para of params.templateFooter.trim().split(/\n+/).slice(0, 15)) {
      if (!para.trim()) continue
      drawWrapped(para.trim(), 9, 0.45)
    }
    y -= 4
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
