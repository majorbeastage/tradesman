/**
 * Custom estimate / invoice number formats.
 *
 * Tokens:
 *   {PREFIX}  — fixed prefix text (from settings)
 *   {YYYY} {YY} {MM} {DD} — date parts
 *   {####} {###} {##} {#} — zero-padded sequence (length = # count)
 *   {SEQ} — raw sequence without padding
 *
 * Examples: EST-{YYYY}-{####} → EST-2026-0042
 *           INV-{YY}{MM}-{###} → INV-2608-007
 */

export type DocumentNumberFormatSettings = {
  format: string
  prefix: string
  nextSequence: number
}

export const DEFAULT_ESTIMATE_NUMBER_FORMAT = "EST-{YYYY}-{####}"
export const DEFAULT_INVOICE_NUMBER_FORMAT = "INV-{YYYY}{MM}-{####}"

export function parseDocumentNumberSettings(
  meta: Record<string, unknown>,
  kind: "estimate" | "invoice",
): DocumentNumberFormatSettings {
  const formatKey = kind === "estimate" ? "estimate_number_format" : "invoice_number_format"
  const prefixKey = kind === "estimate" ? "estimate_number_prefix" : "invoice_number_prefix"
  const seqKey = kind === "estimate" ? "estimate_number_next" : "invoice_number_next"
  const fallbackFormat = kind === "estimate" ? DEFAULT_ESTIMATE_NUMBER_FORMAT : DEFAULT_INVOICE_NUMBER_FORMAT
  const format =
    typeof meta[formatKey] === "string" && String(meta[formatKey]).trim()
      ? String(meta[formatKey]).trim().slice(0, 80)
      : fallbackFormat
  const prefix =
    typeof meta[prefixKey] === "string" ? String(meta[prefixKey]).trim().slice(0, 24) : kind === "estimate" ? "EST" : "INV"
  const seqRaw = meta[seqKey]
  let nextSequence = 1
  if (typeof seqRaw === "number" && Number.isFinite(seqRaw) && seqRaw >= 1) nextSequence = Math.floor(seqRaw)
  else if (typeof seqRaw === "string" && /^\d+$/.test(seqRaw.trim())) nextSequence = Math.max(1, parseInt(seqRaw.trim(), 10))
  return { format, prefix, nextSequence }
}

export function formatDocumentNumber(
  settings: DocumentNumberFormatSettings,
  when: Date = new Date(),
  sequenceOverride?: number,
): string {
  const seq = sequenceOverride ?? settings.nextSequence
  const yyyy = String(when.getFullYear())
  const yy = yyyy.slice(-2)
  const mm = String(when.getMonth() + 1).padStart(2, "0")
  const dd = String(when.getDate()).padStart(2, "0")
  let out = settings.format || DEFAULT_ESTIMATE_NUMBER_FORMAT
  out = out.replace(/\{PREFIX\}/gi, settings.prefix || "")
  out = out.replace(/\{YYYY\}/g, yyyy)
  out = out.replace(/\{YY\}/g, yy)
  out = out.replace(/\{MM\}/g, mm)
  out = out.replace(/\{DD\}/g, dd)
  out = out.replace(/\{SEQ\}/gi, String(seq))
  out = out.replace(/\{(#+)\}/g, (_, hashes: string) => String(seq).padStart(hashes.length, "0"))
  return out.trim().slice(0, 64) || String(seq)
}

/** Advance sequence in profile metadata after assigning a number. */
export function bumpDocumentNumberMeta(
  meta: Record<string, unknown>,
  kind: "estimate" | "invoice",
  usedSequence: number,
): Record<string, unknown> {
  const seqKey = kind === "estimate" ? "estimate_number_next" : "invoice_number_next"
  return { ...meta, [seqKey]: Math.max(1, Math.floor(usedSequence) + 1) }
}
