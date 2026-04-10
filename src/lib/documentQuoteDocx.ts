import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"
import type { QuotePdfLineItem } from "./documentPdf"

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

function readPngDimensions(bytes: Uint8Array): { w: number; h: number } | null {
  if (bytes.byteLength < 24) return null
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50) return null
  const dv = new DataView(bytes.buffer, bytes.byteOffset + 16, 8)
  const w = dv.getUint32(0, false)
  const h = dv.getUint32(4, false)
  if (!w || !h) return null
  return { w, h }
}

function logoDocxDimensions(bytes: Uint8Array, kind: "png" | "jpeg"): { width: number; height: number } {
  const maxW = 220
  const maxH = 72
  if (kind === "png") {
    const dim = readPngDimensions(bytes)
    if (dim) {
      const scale = Math.min(maxW / dim.w, maxH / dim.h, 1)
      return { width: Math.round(dim.w * scale), height: Math.round(dim.h * scale) }
    }
  }
  return { width: maxW, height: 48 }
}

/**
 * Builds a .docx estimate/quote for download in Microsoft Word.
 * Layout mirrors the PDF export: business block, customer, optional intro, line table, total, footer.
 */
export async function buildQuoteDocxBlob(params: {
  title: string
  businessLabel: string
  customerName: string
  items: QuotePdfLineItem[]
  templateHeader?: string | null
  templateFooter?: string | null
  includePreparedDate?: boolean
  showLineNumbers?: boolean
  logo?: { bytes: Uint8Array; kind: "png" | "jpeg" } | null
}): Promise<Blob> {
  const includeDate = params.includePreparedDate !== false
  const showNums = params.showLineNumbers === true
  const children: (Paragraph | Table)[] = []

  if (params.logo?.bytes?.length) {
    const docxType = params.logo.kind === "png" ? "png" : "jpg"
    const { width, height } = logoDocxDimensions(params.logo.bytes, params.logo.kind)
    try {
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          children: [
            new ImageRun({
              type: docxType,
              data: params.logo.bytes,
              transformation: { width, height },
            }),
          ],
        }),
      )
    } catch {
      /* skip invalid image */
    }
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
      spacing: { after: 120 },
      children: [new TextRun({ text: (params.businessLabel || "Estimate").slice(0, 200), bold: true, size: 36 })],
    }),
  )

  children.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: `Customer: ${(params.customerName || "Customer").slice(0, 200)}`, size: 22 })],
    }),
  )

  children.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: params.title.slice(0, 200), bold: true, size: 26 })],
    }),
  )

  if (includeDate) {
    const d = new Date().toLocaleDateString(undefined, { dateStyle: "medium" })
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        children: [new TextRun({ text: `Prepared: ${d}`, italics: true, size: 20, color: "666666" })],
      }),
    )
  }

  if (params.templateHeader?.trim()) {
    for (const para of params.templateHeader.trim().split(/\n+/).slice(0, 24)) {
      const t = para.trim()
      if (t)
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({ text: t.slice(0, 2000), size: 22 })],
          }),
        )
    }
    children.push(new Paragraph({ text: "" }))
  }

  const headerCells: TableCell[] = []
  if (showNums) {
    headerCells.push(
      new TableCell({
        width: { size: 6, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text: "#", bold: true, size: 20 })] })],
      }),
    )
  }
  headerCells.push(
    new TableCell({
      width: { size: showNums ? 44 : 50, type: WidthType.PERCENTAGE },
      children: [new Paragraph({ children: [new TextRun({ text: "Description", bold: true, size: 20 })] })],
    }),
    new TableCell({
      width: { size: 12, type: WidthType.PERCENTAGE },
      children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Qty", bold: true, size: 20 })] })],
    }),
    new TableCell({
      width: { size: 17, type: WidthType.PERCENTAGE },
      children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Unit", bold: true, size: 20 })] })],
    }),
    new TableCell({
      width: { size: showNums ? 21 : 23, type: WidthType.PERCENTAGE },
      children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Line total", bold: true, size: 20 })] })],
    }),
  )

  const rows: TableRow[] = [new TableRow({ children: headerCells })]

  params.items.forEach((row, idx) => {
    const desc = row.description.slice(0, 500)
    const cells: TableCell[] = []
    if (showNums) {
      cells.push(
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: String(idx + 1), size: 20 })] })],
        }),
      )
    }
    cells.push(
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: desc, size: 20 })] })],
      }),
      new TableCell({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: String(row.quantity), size: 20 })],
          }),
        ],
      }),
      new TableCell({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: money(row.unitPrice), size: 20 })],
          }),
        ],
      }),
      new TableCell({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: money(row.total), size: 20 })],
          }),
        ],
      }),
    )
    rows.push(new TableRow({ children: cells }))
  })

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    }),
  )

  const grand = params.items.reduce((s, r) => s + r.total, 0)
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 200 },
      children: [new TextRun({ text: `Total: ${money(grand)}`, bold: true, size: 28 })],
    }),
  )

  if (params.templateFooter?.trim()) {
    for (const para of params.templateFooter.trim().split(/\n+/).slice(0, 24)) {
      const t = para.trim()
      if (t)
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({ text: t.slice(0, 2000), size: 20, color: "444444" })],
          }),
        )
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  })

  return Packer.toBlob(doc)
}

export function downloadDocxBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
