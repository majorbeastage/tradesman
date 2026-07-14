import {
  createDefaultBusinessWorkflow,
  createExampleBusinessWorkflow,
  newWorkflowEdge,
  newWorkflowNode,
  type BusinessWorkflowDoc,
} from "./businessWorkflow"
import { PLATFORM_DEPARTMENT_KEYS } from "./platformEmailDepartments"

export type WorkflowTemplateDef = {
  id: string
  label: string
  description: string
  scopeKind: "department" | "customer" | "template"
  departmentKey?: string
  build: () => BusinessWorkflowDoc
}

function deptWorkflow(title: string, steps: string[]): BusinessWorkflowDoc {
  const nodes = steps.map((label, i) => newWorkflowNode(label, i, 40 + (i % 2) * 190, 24 + i * 72))
  const edges = []
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push(newWorkflowEdge(nodes[i].id, nodes[i + 1].id, i === 1 ? "needs_approval" : "approved"))
  }
  return { v: 1, title, nodes, edges, updated_at: new Date().toISOString() }
}

export const WORKFLOW_TEMPLATE_CATALOG: WorkflowTemplateDef[] = [
  {
    id: "template-default-lifecycle",
    label: "Customer job lifecycle (default)",
    description: "Standard 7-step flow: intake → estimate → approve → schedule → complete → payment → receipt.",
    scopeKind: "template",
    build: createDefaultBusinessWorkflow,
  },
  {
    id: "template-full-intake",
    label: "Full customer intake → billing (advanced)",
    description: "Larger multi-approval example with parts, accounting, and shop manager routes.",
    scopeKind: "template",
    build: createExampleBusinessWorkflow,
  },
  {
    id: "template-estimate-only",
    label: "Estimate approval chain",
    description: "Build estimate through shop, parts, and accounting sign-off.",
    scopeKind: "template",
    build: () =>
      deptWorkflow("Estimate approval chain", [
        "Job scope captured",
        "Estimate built",
        "Parts department review",
        "Shop manager approval",
        "Accounting approval",
        "Send to customer",
      ]),
  },
  {
    id: "template-work-order",
    label: "Work order → completion",
    description: "After customer signs, schedule crew and close out the job.",
    scopeKind: "template",
    build: () =>
      deptWorkflow("Work order → completion", [
        "Customer signed estimate",
        "Work order created",
        "Resources scheduled",
        "Field work complete",
        "Receipt sent to customer",
      ]),
  },
  ...PLATFORM_DEPARTMENT_KEYS.map((dept) => ({
    id: `dept-${dept.key}`,
    label: `${dept.label} department flow`,
    description: `Standard ${dept.label.toLowerCase()} handoffs and approvals.`,
    scopeKind: "department" as const,
    departmentKey: dept.key,
    build: () => {
      const steps =
        dept.key === "parts"
          ? ["Parts request received", "Vendor quote", "PO approval", "Parts ordered", "Ready for field"]
          : dept.key === "scheduling"
            ? ["Scheduling request", "Crew availability check", "Customer confirmation", "Calendar hold", "Dispatch notice"]
            : dept.key === "permits"
              ? ["Permit scope review", "Application prepared", "Submitted to municipality", "Permit approved", "Release to field"]
              : ["Invoice draft", "Accounting review", "Sent to customer", "Payment received", "Closed in books"]
      return deptWorkflow(`${dept.label} workflow`, steps)
    },
  })),
  {
    id: "customer-residential",
    label: "Residential customer journey",
    description: "Homeowner from first call through signed estimate.",
    scopeKind: "customer",
    build: () =>
      deptWorkflow("Residential customer workflow", [
        "Homeowner intake call",
        "Site visit scheduled",
        "Estimate prepared",
        "Estimate sent to homeowner",
        "Homeowner signs",
      ]),
  },
  {
    id: "customer-commercial",
    label: "Commercial / GC customer journey",
    description: "General contractor or property manager approval path.",
    scopeKind: "customer",
    build: () =>
      deptWorkflow("Commercial customer workflow", [
        "GC / property manager intake",
        "Scope and bid review",
        "Internal estimate approval",
        "Proposal to GC",
        "PO or signed agreement",
        "Mobilize crew",
      ]),
  },
]

export function workflowTemplateById(id: string): WorkflowTemplateDef | null {
  return WORKFLOW_TEMPLATE_CATALOG.find((t) => t.id === id) ?? null
}

export function departmentTemplateOptions(): WorkflowTemplateDef[] {
  return WORKFLOW_TEMPLATE_CATALOG.filter((t) => t.scopeKind === "department")
}

export function customerTemplateOptions(): WorkflowTemplateDef[] {
  return WORKFLOW_TEMPLATE_CATALOG.filter((t) => t.scopeKind === "customer")
}

export function generalTemplateOptions(): WorkflowTemplateDef[] {
  return WORKFLOW_TEMPLATE_CATALOG.filter((t) => t.scopeKind === "template")
}
