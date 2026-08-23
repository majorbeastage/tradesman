/**
 * Document numbering for estimates, invoices, and future work orders / inventory.
 *
 * Simple model (UI):
 *   Prefix + sequence digit length (3–6) → e.g. EST-0001, INV-0042
 *
 * Legacy token formats are still parsed for digit length / prefix when present.
 */

export type DocumentNumberKind = "estimate" | "invoice" | "work_order" | "inventory"

export type DocumentNumberDigitCount = 3 | 4 | 5 | 6

export const DOCUMENT_NUMBER_DIGIT_OPTIONS: DocumentNumberDigitCount[] = [3, 4, 5, 6]

export type DocumentNumberFormatSettings = {
  /** Derived pattern kept for compatibility with older callers. */
  format: string
  prefix: string
  sequenceDigits: DocumentNumberDigitCount
  nextSequence: number
  /** When false, documents do not show/auto-assign custom numbers. */
  enabled?: boolean
}

type KindDefaults = {
  prefix: string
  digits: DocumentNumberDigitCount
  formatKey: string
  prefixKey: string
  digitsKey: string
  seqKey: string
  enabledKey: string
}

const KIND_DEFAULTS: Record<DocumentNumberKind, KindDefaults> = {
  estimate: {
    prefix: "EST",
    digits: 4,
    formatKey: "estimate_number_format",
    prefixKey: "estimate_number_prefix",
    digitsKey: "estimate_number_digits",
    seqKey: "estimate_number_next",
    enabledKey: "estimate_number_enabled",
  },
  invoice: {
    prefix: "INV",
    digits: 4,
    formatKey: "invoice_number_format",
    prefixKey: "invoice_number_prefix",
    digitsKey: "invoice_number_digits",
    seqKey: "invoice_number_next",
    enabledKey: "invoice_number_enabled",
  },
  work_order: {
    prefix: "WO",
    digits: 4,
    formatKey: "work_order_number_format",
    prefixKey: "work_order_number_prefix",
    digitsKey: "work_order_number_digits",
    seqKey: "work_order_number_next",
    enabledKey: "work_order_number_enabled",
  },
  inventory: {
    prefix: "SKU",
    digits: 4,
    formatKey: "inventory_number_format",
    prefixKey: "inventory_number_prefix",
    digitsKey: "inventory_number_digits",
    seqKey: "inventory_number_next",
    enabledKey: "inventory_number_enabled",
  },
}

export function buildDocumentNumberFormat(prefix: string, digits: DocumentNumberDigitCount): string {
  const hashes = "#".repeat(digits)
  const p = prefix.trim()
  return p ? `{PREFIX}-{${hashes}}` : `{${hashes}}`
}

export const DEFAULT_ESTIMATE_NUMBER_FORMAT = buildDocumentNumberFormat("EST", 4)
export const DEFAULT_INVOICE_NUMBER_FORMAT = buildDocumentNumberFormat("INV", 4)

export function clampDocumentNumberDigits(raw: unknown, fallback: DocumentNumberDigitCount = 4): DocumentNumberDigitCount {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw.trim(), 10) : NaN
  if (n === 3 || n === 4 || n === 5 || n === 6) return n
  return fallback
}

