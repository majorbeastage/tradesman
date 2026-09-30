import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"
import { compressRasterForPdfEmbed } from "./documentPdf"
import { finalizePdfBytes } from "./sandboxPdfWatermark"
import { normalizeHexColor, DEFAULT_DOCUMENT_PRIMARY_COLOR, DEFAULT_DOCUMENT_SECONDARY_COLOR } from "./documentVisualTemplate"

export type GraphicalDocumentLine = {
  description: string
  quantity: number
  rate: number
  amount: number
}

export type GraphicalCustomerDocumentInput = {
  documentKind: "invoice" | "receipt"
  businessName: string
  phone?: string | null
  tagline?: string | null
  logo?: { bytes: Uint8Array; kind: "png" | "jpeg" } | null
  primaryColor: string
  secondaryColor: string
  documentNumber?: string | null
  accountNumber?: string | null
  dateLabel: string
  paymentMethod?: string | null
  paymentStatus?: string | null
  billToName: string
  billToPhone?: string | null
  billToEmail?: string | null
  billToAddress?: string | null
  jobTitle?: string | null
  notes?: string | null
  lines: GraphicalDocumentLine[]
  subtotal: number
  amountPaid?: number | null
  balanceDue?: number | null
  sourceLabel?: string | null
  showDate?: boolean
  showJob?: boolean
  showNotes?: boolean
  showPaymentMethod?: boolean
  sandboxWatermark?: boolean
}

function pdfSafe(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, " ").replace(/[ \t]+/g, " ").trim()
}

function money(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  return `$${v.toFixed(2)}`
}

function hexRgb(hex: string, fallback: string) {
  const h = normalizeHexColor(hex, fallback).slice(1)
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255)
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = pdfSafe(text).split(" ").filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next
      continue
    }
    if (current) lines.push(current)
    current = word
  }
  if (current) lines.push(current)
  return lines
}

