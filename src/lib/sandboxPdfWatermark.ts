import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib"

export const SANDBOX_PDF_WATERMARK_TEXT = "SANDBOX — TRAINING ONLY"

/** Stamp a diagonal watermark on every page (training / sandbox documents). */
export async function stampSandboxWatermarkOnPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    page.drawText(SANDBOX_PDF_WATERMARK_TEXT, {
      x: width * 0.12,
      y: height * 0.52,
      size: Math.min(42, width * 0.07),
      font,
      color: rgb(0.72, 0.72, 0.72),
      rotate: degrees(-32),
      opacity: 0.28,
    })
  }
  return doc.save()
}

export async function finalizePdfBytes(bytes: Uint8Array, opts?: { sandboxWatermark?: boolean }): Promise<Uint8Array> {
  if (opts?.sandboxWatermark) return stampSandboxWatermarkOnPdf(bytes)
  return bytes
}
