import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import {
  businessWorkflowToEntry,
  cloneWorkflowDoc,
  entryToBusinessWorkflowDoc,
  mergeEntryIntoSavedWorkflow,
  mergeWorkflowDocs,
  removeSavedWorkflowEntry,
  type SavedWorkflowEntry,
  type SavedWorkflowScopeKind,
  type SavedWorkflowsLibrary,
  upsertSavedWorkflowEntry,
} from "../../lib/savedWorkflows"
import {
  WORKFLOW_TEMPLATE_CATALOG,
  customerTemplateOptions,
  departmentTemplateOptions,
  generalTemplateOptions,
  workflowTemplateById,
} from "../../lib/workflowTemplates"
import { PLATFORM_DEPARTMENT_KEYS } from "../../lib/platformEmailDepartments"
import { businessWorkflowFromVoiceResult, fetchWorkflowFromVoice } from "../../lib/workflowFromVoiceApi"
import { getPlatformToolsAccessToken } from "../../lib/specialtyReportAssistantApi"
import { useSpeechRecognitionInput } from "../../lib/useSpeechRecognitionInput"
import type { BusinessWorkflowDoc } from "../../lib/businessWorkflow"
import type { OrgChartNode } from "../../lib/organizationChart"

type HubPanel = "saved" | "dept-customer" | null

type CustomerOption = { id: string; display_name: string }

type Props = {
  userId: string | null
  liveDoc: BusinessWorkflowDoc
  savedLibrary: SavedWorkflowsLibrary
  orgChartRoles: OrgChartNode[]
  hubPanel: HubPanel
  onHubPanelChange: (panel: HubPanel) => void
  onApplyLiveDoc: (doc: BusinessWorkflowDoc) => void
  onPersistSavedLibrary: (library: SavedWorkflowsLibrary) => Promise<void>
}

const secondaryBtn: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  color: theme.text,
}

const primaryBtn: CSSProperties = {
  ...secondaryBtn,
  background: theme.primary,
  borderColor: theme.primary,
  color: "#fff",
}

export function WorkflowHubNavButtons({
  hubPanel,
  onHubPanelChange,
}: {
  hubPanel: HubPanel
  onHubPanelChange: (panel: HubPanel) => void
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onHubPanelChange(hubPanel === "dept-customer" ? null : "dept-customer")}
        style={{
          ...secondaryBtn,
          borderColor: hubPanel === "dept-customer" ? theme.primary : theme.border,
          color: hubPanel === "dept-customer" ? theme.primary : theme.text,
        }}
      >
        Department &amp; customer workflow
      </button>
      <button
        type="button"
        onClick={() => onHubPanelChange(hubPanel === "saved" ? null : "saved")}
        style={{
          ...secondaryBtn,
          borderColor: hubPanel === "saved" ? theme.primary : theme.border,
          color: hubPanel === "saved" ? theme.primary : theme.text,
        }}
      >
        Saved workflows
      </button>
    </>
  )
}

