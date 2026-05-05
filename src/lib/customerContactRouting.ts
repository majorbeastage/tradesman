type CustomerIdentifierLike = {
  type?: string | null
  value?: string | null
}

export type ContactTarget = "primary" | "additional"

export function contactTargetLabel(target: ContactTarget): string {
  return target === "additional" ? "Additional contact" : "Primary customer"
}

function firstByType(rows: CustomerIdentifierLike[], t: string): string {
  return rows.find((r) => String(r.type ?? "").toLowerCase() === t)?.value?.trim?.() ?? ""
}

export function resolveCustomerContactByTarget(rows: CustomerIdentifierLike[], target: ContactTarget): { phone: string; email: string } {
  const primaryPhone = firstByType(rows, "phone")
  const primaryEmail = firstByType(rows, "email")
  const additionalPhone = firstByType(rows, "additional_phone")
  const additionalEmail = firstByType(rows, "additional_email")
  if (target === "additional") {
    return {
      phone: additionalPhone || primaryPhone,
      email: additionalEmail || primaryEmail,
    }
  }
  return {
    phone: primaryPhone || additionalPhone,
    email: primaryEmail || additionalEmail,
  }
}

export function readContactTargetFromMetadata(metadata: unknown): ContactTarget {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "primary"
  const raw = (metadata as Record<string, unknown>).contact_target
  return raw === "additional" ? "additional" : "primary"
}

