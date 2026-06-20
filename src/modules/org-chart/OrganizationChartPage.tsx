import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { formatAppError } from "../../lib/formatAppError"
import { saveJobTitleNicknameForProfile } from "../../lib/jobTitleNickname"
import { isSandboxDemoUserId } from "../../lib/sandboxDemoTeam"
import { loadLinkableOrgUsers, type LinkableOrgUser } from "../../lib/orgChartMembers"
import {
  canvasPointFromEvent,
  connectorIn,
  connectorOut,
  resolveWireDropTarget,
  type WireDragState,
} from "../../lib/diagramWire"
import { DiagramContextMenu, type DiagramMenuAction } from "../../components/diagram/DiagramContextMenu"
import { DiagramEditorDock } from "../../components/diagram/DiagramEditorDock"
import WireEndpointHandle from "../../components/diagram/WireEndpointHandle"
import DiagramWireDragBanner from "../../components/diagram/DiagramWireDragBanner"
import {
  buildOrgChartShareMailto,
  createExampleOrganizationChart,
  downloadOrgChartSvg,
  loadOrganizationChartFromMetadata,
  mergeOrganizationChartMetadata,
  newOrgChartEdge,
  newOrgChartNode,
  orgChartEdgeGeometry,
  orgChartEdgesWithLanes,
  orgChartToSvg,
  syncOrgChartParentIds,
  type OrganizationChartDoc,
  type OrgChartEdge,
  type OrgChartNode,
} from "../../lib/organizationChart"
import {
  externalContactById,
  loadExternalContactsFromMetadata,
  mergeExternalContactsMetadata,
  newExternalContact,
  type ExternalContact,
  type ExternalContactsDoc,
} from "../../lib/externalContacts"

type Props = {
  setPage: (page: string) => void
}

const NODE_W = 240
const NODE_H = 72

const TILE_LABEL_STYLE: CSSProperties = {
  width: "100%",
  border: "none",
  background: "transparent",
  outline: "none",
  resize: "none",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  lineHeight: 1.35,
  minHeight: 28,
  maxHeight: 56,
  overflow: "auto",
}

const TILE_SUBLABEL_STYLE: CSSProperties = {
  ...TILE_LABEL_STYLE,
  fontSize: 11,
  color: "#64748b",
  minHeight: 22,
  maxHeight: 40,
  marginTop: 2,
}

