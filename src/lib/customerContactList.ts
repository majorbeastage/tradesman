import type { CustomerIdentifierRow } from "./customerIdentifiers"
import { formatDisplayText } from "./formatDisplayText"

const PHONE_TYPES = ["phone", "additional_phone"] as const
const EMAIL_TYPES = ["email", "additional_email"] as const

function valuesForTypes(identifiers: CustomerIdentifierRow[] | null | undefined, types: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of identifiers ?? []) {
    const type = String(row.type ?? "").toLowerCase()
    if (!types.includes(type)) continue
    const v = formatDisplayText(row.value, "")
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

export function listCustomerPhoneValues(identifiers: CustomerIdentifierRow[] | null | undefined): string[] {
  return valuesForTypes(identifiers, PHONE_TYPES)
}

export function listCustomerEmailValues(identifiers: CustomerIdentifierRow[] | null | undefined): string[] {
  return valuesForTypes(identifiers, EMAIL_TYPES)
}

export function pickDefaultContactValue(options: string[], preferred?: string): string {
  const pref = preferred?.trim()
  if (pref && options.includes(pref)) return pref
  return options[0]?.trim() ?? ""
}
