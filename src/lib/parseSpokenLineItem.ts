/**
 * Rules-first parse for voice/text line item creation (Estimates library + job-type wizard).
 * Optimized for “wow that was simple” defaults — titles, qty, $/unit, and unit labels.
 */

export type LineUnitBasis = string

export type ParsedSpokenLineItem = {
  title: string
  description: string
  quantity: number
  unit_price: number
  unit_basis: LineUnitBasis
  line_kind: string
  minimum_line_total?: number
  minimum_quantity?: number
}

const KNOWN_UNITS: Array<{ re: RegExp; basis: string; singular: string; plural: string }> = [
  { re: /\b(acres?|ac)\b/i, basis: "acres", singular: "Acre", plural: "Acres" },
  { re: /\b(square\s*feet|sq\.?\s*ft\.?|sqft)\b/i, basis: "sqft", singular: "Sq Ft", plural: "Sq Ft" },
  { re: /\b(square\s*yards?|sq\.?\s*yd\.?)\b/i, basis: "sqyd", singular: "Sq Yd", plural: "Sq Yd" },
  { re: /\b(miles?|mi)\b/i, basis: "miles", singular: "Mile", plural: "Miles" },
  { re: /\b(hours?|hrs?)\b/i, basis: "hours", singular: "Hour", plural: "Hours" },
  { re: /\b(gallons?|gal)\b/i, basis: "gallons", singular: "Gallon", plural: "Gallons" },
  { re: /\b(loads?)\b/i, basis: "loads", singular: "Load", plural: "Loads" },
  { re: /\b(yards?|yds?)\b/i, basis: "yards", singular: "Yard", plural: "Yards" },
  { re: /\b(tons?)\b/i, basis: "tons", singular: "Ton", plural: "Tons" },
  { re: /\b(bags?)\b/i, basis: "bags", singular: "Bag", plural: "Bags" },
  { re: /\b(trees?)\b/i, basis: "trees", singular: "Tree", plural: "Trees" },
  { re: /\b(rooms?)\b/i, basis: "rooms", singular: "Room", plural: "Rooms" },
  { re: /\b(each|ea|units?|pcs?|pieces?)\b/i, basis: "each", singular: "Each", plural: "Each" },
]

export const COMMON_LINE_UNITS: Array<{ id: string; label: string }> = [
  { id: "hours", label: "Hours" },
  { id: "miles", label: "Miles" },
  { id: "each", label: "Each" },
  { id: "acres", label: "Acres" },
  { id: "sqft", label: "Sq Ft" },
  { id: "sqyd", label: "Sq Yd" },
  { id: "yards", label: "Yards" },
  { id: "gallons", label: "Gallons" },
  { id: "loads", label: "Loads" },
  { id: "tons", label: "Tons" },
  { id: "bags", label: "Bags" },
  { id: "trees", label: "Trees" },
  { id: "rooms", label: "Rooms" },
]

function titleCaseWords(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^(of|to|per|and|or|a|an)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ")
}

function detectUnit(text: string): { basis: string; singular: string; plural: string } | null {
  for (const u of KNOWN_UNITS) {
    if (u.re.test(text)) return { basis: u.basis, singular: u.singular, plural: u.plural }
  }
  return null
}

