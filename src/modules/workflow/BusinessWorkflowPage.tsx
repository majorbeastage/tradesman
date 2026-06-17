import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import {
  WORKFLOW_EDGE_META,
  WORKFLOW_NODE_COLOR_META,
  WORKFLOW_NODE_COLORS,
  WORKFLOW_REQUIREMENT_SUGGESTIONS,
  buildShareWithAdminMailto,
  createExampleBusinessWorkflow,
  downloadWorkflowSvg,
  loadBusinessWorkflowFromMetadata,
  mergeBusinessWorkflowMetadata,
  newWorkflowEdge,
  newWorkflowNode,
  sortedWorkflowNodes,
  workflowEdgeGeometry,
  workflowEdgeStroke,
  workflowEdgesWithLanes,
  workflowNodePresentation,
  workflowToSvg,
  type BusinessWorkflowDoc,
  type WorkflowEdge,
  type WorkflowEdgeApproval,
  type WorkflowNode,
  type WorkflowNodeColor,
} from "../../lib/businessWorkflow"
import { formatAppError } from "../../lib/formatAppError"

type Props = {
  setPage: (page: string) => void
}

const NODE_W = 240
const NODE_H = 52

const APPROVAL_OPTIONS: WorkflowEdgeApproval[] = ["approved", "needs_approval", "needs_multiple_approvals"]

