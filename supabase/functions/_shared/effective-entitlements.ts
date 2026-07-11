/** Edge-safe entitlements resolver (mirrors src/lib/effectiveEntitlements.ts). */

import type { ProductPackageId } from "./onboarding-packages.ts"

export type PackageEntitlementsEdge = {
  maxUsers: number
  maxOfficeManagers: number
  maxInternalUsersWithoutPhone?: number
  maxExternalUsersWithPhone?: number
  teamMemberSlots: number
  officeManagerInviteLimit: number
  userInviteLimit: number
}

const PACKAGE_ENTITLEMENTS: Record<ProductPackageId, PackageEntitlementsEdge> = {
  estimate_tools_only: { maxUsers: 1, maxOfficeManagers: 0, teamMemberSlots: 0, officeManagerInviteLimit: 0, userInviteLimit: 0 },
  base: { maxUsers: 1, maxOfficeManagers: 0, teamMemberSlots: 0, officeManagerInviteLimit: 0, userInviteLimit: 0 },
  office_manager_entry: { maxUsers: 2, maxOfficeManagers: 1, teamMemberSlots: 1, officeManagerInviteLimit: 0, userInviteLimit: 1 },
  office_manager_pro: { maxUsers: 5, maxOfficeManagers: 1, teamMemberSlots: 4, officeManagerInviteLimit: 0, userInviteLimit: 4 },
  office_manager_elite: { maxUsers: 10, maxOfficeManagers: 2, teamMemberSlots: 9, officeManagerInviteLimit: 1, userInviteLimit: 8 },
  corporate: {
    maxUsers: 23,
    maxOfficeManagers: 3,
    maxInternalUsersWithoutPhone: 10,
    maxExternalUsersWithPhone: 10,
    teamMemberSlots: 22,
    officeManagerInviteLimit: 2,
    userInviteLimit: 20,
  },
}

const BILLING_TO_PACKAGE: Record<string, ProductPackageId> = {
  estimate_tools_only: "estimate_tools_only",
  basic_package: "base",
  om_entry: "office_manager_entry",
  om_pro: "office_manager_pro",
  om_elite: "office_manager_elite",
  corporate: "corporate",
}

function applyAddOns(ent: PackageEntitlementsEdge, additional: string[]): PackageEntitlementsEdge {
  const next = { ...ent }
  for (const raw of additional) {
    switch (raw) {
      case "additional_office_manager":
        next.maxUsers += 1
        next.maxOfficeManagers += 1
        break
      case "additional_external_user":
        next.maxUsers += 1
        if (next.maxExternalUsersWithPhone != null) next.maxExternalUsersWithPhone += 1
        break
      case "additional_internal_user":
        next.maxUsers += 1
        if (next.maxInternalUsersWithoutPhone != null) next.maxInternalUsersWithoutPhone += 1
        break
      default:
        break
    }
  }
  next.teamMemberSlots = Math.max(0, next.maxUsers - 1)
  next.officeManagerInviteLimit = Math.max(0, next.maxOfficeManagers - 1)
  next.userInviteLimit = Math.max(0, next.maxUsers - next.maxOfficeManagers)
  return next
}

export function resolveEffectiveEntitlementsFromMetadata(metadata: Record<string, unknown> | null | undefined): PackageEntitlementsEdge {
  const meta = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {}
  let packageId: ProductPackageId | null = null
  const rawPkg = meta.product_package
  if (typeof rawPkg === "string" && rawPkg in PACKAGE_ENTITLEMENTS) packageId = rawPkg as ProductPackageId
  const billing = meta.billing_product_type
  if (!packageId && typeof billing === "string") packageId = BILLING_TO_PACKAGE[billing] ?? null
  const base = packageId ? PACKAGE_ENTITLEMENTS[packageId] : PACKAGE_ENTITLEMENTS.base
  const additional = Array.isArray(meta.billing_additional_products)
    ? meta.billing_additional_products.filter((x): x is string => typeof x === "string")
    : []
  return applyAddOns(base, additional)
}

export function shellSlotCountFromMetadata(metadata: Record<string, unknown> | null | undefined): number {
  return resolveEffectiveEntitlementsFromMetadata(metadata).teamMemberSlots
}