export default function OrganizationChartPage({ setPage }: Props) {
  const { user } = useAuth()
  const userId = useScopedUserId() ?? user?.id ?? null
  const [doc, setDoc] = useState<OrganizationChartDoc>(() => createExampleOrganizationChart())
  const [externalContacts, setExternalContacts] = useState<ExternalContactsDoc>(() =>
    loadExternalContactsFromMetadata(null),
  )
  const [members, setMembers] = useState<LinkableOrgUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveFlash, setSaveFlash] = useState("")
  const [err, setErr] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [linkFromId, setLinkFromId] = useState<string | null>(null)
  const [newLineLabel, setNewLineLabel] = useState("")
  const [drag, setDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const [wireDrag, setWireDrag] = useState<WireDragState | null>(null)
  const [wireDropTargetId, setWireDropTargetId] = useState<string | null>(null)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: "node" | "edge" | "canvas"; id?: string } | null>(null)
  const clipboardRef = useRef<OrgChartNode | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<number | null>(null)
  const externalSaveTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!supabase || !userId) {
      setLoading(false)
      return
    }
    let cancelled = false
    void Promise.all([
      supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle(),
      loadLinkableOrgUsers(supabase, userId),
    ])
      .then(([profileRes, team]) => {
        if (cancelled) return
        if (profileRes.error) setErr(profileRes.error.message)
        else {
          setDoc(loadOrganizationChartFromMetadata(profileRes.data?.metadata))
          setExternalContacts(loadExternalContactsFromMetadata(profileRes.data?.metadata))
        }
        setMembers(team)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErr(formatAppError(e))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const persist = useCallback(
    (next: OrganizationChartDoc): Promise<void> => {
      if (!supabase || !userId) return Promise.resolve()
      setSaving(true)
      return (async () => {
        try {
          const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
          const prevMeta =
            data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
              ? { ...(data.metadata as Record<string, unknown>) }
              : {}
          const { error } = await supabase
            .from("profiles")
            .update({ metadata: mergeOrganizationChartMetadata(prevMeta, next) })
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

  const persistExternalContacts = useCallback(
    (next: ExternalContactsDoc): Promise<void> => {
      if (!supabase || !userId) return Promise.resolve()
      setSaving(true)
      return (async () => {
        try {
          const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
          const prevMeta =
            data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
              ? { ...(data.metadata as Record<string, unknown>) }
              : {}
          const { error } = await supabase
            .from("profiles")
            .update({ metadata: mergeExternalContactsMetadata(prevMeta, next) })
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

  const saveNow = useCallback(() => {
    if (!supabase || !userId) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    if (externalSaveTimer.current) window.clearTimeout(externalSaveTimer.current)
    setSaving(true)
    void (async () => {
      try {
        const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
        let prevMeta =
          data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
            ? { ...(data.metadata as Record<string, unknown>) }
            : {}
        prevMeta = mergeOrganizationChartMetadata(prevMeta, doc)
        prevMeta = mergeExternalContactsMetadata(prevMeta, externalContacts)
        const { error } = await supabase
          .from("profiles")
          .update({ metadata: prevMeta, updated_at: new Date().toISOString() })
          .eq("id", userId)
        if (error) throw error
        setSaveFlash("Saved")
        window.setTimeout(() => setSaveFlash(""), 2200)
      } catch (e: unknown) {
        setErr(formatAppError(e))
      } finally {
        setSaving(false)
      }
    })()
  }, [doc, externalContacts, userId])

  const updateExternalContacts = useCallback(
    (patch: Partial<ExternalContactsDoc> | ((prev: ExternalContactsDoc) => ExternalContactsDoc)) => {
      setExternalContacts((prev) => {
        const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch }
        if (externalSaveTimer.current) window.clearTimeout(externalSaveTimer.current)
        externalSaveTimer.current = window.setTimeout(() => persistExternalContacts(next), 800)
        return next
      })
    },
    [persistExternalContacts],
  )

  const updateDoc = useCallback(
    (patch: Partial<OrganizationChartDoc> | ((prev: OrganizationChartDoc) => OrganizationChartDoc)) => {
      setDoc((prev) => {
        const raw = typeof patch === "function" ? patch(prev) : { ...prev, ...patch }
        const next: OrganizationChartDoc = {
          ...raw,
          edges: raw.edges ?? prev.edges ?? [],
          nodes: syncOrgChartParentIds(raw.nodes ?? prev.nodes, raw.edges ?? prev.edges ?? []),
        }
        if (saveTimer.current) window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => persist(next), 800)
        return next
      })
    },
    [persist],
  )

  const nodeById = useMemo(() => new Map(doc.nodes.map((n) => [n.id, n])), [doc.nodes])
  const edgesWithLanes = useMemo(() => orgChartEdgesWithLanes(doc.edges), [doc.edges])

  const activeWireEdge = useMemo(
    () => (wireDrag?.kind === "reconnect" ? doc.edges.find((e) => e.id === wireDrag.edgeId) ?? null : null),
    [wireDrag, doc.edges],
  )

  const isWireDropAllowed = useCallback(
    (nodeId: string) => {
      if (!wireDrag) return false
      if (wireDrag.kind === "new") return nodeId !== wireDrag.fromId
      if (!activeWireEdge) return true
      if (wireDrag.end === "from") return nodeId !== activeWireEdge.toId
      return nodeId !== activeWireEdge.fromId
    },
    [wireDrag, activeWireEdge],
  )

  const resolveDropAt = useCallback(
    (x: number, y: number) => resolveWireDropTarget(doc.nodes, x, y, NODE_W, NODE_H, isWireDropAllowed),
    [doc.nodes, isWireDropAllowed],
  )

  const patchNode = useCallback(
    (id: string, patch: Partial<OrgChartNode>) => {
      updateDoc((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      }))
    },
    [updateDoc],
  )

  const patchEdge = useCallback(
    (edgeId: string, patch: Partial<OrgChartEdge>) => {
      updateDoc((prev) => ({
        ...prev,
        edges: prev.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)),
      }))
    },
    [updateDoc],
  )

  const removeEdge = useCallback(
    (edgeId: string) => {
      updateDoc((prev) => ({ ...prev, edges: prev.edges.filter((e) => e.id !== edgeId) }))
      if (selectedEdgeId === edgeId) setSelectedEdgeId(null)
    },
    [selectedEdgeId, updateDoc],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (wireDrag && canvasRef.current) {
        const pt = canvasPointFromEvent(e, canvasRef.current)
        setWireDrag((prev) => (prev ? { ...prev, x: pt.x, y: pt.y } : prev))
        setWireDropTargetId(resolveDropAt(pt.x, pt.y))
        return
      }
      if (!drag || !canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      const x = Math.max(8, Math.min(rect.width - NODE_W - 8, e.clientX - rect.left - drag.offsetX))
      const y = Math.max(8, e.clientY - rect.top - drag.offsetY)
      patchNode(drag.id, { x, y })
    },
    [drag, wireDrag, patchNode, resolveDropAt],
  )

  const completeWireDrag = useCallback(
    (targetNodeId: string | null) => {
      if (!wireDrag) return
      if (!targetNodeId) {
        setWireDrag(null)
        setWireDropTargetId(null)
        return
      }
      if (wireDrag.kind === "new") {
        if (wireDrag.fromId === targetNodeId) {
          setWireDrag(null)
          setWireDropTargetId(null)
          return
        }
        const label = newLineLabel.trim()
        const duplicate = doc.edges.some((e) => e.fromId === wireDrag.fromId && e.toId === targetNodeId && (e.label ?? "") === label)
        if (!duplicate) {
          const edge = newOrgChartEdge(wireDrag.fromId, targetNodeId, label)
          updateDoc((prev) => ({ ...prev, edges: [...prev.edges, edge] }))
          setSelectedEdgeId(edge.id)
          setSelectedId(targetNodeId)
        }
        setLinkFromId(null)
        setNewLineLabel("")
      } else {
        const edge = doc.edges.find((row) => row.id === wireDrag.edgeId)
        if (edge) {
          updateDoc((prev) => ({
            ...prev,
            edges: prev.edges.map((row) => {
              if (row.id !== wireDrag.edgeId) return row
              if (wireDrag.end === "from") {
                return targetNodeId !== row.toId ? { ...row, fromId: targetNodeId } : row
              }
              return targetNodeId !== row.fromId ? { ...row, toId: targetNodeId } : row
            }),
          }))
          setSelectedEdgeId(wireDrag.edgeId)
          setSelectedId(null)
        }
      }
      setWireDrag(null)
      setWireDropTargetId(null)
    },
    [wireDrag, doc.edges, newLineLabel, updateDoc],
  )

  const endDrag = useCallback(
    (e?: ReactPointerEvent) => {
      if (wireDrag && canvasRef.current && e) {
        const pt = canvasPointFromEvent(e, canvasRef.current)
        completeWireDrag(resolveDropAt(pt.x, pt.y))
        return
      }
      if (wireDrag) {
        setWireDrag(null)
        setWireDropTargetId(null)
      }
      setDrag(null)
    },
    [wireDrag, completeWireDrag, resolveDropAt],
  )

  const selected = selectedId ? nodeById.get(selectedId) ?? null : null
  const rootNode = doc.nodes.find((n) => !n.parentId) ?? doc.nodes[0]

  function handleNodeClick(nodeId: string) {
    if (linkFromId) {
      if (linkFromId === nodeId) {
        setLinkFromId(null)
        return
      }
      const label = newLineLabel.trim()
      const duplicate = doc.edges.some((e) => e.fromId === linkFromId && e.toId === nodeId && (e.label ?? "") === label)
      if (!duplicate) {
        const edge = newOrgChartEdge(linkFromId, nodeId, label)
        updateDoc((prev) => ({ ...prev, edges: [...prev.edges, edge] }))
        setSelectedEdgeId(edge.id)
      }
      setLinkFromId(null)
      setNewLineLabel("")
      setSelectedId(nodeId)
      return
    }
    setSelectedId(nodeId)
    setSelectedEdgeId(null)
  }

  function startWireFromNode(nodeId: string, e: ReactPointerEvent) {
    if (!canvasRef.current) return
    const node = nodeById.get(nodeId)
    if (!node) return
    const out = connectorOut(node, NODE_W, NODE_H)
    const pt = canvasPointFromEvent(e, canvasRef.current)
    setWireDrag({ kind: "new", fromId: nodeId, anchorX: out.x, anchorY: out.y, x: pt.x, y: pt.y })
    setLinkFromId(null)
    setSelectedEdgeId(null)
    setSelectedId(nodeId)
  }

  function startReconnectWire(edge: OrgChartEdge, end: "from" | "to", grabX: number, grabY: number) {
    if (!canvasRef.current) return
    const from = nodeById.get(edge.fromId)
    const to = nodeById.get(edge.toId)
    if (!from || !to) return
    const anchor = end === "from" ? connectorIn(to, NODE_W) : connectorOut(from, NODE_W, NODE_H)
    setWireDrag({
      kind: "reconnect",
      edgeId: edge.id,
      end,
      anchorX: anchor.x,
      anchorY: anchor.y,
      x: grabX,
      y: grabY,
    })
    setSelectedEdgeId(edge.id)
    setSelectedId(null)
    setLinkFromId(null)
  }

  function startLinkFromSelected() {
    if (!selectedId) return
    setLinkFromId(selectedId)
    setSelectedEdgeId(null)
  }

  function addChild(parentIdOverride?: string) {
    const parent = (parentIdOverride ? nodeById.get(parentIdOverride) : null) ?? selected ?? rootNode
    if (!parent) return
    const childCount = doc.edges.filter((e) => e.fromId === parent.id).length
    const node = newOrgChartNode("New role", parent.id, parent.x + childCount * 40 - 40, parent.y + 116)
    const edge = newOrgChartEdge(parent.id, node.id)
    updateDoc((prev) => ({
      ...prev,
      nodes: [...prev.nodes, node],
      edges: [...prev.edges, edge],
    }))
    setSelectedId(node.id)
    setSelectedEdgeId(edge.id)
  }

  function addRootRole() {
    const node = newOrgChartNode("New role", null, 40 + doc.nodes.length * 24, 40)
    updateDoc((prev) => ({ ...prev, nodes: [...prev.nodes, node] }))
    setSelectedId(node.id)
  }

  function removeSelected() {
    if (!selectedId) return
    updateDoc((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== selectedId),
      edges: prev.edges.filter((e) => e.fromId !== selectedId && e.toId !== selectedId),
    }))
    setSelectedId(null)
    setSelectedEdgeId(null)
  }

  function resetExample() {
    if (!window.confirm("Replace your org chart with the example layout?")) return
    updateDoc(createExampleOrganizationChart())
    setLinkFromId(null)
    setSelectedEdgeId(null)
  }

  function shareWithAdmin() {
    const label = user?.email ?? userId ?? "Tradesman user"
    updateDoc((prev) => ({ ...prev, shared_with_admin_at: new Date().toISOString() }))
    window.location.href = buildOrgChartShareMailto(doc, label)
  }

  async function saveMemberJobTitle(memberId: string, jobTitle: string) {
    if (!supabase) return
    try {
      if (!isSandboxDemoUserId(memberId)) {
        await saveJobTitleNicknameForProfile(supabase, memberId, jobTitle)
      }
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, jobTitle: jobTitle.trim() } : m)))
    } catch (e: unknown) {
      setErr(formatAppError(e))
    }
  }

  const memberById = useMemo(() => {
    const map = new Map(members.map((m) => [m.id, m]))
    for (const n of doc.nodes) {
      if (!n.linkedUserId || map.has(n.linkedUserId)) continue
      map.set(n.linkedUserId, {
        id: n.linkedUserId,
        displayName: isSandboxDemoUserId(n.linkedUserId) ? "Demo team member" : "Linked user",
        email: null,
        jobTitle: n.jobTitle,
        isDemo: isSandboxDemoUserId(n.linkedUserId),
      })
    }
    return map
  }, [members, doc.nodes])

  const orgNodeLinkedLabel = useCallback(
    (n: OrgChartNode): string | null => {
      if (n.externalContactId) {
        const ext = externalContactById(externalContacts, n.externalContactId)
        return ext ? `External: ${ext.displayName}` : "External contact"
      }
      if (n.linkedUserId) {
        return memberById.get(n.linkedUserId)?.displayName ?? "Linked user"
      }
      return null
    },
    [externalContacts, memberById],
  )

  function openContextMenu(e: React.MouseEvent, target: "node" | "edge" | "canvas", id?: string) {
    e.preventDefault()
    e.stopPropagation()
    if (target === "node" && id) {
      setSelectedId(id)
      setSelectedEdgeId(null)
    } else if (target === "edge" && id) {
      setSelectedEdgeId(id)
      setSelectedId(null)
    }
    setContextMenu({ x: e.clientX, y: e.clientY, target, id })
  }

  const contextMenuActions = useMemo((): DiagramMenuAction[] => {
    if (!contextMenu) return []
    if (contextMenu.target === "node" && contextMenu.id) {
      return [
        { id: "rename", label: "Rename (edit in box)" },
        { id: "copy", label: "Copy role" },
        { id: "paste", label: "Paste role", disabled: !clipboardRef.current },
        { id: "add_line", label: "Add reporting line from here" },
        { id: "add_child", label: "Add child role" },
        { id: "remove", label: "Remove role", danger: true },
      ]
    }
    if (contextMenu.target === "edge" && contextMenu.id) {
      return [{ id: "remove", label: "Remove line", danger: true }]
    }
    return [{ id: "paste", label: "Paste role", disabled: !clipboardRef.current }]
  }, [contextMenu])

  function handleContextAction(actionId: string) {
    if (!contextMenu) return
    if (contextMenu.target === "node" && contextMenu.id) {
      const node = nodeById.get(contextMenu.id)
      if (!node) return
      if (actionId === "copy") clipboardRef.current = { ...node }
      if (actionId === "paste" && clipboardRef.current) {
        const src = clipboardRef.current
        const copy = newOrgChartNode(`${src.label} (copy)`, node.parentId, node.x + 32, node.y + 32)
        copy.jobTitle = src.jobTitle
        copy.linkedUserId = src.linkedUserId
        updateDoc((prev) => ({ ...prev, nodes: [...prev.nodes, copy] }))
        setSelectedId(copy.id)
      }
      if (actionId === "add_line") {
        setSelectedId(contextMenu.id)
        startLinkFromSelected()
      }
      if (actionId === "add_child") {
        addChild(contextMenu.id)
      }
      if (actionId === "remove") {
        setSelectedId(contextMenu.id)
        removeSelected()
      }
    } else if (contextMenu.target === "edge" && contextMenu.id && actionId === "remove") {
      removeEdge(contextMenu.id)
    } else if (actionId === "paste" && clipboardRef.current) {
      const src = clipboardRef.current
      const parent = rootNode
      if (!parent) return
      const copy = newOrgChartNode(`${src.label} (copy)`, parent.id, parent.x + 40, parent.y + 116)
      copy.jobTitle = src.jobTitle
      copy.linkedUserId = src.linkedUserId
      updateDoc((prev) => ({ ...prev, nodes: [...prev.nodes, copy] }))
      setSelectedId(copy.id)
    }
  }

  const selectedEdge = selectedEdgeId ? doc.edges.find((e) => e.id === selectedEdgeId) ?? null : null
  const selectedNodeEdges = selectedId ? doc.edges.filter((e) => e.fromId === selectedId || e.toId === selectedId) : []

  const dockTitle = selectedEdge ? "Reporting line" : selected ? "Role" : linkFromId ? "Adding line" : "Properties"
  const dockSubtitle = selectedEdge
    ? "Drag endpoints on the chart or edit from/to roles here."
    : selected
      ? "Link users, manage reporting lines, and add child roles."
      : linkFromId
        ? "Click a target role on the chart, or drag from a connector dot."
        : "Click a role or line on the chart. Right-click for copy, paste, add line, and remove."

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "16px 20px 40px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <button type="button" onClick={() => setPage("dashboard")} style={secondaryBtn}>
          ← Dashboard
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: theme.text, flex: 1 }}>Organization chart</h1>
        <button type="button" onClick={() => setPage("business-workflow")} style={navCrossBtn}>
          Business workflow →
        </button>
        <button type="button" onClick={() => void saveNow()} disabled={saving || loading} style={primaryBtn}>
          {saving ? "Saving…" : "Save"}
        </button>
        {saveFlash ? <span style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>{saveFlash}</span> : null}
        {saving && !saveFlash ? <span style={{ fontSize: 12, color: "#64748b" }}>Saving…</span> : null}
      </div>

      <p style={{ margin: "0 0 16px", fontSize: 14, color: "#64748b", lineHeight: 1.55, maxWidth: 820 }}>
        Drag roles into your company structure. Drag from a role&apos;s connector dot to another role to draw a reporting
        line, or select a line and drag its endpoints to reconnect. Link nodes to Tradesman users and set job titles.
      </p>

      {err ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p> : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <input
          value={doc.title}
          onChange={(e) => updateDoc({ title: e.target.value })}
          style={{ ...theme.formInput, flex: "1 1 220px", fontWeight: 700 }}
          placeholder="Chart title"
        />
        <button type="button" onClick={() => addChild()} style={primaryBtn}>
          + Add role
        </button>
        <button type="button" onClick={addRootRole} style={secondaryBtn}>
          + Top-level role
        </button>
        <button
          type="button"
          onClick={startLinkFromSelected}
          disabled={!selectedId}
          style={{ ...secondaryBtn, opacity: selectedId ? 1 : 0.55 }}
        >
          + Add line
        </button>
        {linkFromId ? (
          <button type="button" onClick={() => setLinkFromId(null)} style={{ ...secondaryBtn, borderColor: "#fecaca", color: "#b91c1c" }}>
            Cancel line
          </button>
        ) : null}
        <button type="button" onClick={() => downloadOrgChartSvg(doc)} style={secondaryBtn}>
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
            Remove role
          </button>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {loading ? (
          <p style={{ color: "#64748b" }}>Loading chart…</p>
        ) : (
          <div
            ref={canvasRef}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endDrag(e)}
            onPointerLeave={(e) => endDrag(e)}
            onContextMenu={(e) => openContextMenu(e, "canvas")}
            style={{
              position: "relative",
              minHeight: 640,
              borderRadius: 12,
              border: `1px solid ${theme.border}`,
              background: "#f8fafc",
              overflow: "auto",
            }}
          >
            {wireDrag ? (
              <DiagramWireDragBanner
                message={
                  wireDrag.kind === "new"
                    ? "Drop on any role box to connect"
                    : wireDrag.end === "from"
                      ? "Drop on the role where this line should start"
                      : "Drop on the role this line should point to"
                }
              />
            ) : null}
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} aria-hidden={false}>
              {wireDrag ? (
                <line
                  x1={wireDrag.kind === "reconnect" && wireDrag.end === "from" ? wireDrag.x : wireDrag.anchorX}
                  y1={wireDrag.kind === "reconnect" && wireDrag.end === "from" ? wireDrag.y : wireDrag.anchorY}
                  x2={wireDrag.kind === "reconnect" && wireDrag.end === "from" ? wireDrag.anchorX : wireDrag.x}
                  y2={wireDrag.kind === "reconnect" && wireDrag.end === "from" ? wireDrag.anchorY : wireDrag.y}
                  stroke="#64748b"
                  strokeWidth={2.5}
                  strokeDasharray="7 5"
                />
              ) : null}
              {edgesWithLanes.map(({ edge, laneIndex, laneCount }) => {
                const from = nodeById.get(edge.fromId)
                const to = nodeById.get(edge.toId)
                if (!from || !to) return null
                const g = orgChartEdgeGeometry(from, to, laneIndex, laneCount)
                const selected = selectedEdgeId === edge.id
                const hovered = hoveredEdgeId === edge.id
                const label = edge.label?.trim()
                const labelW = label ? Math.min(180, Math.max(60, label.length * 6 + 14)) : 0
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
                      onMouseEnter={() => setHoveredEdgeId(edge.id)}
                      onMouseLeave={() => setHoveredEdgeId((id) => (id === edge.id ? null : id))}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedEdgeId(edge.id)
                        setSelectedId(null)
                        setLinkFromId(null)
                      }}
                      onContextMenu={(e) => openContextMenu(e, "edge", edge.id)}
                    />
                    <line
                      x1={g.x1}
                      y1={g.y1}
                      x2={g.x2}
                      y2={g.y2}
                      stroke="#64748b"
                      strokeWidth={selected || hovered ? 3.5 : 2}
                      markerEnd="url(#org-arrow)"
                      style={{ pointerEvents: "none" }}
                    />
                    {label ? (
                      <g style={{ pointerEvents: "none" }}>
                        <rect x={g.cx - labelW / 2} y={g.cy - 9} width={labelW} height={18} rx={4} fill="#fff" stroke="#94a3b8" />
                        <text x={g.cx} y={g.cy + 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="#475569">
                          {label.length > 26 ? `${label.slice(0, 25)}…` : label}
                        </text>
                      </g>
                    ) : null}
                  </g>
                )
              })}
              <defs>
                <marker id="org-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#64748b" />
                </marker>
              </defs>
            </svg>

            {doc.nodes.map((n) => {
              const eligible = Boolean(wireDrag && isWireDropAllowed(n.id))
              return (
              <OrgNodeCard
                key={n.id}
                node={n}
                linkedLabel={orgNodeLinkedLabel(n)}
                selected={selectedId === n.id}
                linkSource={linkFromId === n.id}
                linkMode={Boolean(linkFromId) || Boolean(wireDrag)}
                wireDragActive={Boolean(wireDrag)}
                wireEligible={eligible}
                wireDropTarget={wireDropTargetId === n.id}
                onWireTargetEnter={() => {
                  if (wireDrag && isWireDropAllowed(n.id)) setWireDropTargetId(n.id)
                }}
                onWireTargetLeave={() => setWireDropTargetId((id) => (id === n.id ? null : id))}
                onWireTargetDrop={() => {
                  if (wireDrag && isWireDropAllowed(n.id)) completeWireDrag(n.id)
                }}
                members={members}
                onSelect={() => handleNodeClick(n.id)}
                onPatch={(patch) => patchNode(n.id, patch)}
                onDragStart={(offsetX, offsetY) => {
                  if (linkFromId || wireDrag) return
                  setDrag({ id: n.id, offsetX, offsetY })
                }}
                onStartWire={(e) => startWireFromNode(n.id, e)}
                onContextMenu={(e) => openContextMenu(e, "node", n.id)}
              />
            )})}

            {edgesWithLanes.map(({ edge }) => {
              const from = nodeById.get(edge.fromId)
              const to = nodeById.get(edge.toId)
              if (!from || !to) return null
              const selected = selectedEdgeId === edge.id
              const hovered = hoveredEdgeId === edge.id
              const reconnecting = wireDrag?.kind === "reconnect" && wireDrag.edgeId === edge.id
              if (!(selected || hovered || reconnecting)) return null
              const start = connectorOut(from, NODE_W, NODE_H)
              const end = connectorIn(to, NODE_W)
              return (
                <Fragment key={`org-handles-${edge.id}`}>
                  <WireEndpointHandle
                    x={start.x}
                    y={start.y}
                    stroke="#64748b"
                    selected={selected || reconnecting}
                    emphasized={hovered || reconnecting}
                    label="Start"
                    title="Drag to move where this line starts"
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      startReconnectWire(edge, "from", start.x, start.y)
                      canvasRef.current?.setPointerCapture(e.pointerId)
                    }}
                  />
                  <WireEndpointHandle
                    x={end.x}
                    y={end.y}
                    stroke="#64748b"
                    selected={selected || reconnecting}
                    emphasized={hovered || reconnecting}
                    label="Points to"
                    title="Drag to move where this line points"
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      startReconnectWire(edge, "to", end.x, end.y)
                      canvasRef.current?.setPointerCapture(e.pointerId)
                    }}
                  />
                </Fragment>
              )
            })}
          </div>
        )}

        <DiagramEditorDock title={dockTitle} subtitle={dockSubtitle}>
          {linkFromId ? (
            <div style={linkBanner}>
              <div style={{ fontWeight: 700 }}>
                From: {nodeById.get(linkFromId)?.label ?? "Role"} → click target role or drag a connector dot
              </div>
              <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600, marginTop: 8 }}>
                Line label (optional)
                <input value={newLineLabel} onChange={(e) => setNewLineLabel(e.target.value)} style={theme.formInput} placeholder="e.g. Reports to" />
              </label>
              <button type="button" onClick={() => setLinkFromId(null)} style={{ ...secondaryBtn, marginTop: 8, borderColor: "#fecaca", color: "#b91c1c" }}>
                Cancel line
              </button>
            </div>
          ) : selectedEdge ? (
            <OrgEdgeEditor
              edge={selectedEdge}
              nodeById={nodeById}
              allNodes={doc.nodes}
              onPatch={(patch) => patchEdge(selectedEdge.id, patch)}
              onRemove={() => removeEdge(selectedEdge.id)}
            />
          ) : selected ? (
            <>
              <OrgRoleEditor
                node={selected}
                members={members}
                externalContacts={externalContacts.contacts}
                linkedLabel={orgNodeLinkedLabel(selected)}
                onPatch={(patch) => patchNode(selected.id, patch)}
                onRemove={removeSelected}
                onAddChild={addChild}
                onAddLine={startLinkFromSelected}
              />
              {selectedNodeEdges.length > 0 ? (
                <>
                  <h3 style={{ margin: "8px 0 0", fontSize: 14, fontWeight: 800 }}>Lines for this role</h3>
                  <div style={{ display: "grid", gap: 10 }}>
                    {selectedNodeEdges.map((edge) => (
                      <OrgEdgeEditor
                        key={edge.id}
                        edge={edge}
                        nodeById={nodeById}
                        allNodes={doc.nodes}
                        compact
                        active={selectedEdgeId === edge.id}
                        onPatch={(patch) => patchEdge(edge.id, patch)}
                        onRemove={() => removeEdge(edge.id)}
                        onFocus={() => setSelectedEdgeId(edge.id)}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No reporting lines yet — drag a connector dot or use + Add line.</p>
              )}
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
                No role selected. Team job titles for signed-in users are listed below for quick nickname edits.
              </p>
              <ExternalContactsPanel
                contacts={externalContacts.contacts}
                onAdd={() =>
                  updateExternalContacts((prev) => ({
                    ...prev,
                    contacts: [...prev.contacts, newExternalContact("New external contact")],
                  }))
                }
                onPatch={(id, patch) =>
                  updateExternalContacts((prev) => ({
                    ...prev,
                    contacts: prev.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
                  }))
                }
                onRemove={(id) =>
                  updateExternalContacts((prev) => ({
                    ...prev,
                    contacts: prev.contacts.filter((c) => c.id !== id),
                  }))
                }
              />
              <OrgTeamJobTitlesPanel members={members} onSaveTitle={saveMemberJobTitle} />
            </>
          )}
        </DiagramEditorDock>
      </div>

      {contextMenu ? (
        <DiagramContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextMenuActions}
          onSelect={handleContextAction}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, color: "#475569" }}>Preview export</summary>
        <div
          style={{ marginTop: 10, padding: 12, borderRadius: 10, border: `1px solid ${theme.border}`, background: "#fff" }}
          dangerouslySetInnerHTML={{ __html: orgChartToSvg(doc) }}
        />
      </details>
    </div>
  )
}