/** Pull digit length from a legacy `{###}` / `{####}` token in a format string. */
export function extractDigitsFromFormat(format: string, fallback: DocumentNumberDigitCount = 4): DocumentNumberDigitCount {
  const m = format.match(/\{(#{2,8})\}/)
  if (!m?.[1]) return fallback
  return clampDocumentNumberDigits(m[1].length, fallback)
}

export function parseDocumentNumberSettings(
  meta: Record<string, unknown>,
  kind: DocumentNumberKind,
): DocumentNumberFormatSettings {
  const defaults = KIND_DEFAULTS[kind]
  const storedFormat =
    typeof meta[defaults.formatKey] === "string" && String(meta[defaults.formatKey]).trim()
      ? String(meta[defaults.formatKey]).trim().slice(0, 80)
      : null
  const prefix =
    typeof meta[defaults.prefixKey] === "string" && String(meta[defaults.prefixKey]).trim()
      ? String(meta[defaults.prefixKey]).trim().slice(0, 24)
      : defaults.prefix
  const sequenceDigits =
    meta[defaults.digitsKey] != null
      ? clampDocumentNumberDigits(meta[defaults.digitsKey], defaults.digits)
      : storedFormat
        ? extractDigitsFromFormat(storedFormat, defaults.digits)
        : defaults.digits
  const seqRaw = meta[defaults.seqKey]
  let nextSequence = 1
  if (typeof seqRaw === "number" && Number.isFinite(seqRaw) && seqRaw >= 1) nextSequence = Math.floor(seqRaw)
  else if (typeof seqRaw === "string" && /^\d+$/.test(seqRaw.trim())) nextSequence = Math.max(1, parseInt(seqRaw.trim(), 10))

  return {
    format: buildDocumentNumberFormat(prefix, sequenceDigits),
    prefix,
    sequenceDigits,
    nextSequence,
    // Default ON when prefix/digits were configured; otherwise require explicit apply checkbox.
    enabled: meta[defaults.enabledKey] === true || meta[defaults.enabledKey] === "true",
  }
}

export function formatDocumentNumber(
  settings: DocumentNumberFormatSettings,
  when: Date = new Date(),
  sequenceOverride?: number,
): string {
  const seq = sequenceOverride ?? settings.nextSequence
  const digits = settings.sequenceDigits ?? extractDigitsFromFormat(settings.format, 4)
  const prefix = (settings.prefix ?? "").trim()
  const padded = String(seq).padStart(digits, "0")
  // Prefer the simple Prefix-#### model. Fall back to token expand only if format
  // still contains date tokens from an older custom string.
  const format = settings.format || buildDocumentNumberFormat(prefix || "DOC", digits)
  if (/\{YYYY\}|\{YY\}|\{MM\}|\{DD\}|\{SEQ\}/i.test(format) && format.includes("{")) {
    const yyyy = String(when.getFullYear())
    const yy = yyyy.slice(-2)
    const mm = String(when.getMonth() + 1).padStart(2, "0")
    const dd = String(when.getDate()).padStart(2, "0")
    let out = format
    out = out.replace(/\{PREFIX\}/gi, prefix)
    out = out.replace(/\{YYYY\}/g, yyyy)
    out = out.replace(/\{YY\}/g, yy)
    out = out.replace(/\{MM\}/g, mm)
    out = out.replace(/\{DD\}/g, dd)
    out = out.replace(/\{SEQ\}/gi, String(seq))
    out = out.replace(/\{(#+)\}/g, (_, hashes: string) => String(seq).padStart(hashes.length, "0"))
    return out.trim().slice(0, 64) || padded
  }
  return (prefix ? `${prefix}-${padded}` : padded).slice(0, 64)
}

/** Persist simple numbering fields (+ derived format) into profile metadata. */
export function applyDocumentNumberSettingsToMeta(
  meta: Record<string, unknown>,
  kind: DocumentNumberKind,
  input: {
    prefix: string
    sequenceDigits: DocumentNumberDigitCount
    nextSequence?: number
    enabled?: boolean
  },
): Record<string, unknown> {
  const defaults = KIND_DEFAULTS[kind]
  const prefix = input.prefix.trim().slice(0, 24) || defaults.prefix
  const sequenceDigits = clampDocumentNumberDigits(input.sequenceDigits, defaults.digits)
  const next: Record<string, unknown> = {
    ...meta,
    [defaults.prefixKey]: prefix,
    [defaults.digitsKey]: sequenceDigits,
    [defaults.formatKey]: buildDocumentNumberFormat(prefix, sequenceDigits),
    [defaults.enabledKey]: input.enabled === true,
  }
  if (typeof input.nextSequence === "number" && Number.isFinite(input.nextSequence) && input.nextSequence >= 1) {
    next[defaults.seqKey] = Math.floor(input.nextSequence)
  } else if (typeof meta[defaults.seqKey] !== "number") {
    next[defaults.seqKey] = 1
  }
  return next
}

/** Advance sequence in profile metadata after assigning a number. */
export function bumpDocumentNumberMeta(
  meta: Record<string, unknown>,
  kind: DocumentNumberKind,
  usedSequence: number,
): Record<string, unknown> {
  const seqKey = KIND_DEFAULTS[kind].seqKey
  return { ...meta, [seqKey]: Math.max(1, Math.floor(usedSequence) + 1) }
}
