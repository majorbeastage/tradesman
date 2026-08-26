import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { theme } from "../styles/theme"
import {
  CUSTOM_AI_PROMPT_MAX_LENGTH,
  emptyCustomScreeningStep,
  inferKindFromPrompt,
  recommendedStepsWithContact,
  RECOMMENDED_SCREENING_STEPS,
  resolveStepVoiceSource,
  standardQuestionSummary,
  type VoiceMenuLayout,
  type VoiceSavedPrompt,
  type VoiceScreeningStep,
  type VoiceStepVoiceSource,
} from "../lib/voiceAutoAttendant"
import { useLocale } from "../i18n/LocaleContext"
import { transcribeAttendantAudio, voiceStudioUserRequest } from "../lib/voicePromptStudio"
import { AttendantStepRecorder } from "./AttendantStepRecorder"

type PlatformVoicePrompt = {
  id: string
  prompt_key: string
  title: string
  category: string
  script_text: string
  playback_url: string
}

type PromptCatalogItem = {
  id: string
  prompt: string
  title?: string
  voiceSource: VoiceStepVoiceSource
  recordingUrl?: string
  kind: VoiceScreeningStep["kind"]
}

type PromptFilter = "all" | "hannah" | "ai" | "own"
const CUSTOM_AI_OPTION_ID = "ai:custom"

type Props = {
  layout: VoiceMenuLayout
  steps: VoiceScreeningStep[]
  savedPrompts: VoiceSavedPrompt[]
  collectContactInfo: boolean
  onChange: (steps: VoiceScreeningStep[]) => void
  onSavedPromptsChange: (prompts: VoiceSavedPrompt[]) => void
  onCollectContactChange: (v: boolean) => void
}

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

function sourcePrefix(source: VoiceStepVoiceSource): string {
  if (source === "hannah") return "Pre Recorded Hannah"
  if (source === "own") return "User Recorded"
  return "AI Voice"
}

function formatPromptOption(item: PromptCatalogItem, showSource: boolean): string {
  const summary =
    item.title?.trim() ||
    (item.voiceSource === "ai" || item.kind !== "custom"
      ? standardQuestionSummary(item.kind, item.prompt)
      : item.prompt.replace(/\s+/g, " ").trim() || "Custom question")
  const short = summary.length > 72 ? `${summary.slice(0, 69)}…` : summary
  return showSource ? `${sourcePrefix(item.voiceSource)} — ${short}` : short
}

function catalogKey(item: Pick<PromptCatalogItem, "voiceSource" | "prompt" | "recordingUrl">): string {
  return `${item.voiceSource}|${item.recordingUrl ?? ""}|${item.prompt.trim().toLowerCase()}`
}

