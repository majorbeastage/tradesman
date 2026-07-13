/**
 * Rules-first parse for voice/text line item creation (Estimates library wizard).
 */

export type ParsedSpokenLineItem = {
  title: string
  description: string
  quantity: number
  unit_price: number
  unit_basis: "hours" | "each" | "miles"
  line_kind: string
}

export function parseSpokenLineItem(raw: string, knownDescriptions: string[] = []): ParsedSpokenLineItem | null {
  const text = raw.trim()
  if (text.length < 3) return null

  const lower = text.toLowerCase()
  let matchedDescription: string | undefined
  for (const desc of knownDescriptions) {
    const d = desc.trim()
    if (d.length < 3) continue
    const dl = d.toLowerCase()
    if (lower.includes(dl) || dl.includes(lower)) {
      if (!matchedDescription || d.length > matchedDescription.length) matchedDescription = d
    }
  }

  let unit_price = 0
  const dollar = text.match(/\$\s*(\d+(?:\.\d{1,2})?)/) ?? text.match(/(\d+(?:\.\d{1,2})?)\s*(?:dollars?|bucks?)\b/i)
  if (dollar) unit_price = Number.parseFloat(dollar[1]) || 0

  const atRate = text.match(/(?:at|@)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i)
  if (atRate && !unit_price) unit_price = Number.parseFloat(atRate[1]) || 0

  let quantity = 1
  const qtyHr = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i)
  const qtyEa = text.match(/(\d+(?:\.\d+)?)\s*(?:each|ea|units?)\b/i)
  const qtyMi = text.match(/(\d+(?:\.\d+)?)\s*(?:miles?|mi)\b/i)
  if (qtyHr) quantity = Number.parseFloat(qtyHr[1]) || 1
  else if (qtyEa) quantity = Number.parseFloat(qtyEa[1]) || 1
  else if (qtyMi) quantity = Number.parseFloat(qtyMi[1]) || 1

  let unit_basis: ParsedSpokenLineItem["unit_basis"] = "hours"
  if (/\b(miles?|mi)\b/i.test(text)) unit_basis = "miles"
  else if (/\b(each|ea|units?|flat)\b/i.test(text)) unit_basis = "each"

  let line_kind = "labor"
  if (/\b(material|materials|parts?|supply|supplies)\b/i.test(text)) line_kind = "materials"
  else if (/\b(misc|fee|permit|disposal)\b/i.test(text)) line_kind = "misc"

  const cleaned = text
    .replace(/\$\s*\d+(?:\.\d{1,2})?/g, "")
    .replace(/\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|each|ea|units?|miles?|mi)\b/gi, "")
    .replace(/\b(at|@)\s*\d+(?:\.\d+)?/gi, "")
    .replace(/\s+/g, " ")
    .trim()

  const title = (matchedDescription ?? cleaned).slice(0, 120) || text.slice(0, 120)
  const description = matchedDescription ?? (cleaned || title)

  if (!title) return null
  return { title, description, quantity, unit_price, unit_basis, line_kind }
}
