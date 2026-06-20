/** Vendor / outsourced contacts — shared by org chart and business workflow routing. */

export type ExternalContact = {
  id: string
  displayName: string
  email?: string | null
  phone?: string | null
  company?: string | null
  /** e.g. Parts vendor, Outsourced technician, External accounting */
  role?: string | null
  department?: string | null
  notes?: string | null
}

export type ExternalContactsDoc = {
  v: 1
  contacts: ExternalContact[]
  updated_at: string
}

export const EXTERNAL_CONTACTS_META_KEY = "external_contacts_v1"

export function createExampleExternalContacts(): ExternalContactsDoc {
  const now = new Date().toISOString()
  return {
    v: 1,
    updated_at: now,
    contacts: [
      {
        id: "ext-parts-supplier",
        displayName: "Metro Parts Supply",
        email: "orders@metro-parts.example.invalid",
        phone: "(555) 410-2200",
        company: "Metro Parts Supply",
        role: "Parts vendor",
        department: "Parts",
      },
      {
        id: "ext-field-tech",
        displayName: "Sam Rivera Contracting",
        email: "dispatch@sam-rivera.example.invalid",
        phone: "(555) 410-3300",
        company: "Sam Rivera Contracting",
        role: "Outsourced technician",
        department: "Field",
      },
      {
        id: "ext-accounting",
        displayName: "LedgerPro Bookkeeping",
        email: "ap@ledgerpro.example.invalid",
        company: "LedgerPro Bookkeeping",
        role: "External accounting",
        department: "Accounting",
      },
    ],
  }
}

function parseContact(raw: unknown): ExternalContact | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === "string" ? o.id.trim() : ""
  const displayName = typeof o.displayName === "string" ? o.displayName.trim() : ""
  if (!id || !displayName) return null
  return {
    id,
    displayName,
    email: typeof o.email === "string" ? o.email.trim() || null : null,
    phone: typeof o.phone === "string" ? o.phone.trim() || null : null,
    company: typeof o.company === "string" ? o.company.trim() || null : null,
    role: typeof o.role === "string" ? o.role.trim() || null : null,
    department: typeof o.department === "string" ? o.department.trim() || null : null,
    notes: typeof o.notes === "string" ? o.notes.trim() || null : null,
  }
}

export function parseExternalContacts(raw: unknown): ExternalContactsDoc | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (o.v !== 1 || !Array.isArray(o.contacts)) return null
  const contacts: ExternalContact[] = []
  for (const row of o.contacts) {
    const c = parseContact(row)
    if (c) contacts.push(c)
  }
  return {
    v: 1,
    contacts,
    updated_at: typeof o.updated_at === "string" ? o.updated_at : new Date().toISOString(),
  }
}

export function loadExternalContactsFromMetadata(metadata: unknown): ExternalContactsDoc {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return createExampleExternalContacts()
  }
  const raw = (metadata as Record<string, unknown>)[EXTERNAL_CONTACTS_META_KEY]
  return parseExternalContacts(raw) ?? createExampleExternalContacts()
}

export function mergeExternalContactsMetadata(
  prevMeta: Record<string, unknown>,
  doc: ExternalContactsDoc,
): Record<string, unknown> {
  return {
    ...prevMeta,
    [EXTERNAL_CONTACTS_META_KEY]: { ...doc, v: 1, updated_at: new Date().toISOString() },
  }
}

export function externalContactById(doc: ExternalContactsDoc, id: string | null | undefined): ExternalContact | null {
  if (!id?.trim()) return null
  return doc.contacts.find((c) => c.id === id.trim()) ?? null
}

export function newExternalContact(displayName: string): ExternalContact {
  return {
    id: `ext-${crypto.randomUUID().slice(0, 8)}`,
    displayName: displayName.trim() || "External contact",
  }
}
