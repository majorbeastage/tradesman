/**
 * Serverless-safe SMS opt-in consent PDF builder (no imports from src/).
 * Mirror disclosure + layout in `src/lib/smsOptInConsentFormPdf.ts`.
 */
import { PDFDocument, type PDFFont, StandardFonts, rgb } from "pdf-lib"

/** Same text as `DEFAULT_SMS_CONSENT_PAGE.consent_statement` in src/types/legal-pages.ts */
const SMS_CTA_DISCLOSURE_DEFAULT = `“By submitting a service request or contacting [Business Name], you agree to receive SMS messages related to your inquiry, scheduling, estimates, job updates, and customer support from [Business Name]. Message frequency varies. Message and data rates may apply. Reply STOP to opt out. Reply HELP for help.”`

function buildManualSmsConsentDisclosure(businessName: string): string {
  const biz = businessName.trim() || "Your business"
  return SMS_CTA_DISCLOSURE_DEFAULT.replace(/\[Business Name\]/g, biz)
}

/** Standard Helvetica on pdf-lib only supports WinAnsi; strip common Unicode punctuation. */
function pdfSafeText(text: string): string {
  return text
    .replace(/\u2192/g, "->")
    .replace(/\u00b7/g, " - ")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
}

export type SmsOptInConsentFormPdfParams = {
  businessName?: string
  businessPhone?: string
}

function wrapParagraphToLines(text: string, font: PDFFont, maxWidth: number, size: number): string[] {
  const trimmed = pdfSafeText(text).trim()
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
      }
    }
    if (chunk) current = chunk
  }
  pushCurrent()
  return lines
}

export async function buildSmsOptInConsentFormPdfBytes(params: SmsOptInConsentFormPdfParams = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const pageW = 612
  const pageH = 792
  const left = 50
  const right = 50
  const maxW = pageW - left - right
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  let y = pageH - 48
  const lineH = 14

  const newPageIfNeeded = (minY: number) => {
    if (y >= minY) return
  }

  const drawText = (text: string, size: number, bold = false, gray = 0.12) => {
    newPageIfNeeded(48)
    page.drawText(pdfSafeText(text).slice(0, 800), {
      x: left,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(gray, gray, gray),
    })
    y -= lineH + (size > 11 ? 3 : 0)
  }

  const drawWrapped = (text: string, size: number, gray = 0.22) => {
    for (const line of wrapParagraphToLines(text, font, maxW, size)) {
      newPageIfNeeded(48)
      page.drawText(line, { x: left, y, size, font, color: rgb(gray, gray, gray) })
      y -= size + 4
    }
  }

  const drawRule = (yLine: number, fromX = left, toX = pageW - right) => {
    page.drawLine({
      start: { x: fromX, y: yLine },
      end: { x: toX, y: yLine },
      thickness: 0.6,
      color: rgb(0.55, 0.55, 0.55),
    })
  }

  const drawField = (label: string, prefill = "", labelWidth = 118) => {
    newPageIfNeeded(56)
    const labelSize = 10
    page.drawText(label, { x: left, y, size: labelSize, font: fontBold, color: rgb(0.2, 0.2, 0.2) })
    const lineY = y - 3
    const lineStart = left + labelWidth
    drawRule(lineY, lineStart, pageW - right)
    if (prefill.trim()) {
      page.drawText(pdfSafeText(prefill).slice(0, 80), {
        x: lineStart + 4,
        y: y - 1,
        size: 10,
        font,
        color: rgb(0.1, 0.1, 0.1),
      })
    }
    y -= 22
  }

  const bizDisplay = params.businessName?.trim() || ""
  const disclosure = buildManualSmsConsentDisclosure(bizDisplay || "Your Business")

  drawText("SMS Text Message Opt-In Consent Form", 17, true, 0.1)
  y -= 2
  drawText("Tradesman Systems · For contractor / trades business use", 9, false, 0.45)
  y -= 6

  drawWrapped(
    "Have the customer complete and sign this form before you send SMS from Tradesman (or any business line). " +
      "Keep the signed copy with your records. You may also enter the consent in Tradesman under Customers → SMS opt-in.",
    9,
    0.38,
  )
  y -= 4

  drawText("Business information", 11, true, 0.15)
  drawField("Business name", bizDisplay)
  drawField("Business phone", params.businessPhone?.trim() ?? "")
  drawField("Business address (optional)", "")

  y -= 4
  drawText("Customer information", 11, true, 0.15)
  drawField("Customer full name", "")
  drawField("Mobile phone number", "")
  drawField("Email (optional)", "")

  y -= 4
  drawText("Consent disclosure (read to customer or provide a copy)", 11, true, 0.15)
  y -= 2

  const boxTop = y
  const boxPad = 10
  let boxInnerY = boxTop - boxPad
  const disclosureSize = 9.5
  const disclosureLines = wrapParagraphToLines(disclosure, font, maxW - boxPad * 2, disclosureSize)
  const boxHeight = disclosureLines.length * (disclosureSize + 4) + boxPad * 2 + 8
  page.drawRectangle({
    x: left,
    y: boxTop - boxHeight,
    width: maxW,
    height: boxHeight,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 0.8,
    color: rgb(0.98, 0.98, 0.99),
  })
  for (const line of disclosureLines) {
    boxInnerY -= disclosureSize + 4
    page.drawText(line, {
      x: left + boxPad,
      y: boxInnerY,
      size: disclosureSize,
      font,
      color: rgb(0.15, 0.15, 0.15),
    })
  }
  y = boxTop - boxHeight - 14

  newPageIfNeeded(120)
  const checkY = y
  const boxSize = 11
  page.drawRectangle({
    x: left,
    y: checkY - boxSize,
    width: boxSize,
    height: boxSize,
    borderColor: rgb(0.2, 0.2, 0.2),
    borderWidth: 1,
  })
  const agreeLead =
    "I agree to receive text messages as described above. I understand message frequency varies, message and data rates may apply, and I can reply STOP to opt out or HELP for help."
  const agreeLines = wrapParagraphToLines(agreeLead, font, maxW - boxSize - 10, 9.5)
  let agreeY = checkY - 2
  for (const line of agreeLines) {
    page.drawText(line, { x: left + boxSize + 8, y: agreeY, size: 9.5, font, color: rgb(0.15, 0.15, 0.15) })
    agreeY -= 12
  }
  y = Math.min(checkY - boxSize - 6, agreeY) - 10

  drawField("Customer signature", "", 108)
  drawField("Date (customer)", "", 108)

  y -= 2
  drawText("Business record (optional)", 10, true, 0.3)
  drawField("Recorded by (staff name)", "", 130)
  drawField("Date (recorded)", "", 108)
  drawField("Consent method (e.g. in person, phone)", "", 200)

  y -= 2
  drawWrapped(
    "Retention: Store this signed form (or equivalent proof) where you keep customer files. " +
      "Tradesman Systems facilitates one-to-one messaging; your business is responsible for consent and opt-outs. " +
      "This template is not legal advice.",
    8,
    0.5,
  )

  const footer = `Generated ${new Date().toLocaleDateString("en-US", { dateStyle: "medium" })} · tradesman-us.com/sms-cta`
  page.drawText(footer, {
    x: left,
    y: 36,
    size: 8,
    font,
    color: rgb(0.55, 0.55, 0.55),
  })

  return doc.save()
}

export function smsOptInConsentFormFilename(businessName?: string): string {
  const base = "sms-opt-in-consent-form"
  const slug = (businessName ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return slug ? `${base}-${slug}.pdf` : `${base}.pdf`
}
