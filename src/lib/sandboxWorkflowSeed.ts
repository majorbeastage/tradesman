/**
 * Seeds sandbox accounts with a runnable estimate approval workflow,
 * org chart links, and external contacts for training.
 */

import { createExampleBusinessWorkflow, mergeBusinessWorkflowMetadata, type BusinessWorkflowDoc } from "./businessWorkflow"
import { createExampleOrganizationChart, mergeOrganizationChartMetadata, type OrganizationChartDoc } from "./organizationChart"
import {
  createExampleExternalContacts,
  mergeExternalContactsMetadata,
  EXTERNAL_CONTACTS_META_KEY,
} from "./externalContacts"
import { BUSINESS_WORKFLOW_META_KEY } from "./businessWorkflow"
import { ORG_CHART_META_KEY } from "./organizationChart"
import { DEFAULT_SANDBOX_DEMO_TEAM } from "./sandboxDemoTeam"
import { buildDefaultSandboxDemoLocations, mergeSandboxDemoLocationsMetadata, SANDBOX_DEMO_LOCATIONS_META_KEY } from "./sandboxDemoLocations"

export function buildSandboxWorkflowSeed(): {
  workflow: BusinessWorkflowDoc
  orgChart: OrganizationChartDoc
  externalContacts: ReturnType<typeof createExampleExternalContacts>
} {
  const externalContacts = createExampleExternalContacts()
  const orgChart = createExampleOrganizationChart()
  const workflow = createExampleBusinessWorkflow()

  const maria = DEFAULT_SANDBOX_DEMO_TEAM.find((m) => m.id.includes("maria"))
  const jake = DEFAULT_SANDBOX_DEMO_TEAM.find((m) => m.id.includes("jake"))
  const sam = DEFAULT_SANDBOX_DEMO_TEAM.find((m) => m.id.includes("sam"))
  const lee = DEFAULT_SANDBOX_DEMO_TEAM.find((m) => m.id.includes("lee"))

  const orgByLabel = (label: string) => orgChart.nodes.find((n) => n.label.toLowerCase().includes(label.toLowerCase()))

  const partsOrg = orgByLabel("parts")
  const acctOrg = orgByLabel("accounting")
  const shopOrg = orgByLabel("shop manager")
  const careOrg = orgByLabel("reception")

  if (partsOrg) {
    partsOrg.externalContactId = "ext-parts-supplier"
    partsOrg.linkedUserId = null
  }
  if (acctOrg && lee) acctOrg.linkedUserId = lee.id
  if (shopOrg && maria) shopOrg.linkedUserId = maria.id
  if (careOrg && maria) careOrg.linkedUserId = maria.id

  for (const node of workflow.nodes) {
    const l = node.label.toLowerCase()
    const orgMatch =
      l.includes("parts") ? partsOrg : l.includes("accounting") ? acctOrg : l.includes("shop manager") ? shopOrg : l.includes("reception") ? careOrg : null
    if (orgMatch) node.orgChartNodeId = orgMatch.id

    if (l.includes("parts")) {
      node.externalContactId = "ext-parts-supplier"
      node.assignedUserId = null
    } else if (l.includes("accounting")) {
      node.assignedUserId = lee?.id ?? null
    } else if (l.includes("shop manager") && l.includes("approval")) {
      node.assignedUserId = maria?.id ?? null
    } else if (l.includes("signed by shop manager")) {
      node.assignedUserId = maria?.id ?? null
    } else if (l.includes("estimate is built")) {
      node.assignedUserId = maria?.id ?? null
    } else if (l.includes("work order") || l.includes("field")) {
      node.assignedUserId = jake?.id ?? sam?.id ?? null
      if (sam) node.externalContactId = "ext-field-tech"
    }
  }

  return { workflow, orgChart, externalContacts }
}

export function mergeSandboxWorkflowSeedMetadata(prevMeta: Record<string, unknown>): Record<string, unknown> {
  if (prevMeta[BUSINESS_WORKFLOW_META_KEY] && prevMeta[ORG_CHART_META_KEY] && prevMeta[EXTERNAL_CONTACTS_META_KEY]) {
    return prevMeta
  }
  const seed = buildSandboxWorkflowSeed()
  let next = { ...prevMeta }
  if (!prevMeta[BUSINESS_WORKFLOW_META_KEY]) {
    next = mergeBusinessWorkflowMetadata(next, seed.workflow)
  }
  if (!prevMeta[ORG_CHART_META_KEY]) {
    next = mergeOrganizationChartMetadata(next, seed.orgChart)
  }
  if (!prevMeta[EXTERNAL_CONTACTS_META_KEY]) {
    next = mergeExternalContactsMetadata(next, seed.externalContacts)
  }
  if (!prevMeta[SANDBOX_DEMO_LOCATIONS_META_KEY]) {
    next = mergeSandboxDemoLocationsMetadata(next, buildDefaultSandboxDemoLocations(DEFAULT_SANDBOX_DEMO_TEAM))
  }
  return next
}