function OrgEdgeEditor({
  edge,
  nodeById,
  allNodes,
  compact,
  active,
  onPatch,
  onRemove,
  onFocus,
}: {
  edge: OrgChartEdge
  nodeById: Map<string, OrgChartNode>
  allNodes: OrgChartNode[]
  compact?: boolean
  active?: boolean
  onPatch: (patch: Partial<OrgChartEdge>) => void
  onRemove: () => void
  onFocus?: () => void
}) {
  const from = nodeById.get(edge.fromId)?.label ?? "Role"
  const to = nodeById.get(edge.toId)?.label ?? "Role"
  return (
    <div
      style={{
        padding: compact ? "10px 10px" : "12px 12px",
        borderRadius: 10,
        border: active ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
        background: "#fff",
      }}
      onClick={onFocus}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 6 }}>{from} → {to}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
          From role
          <select value={edge.fromId} onChange={(e) => onPatch({ fromId: e.target.value })} style={theme.formInput} onClick={(e) => e.stopPropagation()}>
            {allNodes.map((n) => (
              <option key={n.id} value={n.id}>{n.label}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
          To role
          <select value={edge.toId} onChange={(e) => onPatch({ toId: e.target.value })} style={theme.formInput} onClick={(e) => e.stopPropagation()}>
            {allNodes.map((n) => (
              <option key={n.id} value={n.id}>{n.label}</option>
            ))}
          </select>
        </label>
      </div>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
        Line label
        <input
          value={edge.label ?? ""}
          onChange={(e) => onPatch({ label: e.target.value.trim() || undefined })}
          placeholder="Optional"
          style={theme.formInput}
          onClick={(e) => e.stopPropagation()}
        />
      </label>
      <button type="button" onClick={onRemove} style={{ ...secondaryBtn, fontSize: 11, padding: "5px 10px", color: "#b91c1c", borderColor: "#fecaca" }}>
        Remove line
      </button>
    </div>
  )
}

function OrgNodeCard({
  node,
  linkedLabel,
  selected,
  linkSource,
  linkMode,
  wireDragActive,
  wireEligible,
  wireDropTarget,
  members,
  onSelect,
  onPatch,
  onDragStart,
  onStartWire,
  onWireTargetEnter,
  onWireTargetLeave,
  onWireTargetDrop,
  onContextMenu,
}: {
  node: OrgChartNode
  linkedLabel: string | null
  selected: boolean
  linkSource: boolean
  linkMode: boolean
  wireDragActive?: boolean
  wireEligible?: boolean
  wireDropTarget?: boolean
  members: LinkableOrgUser[]
  onSelect: () => void
  onPatch: (patch: Partial<OrgChartNode>) => void
  onDragStart: (offsetX: number, offsetY: number) => void
  onStartWire: (e: ReactPointerEvent) => void
  onWireTargetEnter?: () => void
  onWireTargetLeave?: () => void
  onWireTargetDrop?: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: NODE_W,
        minHeight: NODE_H,
        borderRadius: 10,
        border: wireDropTarget
          ? "3px solid #16a34a"
          : linkSource
            ? "2px solid #ca8a04"
            : wireEligible
              ? "2px dashed #86efac"
              : selected
                ? `2px solid ${theme.primary}`
                : `1px solid ${theme.border}`,
        background: wireDropTarget ? "#ecfdf5" : linkSource ? "#fefce8" : wireEligible ? "#f0fdf4" : "#fff",
        boxShadow: wireDropTarget || selected || linkSource ? "0 6px 20px rgba(22,163,74,0.22)" : "0 2px 8px rgba(15,23,42,0.06)",
        padding: "8px 10px",
        cursor: wireDragActive ? "copy" : linkMode ? "crosshair" : "grab",
        touchAction: "none",
        zIndex: wireDropTarget || selected || linkSource ? 3 : wireEligible ? 2 : 1,
        transform: wireDropTarget ? "scale(1.02)" : undefined,
        transition: "transform 0.12s ease, border-color 0.12s ease",
      }}
      onPointerEnter={() => {
        if (wireDragActive) onWireTargetEnter?.()
      }}
      onPointerLeave={() => {
        if (wireDragActive) onWireTargetLeave?.()
      }}
      onPointerUp={(e) => {
        if (wireDragActive && wireDropTarget) {
          e.stopPropagation()
          onWireTargetDrop?.()
        }
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).dataset.wirePort === "out") return
        if (wireDragActive) return
        onSelect()
        if (linkMode) return
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        onDragStart(e.clientX - rect.left, e.clientY - rect.top)
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onContextMenu={onContextMenu}
    >
      {wireDropTarget ? (
        <div style={{ position: "absolute", top: -26, left: "50%", transform: "translateX(-50%)", fontSize: 11, fontWeight: 800, color: "#166534", background: "#dcfce7", border: "1px solid #86efac", borderRadius: 999, padding: "3px 10px", pointerEvents: "none" }}>
          Release to connect
        </div>
      ) : null}
      <textarea
        value={node.label}
        onChange={(e) => onPatch({ label: e.target.value })}
        onClick={(e) => e.stopPropagation()}
        placeholder="Role / department"
        rows={2}
        style={{ ...TILE_LABEL_STYLE, fontSize: 13, fontWeight: 700, color: theme.text }}
      />
      <textarea
        value={node.jobTitle}
        onChange={(e) => onPatch({ jobTitle: e.target.value })}
        onClick={(e) => e.stopPropagation()}
        placeholder="Job title"
        rows={2}
        style={TILE_SUBLABEL_STYLE}
      />
      <select
        value={node.linkedUserId ?? ""}
        onChange={(e) => {
          const id = e.target.value || null
          const member = members.find((m) => m.id === id)
          onPatch({
            linkedUserId: id,
            jobTitle: member?.jobTitle && !node.jobTitle ? member.jobTitle : node.jobTitle,
          })
        }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", marginTop: 4, fontSize: 11, borderRadius: 6, border: `1px solid ${theme.border}`, padding: "3px 6px" }}
      >
        <option value="">Link Tradesman user…</option>
        <LinkableOrgUserOptions members={members} />
      </select>
      {linkedLabel ? <div style={{ fontSize: 10, color: "#0ea5e9", marginTop: 4 }}>{linkedLabel}</div> : null}
      {linkSource ? <div style={{ fontSize: 10, color: "#ca8a04", marginTop: 4 }}>Now click the role this line goes to</div> : null}
      {wireDragActive ? (
        <div aria-hidden data-wire-port="in" style={{ position: "absolute", left: "50%", top: -10, transform: "translateX(-50%)", width: 20, height: 20, borderRadius: "50%", border: "2px dashed #16a34a", background: "#ecfdf5", pointerEvents: "none" }} />
      ) : null}
      <button
        type="button"
        data-wire-port="out"
        title="Drag to another role to connect"
        onPointerDown={(e) => {
          e.stopPropagation()
          onStartWire(e)
          ;(e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId)
        }}
        style={{
          position: "absolute",
          left: "50%",
          bottom: -12,
          transform: "translateX(-50%)",
          width: 24,
          height: 24,
          borderRadius: "50%",
          border: "3px solid #16a34a",
          background: "linear-gradient(180deg, #ecfdf5 0%, #bbf7d0 100%)",
          cursor: "grab",
          padding: 0,
          zIndex: 4,
          boxShadow: "0 2px 10px rgba(22,163,74,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 900,
          color: "#166534",
          lineHeight: 1,
        }}
      >
        ↓
      </button>
    </div>
  )
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

const navCrossBtn: CSSProperties = {
  ...secondaryBtn,
  background: "#eff6ff",
  borderColor: "#bae6fd",
  fontWeight: 700,
}

function LinkableOrgUserOptions({ members }: { members: LinkableOrgUser[] }) {
  return (
    <>
      {members.some((m) => m.isDemo) ? (
        <optgroup label="Demo team (training)">
          {members
            .filter((m) => m.isDemo)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
                {m.jobTitle ? ` — ${m.jobTitle}` : ""}
              </option>
            ))}
        </optgroup>
      ) : null}
      {members.some((m) => !m.isDemo) ? (
        <optgroup label="Organization users">
          {members
            .filter((m) => !m.isDemo)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
                {m.jobTitle ? ` — ${m.jobTitle}` : ""}
              </option>
            ))}
        </optgroup>
      ) : null}
    </>
  )
}