export function CallScreeningMenuBuilder({
  layout,
  steps,
  savedPrompts,
  collectContactInfo,
  onChange,
  onSavedPromptsChange,
  onCollectContactChange,
}: Props) {
  const { t } = useLocale()
  const isCustom = layout === "custom"
  const [platformPrompts, setPlatformPrompts] = useState<PlatformVoicePrompt[]>([])
  const [promptFilterByStep, setPromptFilterByStep] = useState<Record<string, PromptFilter>>({})
  const [transcribingId, setTranscribingId] = useState<string | null>(null)
  const stepsRef = useRef(steps)
  stepsRef.current = steps

  useEffect(() => {
    let cancelled = false
    void voiceStudioUserRequest("client-library")
      .then((payload) => {
        if (cancelled) return
        const rows = Array.isArray(payload.prompts) ? (payload.prompts as PlatformVoicePrompt[]) : []
        setPlatformPrompts(
          rows.map((row) => ({
            ...row,
            playback_url: new URL(row.playback_url, window.location.origin).toString(),
          })),
        )
      })
      .catch(() => {
        if (!cancelled) setPlatformPrompts([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const catalog = useMemo(() => {
    const items: PromptCatalogItem[] = []
    const seen = new Set<string>()
    function push(item: PromptCatalogItem) {
      const key = catalogKey(item)
      if (seen.has(key)) return
      seen.add(key)
      items.push(item)
    }
    for (const step of RECOMMENDED_SCREENING_STEPS) {
      push({
        id: `std:${step.id}`,
        prompt: step.prompt,
        voiceSource: "ai",
        kind: step.kind,
      })
    }
    for (const prompt of platformPrompts) {
      const text = prompt.script_text.trim() || prompt.title.trim()
      push({
        id: `hannah:${prompt.id}`,
        prompt: text,
        title: prompt.title.trim() || standardQuestionSummary(inferKindFromPrompt(text), text),
        voiceSource: "hannah",
        recordingUrl: prompt.playback_url,
        kind: inferKindFromPrompt(text),
      })
    }
    for (const saved of savedPrompts) {
      push({
        id: `saved:${saved.id}`,
        prompt: saved.prompt,
        voiceSource: saved.voiceSource,
        recordingUrl: saved.recordingUrl,
        kind: saved.kind,
      })
    }
    for (const step of steps) {
      if (!step.prompt.trim() && !step.recordingUrl) continue
      push({
        id: `step:${step.id}`,
        prompt: step.prompt,
        voiceSource: resolveStepVoiceSource({ mode: "ai_menu" }, step),
        recordingUrl: step.recordingUrl,
        kind: step.kind,
      })
    }
    return items
  }, [platformPrompts, savedPrompts, steps])

  function updateStep(index: number, patch: Partial<VoiceScreeningStep>) {
    const next = stepsRef.current.map((s, i) => (i === index ? { ...s, ...patch } : s))
    stepsRef.current = next
    onChange(next)
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
    onChange(steps.filter((_, i) => i !== index))
  }

  function loadRecommended() {
    onChange(recommendedStepsWithContact(collectContactInfo))
  }

  function addQuestion() {
    onChange([...steps, emptyCustomScreeningStep()])
  }

  function setVoiceSource(index: number, voiceSource: VoiceStepVoiceSource) {
    const current = stepsRef.current[index]
    updateStep(index, {
      voiceSource,
      recordingUrl: voiceSource === "ai" ? undefined : current?.recordingUrl,
    })
  }

  function applyCatalogItem(index: number, item: PromptCatalogItem) {
    updateStep(index, {
      prompt: item.prompt,
      voiceSource: item.voiceSource,
      recordingUrl: item.recordingUrl,
      kind: item.kind,
    })
  }

  function saveQuestionToLibrary(step: VoiceScreeningStep) {
    const prompt = step.prompt.trim()
    if (!prompt) return
    const voiceSource = resolveStepVoiceSource({ mode: "ai_menu" }, step)
    const next: VoiceSavedPrompt = {
      id: `saved_${Date.now().toString(36)}`,
      prompt,
      voiceSource,
      recordingUrl: step.recordingUrl,
      kind: step.kind === "custom" ? inferKindFromPrompt(prompt) : step.kind,
    }
    const exists = savedPrompts.some((p) => catalogKey(p) === catalogKey(next))
    if (exists) return
    onSavedPromptsChange([...savedPrompts, next].slice(0, 40))
  }

  async function onOwnRecording(index: number, publicUrl: string, liveTranscript?: string) {
    const step = stepsRef.current[index]
    if (!step) return
    const immediate = (liveTranscript || step.prompt).trim() || step.prompt
    updateStep(index, {
      recordingUrl: publicUrl,
      voiceSource: "own",
      kind: inferKindFromPrompt(immediate) === "custom" ? step.kind : inferKindFromPrompt(immediate),
      prompt: immediate,
    })
    setTranscribingId(step.id)
    try {
      const text = (await transcribeAttendantAudio(publicUrl)) || (liveTranscript || "").trim()
      const stillSameDescription = stepsRef.current[index]?.prompt === immediate
      if (text && stillSameDescription) {
        updateStep(index, {
          recordingUrl: publicUrl,
          voiceSource: "own",
          prompt: text,
          kind: inferKindFromPrompt(text),
        })
      }
    } catch {
      /* keep the live transcript or existing description */
    } finally {
      setTranscribingId(null)
    }
  }

  function isCustomAiStep(step: VoiceScreeningStep): boolean {
    if (resolveStepVoiceSource({ mode: "ai_menu" }, step) !== "ai") return false
    return !RECOMMENDED_SCREENING_STEPS.some((row) => row.kind === step.kind && row.prompt === step.prompt)
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{t("account.callScreening.menuHeading")}</span>
        {!isCustom ? (
          <button type="button" style={btnPrimarySmall} onClick={loadRecommended}>
            {t("account.callScreening.loadTemplate")}
          </button>
        ) : (
          <button type="button" style={btnPrimarySmall} onClick={addQuestion}>
            {t("account.callScreening.addQuestion")}
          </button>
        )}
      </div>

      {!isCustom ? (
        <label style={{ display: "flex", gap: 10, fontSize: 13, color: theme.text }}>
          <input type="checkbox" checked={collectContactInfo} onChange={(e) => onCollectContactChange(e.target.checked)} />
          {t("account.callScreening.collectContact")}
        </label>
      ) : null}

      {!isCustom ? (
        <div style={{ display: "grid", gap: 8 }}>
          {steps.map((step, index) => (
            <div key={step.id} style={{ ...card, padding: "10px 12px" }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {t("account.callScreening.questionN").replace("{n}", String(index + 1))}
              </div>
              <div style={{ fontSize: 13, color: theme.text }}>
                {standardQuestionSummary(step.kind, step.prompt)}
              </div>
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "#eff6ff",
                  color: "#1e40af",
                  fontSize: 11,
                  lineHeight: 1.45,
                }}
              >
                Smart response window:{" "}
                <strong>
                  {step.responseTimeoutSeconds ? `${step.responseTimeoutSeconds} seconds` : "analyzed when saved"}
                </strong>{" "}
                to begin answering. Once the caller starts, listening continues until they finish speaking.
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {steps.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>{t("account.callScreening.customEmpty")}</p>
          ) : null}
          {steps.map((step, index) => {
            const voiceSource = resolveStepVoiceSource({ mode: "ai_menu" }, step)
            const filter = promptFilterByStep[step.id] ?? "all"
            const filteredCatalog = catalog.filter((item) => {
              if (filter === "all") return true
              return item.voiceSource === filter
            })
            const customAi = isCustomAiStep(step)
            const selectedKey = catalogKey({
              voiceSource,
              prompt: step.prompt,
              recordingUrl: step.recordingUrl,
            })
            const selectedCatalogId = customAi && (filter === "all" || filter === "ai")
              ? CUSTOM_AI_OPTION_ID
              : filteredCatalog.find((item) => catalogKey(item) === selectedKey)?.id ?? ""
            const showAiDropdown = filter === "all" || filter === "ai"
            const showRecordedDropdown = filter === "all" || filter === "hannah"
            const showOwnDropdown = filter === "own" && filteredCatalog.length > 0
            const showPromptDropdown = showAiDropdown || showRecordedDropdown || showOwnDropdown
            const showOwnTools = filter === "own" || voiceSource === "own"
            return (
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
                    <button type="button" style={btnSmall} onClick={() => removeStep(index)}>
                      {t("account.callScreening.remove")}
                    </button>
                  </div>
                </div>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{t("account.callScreening.voiceSource")}</span>
                  <select
                    value={filter}
                    onChange={(e) => {
                      const next = e.target.value as PromptFilter
                      setPromptFilterByStep((prev) => ({ ...prev, [step.id]: next }))
                      if (next === "ai") setVoiceSource(index, "ai")
                      if (next === "hannah") setVoiceSource(index, "hannah")
                      if (next === "own") setVoiceSource(index, "own")
                    }}
                    style={theme.formInput}
                  >
                    <option value="all">{t("account.callScreening.filterAll")}</option>
                    <option value="ai">{t("account.callScreening.filterAi")}</option>
                    <option value="hannah">{t("account.callScreening.filterHannah")}</option>
                    <option value="own">{t("account.callScreening.filterOwn")}</option>
                  </select>
                </label>

                {showPromptDropdown ? (
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{t("account.callScreening.promptDescription")}</span>
                    <select
                      value={selectedCatalogId}
                      onChange={(e) => {
                        const value = e.target.value
                        if (value === CUSTOM_AI_OPTION_ID) {
                          updateStep(index, {
                            prompt: "",
                            kind: "custom",
                            voiceSource: "ai",
                            recordingUrl: undefined,
                          })
                          return
                        }
                        const item = catalog.find((row) => row.id === value)
                        if (item) applyCatalogItem(index, item)
                      }}
                      style={theme.formInput}
                    >
                      <option value="">{t("account.callScreening.promptPick")}</option>
                      {showAiDropdown ? (
                        <option value={CUSTOM_AI_OPTION_ID}>{t("account.callScreening.customAiOption")}</option>
                      ) : null}
                      {filteredCatalog.map((item) => (
                        <option key={item.id} value={item.id}>
                          {formatPromptOption(item, filter === "all")}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {showAiDropdown && customAi ? (
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>
                      {t("account.callScreening.customAiField")} ({step.prompt.length}/{CUSTOM_AI_PROMPT_MAX_LENGTH})
                    </span>
                    <textarea
                      value={step.prompt}
                      maxLength={CUSTOM_AI_PROMPT_MAX_LENGTH}
                      onChange={(e) =>
                        updateStep(index, {
                          prompt: e.target.value.slice(0, CUSTOM_AI_PROMPT_MAX_LENGTH),
                          kind: inferKindFromPrompt(e.target.value) === "custom" ? "custom" : inferKindFromPrompt(e.target.value),
                          voiceSource: "ai",
                        })
                      }
                      rows={3}
                      style={{ ...theme.formInput, resize: "vertical", minHeight: 72 }}
                      placeholder={t("account.callScreening.customPromptPlaceholder")}
                    />
                  </label>
                ) : null}

                {filter === "hannah" && !step.recordingUrl ? (
                  <span style={{ fontSize: 12, color: "#b45309" }}>{t("account.callScreening.pickHannah")}</span>
                ) : null}
                {voiceSource === "hannah" && step.recordingUrl ? (
                  <audio controls preload="none" src={step.recordingUrl} style={{ width: "100%" }} />
                ) : null}

                {showOwnTools ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <AttendantStepRecorder
                      recordLabel={t("account.callScreening.recordButton")}
                      onTranscript={(text) => {
                        if (!text.trim()) return
                        updateStep(index, { prompt: text.trim(), kind: inferKindFromPrompt(text), voiceSource: "own" })
                      }}
                      onRecorded={(publicUrl, transcript) => void onOwnRecording(index, publicUrl, transcript)}
                    />
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{t("account.callScreening.audioLink")}</span>
                      <input
                        type="url"
                        value={step.recordingUrl || ""}
                        placeholder="https://"
                        onChange={(e) =>
                          updateStep(index, {
                            recordingUrl: e.target.value.trim() || undefined,
                            voiceSource: "own",
                          })
                        }
                        style={theme.formInput}
                      />
                    </label>
                    {step.recordingUrl ? <audio controls preload="none" src={step.recordingUrl} style={{ width: "100%" }} /> : null}
                    {transcribingId === step.id ? (
                      <span style={{ fontSize: 11, color: "#64748b" }}>{t("account.callScreening.transcribing")}</span>
                    ) : null}
                  </div>
                ) : null}

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    style={btnSmall}
                    disabled={!step.prompt.trim() && !step.recordingUrl}
                    onClick={() => saveQuestionToLibrary(step)}
                  >
                    {t("account.callScreening.saveQuestion")}
                  </button>
                </div>

                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "#eff6ff",
                    color: "#1e40af",
                    fontSize: 11,
                    lineHeight: 1.45,
                  }}
                >
                  Smart response window:{" "}
                  <strong>
                    {step.responseTimeoutSeconds ? `${step.responseTimeoutSeconds} seconds` : "analyzed when saved"}
                  </strong>{" "}
                  to begin answering. Once the caller starts, listening continues until they finish speaking.
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
