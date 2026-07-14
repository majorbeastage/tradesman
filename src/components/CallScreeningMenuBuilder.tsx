import { useMemo, type CSSProperties } from "react"
import { theme } from "../styles/theme"
import {
  newScreeningStepId,
  recommendedStepsWithContact,
  type VoiceScreeningStep,
  type VoiceScreeningStepKind,
} from "../lib/voiceAutoAttendant"
import { useLocale } from "../i18n/LocaleContext"

type Props = {
  mode: "ai_menu" | "recorded_menu"
  steps: VoiceScreeningStep[]
  collectContactInfo: boolean
  onChange: (steps: VoiceScreeningStep[]) => void
  onCollectContactChange: (v: boolean) => void
}

const STEP_KINDS: VoiceScreeningStepKind[] = [
  "service_intent",
  "schedule_timing",
  "caller_name",
  "callback_number",
  "sms_opt_in",
  "custom",
]

const card: CSSProperties = {
  border: `1px solid ${theme.border}`,
  borderRadius: 10,
  padding: "12px 14px",
  background: "#fff",
  display: "grid",
  gap: 10,
}

const btnSmall: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
}

const btnPrimarySmall: CSSProperties = {
  ...btnSmall,
  border: "none",
  background: theme.primary,
  color: "#fff",
}

export function CallScreeningMenuBuilder({ mode, steps, collectContactInfo, onChange, onCollectContactChange }: Props) {
  const { t } = useLocale()
  const isRecorded = mode === "recorded_menu"

  const kindLabel = useMemo(
    () =>
      ({
        service_intent: t("account.callScreening.kind.service"),
        schedule_timing: t("account.callScreening.kind.schedule"),
        caller_name: t("account.callScreening.kind.name"),
        callback_number: t("account.callScreening.kind.phone"),
        sms_opt_in: t("account.callScreening.kind.smsOptIn"),
        custom: t("account.callScreening.kind.custom"),
      }) as Record<VoiceScreeningStepKind, string>,
    [t],
  )

  function updateStep(index: number, patch: Partial<VoiceScreeningStep>) {
    onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  function moveStep(index: number, dir: -1 | 1) {
    const next = index + dir
    if (next < 0 || next >= steps.length) return
    const copy = [...steps]
    const tmp = copy[index]
    copy[index] = copy[next]
    copy[next] = tmp
    onChange(copy)
  }

  function removeStep(index: number) {
    if (steps.length <= 1) return
    onChange(steps.filter((_, i) => i !== index))
  }

  function addCustomStep() {
    onChange([
      ...steps,
      {
        id: newScreeningStepId(),
        kind: "custom",
        prompt: t("account.callScreening.customPromptPlaceholder"),
        enabled: true,
      },
    ])
  }

  function loadRecommended() {
    onChange(recommendedStepsWithContact(collectContactInfo))
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{t("account.callScreening.menuHeading")}</span>
        <button type="button" style={btnPrimarySmall} onClick={loadRecommended}>
          {t("account.callScreening.loadTemplate")}
        </button>
        <button type="button" style={btnSmall} onClick={addCustomStep}>
          {t("account.callScreening.addQuestion")}
        </button>
      </div>

      <label style={{ display: "flex", gap: 10, fontSize: 13, color: theme.text }}>
        <input type="checkbox" checked={collectContactInfo} onChange={(e) => onCollectContactChange(e.target.checked)} />
        {t("account.callScreening.collectContact")}
      </label>

      <div style={{ display: "grid", gap: 10 }}>
        {steps.map((step, index) => (
          <div key={step.id} style={card}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700 }}>
                <input
                  type="checkbox"
                  checked={step.enabled}
                  onChange={(e) => updateStep(index, { enabled: e.target.checked })}
                />
                {t("account.callScreening.questionN").replace("{n}", String(index + 1))}
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" style={btnSmall} disabled={index === 0} onClick={() => moveStep(index, -1)}>
                  ↑
                </button>
                <button type="button" style={btnSmall} disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)}>
                  ↓
                </button>
                <button type="button" style={btnSmall} disabled={steps.length <= 1} onClick={() => removeStep(index)}>
                  {t("account.callScreening.remove")}
                </button>
              </div>
            </div>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{t("account.callScreening.stepKind")}</span>
              <select
                value={step.kind}
                onChange={(e) => updateStep(index, { kind: e.target.value as VoiceScreeningStepKind })}
                style={theme.formInput}
              >
                {STEP_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {kindLabel[k]}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>
                {isRecorded ? t("account.callScreening.promptTranscript") : t("account.callScreening.promptText")}
              </span>
              <textarea
                value={step.prompt}
                onChange={(e) => updateStep(index, { prompt: e.target.value })}
                rows={3}
                style={{ ...theme.formInput, resize: "vertical", minHeight: 72 }}
                placeholder={t("account.callScreening.promptPlaceholder")}
              />
            </label>

            {isRecorded ? (
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{t("account.callScreening.recordingUrl")}</span>
                <input
                  type="url"
                  value={step.recordingUrl ?? ""}
                  onChange={(e) => updateStep(index, { recordingUrl: e.target.value.trim() || undefined })}
                  style={theme.formInput}
                  placeholder="https://…"
                />
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{t("account.callScreening.recordingUrlHelp")}</span>
              </label>
            ) : null}

            {step.kind === "schedule_timing" ? (
              <p style={{ margin: 0, fontSize: 11, color: "#0ea5e9" }}>{t("account.callScreening.serviceTokenHint")}</p>
            ) : null}
            {step.kind === "sms_opt_in" ? (
              <p style={{ margin: 0, fontSize: 11, color: "#0ea5e9" }}>{t("account.callScreening.smsOptInHint")}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
