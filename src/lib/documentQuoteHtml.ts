import type { QuotePdfLineItem, QuotePdfCustomerCopyAttachment } from "./documentPdf"

/** Lightweight HTML estimate — opens in any browser (Android / iOS / Windows) without a PDF viewer. */
export function buildQuoteHtmlDocument(params: {
  title: string
  businessLabel: string
  customerName: string
  items: QuotePdfLineItem[]
  templateHeader?: string | null
  templateFooter?: string | null
  jobDescription?: string | null
  jobDescriptionLabel?: string | null
  includePreparedDate?: boolean
  preparedDateLabel?: string | null
  showLineNumbers?: boolean
  legal?: { body: string; cancellation?: string; showSignatures?: boolean } | null
  customerCopyAttachments?: QuotePdfCustomerCopyAttachment[] | null
  documentNumber?: string | null
}): string {
  const includeDate = params.includePreparedDate !== false
  const showNums = params.showLineNumbers !== false
  const d =
    params.preparedDateLabel?.trim() ||
    new Date().toLocaleDateString(undefined, { dateStyle: "medium" })
  const grand = params.items.reduce((s, r) => s + r.total, 0)
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")

  const rows = params.items
    .map((row, idx) => {
      const prefix = showNums ? `${idx + 1}. ` : ""
      return `<tr>
        <td>${esc(prefix + row.description)}</td>
        <td style="text-align:right">${row.quantity}</td>
        <td style="text-align:right">$${row.unitPrice.toFixed(2)}</td>
        <td style="text-align:right">$${row.total.toFixed(2)}</td>
      </tr>`
    })
    .join("")

  const photos = (params.customerCopyAttachments ?? [])
    .filter((a) => a.publicUrl?.trim())
    .slice(0, 15)
    .map((a) => {
      const desc = a.description?.trim() ? `<p style="margin:0 0 6px;font-size:13px;color:#475569">${esc(a.description.trim())}</p>` : ""
      const isImg = /\.(jpg|jpeg|png|gif|webp|avif)(\?|#|$)/i.test(a.publicUrl) || (a.contentType || "").startsWith("image/")
      if (isImg) {
        return `<figure style="margin:0 0 16px">${desc}<img src="${esc(a.publicUrl.trim())}" alt="" style="max-width:100%;height:auto;border-radius:8px;border:1px solid #e2e8f0"/></figure>`
      }
      return `<p style="margin:0 0 12px">${desc}<a href="${esc(a.publicUrl.trim())}">${esc(a.fileName || "Attachment")}</a></p>`
    })
    .join("")

  const legal = params.legal?.body?.trim()
    ? `<section style="margin-top:28px">
        <h2 style="font-size:15px;margin:0 0 8px">Terms and acknowledgment</h2>
        <div style="white-space:pre-wrap;font-size:13px;line-height:1.45">${esc(params.legal.body.trim())}</div>
        ${params.legal.cancellation?.trim() ? `<div style="white-space:pre-wrap;font-size:13px;margin-top:10px">${esc(params.legal.cancellation.trim())}</div>` : ""}
        ${params.legal.showSignatures ? `<p style="margin-top:24px;font-size:13px">Customer signature: _____________________________ &nbsp; Date: ______________</p>` : ""}
      </section>`
    : ""

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(params.title)}</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;padding:24px;color:#0f172a;background:#fff;line-height:1.45}
  h1{font-size:22px;margin:0 0 4px}
  .meta{color:#64748b;font-size:14px;margin:0 0 4px}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  th,td{padding:8px 6px;border-bottom:1px solid #e2e8f0;font-size:14px;text-align:left}
  th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#64748b}
  .total{font-size:18px;font-weight:800;margin-top:8px}
  @media print{body{padding:12px}}
</style>
</head>
<body>
  <h1>${esc(params.businessLabel || "Estimate")}</h1>
  ${params.documentNumber?.trim() ? `<p class="meta">No. ${esc(params.documentNumber.trim())}</p>` : ""}
  <p class="meta">Customer: ${esc(params.customerName)}</p>
  <p class="meta">${esc(params.title)}</p>
  ${includeDate ? `<p class="meta">Prepared: ${esc(d)}</p>` : ""}
  ${params.templateHeader?.trim() ? `<section style="margin:16px 0;white-space:pre-wrap;font-size:14px">${esc(params.templateHeader.trim())}</section>` : ""}
  ${
    params.jobDescription?.trim()
      ? `<section style="margin:16px 0"><h2 style="font-size:15px;margin:0 0 6px">${esc(params.jobDescriptionLabel?.trim() || "Job description")}</h2><div style="white-space:pre-wrap;font-size:14px">${esc(params.jobDescription.trim())}</div></section>`
      : ""
  }
  <h2 style="font-size:15px;margin:20px 0 8px">Line items</h2>
  <table>
    <thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="total">Total: $${grand.toFixed(2)}</p>
  ${params.templateFooter?.trim() ? `<section style="margin-top:20px;white-space:pre-wrap;font-size:13px;color:#475569">${esc(params.templateFooter.trim())}</section>` : ""}
  ${photos ? `<section style="margin-top:28px"><h2 style="font-size:15px;margin:0 0 12px">Photos &amp; files</h2>${photos}</section>` : ""}
  ${legal}
</body>
</html>`
}

export function downloadQuoteHtmlFile(html: string, fileBase: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${fileBase.replace(/[^\w.-]+/g, "_") || "estimate"}.html`
  a.click()
  URL.revokeObjectURL(url)
}
