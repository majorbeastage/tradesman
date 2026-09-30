export type DocumentVisualStyle = "basic" | "graphical"

export const DEFAULT_DOCUMENT_PRIMARY_COLOR = "#1B4F72"
export const DEFAULT_DOCUMENT_SECONDARY_COLOR = "#5DADE2"

export type DocumentVisualTemplateSettings = {
  style: DocumentVisualStyle
  primaryColor: string
  secondaryColor: string
}

const KIND_KEYS = {
  invoice: {
    style: "invoice_template_layout",
    primary: "invoice_template_primary_color",
    secondary: "invoice_template_secondary_color",
  },
  receipt: {
    style: "receipt_template_layout",
    primary: "receipt_template_primary_color",
    secondary: "receipt_template_secondary_color",
  },
} as const

export function normalizeHexColor(raw: unknown, fallback: string): string {
  const s = typeof raw === "string" ? raw.trim() : ""
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return `#${s.slice(1).toUpperCase()}`
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toUpperCase()}`
  return fallback
}

export function parseDocumentVisualTemplate(
  meta: Record<string, unknown>,
  kind: keyof typeof KIND_KEYS,
): DocumentVisualTemplateSettings {
  const keys = KIND_KEYS[kind]
  const styleValue = meta[keys.style]
  const styleRaw = typeof styleValue === "string" ? styleValue.trim().toLowerCase() : ""
  return {
    style: styleRaw === "graphical" ? "graphical" : "basic",
    primaryColor: normalizeHexColor(meta[keys.primary], DEFAULT_DOCUMENT_PRIMARY_COLOR),
    secondaryColor: normalizeHexColor(meta[keys.secondary], DEFAULT_DOCUMENT_SECONDARY_COLOR),
  }
}

export function applyDocumentVisualTemplate(
  meta: Record<string, unknown>,
  kind: keyof typeof KIND_KEYS,
  input: DocumentVisualTemplateSettings,
): Record<string, unknown> {
  const keys = KIND_KEYS[kind]
  return {
    ...meta,
    [keys.style]: input.style === "graphical" ? "graphical" : "basic",
    [keys.primary]: normalizeHexColor(input.primaryColor, DEFAULT_DOCUMENT_PRIMARY_COLOR),
    [keys.secondary]: normalizeHexColor(input.secondaryColor, DEFAULT_DOCUMENT_SECONDARY_COLOR),
  }
}