export default function BusinessWorkflowPage({ setPage }: Props) {
  const { user } = useAuth()
  const userId = useScopedUserId() ?? user?.id ?? null
  const [doc, setDoc] = useState<BusinessWorkflowDoc>(() => createExampleBusinessWorkflow())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [linkFromId, setLinkFromId] = useState<string | null>(null)
  const [newArrowApproval, setNewArrowApproval] = useState<WorkflowEdgeApproval>("needs_approval")
  const [newArrowRequirement, setNewArrowRequirement] = useState("")
  const [drag, setDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!supabase || !userId) {
      setLoading(false)
      return
    }
    let cancelled = false
    void supabase
      .from("profiles")
      .select("metadata, display_name")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setErr(error.message)
        else setDoc(loadBusinessWorkflowFromMetadata(data?.metadata))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const persist = useCallback(
    (next: BusinessWorkflowDoc) => {
      if (!supabase || !userId) return
      setSaving(true)
      void (async () => {
        try {
          const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
          const prevMeta =
            data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
              ? { ...(data.metadata as Record<string, unknown>) }
              : {}
          const { error } = await supabase
            .from("profiles")
            .update({ metadata: mergeBusinessWorkflowMetadata(prevMeta, next) })
            .eq("id", userId)
          if (error) throw error
        } catch (e: unknown) {
          setErr(formatAppError(e))
        } finally {
          setSaving(false)
        }
      })()
    },
    [userId],
  )

  const updateDoc = useCallback(
    (patch: Partial<BusinessWorkflowDoc> | ((prev: BusinessWorkflowDoc) => BusinessWorkflowDoc)) => {
      setDoc((prev) => {
        const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch }
        if (saveTimer.current) window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => persist(next), 800)
        return next
      })
    },
    [persist],
  )

  const nodes = sortedWorkflowNodes(doc)
  const nodeById = useMemo(() => new Map(doc.nodes.map((n) => [n.id, n])), [doc.nodes])
  const edgesWithLanes = useMemo(() => workflowEdgesWithLanes(doc.edges), [doc.edges])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag || !canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      const x = Math.max(8, Math.min(rect.width - NODE_W - 8, e.clientX - rect.left - drag.offsetX))
      const y = Math.max(8, e.clientY - rect.top - drag.offsetY)
      updateDoc((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === drag.id ? { ...n, x, y } : n)),
      }))
    },
    [drag, updateDoc],
  )

  const endDrag = useCallback(() => setDrag(null), [])

  function handleNodeClick(nodeId: string) {
    if (linkFromId) {
      if (linkFromId === nodeId) {
        setLinkFromId(null)
        return
      }
      const req = newArrowRequirement.trim()
      const duplicate = doc.edges.some(
        (e) =>
          e.fromId === linkFromId &&
          e.toId === nodeId &&
          e.approval === newArrowApproval &&
          (e.requirement ?? "") === req,
      )
      if (!duplicate) {
        const edge = newWorkflowEdge(linkFromId, nodeId, newArrowApproval, req)
        updateDoc((prev) => ({ ...prev, edges: [...prev.edges, edge] }))
        setSelectedEdgeId(edge.id)
      }
      setLinkFromId(null)
      setNewArrowRequirement("")
      setSelectedId(nodeId)
      return
    }
    setSelectedId(nodeId)
    setSelectedEdgeId(null)
  }

  function addStep() {
    const last = nodes[nodes.length - 1]
    const order = nodes.length
    const node = newWorkflowNode(`New step ${order + 1}`, order, last?.x ?? 40, (last?.y ?? 0) + 88)
    updateDoc((prev) => ({ ...prev, nodes: [...prev.nodes, node] }))
    setSelectedId(node.id)
    setSelectedEdgeId(null)
  }

  function removeSelected() {
    if (!selectedId) return
    updateDoc((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== selectedId).map((n, i) => ({ ...n, order: i })),
      edges: prev.edges.filter((e) => e.fromId !== selectedId && e.toId !== selectedId),
    }))
    setSelectedId(null)
    setSelectedEdgeId(null)
  }

  function removeEdge(edgeId: string) {
    updateDoc((prev) => ({ ...prev, edges: prev.edges.filter((e) => e.id !== edgeId) }))
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null)
  }

  function patchEdge(edgeId: string, patch: Partial<WorkflowEdge>) {
    updateDoc((prev) => ({
      ...prev,
      edges: prev.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)),
    }))
  }

  function patchNode(nodeId: string, patch: Partial<WorkflowNode>) {
    updateDoc((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
    }))
  }

  function startLinkFromSelected() {
    if (!selectedId) return
    setLinkFromId(selectedId)
    setSelectedEdgeId(null)
  }

  function resetExample() {
    if (!window.confirm("Replace your workflow with the example customer-intake → billing flow?")) return
    updateDoc(createExampleBusinessWorkflow())
    setLinkFromId(null)
    setSelectedEdgeId(null)
  }

  function shareWithAdmin() {
    const label = user?.email ?? userId ?? "Tradesman user"
    updateDoc((prev) => ({ ...prev, shared_with_admin_at: new Date().toISOString() }))
    window.location.href = buildShareWithAdminMailto(doc, label)
  }

  const selectedNodeEdges = selectedId
    ? doc.edges.filter((e) => e.fromId === selectedId || e.toId === selectedId)
    : []

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "16px 20px 40px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <button type="button" onClick={() => setPage("dashboard")} style={secondaryBtn}>
          ← Dashboard
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: theme.text, flex: 1 }}>My Business Workflow</h1>
        {saving ? <span style={{ fontSize: 12, color: "#64748b" }}>Saving…</span> : null}
      </div>

      <p style={{ margin: "0 0 12px", fontSize: 14, color: "#64748b", lineHeight: 1.55, maxWidth: 820 }}>
        Drag steps to lay out your process. Color each box, add multiple arrows, and label each arrow with requirements
        (e.g. estimate approvals, purchase order approvals). Green = approved, red = needs approval from target, yellow =
        multiple approvals.
      </p>

      <WorkflowArrowLegend />

      {err ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p> : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <input
          value={doc.title}
          onChange={(e) => updateDoc({ title: e.target.value })}
          style={{ ...theme.formInput, flex: "1 1 220px", fontWeight: 700 }}
          placeholder="Workflow title"
        />
        <button type="button" onClick={addStep} style={primaryBtn}>
          + Add step
        </button>
        <button
          type="button"
          onClick={startLinkFromSelected}
          disabled={!selectedId}
          style={{ ...secondaryBtn, opacity: selectedId ? 1 : 0.55 }}
          title={selectedId ? "Add an arrow starting from the selected step" : "Select a step first"}
        >
          + Add arrow
        </button>
        {linkFromId ? (
          <button type="button" onClick={() => setLinkFromId(null)} style={{ ...secondaryBtn, borderColor: "#fecaca", color: "#b91c1c" }}>
            Cancel arrow
          </button>
        ) : null}
        <button type="button" onClick={() => downloadWorkflowSvg(doc)} style={secondaryBtn}>
          Download SVG
        </button>
        <button type="button" onClick={shareWithAdmin} style={secondaryBtn}>
          Share with Admin
        </button>
        <button type="button" onClick={resetExample} style={secondaryBtn}>
          Load example
        </button>
        {selectedId ? (
          <button type="button" onClick={removeSelected} style={{ ...secondaryBtn, borderColor: "#fecaca", color: "#b91c1c" }}>
            Remove step
          </button>
        ) : null}
      </div>

      {linkFromId ? (
        <div style={linkBanner}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", width: "100%" }}>
            <span style={{ fontWeight: 700 }}>Adding arrow from:</span> {nodeById.get(linkFromId)?.label ?? "Step"}
            <span style={{ color: "#64748b" }}>→ click the target step</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", width: "100%", marginTop: 8 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600, flex: "1 1 160px" }}>
              Requirement label
              <input
                list="wf-requirement-suggestions"
                value={newArrowRequirement}
                onChange={(e) => setNewArrowRequirement(e.target.value)}
                placeholder="e.g. Estimate approval"
                style={theme.formInput}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
              Arrow type
              <select
                value={newArrowApproval}
                onChange={(e) => setNewArrowApproval(e.target.value as WorkflowEdgeApproval)}
                style={{ ...theme.formInput, margin: 0, padding: "8px 10px", fontSize: 13 }}
              >
                {APPROVAL_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {WORKFLOW_EDGE_META[k].shortLabel}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <datalist id="wf-requirement-suggestions">
            {WORKFLOW_REQUIREMENT_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: 16, alignItems: "start" }}>
        {loading ? (
          <p style={{ color: "#64748b" }}>Loading workflow…</p>
        ) : (
          <div
            ref={canvasRef}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onClick={() => {
              if (!linkFromId) {
                setSelectedId(null)
                setSelectedEdgeId(null)
              }
            }}
            style={{
              position: "relative",
              minHeight: Math.max(640, nodes.length * 88 + 80),
              borderRadius: 12,
              border: `1px solid ${theme.border}`,
              background: "#f8fafc",
              overflow: "auto",
            }}
          >
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} aria-hidden={false}>
              <defs>
                {APPROVAL_OPTIONS.map((kind) => (
                  <marker key={kind} id={`wf-arrow-${kind}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill={workflowEdgeStroke(kind)} />
                  </marker>
                ))}
              </defs>
              {edgesWithLanes.map(({ edge, laneIndex, laneCount }) => {
                const from = nodeById.get(edge.fromId)
                const to = nodeById.get(edge.toId)
                if (!from || !to) return null
                const g = workflowEdgeGeometry(from, to, laneIndex, laneCount)
                const stroke = workflowEdgeStroke(edge.approval)
                const selected = selectedEdgeId === edge.id
                const req = edge.requirement?.trim()
                const labelW = req ? Math.min(200, Math.max(72, req.length * 6.2 + 16)) : 0
                const labelH = 18
                return (
                  <g key={edge.id}>
                    <line
                      x1={g.x1}
                      y1={g.y1}
                      x2={g.x2}
                      y2={g.y2}
                      stroke="transparent"
                      strokeWidth={14}
                      style={{ pointerEvents: "auto", cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedEdgeId(edge.id)
                        setSelectedId(null)
                        setLinkFromId(null)
                      }}
                    />
                    <line
                      x1={g.x1}
                      y1={g.y1}
                      x2={g.x2}
                      y2={g.y2}
                      stroke={stroke}
                      strokeWidth={selected ? 4 : 2.5}
                      markerEnd={`url(#wf-arrow-${edge.approval})`}
                      style={{ pointerEvents: "none" }}
                    />
                    {req ? (
                      <g style={{ pointerEvents: "none" }}>
                        <rect
                          x={g.cx - labelW / 2}
                          y={g.cy - labelH / 2}
                          width={labelW}
                          height={labelH}
                          rx={4}
                          fill="#ffffff"
                          stroke={stroke}
                          strokeWidth={1}
                        />
                        <text
                          x={g.cx}
                          y={g.cy + 4}
                          textAnchor="middle"
                          fontSize={10}
                          fontWeight={600}
                          fill="#334155"
                        >
                          {req.length > 28 ? `${req.slice(0, 27)}…` : req}
                        </text>
                      </g>
                    ) : null}
                  </g>
                )
              })}
            </svg>

            {nodes.map((n) => (
              <WorkflowNodeCard
                key={n.id}
                node={n}
                selected={selectedId === n.id}
                linkSource={linkFromId === n.id}
                linkMode={Boolean(linkFromId)}
                onSelect={() => handleNodeClick(n.id)}
                onLabelChange={(label) =>
                  updateDoc((prev) => ({
                    ...prev,
                    nodes: prev.nodes.map((row) => (row.id === n.id ? { ...row, label } : row)),
                  }))
                }
                onDragStart={(offsetX, offsetY) => {
                  if (linkFromId) return
                  setDrag({ id: n.id, offsetX, offsetY })
                }}
              />
            ))}
          </div>
        )}

        <aside style={sidePanel}>
          {selectedId && nodeById.has(selectedId) ? (
            <NodeColorEditor
              node={nodeById.get(selectedId)!}
              onChange={(boxColor) => patchNode(selectedId, { boxColor })}
            />
          ) : null}

          <h2 style={{ margin: selectedId ? "16px 0 10px" : "0 0 10px", fontSize: 15, fontWeight: 800 }}>Arrows</h2>
          {selectedEdgeId && doc.edges.some((e) => e.id === selectedEdgeId) ? (
            <EdgeEditor
              edge={doc.edges.find((e) => e.id === selectedEdgeId)!}
              nodeById={nodeById}
              onPatch={(patch) => patchEdge(selectedEdgeId, patch)}
              onRemove={() => removeEdge(selectedEdgeId)}
            />
          ) : selectedId && selectedNodeEdges.length > 0 ? (
            <div style={{ display: "grid", gap: 10 }}>
              {selectedNodeEdges.map((edge) => (
                <EdgeEditor
                  key={edge.id}
                  edge={edge}
                  nodeById={nodeById}
                  compact
                  onPatch={(patch) => patchEdge(edge.id, patch)}
                  onRemove={() => removeEdge(edge.id)}
                  onFocus={() => setSelectedEdgeId(edge.id)}
                />
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
              Select a step to change its box color. Use <strong>+ Add arrow</strong> and set a requirement label (e.g.
              estimate approval). Click an arrow to edit.
            </p>
          )}
        </aside>
      </div>

      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, color: "#475569" }}>Preview export</summary>
        <div
          style={{ marginTop: 10, padding: 12, borderRadius: 10, border: `1px solid ${theme.border}`, background: "#fff" }}
          dangerouslySetInnerHTML={{ __html: workflowToSvg(doc) }}
        />
      </details>
    </div>
  )
}

function NodeColorEditor({ node, onChange }: { node: WorkflowNode; onChange: (color: WorkflowNodeColor) => void }) {
  const current = node.boxColor ?? "default"
  return (
    <div>
      <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>Step box</h2>
      <p style={{ margin: "0 0 10px", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>{node.label}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {WORKFLOW_NODE_COLORS.map((c) => {
          const meta = WORKFLOW_NODE_COLOR_META[c]
          const active = current === c
          return (
            <button
              key={c}
              type="button"
              title={meta.label}
              onClick={() => onChange(c)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: active ? `2px solid ${theme.primary}` : `1px solid ${meta.border}`,
                background: meta.fill,
                cursor: "pointer",
                boxShadow: active ? "0 0 0 2px rgba(249,115,22,0.25)" : undefined,
              }}
            />
          )
        })}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "#94a3b8" }}>
        {WORKFLOW_NODE_COLOR_META[current].label} box
      </div>
    </div>
  )
}

function WorkflowArrowLegend() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 14, fontSize: 12, color: "#475569" }}>
      {APPROVAL_OPTIONS.map((kind) => (
        <span key={kind} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            aria-hidden
            style={{ width: 28, height: 4, borderRadius: 2, background: workflowEdgeStroke(kind) }}
          />
          {WORKFLOW_EDGE_META[kind].label}
        </span>
      ))}
    </div>
  )
}

