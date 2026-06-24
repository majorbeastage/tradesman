import type { ProductPackageId } from "./productPackages"

export type SignupAdvisorModuleId =
  | "estimates_tool"
  | "work_order_tool"
  | "purchase_order_tool"
  | "parts_inventory_tool"
  | "organization_chart"
  | "business_workflow"

export type SignupAdvisorAnswers = {
  multipleDepartments: boolean
  departmentCount: number
  departmentsUsingTradesman: number
  employeeCount: number
  employeesUsingTradesman: number
  externalPhoneUsers: number
  hasPartsDepartment: boolean
}

export type SignupAdvisorRecommendation = {
  packageId: ProductPackageId | null
  modules: SignupAdvisorModuleId[]
  summary: string
  bullets: string[]
}

export const SIGNUP_ADVISOR_MODULE_LABELS: Record<SignupAdvisorModuleId, string> = {
  estimates_tool: "Estimates Tool",
  work_order_tool: "Work Order Tool",
  purchase_order_tool: "Purchase Order Tool",
  parts_inventory_tool: "Parts & Materials Inventory",
  organization_chart: "Organization chart",
  business_workflow: "Business workflow chart",
}

export function defaultSignupAdvisorAnswers(): SignupAdvisorAnswers {
  return {
    multipleDepartments: false,
    departmentCount: 1,
    departmentsUsingTradesman: 1,
    employeeCount: 1,
    employeesUsingTradesman: 1,
    externalPhoneUsers: 0,
    hasPartsDepartment: false,
  }
}

/** Recommend subscription tier + optional modules from onboarding questionnaire. */
export function recommendSignupProducts(answers: SignupAdvisorAnswers): SignupAdvisorRecommendation {
  const modules = new Set<SignupAdvisorModuleId>(["estimates_tool"])
  const bullets: string[] = []

  if (answers.employeesUsingTradesman >= 2 || answers.departmentsUsingTradesman >= 2) {
    modules.add("work_order_tool")
    bullets.push("Multiple departments or logins benefit from Work Orders after signed estimates.")
  }

  if (answers.hasPartsDepartment || answers.departmentsUsingTradesman >= 3) {
    modules.add("purchase_order_tool")
    modules.add("parts_inventory_tool")
    bullets.push("Parts department workflows need Purchase Orders and inventory tracking.")
  }

  if (answers.multipleDepartments && answers.departmentsUsingTradesman >= 2) {
    modules.add("organization_chart")
    modules.add("business_workflow")
    bullets.push("Organization and workflow charts help route approvals across departments.")
  }

  let packageId: ProductPackageId | null = null

  if (
    answers.employeesUsingTradesman <= 1 &&
    answers.departmentsUsingTradesman <= 1 &&
    !answers.hasPartsDepartment &&
    answers.externalPhoneUsers <= 0
  ) {
    packageId = "estimate_tools_only"
    bullets.push("Single-user estimate workflow — start with Estimate Tools only.")
  } else if (
    answers.employeesUsingTradesman >= 12 ||
    answers.departmentsUsingTradesman >= 4 ||
    answers.externalPhoneUsers >= 6 ||
    (answers.employeeCount >= 20 && answers.multipleDepartments)
  ) {
    packageId = "corporate"
    modules.add("work_order_tool")
    modules.add("purchase_order_tool")
    modules.add("parts_inventory_tool")
    modules.add("organization_chart")
    modules.add("business_workflow")
    bullets.push(
      "Corporate includes work orders, purchase orders, org chart, workflow chart, 20 users (10 internal + 10 external phone), and 3 office managers.",
    )
  } else if (answers.employeesUsingTradesman >= 6 || answers.externalPhoneUsers >= 3) {
    packageId = "office_manager_elite"
    bullets.push("Office Manager Elite fits larger teams with multiple logins and external calling.")
  } else if (answers.employeesUsingTradesman >= 3 || answers.departmentsUsingTradesman >= 2) {
    packageId = "office_manager_pro"
    bullets.push("Office Manager Pro balances team size with full customer, estimate, and scheduling tools.")
  } else if (answers.employeesUsingTradesman >= 2) {
    packageId = "office_manager_entry"
    bullets.push("Office Manager Entry adds a second login and office manager controls.")
  } else {
    packageId = "base"
    bullets.push("Base package covers solo operators who need leads, conversations, estimates, and calendar.")
  }

  const moduleList = [...modules]
  const summary =
    packageId === "corporate"
      ? "Corporate — full multi-department operations"
      : `${moduleList.map((m) => SIGNUP_ADVISOR_MODULE_LABELS[m]).join(", ")}`

  return { packageId, modules: moduleList, summary, bullets }
}

export function serializeSignupAdvisorPayload(
  answers: SignupAdvisorAnswers,
  recommendation: SignupAdvisorRecommendation,
): string {
  return JSON.stringify({ answers, recommendation })
}

export function parseSignupAdvisorPayload(raw: string | null | undefined): {
  answers: SignupAdvisorAnswers
  recommendation: SignupAdvisorRecommendation
} | null {
  if (!raw?.trim()) return null
  try {
    const o = JSON.parse(raw) as {
      answers?: SignupAdvisorAnswers
      recommendation?: SignupAdvisorRecommendation
    }
    if (!o.answers || !o.recommendation) return null
    return { answers: o.answers, recommendation: o.recommendation }
  } catch {
    return null
  }
}
