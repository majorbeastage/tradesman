import type { ProductPackageId } from "./productPackages"
import { monthlyUsdForBillingProductType, type BillingProductTypeId } from "./billingProductTypes"

/** Maps signup product_package → admin billing_product_type. */
export const PRODUCT_PACKAGE_TO_BILLING: Record<ProductPackageId, BillingProductTypeId> = {
  estimate_tools_only: "estimate_tools_only",
  base: "basic_package",
  office_manager_entry: "om_entry",
  office_manager_pro: "om_pro",
  office_manager_elite: "om_elite",
  corporate: "corporate",
}

export type PackageEntitlements = {
  monthlyUsd: number
  maxUsers: number
  maxOfficeManagers: number
  maxLeadsPerMonth: number
  voiceMinutesPerUser: number
  smsMessagesPerUser: number
  /** Corporate: internal logins without assigned phone numbers. */
  maxInternalUsersWithoutPhone?: number
  /** Corporate: external users with assigned Tradesman phone numbers. */
  maxExternalUsersWithPhone?: number
}

export const PACKAGE_ENTITLEMENTS: Record<ProductPackageId, PackageEntitlements> = {
  estimate_tools_only: {
    monthlyUsd: 49.99,
    maxUsers: 1,
    maxOfficeManagers: 0,
    maxLeadsPerMonth: 0,
    voiceMinutesPerUser: 0,
    smsMessagesPerUser: 0,
  },
  base: {
    monthlyUsd: 124.99,
    maxUsers: 1,
    maxOfficeManagers: 0,
    maxLeadsPerMonth: 5,
    voiceMinutesPerUser: 200,
    smsMessagesPerUser: 200,
  },
  office_manager_entry: {
    monthlyUsd: 159.99,
    maxUsers: 2,
    maxOfficeManagers: 1,
    maxLeadsPerMonth: 10,
    voiceMinutesPerUser: 200,
    smsMessagesPerUser: 200,
  },
  office_manager_pro: {
    monthlyUsd: 199.99,
    maxUsers: 5,
    maxOfficeManagers: 1,
    maxLeadsPerMonth: 10,
    voiceMinutesPerUser: 200,
    smsMessagesPerUser: 200,
  },
  office_manager_elite: {
    monthlyUsd: 369.99,
    maxUsers: 10,
    maxOfficeManagers: 2,
    maxLeadsPerMonth: 25,
    voiceMinutesPerUser: 200,
    smsMessagesPerUser: 200,
  },
  corporate: {
    monthlyUsd: 649.99,
    maxUsers: 23,
    maxOfficeManagers: 3,
    maxLeadsPerMonth: 50,
    voiceMinutesPerUser: 200,
    smsMessagesPerUser: 200,
    maxInternalUsersWithoutPhone: 10,
    maxExternalUsersWithPhone: 10,
  },
}

/** Days in billing month for proration (consistent 30-day cycle). */
const PRORATION_CYCLE_DAYS = 30

/**
 * Prorate monthly subscription from signup/today through selected recurring bill date.
 * billDayOfMonth: 1–28 (day of month for recurring charge).
 */
export function computeSignupProrationUsd(params: {
  packageId: ProductPackageId
  today?: Date
  billDayOfMonth: number
}): {
  monthlyUsd: number
  dueTodayUsd: number
  daysUntilBillDate: number
  billDateLabel: string
} {
  const monthlyUsd = PACKAGE_ENTITLEMENTS[params.packageId]?.monthlyUsd ?? monthlyUsdForBillingProductType(PRODUCT_PACKAGE_TO_BILLING[params.packageId])
  const today = params.today ?? new Date()
  const day = Math.min(28, Math.max(1, Math.floor(params.billDayOfMonth)))

  const billDate = new Date(today.getFullYear(), today.getMonth(), day, 12, 0, 0, 0)
  if (billDate.getTime() <= today.getTime()) {
    billDate.setMonth(billDate.getMonth() + 1)
  }

  const msPerDay = 86400000
  const daysUntilBillDate = Math.max(1, Math.ceil((billDate.getTime() - today.getTime()) / msPerDay))
  const dueTodayUsd = Math.round(((monthlyUsd * daysUntilBillDate) / PRORATION_CYCLE_DAYS) * 100) / 100
  const billDateLabel = billDate.toLocaleDateString(undefined, { dateStyle: "medium" })

  return { monthlyUsd, dueTodayUsd, daysUntilBillDate, billDateLabel }
}

export function shellUserCountForPackage(packageId: ProductPackageId): number {
  const e = PACKAGE_ENTITLEMENTS[packageId]
  if (!e) return 0
  return Math.max(0, e.maxUsers - 1)
}
