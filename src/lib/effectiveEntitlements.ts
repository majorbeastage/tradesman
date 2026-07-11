/**
 * Resolve effective subscription entitlements from signup package + admin billing lines.
 * Single source for pricing → Billing & Helcim → MyT Team Members seat math.
 */

import type { BillingProductTypeId } from "./billingProductTypes"
import { isBillingProductTypeId, sumMonthlyBillingUsd } from "./billingProductTypes"
import { parseBillingMetadata } from "./billingProfileMetadata"
import type { ProductPackageId } from "./productPackages"
import { labelForProductPackageId, PRODUCT_PACKAGE_IDS } from "./productPackages"
import {
  PACKAGE_ENTITLEMENTS,
  PRODUCT_PACKAGE_TO_BILLING,
  type PackageEntitlements,
} from "./subscriptionEntitlements"

export type EffectiveEntitlements = PackageEntitlements & {
  packageId: ProductPackageId | null
  packageLabel: string
  billingProductType: BillingProductTypeId | null
  /** Team invite slots excluding the account owner. */
  teamMemberSlots: number
  /** Additional office manager invites beyond the owner. */
  officeManagerInviteLimit: number
  /** Field / external user invite slots. */
  userInviteLimit: number
  /** Human-readable seat line (matches pricing page). */
  seatSummaryLabel: string
}

const BILLING_TO_PACKAGE: Partial<Record<BillingProductTypeId, ProductPackageId>> = {
  estimate_tools_only: "estimate_tools_only",
  basic_package: "base",
  om_entry: "office_manager_entry",
  om_pro: "office_manager_pro",
  om_elite: "office_manager_elite",
  corporate: "corporate",
}

function cloneEntitlements(ent: PackageEntitlements): PackageEntitlements {
  return { ...ent }
}

function resolveBasePackageId(metadata: Record<string, unknown>): ProductPackageId | null {
  const rawPkg = metadata.product_package
  if (typeof rawPkg === "string" && PRODUCT_PACKAGE_IDS.includes(rawPkg as ProductPackageId)) {
    return rawPkg as ProductPackageId
  }
  const billing = metadata.billing_product_type
  if (typeof billing === "string" && isBillingProductTypeId(billing)) {
    return BILLING_TO_PACKAGE[billing] ?? null
  }
  return null
}

function applyBillingAddOns(ent: PackageEntitlements, additional: string[]): PackageEntitlements {
  const next = cloneEntitlements(ent)
  for (const raw of additional) {
    if (!isBillingProductTypeId(raw)) continue
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
  return next
}

function formatSeatSummaryLabel(packageId: ProductPackageId | null, ent: PackageEntitlements): string {
  if (packageId === "corporate" || (ent.maxInternalUsersWithoutPhone != null && ent.maxExternalUsersWithPhone != null)) {
    const om = ent.maxOfficeManagers
    const ext = ent.maxExternalUsersWithPhone ?? 0
    const internal = ent.maxInternalUsersWithoutPhone ?? 0
    return `${om} office manager${om === 1 ? "" : "s"} · ${ext} external · ${internal} internal`
  }
  if (ent.maxOfficeManagers > 0) {
    const users = Math.max(0, ent.maxUsers - ent.maxOfficeManagers)
    const om = ent.maxOfficeManagers
    return `${om} office manager${om === 1 ? "" : "s"} · ${users} user${users === 1 ? "" : "s"}`
  }
  const total = ent.maxUsers
  return `${total} user sign-in${total === 1 ? "" : "s"}`
}

/** Resolve entitlements from profile metadata (product_package + billing_product_type + add-ons). */
export function resolveEffectiveEntitlements(metadata: Record<string, unknown> | null | undefined): EffectiveEntitlements {
  const meta = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {}
  const billing = parseBillingMetadata(meta)
  const packageId = resolveBasePackageId(meta)
  const base = packageId ? PACKAGE_ENTITLEMENTS[packageId] : PACKAGE_ENTITLEMENTS.base
  const ent = applyBillingAddOns(base, billing.billing_additional_products ?? [])

  const billingProductType =
    billing.billing_product_type && isBillingProductTypeId(billing.billing_product_type)
      ? billing.billing_product_type
      : packageId
        ? PRODUCT_PACKAGE_TO_BILLING[packageId]
        : null

  const monthlyFromBilling = sumMonthlyBillingUsd(billing.billing_product_type, billing.billing_additional_products)
  const monthlyUsd = monthlyFromBilling > 0 ? monthlyFromBilling : ent.monthlyUsd

  const teamMemberSlots = Math.max(0, ent.maxUsers - 1)
  const officeManagerInviteLimit = Math.max(0, ent.maxOfficeManagers - 1)
  const userInviteLimit = Math.max(0, ent.maxUsers - ent.maxOfficeManagers)

  const packageLabel = packageId
    ? labelForProductPackageId(packageId)
    : billingProductType
      ? billingProductType
      : "Standard contractor package"

  return {
    ...ent,
    monthlyUsd,
    packageId,
    packageLabel,
    billingProductType,
    teamMemberSlots,
    officeManagerInviteLimit,
    userInviteLimit,
    seatSummaryLabel: formatSeatSummaryLabel(packageId, ent),
  }
}

/** Open shell invite rows to seed at signup (excludes account owner seat). */
export function shellSlotCountForMetadata(metadata: Record<string, unknown> | null | undefined): number {
  return resolveEffectiveEntitlements(metadata).teamMemberSlots
}

export function shellSlotCountForPackage(packageId: ProductPackageId): number {
  return resolveEffectiveEntitlements({ product_package: packageId }).teamMemberSlots
}
