/** Per-account department routes: `{key}-{slug}@tradesman-us.com` */
export const PLATFORM_DEPARTMENT_KEYS = [
  { key: "parts", label: "Parts" },
  { key: "scheduling", label: "Scheduling" },
  { key: "permits", label: "Permits" },
  { key: "invoices", label: "Invoices / billing" },
] as const

export type PlatformDepartmentKey = (typeof PLATFORM_DEPARTMENT_KEYS)[number]["key"]

export function departmentLocalPart(departmentKey: string, primarySlug: string): string {
  const dept = departmentKey.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")
  const slug = primarySlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")
  return `${dept}-${slug}`
}

export function departmentEmailAddress(departmentKey: string, primarySlug: string, domain = "tradesman-us.com"): string {
  return `${departmentLocalPart(departmentKey, primarySlug)}@${domain}`
}