function EdgeEditor({
  edge,
  nodeById,
  compact,
  onPatch,
  onRemove,
  onFocus,
}: {
  edge: WorkflowEdge
  nodeById: Map<string, WorkflowNode>
  compact?: boolean
  onPatch: (patch: Partial<WorkflowEdge>) => void
  onRemove: () => void
  onFocus?: () => void
}) {
  const from = nodeById.get(edge.fromId)?.label ?? "Step"
  const to = nodeById.get(edge.toId)?.label ?? "Step"
  return (
    <div
      style={{
        padding: compact ? "10px 10px" : "12px 12px",
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: "#fff",
      }}
      onClick={onFocus}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 6, lineHeight: 1.35 }}>
        {from} → {to}
      </div>
      <datalist id={`wf-req-${edge.id}`}>
        {WORKFLOW_REQUIREMENT_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
        Requirement
        <input
          list={`wf-req-${edge.id}`}
          value={edge.requirement ?? ""}
          onChange={(e) => onPatch({ requirement: e.target.value.trim() || undefined })}
          placeholder="e.g. Purchase order approval"
          style={theme.formInput}
          onClick={(e) => e.stopPropagation()}
        />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
        Arrow meaning
        <select
          value={edge.approval}
          onChange={(e) => onPatch({ approval: e.target.value as WorkflowEdgeApproval })}
          style={theme.formInput}
        >
          {APPROVAL_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {WORKFLOW_EDGE_META[k].shortLabel}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={onRemove} style={{ ...secondaryBtn, fontSize: 11, padding: "5px 10px", color: "#b91c1c", borderColor: "#fecaca" }}>
        Remove arrow
      </button>
    </div>
  )
}

