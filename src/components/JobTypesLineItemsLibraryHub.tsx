import { useEffect, useState } from "react"
import { theme } from "../styles/theme"
import EstimatesJobSetupWizardPanel from "./EstimatesJobSetupWizardPanel"
import EstimateLineItemsLibraryPanel from "./EstimateLineItemsLibraryPanel"
import JobTypesManagerModal from "./JobTypesManagerModal"
import type { AssistantHandoffPayload } from "../lib/assistantHandoff"
import type { EstimateLinePresetRow } from "../lib/estimateLinePresets"

export type JobTypesLineItemsLibraryTab = "line_items" | "job_types"

type Props = {
  userId: string
  jobTypesButtonLabel: string
  lineItemsButtonLabel: string
  showLineItems?: boolean
  showJobTypes: boolean
  initialTab?: JobTypesLineItemsLibraryTab
  lineItemsHandoff?: AssistantHandoffPayload | null
  onDismissHandoff?: () => void
  onJobTypeFollowUp?: (jobTypeName: string, presetIds: string[]) => void
  onDataChanged?: () => void
  onLineItemsSaved?: (rows: EstimateLinePresetRow[]) => void
}

export default function JobTypesLineItemsLibraryHub({
  userId,
  jobTypesButtonLabel,
  lineItemsButtonLabel,
  showLineItems = true,
  showJobTypes,
  initialTab = "line_items",
  lineItemsHandoff = null,
  onDismissHandoff,
  onJobTypeFollowUp,
  onDataChanged,
  onLineItemsSaved,
}: Props) {
  const [tab, setTab] = useState<JobTypesLineItemsLibraryTab>(
    showLineItems ? initialTab : showJobTypes ? "job_types" : "line_items",
  )
  const [jobTypesKey, setJobTypesKey] = useState(0)

  useEffect(() => {
    if (!showLineItems && showJobTypes) setTab("job_types")
    else if (showLineItems) setTab(initialTab)
  }, [initialTab, showLineItems, showJobTypes])

  function handleWizardApplied() {
    onDataChanged?.()
    setJobTypesKey((k) => k + 1)
  }

  const tabBtn = (id: JobTypesLineItemsLibraryTab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      style={{
        padding: "8px 14px",
        borderRadius: 8,
        border: `1px solid ${theme.border}`,
        background: tab === id ? "#dbeafe" : "#fff",
        color: "#0f172a",
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <EstimatesJobSetupWizardPanel userId={userId} onApplied={handleWizardApplied} />

      {showLineItems && showJobTypes ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {tabBtn("line_items", lineItemsButtonLabel)}
          {tabBtn("job_types", jobTypesButtonLabel)}
        </div>
      ) : null}

      {tab === "line_items" && showLineItems ? (
        <EstimateLineItemsLibraryPanel
          userId={userId}
          handoff={lineItemsHandoff}
          onDismissHandoff={onDismissHandoff}
          onJobTypeFollowUp={onJobTypeFollowUp}
          onSaved={(rows) => {
            onLineItemsSaved?.(rows)
            onDataChanged?.()
          }}
        />
      ) : null}

      {tab === "job_types" && showJobTypes ? (
        <JobTypesManagerModal
          key={jobTypesKey}
          variant="inline"
          open
          onClose={() => undefined}
          userId={userId}
          title={jobTypesButtonLabel}
          estimateLineItemsLabel={lineItemsButtonLabel}
          showSetupWizard={false}
          onChanged={onDataChanged}
        />
      ) : null}
    </div>
  )
}
