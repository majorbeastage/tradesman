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
  minimum_line_total?: number
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

  const centsPer = text.match(/(\d+(?:\.\d+)?)\s*(?:cents?)\s*(?:per|\/)\s*(?:mile|mi|hour|hr|each)?/i)
  if (centsPer && !unit_price) unit_price = (Number.parseFloat(centsPer[1]) || 0) / 100

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
  if (/\b(miles?|mi|travel|mileage|gas)\b/i.test(text)) unit_basis = "miles"
  else if (/\b(each|ea|units?|flat|minimum)\b/i.test(text)) unit_basis = "each"

  let line_kind = "labor"
  if (/\b(material|materials|parts?|supply|supplies|equipment|fuel)\b/i.test(text)) line_kind = "material"
  else if (/\b(travel|mileage|gas|mile)\b/i.test(text)) line_kind = "travel"
  else if (/\b(misc|fee|permit|disposal|minimum)\b/i.test(text)) line_kind = "misc"

  let minimum_line_total: number | undefined
  const minMatch =
    text.match(/(?:minimum|min\.?|min charge)\s*(?:of\s*)?\$?\s*(\d+(?:\.\d{1,2})?)/i) ??
    text.match(/\$\s*(\d+(?:\.\d{1,2})?)\s*(?:minimum|min\.?)/i)
  if (minMatch) minimum_line_total = Number.parseFloat(minMatch[1]) || undefined

  const cleaned = text
    .replace(/\$\s*\d+(?:\.\d{1,2})?/g, "")
    .replace(/\d+(?:\.\d+)?\s*(?:cents?)\b/gi, "")
    .replace(/\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|each|ea|units?|miles?|mi)\b/gi, "")
    .replace(/\b(at|@)\s*\d+(?:\.\d+)?/gi, "")
    .replace(/\s+/g, " ")
    .trim()

  const title = (matchedDescription ?? cleaned).slice(0, 120) || text.slice(0, 120)
  const description = matchedDescription ?? (cleaned || title)

  if (!title) return null
  return { title, description, quantity, unit_price, unit_basis, line_kind, minimum_line_total }
}

/** Split a free-text products/services description into candidate job type names. */
export function extractJobTypeNamesFromServicesText(raw: string): string[] {
  const text = raw.trim()
  if (!text) return []
  const chunks: string[] = []
  const working = text
    .replace(/\bi\s+(?:do|offer|provide|specialize in)\s+/gi, " ")
    .replace(/\band\b/gi, ",")
  for (const part of working.split(/[,;\n•·]+/)) {
    let item = part.trim().replace(/^(?:also|plus|including)\s+/i, "").trim()
    if (item.length < 3) continue
    if (/\b(how|what|when|please|thank)\b/i.test(item) && item.split(/\s+/).length > 8) continue
    item = item.replace(/^[a-z]/, (c) => c.toUpperCase()).slice(0, 80)
    chunks.push(item)
    if (chunks.length >= 16) break
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of chunks) {
    const key = c.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

/** Pull multiple pricing phrases into line drafts from a pricing description paragraph. */
export function parsePricingPhrasesToLineItems(raw: string): ParsedSpokenLineItem[] {
  const parts = raw
    .split(/[,;\n]+|(?:\band\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
  const out: ParsedSpokenLineItem[] = []
  const seen = new Set<string>()
  for (const part of parts.length ? parts : [raw]) {
    const parsed = parseSpokenLineItem(part)
    if (!parsed) continue
    const key = `${parsed.title.toLowerCase()}|${parsed.line_kind}|${parsed.unit_basis}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(parsed)
    if (out.length >= 12) break
  }
  return out
}