export function WorkflowVoiceAttendant({
  onApply,
}: {
  onApply: (doc: BusinessWorkflowDoc, mode: "replace" | "merge") => void
}) {
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")
  const [importMode, setImportMode] = useState<"replace" | "merge">("replace")

  const onSpeechDisplay = useCallback((t: string) => setText(t), [])

  const { speechSupported, listening, startListening, stopListening } = useSpeechRecognitionInput(onSpeechDisplay, {
    preferLiveTranscript: true,
    onSessionEnd: (finalText: string) => {
      if (finalText.trim()) setText(finalText.trim())
    },
  })

  async function buildFromVoice() {
    const utterance = text.trim()
    if (!utterance) {
      setNote("Describe your process first — type or tap the microphone.")
      return
    }
    setBusy(true)
    setNote("")
    try {
      const token = await getPlatformToolsAccessToken()
      const result = await fetchWorkflowFromVoice(token, utterance)
      const doc = businessWorkflowFromVoiceResult(result)
      onApply(doc, importMode)
      setNote(result.note ?? (result.fallback ? "Workflow created (basic layout)." : "Workflow created from your description."))
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not build workflow.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <details
      style={{
        marginBottom: 14,
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: "#fff",
        padding: "10px 14px",
      }}
    >
      <summary style={{ cursor: "pointer", fontWeight: 700, color: "#334155" }}>AI workflow attendant (voice or text)</summary>
      <p style={{ margin: "10px 0 8px", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
        Describe your process out loud — e.g. &quot;Customer calls in, reception builds an estimate, parts approves, then
        accounting bills.&quot; Works in live and sandbox.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
        <label style={{ display: "grid", gap: 4, flex: "1 1 240px", fontSize: 12, fontWeight: 600 }}>
          Your description
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Describe steps and who approves what…"
            style={{ ...theme.formInput, resize: "vertical", minHeight: 72 }}
          />
        </label>
        {speechSupported ? (
          <button
            type="button"
            onClick={() => (listening ? stopListening() : startListening())}
            style={{
              ...secondaryBtn,
              borderColor: listening ? "#fecaca" : theme.border,
              color: listening ? "#b91c1c" : theme.text,
            }}
          >
            {listening ? "Stop listening" : "🎤 Listen"}
          </button>
        ) : null}
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
          Apply as
          <select value={importMode} onChange={(e) => setImportMode(e.target.value as "replace" | "merge")} style={theme.formInput}>
            <option value="replace">Create / replace live workflow</option>
            <option value="merge">Merge into live workflow</option>
          </select>
        </label>
        <button type="button" onClick={() => void buildFromVoice()} disabled={busy} style={primaryBtn}>
          {busy ? "Building…" : "Build workflow"}
        </button>
      </div>
      {note ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "#059669" }}>{note}</p> : null}
    </details>
  )
}

export default function WorkflowHubPanels({
  userId,
  liveDoc,
  savedLibrary,
  orgChartRoles,
  hubPanel,
  onHubPanelChange,
  onApplyLiveDoc,
  onPersistSavedLibrary,
}: Props) {
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [scopeKind, setScopeKind] = useState<"department" | "customer" | "template">("department")
  const [departmentKey, setDepartmentKey] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [templateId, setTemplateId] = useState(WORKFLOW_TEMPLATE_CATALOG[0]?.id ?? "")
  const [importTarget, setImportTarget] = useState<"new-live" | "merge-live" | "new-saved" | "merge-saved">("new-live")
  const [mergeSavedId, setMergeSavedId] = useState("")
  const [savedTitle, setSavedTitle] = useState("")
  const [flash, setFlash] = useState("")

  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    void supabase
      .from("customers")
      .select("id, display_name")
      .eq("user_id", userId)
      .order("display_name", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (cancelled) return
        setCustomers(
          (data ?? [])
            .map((r) => ({
              id: String((r as { id?: string }).id ?? ""),
              display_name: String((r as { display_name?: string }).display_name ?? "Customer").trim() || "Customer",
            }))
            .filter((r) => r.id),
        )
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const departmentOptions = useMemo(() => {
    const platform = PLATFORM_DEPARTMENT_KEYS.map((d: { key: string; label: string }) => ({
      key: `platform:${d.key}`,
      label: d.label,
      templateId: `dept-${d.key}`,
    }))
    const roles = orgChartRoles.map((r) => ({
      key: `org:${r.id}`,
      label: r.label,
      templateId: "",
    }))
    return [...platform, ...roles]
  }, [orgChartRoles])

  useEffect(() => {
    if (!departmentKey && departmentOptions.length) {
      setDepartmentKey(departmentOptions[0].key)
      if (departmentOptions[0].templateId) setTemplateId(departmentOptions[0].templateId)
    }
  }, [departmentKey, departmentOptions])

  const templateOptions = useMemo(() => {
    if (scopeKind === "department") return departmentTemplateOptions()
    if (scopeKind === "customer") return customerTemplateOptions()
    return generalTemplateOptions()
  }, [scopeKind])

  useEffect(() => {
    if (templateOptions.length && !templateOptions.some((t) => t.id === templateId)) {
      setTemplateId(templateOptions[0].id)
    }
  }, [templateOptions, templateId])

  function resolveSourceDoc(): BusinessWorkflowDoc | null {
    const tpl = workflowTemplateById(templateId)
    if (!tpl) return null
    let doc = tpl.build()
    const customer = customers.find((c) => c.id === customerId)
    if (scopeKind === "customer" && customer) {
      doc = { ...doc, title: `${customer.display_name} — ${doc.title}` }
    }
    if (scopeKind === "department") {
      const deptLabel =
        departmentKey.startsWith("platform:")
          ? PLATFORM_DEPARTMENT_KEYS.find((d) => `platform:${d.key}` === departmentKey)?.label
          : orgChartRoles.find((r) => `org:${r.id}` === departmentKey)?.label
      if (deptLabel) doc = { ...doc, title: `${deptLabel} — ${doc.title}` }
    }
    return doc
  }

  function scopeMeta(): {
    scopeKind: SavedWorkflowScopeKind
    departmentKey?: string | null
    departmentLabel?: string | null
    customerId?: string | null
    customerName?: string | null
    templateId?: string | null
  } {
    const customer = customers.find((c) => c.id === customerId)
    const deptLabel =
      departmentKey.startsWith("platform:")
        ? PLATFORM_DEPARTMENT_KEYS.find((d) => `platform:${d.key}` === departmentKey)?.label ?? null
        : orgChartRoles.find((r) => `org:${r.id}` === departmentKey)?.label ?? null
    return {
      scopeKind: scopeKind === "template" ? "template" : scopeKind,
      departmentKey: departmentKey.startsWith("platform:") ? departmentKey.replace("platform:", "") : null,
      departmentLabel: deptLabel,
      customerId: scopeKind === "customer" ? customerId || null : null,
      customerName: customer?.display_name ?? null,
      templateId,
    }
  }

  async function applySource() {
    const source = resolveSourceDoc()
    if (!source) {
      setFlash("Pick a template first.")
      return
    }
    const meta = scopeMeta()
    if (importTarget === "new-live") {
      onApplyLiveDoc(cloneWorkflowDoc(source))
      setFlash("Loaded as your live workflow.")
    } else if (importTarget === "merge-live") {
      onApplyLiveDoc(mergeWorkflowDocs(liveDoc, source))
      setFlash("Merged into your live workflow.")
    } else if (importTarget === "new-saved") {
      const entry = businessWorkflowToEntry(source, {
        title: savedTitle.trim() || source.title,
        ...meta,
      })
      await onPersistSavedLibrary(upsertSavedWorkflowEntry(savedLibrary, entry))
      setFlash("Saved to your workflow library.")
    } else if (importTarget === "merge-saved") {
      if (!mergeSavedId) {
        setFlash("Pick a saved workflow to merge into.")
        return
      }
      const next = mergeEntryIntoSavedWorkflow(savedLibrary, mergeSavedId, source)
      await onPersistSavedLibrary(next)
      setFlash("Merged into saved workflow.")
    }
    window.setTimeout(() => setFlash(""), 3500)
  }

  async function importSavedToLive(entry: SavedWorkflowEntry, mode: "replace" | "merge") {
    const incoming = entryToBusinessWorkflowDoc(entry)
    if (mode === "replace") onApplyLiveDoc(cloneWorkflowDoc(incoming))
    else onApplyLiveDoc(mergeWorkflowDocs(liveDoc, incoming))
    setFlash(mode === "replace" ? "Imported to live workflow." : "Merged into live workflow.")
    window.setTimeout(() => setFlash(""), 3500)
  }

  async function saveLiveToLibrary() {
    const entry = businessWorkflowToEntry(liveDoc, {
      title: savedTitle.trim() || liveDoc.title,
      scopeKind: "general",
    })
    await onPersistSavedLibrary(upsertSavedWorkflowEntry(savedLibrary, entry))
    setFlash("Current live workflow saved.")
    window.setTimeout(() => setFlash(""), 3500)
  }

  async function deleteSaved(id: string) {
    if (!window.confirm("Remove this saved workflow?")) return
    await onPersistSavedLibrary(removeSavedWorkflowEntry(savedLibrary, id))
  }

  if (!hubPanel) return flash ? <p style={{ fontSize: 12, color: "#059669", marginBottom: 8 }}>{flash}</p> : null

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 16,
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, flex: 1 }}>
          {hubPanel === "saved" ? "Saved workflows" : "Department & customer workflow"}
        </h2>
        <button type="button" onClick={() => onHubPanelChange(null)} style={secondaryBtn}>
          Close
        </button>
      </div>

      {flash ? <p style={{ margin: "0 0 10px", fontSize: 12, color: "#059669", fontWeight: 600 }}>{flash}</p> : null}

      {hubPanel === "dept-customer" ? (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
            Start from a department, customer, or template — then create a new live workflow or merge into an existing one.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
              Workflow type
              <select value={scopeKind} onChange={(e) => setScopeKind(e.target.value as typeof scopeKind)} style={theme.formInput}>
                <option value="department">Department</option>
                <option value="customer">Customer</option>
                <option value="template">Template</option>
              </select>
            </label>
            {scopeKind === "department" ? (
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
                Department
                <select
                  value={departmentKey || departmentOptions[0]?.key || ""}
                  onChange={(e) => {
                    setDepartmentKey(e.target.value)
                    const opt = departmentOptions.find((o) => o.key === e.target.value)
                    if (opt?.templateId) setTemplateId(opt.templateId)
                  }}
                  style={theme.formInput}
                >
                  {departmentOptions.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {scopeKind === "customer" ? (
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
                Customer
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={theme.formInput}>
                  <option value="">Select customer…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
              Template
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={theme.formInput}>
                {templateOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {workflowTemplateById(templateId)?.description ? (
            <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>{workflowTemplateById(templateId)?.description}</p>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
              Import action
              <select
                value={importTarget}
                onChange={(e) => setImportTarget(e.target.value as typeof importTarget)}
                style={theme.formInput}
              >
                <option value="new-live">Create new live workflow</option>
                <option value="merge-live">Merge into live workflow</option>
                <option value="new-saved">Save as new saved workflow</option>
                <option value="merge-saved">Merge into saved workflow</option>
              </select>
            </label>
            {(importTarget === "new-saved" || importTarget === "merge-saved") && importTarget === "new-saved" ? (
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
                Saved workflow title
                <input value={savedTitle} onChange={(e) => setSavedTitle(e.target.value)} style={theme.formInput} placeholder="Name this workflow" />
              </label>
            ) : null}
            {importTarget === "merge-saved" ? (
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
                Target saved workflow
                <select value={mergeSavedId} onChange={(e) => setMergeSavedId(e.target.value)} style={theme.formInput}>
                  <option value="">Select saved workflow…</option>
                  {savedLibrary.entries.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <button type="button" onClick={() => void applySource()} style={primaryBtn}>
            Apply workflow
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
            Import a saved workflow into the live editor, or save what you have on the chart now.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, flex: "1 1 200px" }}>
              Save current live workflow as
              <input value={savedTitle} onChange={(e) => setSavedTitle(e.target.value)} style={theme.formInput} placeholder={liveDoc.title} />
            </label>
            <button type="button" onClick={() => void saveLiveToLibrary()} style={secondaryBtn}>
              Save current to library
            </button>
          </div>
          {savedLibrary.entries.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>No saved workflows yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {savedLibrary.entries.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: "#f8fafc",
                  }}
                >
                  <div style={{ flex: "1 1 180px" }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{entry.title}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {entry.scopeKind}
                      {entry.customerName ? ` · ${entry.customerName}` : ""}
                      {entry.departmentLabel ? ` · ${entry.departmentLabel}` : ""}
                      {" · "}
                      {entry.nodes.length} steps
                    </div>
                  </div>
                  <button type="button" onClick={() => void importSavedToLive(entry, "replace")} style={primaryBtn}>
                    Load to live
                  </button>
                  <button type="button" onClick={() => void importSavedToLive(entry, "merge")} style={secondaryBtn}>
                    Merge into live
                  </button>
                  <button type="button" onClick={() => void deleteSaved(entry.id)} style={{ ...secondaryBtn, color: "#b91c1c", borderColor: "#fecaca" }}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