function WorkflowNodeCard({
  node,
  selected,
  linkSource,
  linkMode,
  onSelect,
  onLabelChange,
  onDragStart,
}: {
  node: WorkflowNode
  selected: boolean
  linkSource: boolean
  linkMode: boolean
  onSelect: () => void
  onLabelChange: (label: string) => void
  onDragStart: (offsetX: number, offsetY: number) => void
}) {
  const pres = workflowNodePresentation(node)
  return (
    <div
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: NODE_W,
        minHeight: NODE_H,
        borderRadius: 10,
        border: linkSource
          ? "2px solid #ca8a04"
          : selected
            ? `2px solid ${theme.primary}`
            : `1px solid ${pres.border}`,
        background: linkSource ? "#fefce8" : pres.fill,
        boxShadow: selected || linkSource ? "0 4px 14px rgba(249,115,22,0.18)" : "0 2px 8px rgba(15,23,42,0.06)",
        padding: "8px 10px",
        cursor: linkMode ? "crosshair" : "grab",
        touchAction: "none",
        zIndex: selected || linkSource ? 2 : 1,
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
        onSelect()
        if (linkMode) return
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        onDragStart(e.clientX - rect.left, e.clientY - rect.top)
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
    >
      <input
        value={node.label}
        onChange={(e) => onLabelChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          border: "none",
          background: "transparent",
          fontSize: 13,
          fontWeight: 600,
          color: pres.text,
          outline: "none",
        }}
      />
      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
        {linkSource ? "Arrow starts here — click target" : linkMode ? "Click to connect" : "Drag to move"}
      </div>
    </div>
  )
}

const sidePanel: CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  padding: "14px 14px",
}

const linkBanner: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  marginBottom: 12,
  padding: "10px 14px",
  borderRadius: 10,
  background: "#fefce8",
  border: "1px solid #fde047",
  fontSize: 13,
}

const primaryBtn: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
}

const secondaryBtn: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
}