function OrgRoleEditor({
  node,
  members,
  externalContacts,
  linkedLabel,
  onPatch,
  onRemove,
  onAddChild,
  onAddLine,
}: {
  node: OrgChartNode
  members: LinkableOrgUser[]
  externalContacts: ExternalContact[]
  linkedLabel: string | null
  onPatch: (patch: Partial<OrgChartNode>) => void
  onRemove: () => void
  onAddChild: () => void
  onAddLine: () => void
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
        Role / department
        <input value={node.label} onChange={(e) => onPatch({ label: e.target.value })} style={theme.formInput} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
        Job title
        <input value={node.jobTitle} onChange={(e) => onPatch({ jobTitle: e.target.value })} style={theme.formInput} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
        Linked Tradesman user
        <select
          value={node.linkedUserId ?? ""}
          onChange={(e) => {
            const id = e.target.value || null
            const member = members.find((m) => m.id === id)
            onPatch({
              linkedUserId: id,
              externalContactId: id ? null : node.externalContactId,
              jobTitle: member?.jobTitle && !node.jobTitle ? member.jobTitle : node.jobTitle,
            })
          }}
          style={theme.formInput}
        >
          <option value="">Link Tradesman user…</option>
          <LinkableOrgUserOptions members={members} />
        </select>
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
        External contact (outsourced)
        <select
          value={node.externalContactId ?? ""}
          onChange={(e) =>
            onPatch({
              externalContactId: e.target.value || null,
              linkedUserId: e.target.value ? null : node.linkedUserId,
            })
          }
          style={theme.formInput}
        >
          <option value="">None — internal team member</option>
          {externalContacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
              {c.role ? ` — ${c.role}` : ""}
            </option>
          ))}
        </select>
      </label>
      {linkedLabel ? <div style={{ fontSize: 12, color: "#0ea5e9" }}>Routing: {linkedLabel}</div> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" onClick={onAddLine} style={secondaryBtn}>
          Add reporting line
        </button>
        <button type="button" onClick={onAddChild} style={primaryBtn}>
          Add child role
        </button>
        <button type="button" onClick={onRemove} style={{ ...secondaryBtn, color: "#b91c1c", borderColor: "#fecaca" }}>
          Remove role
        </button>
      </div>
    </div>
  )
}

