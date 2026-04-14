/** Product tiers for pricing page + signup `signup_extras.product_package`. */

/** sessionStorage key: cold navigation from /pricing → / opens signup with preset package. */
export const SIGNUP_PRODUCT_PACKAGE_STORAGE_KEY = "tradesman_signup_product_package"

export type ProductPackageId = "base" | "office_manager_entry" | "office_manager_pro" | "office_manager_elite"

export const PRODUCT_PACKAGE_IDS: ProductPackageId[] = [
  "base",
  "office_manager_entry",
  "office_manager_pro",
  "office_manager_elite",
]

export const PRODUCT_PACKAGES: {
  id: ProductPackageId
  title: string
  priceLine: string
}[] = [
  { id: "base", title: "Base Package", priceLine: "$124.99/month + applicable taxes and fees*" },
  { id: "office_manager_entry", title: "Office Manager Entry Level", priceLine: "$159.99/month + applicable taxes and fees*" },
  { id: "office_manager_pro", title: "Office Manager Pro", priceLine: "$199.99/month + applicable taxes and fees*" },
  { id: "office_manager_elite", title: "Office Manager Elite", priceLine: "$369.99/month + applicable taxes and fees*" },
]

const LABEL_BY_ID: Record<ProductPackageId, string> = {
  base: "Base Package — $124.99/mo",
  office_manager_entry: "Office Manager Entry Level — $159.99/mo",
  office_manager_pro: "Office Manager Pro — $199.99/mo",
  office_manager_elite: "Office Manager Elite — $369.99/mo",
}

export function labelForProductPackageId(id: string | null | undefined): string {
  if (!id || typeof id !== "string") return ""
  if (PRODUCT_PACKAGE_IDS.includes(id as ProductPackageId)) return LABEL_BY_ID[id as ProductPackageId]
  return id
}

/** Query param / sessionStorage token (short, URL-safe). */
export const PRODUCT_PACKAGE_QUERY_VALUES: Record<ProductPackageId, string> = {
  base: "base",
  office_manager_entry: "om-entry",
  office_manager_pro: "om-pro",
  office_manager_elite: "om-elite",
}

const QUERY_TO_ID = Object.fromEntries(
  (Object.keys(PRODUCT_PACKAGE_QUERY_VALUES) as ProductPackageId[]).map((id) => [
    PRODUCT_PACKAGE_QUERY_VALUES[id],
    id,
  ]),
) as Record<string, ProductPackageId>

export function productPackageIdFromQueryParam(param: string | null): ProductPackageId | null {
  if (!param || typeof param !== "string") return null
  const t = param.trim().toLowerCase()
  return QUERY_TO_ID[t] ?? null
}
