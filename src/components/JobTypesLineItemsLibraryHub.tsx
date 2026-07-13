import { useEffect, useState } from "react"
import { theme } from "../styles/theme"
import EstimateLineItemsLibraryPanel from "./EstimateLineItemsLibraryPanel"
import JobTypesManagerModal from "./JobTypesManagerModal"
import JobTypesSetupWizardModal from "./JobTypesSetupWizardModal"
import type { AssistantHandoffPayload } from "../lib/assistantHandoff"
import type { EstimateLinePresetRow } from "../lib/estimateLinePresets"
import type { JobTypeRow } from "../lib/jobTypesApi"

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
  /** Open the setup wizard immediately when hub mounts. */
  autoOpenWizard?: boolean
  onUseJobTypeForEstimate?: (jobType: JobTypeRow) => void
  onUseJobTypeForCalendar?: (jobType: JobTypeRow) => void
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
  autoOpenWizard = false,
  onUseJobTypeForEstimate,
  onUseJobTypeForCalendar,
}: Props) {
  const [tab, setTab] = useState<JobTypesLineItemsLibraryTab>(
    showLineItems ? initialTab : showJobTypes ? "job_types" : "line_items",
  )
  const [jobTypesKey, setJobTypesKey] = useState(0)
  const [wizardOpen, setWizardOpen] = useState(autoOpenWizard)

  useEffect(() => {
    if (!showLineItems && showJobTypes) setTab("job_types")
    else if (showLineItems) setTab(initialTab)
  }, [initialTab, showLineItems, showJobTypes])

  useEffect(() => {
    if (autoOpenWizard) setWizardOpen(true)
  }, [autoOpenWizard])

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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: theme.primary,
            color: "#fff",
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Job types & line items wizard
        </button>
        {showLineItems && showJobTypes ? (
          <>
            {tabBtn("line_items", lineItemsButtonLabel)}
            {tabBtn("job_types", jobTypesButtonLabel)}
          </>
        ) : null}
      </div>

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
          onRequestCreateWizard={() => setWizardOpen(true)}
          onUseForEstimate={onUseJobTypeForEstimate}
          onUseForCalendar={onUseJobTypeForCalendar}
        />
      ) : null}

      <JobTypesSetupWizardModal
        open={wizardOpen}
        userId={userId}
        onClose={() => setWizardOpen(false)}
        onApplied={handleWizardApplied}
        onUseForEstimate={
          onUseJobTypeForEstimate
            ? (jt) => onUseJobTypeForEstimate({ id: jt.id, name: jt.name, duration_minutes: 60, description: null, color_hex: null })
            : undefined
        }
        onUseForCalendar={
          onUseJobTypeForCalendar
            ? (jt) =>
                onUseJobTypeForCalendar({
                  id: jt.id,
                  name: jt.name,
                  duration_minutes: jt.duration_minutes ?? 60,
                  description: null,
                  color_hex: null,
                })
            : undefined
        }
      />
    </div>
  )
}