function ExternalContactsPanel({
  contacts,
  onAdd,
  onPatch,
  onRemove,
}: {
  contacts: ExternalContact[]
  onAdd: () => void
  onPatch: (id: string, patch: Partial<ExternalContact>) => void
  onRemove: (id: string) => void
}) {
  return (
    <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>External contacts</h3>
        <button type="button" onClick={onAdd} style={primaryBtn}>
          Add external contact
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
        Vendors and outsourced roles (parts, field techs, accounting) used by workflow routing and org chart links.
      </p>
      {contacts.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>No external contacts yet.</p>
      ) : (
        contacts.map((c) => (
          <div
            key={c.id}
            style={{
              padding: 10,
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#fff",
              display: "grid",
              gap: 8,
            }}
          >
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
              Display name
              <input
                value={c.displayName}
                onChange={(e) => onPatch(c.id, { displayName: e.target.value })}
                style={theme.formInput}
              />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
                Email
                <input
                  value={c.email ?? ""}
                  onChange={(e) => onPatch(c.id, { email: e.target.value.trim() || null })}
                  style={theme.formInput}
                />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
                Phone
                <input
                  value={c.phone ?? ""}
                  onChange={(e) => onPatch(c.id, { phone: e.target.value.trim() || null })}
                  style={theme.formInput}
                />
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
                Role / function
                <input
                  value={c.role ?? ""}
                  onChange={(e) => onPatch(c.id, { role: e.target.value.trim() || null })}
                  placeholder="e.g. Parts vendor"
                  style={theme.formInput}
                />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
                Department
                <input
                  value={c.department ?? ""}
                  onChange={(e) => onPatch(c.id, { department: e.target.value.trim() || null })}
                  style={theme.formInput}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => onRemove(c.id)}
              style={{ ...secondaryBtn, color: "#b91c1c", borderColor: "#fecaca", justifySelf: "start" }}
            >
              Remove contact
            </button>
          </div>
        ))
      )}
    </div>
  )
}

function OrgTeamJobTitlesPanel({
  members,
  onSaveTitle,
}: {
  members: LinkableOrgUser[]
  onSaveTitle: (memberId: string, jobTitle: string) => void
}) {
  if (members.length === 0) return <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>No team members loaded yet.</p>
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Team job titles</h3>
      {members.map((m) => (
        <label key={m.id} style={{ display: "grid", gap: 4, fontSize: 12 }}>
          <span style={{ fontWeight: 700, color: theme.text }}>{m.displayName}</span>
          <input
            defaultValue={m.jobTitle}
            placeholder="Job title nickname"
            style={theme.formInput}
            onBlur={(e) => {
              if (e.target.value.trim() !== m.jobTitle) onSaveTitle(m.id, e.target.value)
            }}
          />
        </label>
      ))}
    </div>
  )
}