function detectQuantity(text: string, unit: { basis: string } | null): number {
  if (unit) {
    const nearUnit =
      text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:${unit.basis}|acre|acres|ac|mile|miles|mi|hour|hours|hrs?|gallon|gallons|gal|load|loads|yard|yards|yds?|ton|tons|bag|bags|tree|trees|room|rooms|sq\\.?\\s*ft|sqft|each|ea)`, "i")) ??
      text.match(/(\d+(?:\.\d+)?)\s*(?:acres?|ac|miles?|mi|hours?|hrs?|gallons?|gal|loads?|yards?|yds?|tons?|bags?|trees?|rooms?|sq\.?\s*ft\.?|sqft|each|ea)\b/i)
    if (nearUnit) return Number.parseFloat(nearUnit[1]) || 1
  }
  const generic = text.match(/\b(\d+(?:\.\d+)?)\b/)
  if (generic) {
    const n = Number.parseFloat(generic[1])
    // Avoid treating the dollar amount as quantity when it's the only number beside price
    if (Number.isFinite(n) && n > 0 && n < 10000) return n
  }
  return 1
}

function detectPrice(text: string): number {
  const dollar = text.match(/\$\s*(\d+(?:\.\d{1,2})?)/)
  if (dollar) return Number.parseFloat(dollar[1]) || 0

  const dollarsWord = text.match(/(\d+(?:\.\d{1,2})?)\s*(?:dollars?|bucks?)\b/i)
  if (dollarsWord) return Number.parseFloat(dollarsWord[1]) || 0

  const centsPer = text.match(/(\d+(?:\.\d+)?)\s*(?:cents?)\s*(?:per|\/)/i)
  if (centsPer) return (Number.parseFloat(centsPer[1]) || 0) / 100

  const atRate = text.match(/(?:at|@)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i)
  if (atRate) return Number.parseFloat(atRate[1]) || 0

  // "15 dollar charge" / "15$ charge" style without $ first
  const leadingAmt = text.match(/\b(\d+(?:\.\d{1,2})?)\s*(?:dollar|usd)?\s*(?:charge|fee|cost|price|rate)\b/i)
  if (leadingAmt) return Number.parseFloat(leadingAmt[1]) || 0

  return 0
}

function buildSmartTitle(text: string, unit: { singular: string; plural: string; basis: string } | null): string {
  let working = text
    .replace(/\$\s*\d+(?:\.\d{1,2})?/g, " ")
    .replace(/\d+(?:\.\d+)?\s*(?:dollars?|bucks?|cents?)\b/gi, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(?:acres?|ac|miles?|mi|hours?|hrs?|gallons?|gal|loads?|yards?|yds?|tons?|bags?|trees?|rooms?|sq\.?\s*ft\.?|sqft|each|ea)\b/gi, " ")
    .replace(/\b\d+(?:\.\d+)?\b/g, " ")
    .replace(/\b(charge|fee|cost|price|rate|for|of|a|an|the|per|at|@)\b/gi, " ")
    .replace(/[^\w\s-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!working) {
    if (unit) return `Per ${unit.singular} Charge`
    return "Line Item"
  }

  // Prefer "Fuel and Equipment" style from remaining words
  let core = titleCaseWords(working)

  const isFuelEquip = /\b(fuel|equipment|gas|material|materials|labor|travel|mileage)\b/i.test(core)
  if (unit && isFuelEquip) {
    // "Fuel Equipment" → "Per Acre Fuel and Equipment Charge"
    core = core.replace(/\bFuel\b/i, "Fuel").replace(/\bEquipment\b/i, "Equipment")
    if (!/\band\b/i.test(core) && /\bfuel\b/i.test(core) && /\bequipment\b/i.test(core)) {
      core = core.replace(/\bfuel\b/i, "Fuel and").replace(/\s+and\s+and\s+/i, " and ")
    }
    return `Per ${unit.singular} ${core} Charge`.replace(/\s+/g, " ").trim()
  }

  if (unit && !new RegExp(`\\b${unit.singular}\\b`, "i").test(core)) {
    return `Per ${unit.singular} ${core}`.replace(/\s+/g, " ").trim()
  }

  // Flat / fee style
  if (/\b(labor|travel|mileage|material|materials|misc|permit|disposal)\b/i.test(core)) {
    return `${core} Charge`.replace(/\s+/g, " ").trim()
  }

  return core.slice(0, 120)
}

function detectLineKind(text: string): string {
  if (/\b(material|materials|parts?|supply|supplies|equipment|fuel)\b/i.test(text)) return "material"
  if (/\b(travel|mileage|gas|mile)\b/i.test(text)) return "travel"
  if (/\b(misc|fee|permit|disposal|minimum)\b/i.test(text)) return "misc"
  if (/\b(labor|hour|hrs?|man\s*hour)\b/i.test(text)) return "labor"
  return "misc"
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

  const unit = detectUnit(text)
  const unit_price = detectPrice(text)
  const quantity = detectQuantity(text, unit)
  const unit_basis = unit?.basis ?? (/\b(flat|fixed)\b/i.test(text) ? "each" : "hours")
  const line_kind = detectLineKind(text)

  let minimum_line_total: number | undefined
  let minimum_quantity: number | undefined
  const minDollar =
    text.match(/(?:minimum|min\.?|min charge)\s*(?:of\s*)?\$?\s*(\d+(?:\.\d{1,2})?)/i) ??
    text.match(/\$\s*(\d+(?:\.\d{1,2})?)\s*(?:minimum|min\.?)/i)
  if (minDollar) minimum_line_total = Number.parseFloat(minDollar[1]) || undefined
  const minQty = text.match(/(?:minimum|min\.?)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:acres?|hours?|miles?|units?|each)?/i)
  if (minQty && !minimum_line_total) {
    // If they said "minimum 60 dollar" already caught; otherwise quantity min
    if (!/\$|dollar/i.test(minQty[0])) minimum_quantity = Number.parseFloat(minQty[1]) || undefined
  }

  const title = matchedDescription ?? buildSmartTitle(text, unit)
  const description = title

  if (!title) return null
  return {
    title: title.slice(0, 120),
    description: description.slice(0, 500),
    quantity,
    unit_price,
    unit_basis,
    line_kind,
    minimum_line_total,
    minimum_quantity,
  }
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
  // Prefer splitting on sentence / semicolon / newline; keep "and" inside phrases when it's "fuel and equipment"
  const parts = raw
    .split(/[;\n]+|(?<=\d)\s*[,]\s+(?=[A-Za-z])|(?:\.\s+)(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
  const candidates = parts.length > 1 ? parts : raw.split(/[,;\n]+/).map((s) => s.trim()).filter((s) => s.length >= 4)
  const out: ParsedSpokenLineItem[] = []
  const seen = new Set<string>()
  for (const part of candidates.length ? candidates : [raw]) {
    const parsed = parseSpokenLineItem(part)
    if (!parsed) continue
    const key = `${parsed.title.toLowerCase()}|${parsed.line_kind}|${parsed.unit_basis}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(parsed)
    if (out.length >= 12) break
  }
  // If still one blob with multiple costs, try harder splits on "plus" / commas
  if (out.length <= 1 && /(?:plus|,|\/)/i.test(raw)) {
    for (const part of raw.split(/\bplus\b|\/|(?:,\s+)/i).map((s) => s.trim()).filter((s) => s.length >= 4)) {
      const parsed = parseSpokenLineItem(part)
      if (!parsed) continue
      const key = `${parsed.title.toLowerCase()}|${parsed.unit_basis}|${parsed.unit_price}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(parsed)
      if (out.length >= 12) break
    }
  }
  return out
}