export async function buildGraphicalCustomerDocumentPdf(input: GraphicalCustomerDocumentInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const pageWidth = 612
  const pageHeight = 792
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const primary = hexRgb(input.primaryColor, DEFAULT_DOCUMENT_PRIMARY_COLOR)
  const secondary = hexRgb(input.secondaryColor, DEFAULT_DOCUMENT_SECONDARY_COLOR)
  const white = rgb(1, 1, 1)
  const ink = rgb(0.12, 0.16, 0.22)
  const muted = rgb(0.33, 0.38, 0.45)
  const left = 36
  const right = pageWidth - 36
  const contentW = right - left

  let page = doc.addPage([pageWidth, pageHeight])
  let y = pageHeight - 28

  const newPage = () => {
    page = doc.addPage([pageWidth, pageHeight])
    y = pageHeight - 40
  }

  const ensure = (need: number) => {
    if (y - need < 48) newPage()
  }

  const drawRight = (target: PDFPage, text: string, xRight: number, yPos: number, size: number, useFont: PDFFont, color: ReturnType<typeof rgb>) => {
    const safe = pdfSafe(text).slice(0, 80)
    const w = useFont.widthOfTextAtSize(safe, size)
    target.drawText(safe, { x: xRight - w, y: yPos, size, font: useFont, color })
  }

  const sectionBar = (label: string, rightLabel?: string) => {
    ensure(28)
    page.drawRectangle({ x: left, y: y - 16, width: contentW, height: 20, color: secondary })
    page.drawText(pdfSafe(label).slice(0, 40), {
      x: left + 8,
      y: y - 11,
      size: 9,
      font: fontBold,
      color: white,
    })
    if (rightLabel?.trim()) {
      drawRight(page, rightLabel, right - 8, y - 10, 11, fontBold, white)
    }
    y -= 28
  }

  const headerBottom = y - 112
  page.drawRectangle({ x: 0, y: headerBottom, width: pageWidth, height: y - headerBottom + 28, color: primary })

  let textX = left
  if (input.logo?.bytes?.length) {
    try {
      const logoImg = await compressRasterForPdfEmbed(input.logo.bytes, input.logo.kind, 600)
      const embedded = logoImg.kind === "png" ? await doc.embedPng(logoImg.bytes) : await doc.embedJpg(logoImg.bytes)
      const maxW = 86
      const maxH = 72
      const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1)
      const w = embedded.width * scale
      const h = embedded.height * scale
      const boxX = left
      const boxY = headerBottom + 18
      page.drawRectangle({ x: boxX, y: boxY, width: w + 10, height: h + 10, color: white })
      page.drawImage(embedded, { x: boxX + 5, y: boxY + 5, width: w, height: h })
      textX = boxX + w + 22
    } catch {
      textX = left
    }
  }

  const business = pdfSafe(input.businessName || "Your business").slice(0, 42) || "Your business"
  page.drawText(business, { x: textX, y: y - 28, size: 16, font: fontBold, color: white })
  let headerTextY = y - 46
  if (input.phone?.trim()) {
    page.drawText(pdfSafe(input.phone).slice(0, 32), { x: textX, y: headerTextY, size: 10, font, color: white })
    headerTextY -= 14
  }
  if (input.tagline?.trim()) {
    const tag = wrapLines(input.tagline, font, 9, 220).slice(0, 2)
    for (const line of tag) {
      page.drawText(line, { x: textX, y: headerTextY, size: 9, font, color: white })
      headerTextY -= 12
    }
  }

  const title = input.documentKind === "receipt" ? "CUSTOMER RECEIPT" : "INVOICE"
  drawRight(page, title, right, y - 26, 13, fontBold, white)
  if (input.showDate !== false && input.dateLabel.trim()) {
    drawRight(page, input.documentKind === "receipt" ? "Receipt date" : "Invoice date", right, y - 44, 8, font, white)
    drawRight(page, input.dateLabel, right, y - 58, 11, fontBold, white)
  }
  const badge = pdfSafe(input.paymentStatus || "").slice(0, 28)
  if (badge) {
    const badgeW = Math.min(160, fontBold.widthOfTextAtSize(badge, 8) + 16)
    page.drawRectangle({ x: right - badgeW, y: y - 84, width: badgeW, height: 16, color: secondary })
    drawRight(page, badge, right - 6, y - 79, 8, fontBold, white)
  }
  if (input.documentNumber?.trim()) {
    drawRight(page, `# ${pdfSafe(input.documentNumber)}`, right, y - 102, 9, font, white)
  }

  y = headerBottom - 18

  if (input.showPaymentMethod !== false && input.paymentMethod?.trim() && input.documentKind === "receipt") {
    sectionBar("PAYMENT METHOD")
    page.drawText(pdfSafe(input.paymentMethod).slice(0, 80), { x: left, y, size: 11, font: fontBold, color: ink })
    y -= 20
  }

  const accountLabel = input.accountNumber?.trim() ? `Account ${pdfSafe(input.accountNumber)}` : ""
  sectionBar("BILL TO", accountLabel)
  page.drawText(pdfSafe(input.billToName || "Customer").slice(0, 60) || "Customer", { x: left, y, size: 12, font: fontBold, color: ink })
  y -= 15
  const contactBits = [
    input.billToPhone?.trim() ? `Phone: ${pdfSafe(input.billToPhone)}` : "",
    input.billToEmail?.trim() ? `Email: ${pdfSafe(input.billToEmail)}` : "",
  ].filter(Boolean)
  for (const bit of contactBits) {
    page.drawText(bit.slice(0, 90), { x: left, y, size: 10, font, color: muted })
    y -= 13
  }
  if (input.billToAddress?.trim()) {
    for (const line of input.billToAddress.split(/\n+/).slice(0, 3)) {
      const safe = pdfSafe(line)
      if (!safe) continue
      page.drawText(safe.slice(0, 90), { x: left, y, size: 10, font, color: muted })
      y -= 13
    }
  }
  if (input.sourceLabel?.trim()) {
    page.drawText(pdfSafe(input.sourceLabel).slice(0, 100), { x: left, y, size: 9, font, color: muted })
    y -= 14
  }
  y -= 6

  if (input.showJob !== false && input.jobTitle?.trim()) {
    page.drawText(pdfSafe(input.jobTitle).slice(0, 110), { x: left, y, size: 11, font: fontBold, color: ink })
    y -= 18
  }

  sectionBar("SERVICE DETAILS")
  const colDesc = left
  const colQty = 360
  const colRate = 430
  const colAmt = right

  const drawTableHeader = () => {
    ensure(24)
    page.drawRectangle({ x: left, y: y - 6, width: contentW, height: 18, color: primary })
    page.drawText("DESCRIPTION", { x: colDesc + 4, y: y - 1, size: 8, font: fontBold, color: white })
    page.drawText("QTY", { x: colQty, y: y - 1, size: 8, font: fontBold, color: white })
    page.drawText("RATE", { x: colRate, y: y - 1, size: 8, font: fontBold, color: white })
    drawRight(page, "AMOUNT", colAmt - 4, y - 1, 8, fontBold, white)
    y -= 22
  }
  drawTableHeader()

  const lines = input.lines.length > 0 ? input.lines : [{ description: "No line items", quantity: 0, rate: 0, amount: 0 }]
  for (const line of lines.slice(0, 40)) {
    const descLines = wrapLines(line.description || "Item", font, 10, 300).slice(0, 3)
    const rowH = Math.max(16, descLines.length * 12 + 4)
    if (y - rowH < 72) {
      newPage()
      drawTableHeader()
    }
    descLines.forEach((dl, i) => {
      page.drawText(dl, { x: colDesc + 4, y: y - i * 12, size: 10, font, color: ink })
    })
    if (line.quantity || line.amount) {
      page.drawText(String(line.quantity), { x: colQty, y, size: 10, font, color: ink })
      page.drawText(money(line.rate), { x: colRate, y, size: 10, font, color: ink })
      drawRight(page, money(line.amount), colAmt - 4, y, 10, fontBold, ink)
    }
    y -= rowH
  }

  y -= 8
  ensure(70)
  const totalsX = 360
  const row = (label: string, value: string, bold = false) => {
    page.drawText(label, { x: totalsX, y, size: 10, font: bold ? fontBold : font, color: bold ? ink : muted })
    drawRight(page, value, colAmt - 4, y, 10, bold ? fontBold : font, ink)
    y -= 16
  }
  row("Subtotal", money(input.subtotal))
  if (typeof input.amountPaid === "number" && Number.isFinite(input.amountPaid)) {
    row("Amount paid", money(input.amountPaid))
  }
  const balance =
    typeof input.balanceDue === "number" && Number.isFinite(input.balanceDue)
      ? input.balanceDue
      : input.subtotal - (input.amountPaid ?? 0)
  page.drawRectangle({ x: totalsX - 8, y: y - 6, width: right - totalsX + 8, height: 22, color: primary })
  page.drawText("BALANCE DUE", { x: totalsX, y: y, size: 10, font: fontBold, color: white })
  drawRight(page, money(balance), colAmt - 4, y, 11, fontBold, white)
  y -= 28

  if (input.showNotes !== false && input.notes?.trim()) {
    ensure(40)
    for (const para of input.notes.trim().split(/\n+/).slice(0, 6)) {
      for (const line of wrapLines(para, font, 10, contentW)) {
        ensure(16)
        page.drawText(line, { x: left, y, size: 10, font, color: muted })
        y -= 13
      }
    }
    y -= 8
  }

  ensure(56)
  y -= 8
  const thanks = `THANK YOU FOR CHOOSING ${pdfSafe(input.businessName || "US").toUpperCase()}!`.slice(0, 70)
  page.drawText(thanks, { x: left, y, size: 11, font: fontBold, color: primary })
  y -= 14
  const footBits = [input.tagline?.trim() ? pdfSafe(input.tagline) : "", input.phone?.trim() ? pdfSafe(input.phone) : ""]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 90)
  if (footBits) {
    page.drawText(footBits, { x: left, y, size: 9, font, color: muted })
    y -= 13
  }
  page.drawText(
    input.documentKind === "receipt" ? "Please keep this receipt for your records." : "Please keep this invoice for your records.",
    { x: left, y, size: 9, font, color: muted },
  )

  return finalizePdfBytes(await doc.save(), { sandboxWatermark: input.sandboxWatermark })
}
