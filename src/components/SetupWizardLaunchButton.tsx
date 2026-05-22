import { useSetupWizardOptional } from "../contexts/SetupWizardContext"
import { getSetupMiniWizardDef, type SetupMiniWizardId } from "../lib/setupGuideWizards"

type Props = {
  wizardId: SetupMiniWizardId
  /** When true, only the compact “Guide” chip (for dense toolbars). */
  compact?: boolean
}

/** Launches the same mini-wizard linked from Setup Guide for this settings area. */
export default function SetupWizardLaunchButton({ wizardId, compact = false }: Props) {
  const setupWizard = useSetupWizardOptional()
  const def = getSetupMiniWizardDef(wizardId)
  if (!setupWizard || !def) return null

  return (
    <button
      type="button"
      title={`Guided setup: ${def.summary}`}
      onClick={() => setupWizard.launchWizard(wizardId)}
      style={{
        padding: compact ? "6px 10px" : "8px 12px",
        borderRadius: 6,
        border: "1px solid #6366f1",
        background: "#eef2ff",
        color: "#4338ca",
        cursor: "pointer",
        fontWeight: 700,
        fontSize: compact ? 12 : 13,
        whiteSpace: "nowrap",
      }}
    >
      {compact ? "Guide" : "Guided setup"}
    </button>
  )
}
