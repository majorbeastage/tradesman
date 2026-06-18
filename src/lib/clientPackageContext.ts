import type { PortalConfig } from "../types/portal-builder"
import { isOperationsPackageEnabled } from "../types/portal-builder"
import type { UserRole } from "../contexts/AuthContext"
import {
  labelForProductPackageId,
  type ProductPackageId,
  PRODUCT_PACKAGE_IDS,
} from "./productPackages"
import { PRODUCT_PACKAGE_TO_BILLING } from "./subscriptionEntitlements"
import { billingProductLabel, isBillingProductTypeId } from "./billingProductTypes"

export type ClientPackageContext = {
  packageId: ProductPackageId | null
  packageLabel: string
  billingProductType: string | null
  isCorporate: boolean
  hasOperations: boolean
  isEstimateToolsOnly: boolean
  accountRole: UserRole | null
}

function packageIdFromBillingType(billing: string): ProductPackageId | null {
  for (const id of PRODUCT_PACKAGE_IDS) {
    if (PRODUCT_PACKAGE_TO_BILLING[id] === billing) return id
  }
  return null
}

function resolvePackageId(
  metadata: Record<string, unknown> | null | undefined,
  portalConfig: PortalConfig | null | undefined,
): ProductPackageId | null {
  const metaPkg = metadata?.product_package
  if (typeof metaPkg === "string" && PRODUCT_PACKAGE_IDS.includes(metaPkg as ProductPackageId)) {
    return metaPkg as ProductPackageId
  }
  const billing = metadata?.billing_product_type
  if (typeof billing === "string" && isBillingProductTypeId(billing)) {
    const fromBilling = packageIdFromBillingType(billing)
    if (fromBilling) return fromBilling
  }
  if (portalConfig?.corporate_package === true) return "corporate"
  if (portalConfig?.estimate_tools_only_package === true) return "estimate_tools_only"
  return null
}

/** Product package + entitlements snapshot for Setup Guide and platform assistant. */
export function resolveClientPackage(
  metadata: Record<string, unknown> | null | undefined,
  portalConfig: PortalConfig | null | undefined,
  accountRole?: UserRole | null,
): ClientPackageContext {
  const packageId = resolvePackageId(metadata, portalConfig)
  const billingRaw = metadata?.billing_product_type
  const billingProductType = typeof billingRaw === "string" ? billingRaw : null
  const isCorporate = packageId === "corporate" || portalConfig?.corporate_package === true
  const isEstimateToolsOnly =
    packageId === "estimate_tools_only" || portalConfig?.estimate_tools_only_package === true
  const hasOperations = isOperationsPackageEnabled(portalConfig)
  const packageLabel = packageId
    ? labelForProductPackageId(packageId)
    : billingProductType
      ? billingProductLabel(billingProductType)
      : isCorporate
        ? "Corporate"
        : isEstimateToolsOnly
          ? "Estimate Tools only"
          : "Standard contractor package"

  return {
    packageId,
    packageLabel,
    billingProductType,
    isCorporate,
    hasOperations,
    isEstimateToolsOnly,
    accountRole: accountRole ?? null,
  }
}

/** Short paragraph for LLM / assistant catalog. */
export function buildClientPackageAssistantSummary(ctx: ClientPackageContext): string {
  const lines: string[] = []
  lines.push("## Account product package")
  lines.push("")
  lines.push(`**${ctx.packageLabel}**${ctx.packageId ? ` (\`${ctx.packageId}\`)` : ""}.`)
  if (ctx.accountRole) {
    lines.push(`Signed-in role: **${ctx.accountRole}**.`)
  }
  if (ctx.isEstimateToolsOnly) {
    lines.push("- Estimate Tools only — Estimates + Payments focus; Customers and Scheduling are limited.")
  } else if (ctx.isCorporate) {
    lines.push("- Corporate package — Operations hub (work orders, POs, inventory, team management), organization chart, and business workflow.")
    lines.push("- Corporate roles: **Corporate Management** (oversight), **Corporate External** (field users with business phone), **Corporate Internal** (back-office without assigned phone).")
  } else if (ctx.hasOperations) {
    lines.push("- Operations tab enabled — work orders, purchase orders, inventory, and team management.")
  }
  if (!ctx.isEstimateToolsOnly) {
    lines.push("- Optional **call screening** on My T — AI or recorded menu before forwarding (off by default; whisper/forward unchanged when disabled).")
  }
  return lines.join("\n")
}
