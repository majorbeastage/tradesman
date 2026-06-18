import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { formatAppError } from "../../lib/formatAppError"
import { saveJobTitleNicknameForProfile } from "../../lib/jobTitleNickname"
import { loadLinkableOrgUsers, type LinkableOrgUser } from "../../lib/orgChartMembers"
import { DiagramContextMenu, type DiagramMenuAction } from "../../components/diagram/DiagramContextMenu"
import { DiagramEditorDock } from "../../components/diagram/DiagramEditorDock"
import {
  buildOrgChartShareMailto,
  createExampleOrganizationChart,
  downloadOrgChartSvg,
  loadOrganizationChartFromMetadata,
  mergeOrganizationChartMetadata,
  newOrgChartNode,
  orgChartToSvg,
  type OrganizationChartDoc,
  type OrgChartNode,
} from "../../lib/organizationChart"

type Props = {
  setPage: (page: string) => void
}

const NODE_W = 240
const NODE_H = 72

export default function OrganizationChartPage({ setPage }: Props) {
  const { user } = useAuth()
  const userId = useScopedUserId() ?? user?.id ?? null
  const [doc, setDoc] = useState<OrganizationChartDoc>(() => createExampleOrganizationChart())
  const [members, setMembers] = useState<LinkableOrgUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: "node" | "canvas"; id?: string } | null>(null)
  const clipboardRef = useRef<OrgChartNode | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<number | null>(null)

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
        else setDoc(loadOrganizationChartFromMetadata(profileRes.data?.metadata))
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
    (next: OrganizationChartDoc) => {
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

  const updateDoc = useCallback(
    (patch: Partial<OrganizationChartDoc> | ((prev: OrganizationChartDoc) => OrganizationChartDoc)) => {
      setDoc((prev) => {
        const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch }
        if (saveTimer.current) window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => persist(next), 800)
        return next
      })
    },
    [persist],
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

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!drag || !canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      const x = Math.max(8, Math.min(rect.width - NODE_W - 8, e.clientX - rect.left - drag.offsetX))
      const y = Math.max(8, e.clientY - rect.top - drag.offsetY)
      patchNode(drag.id, { x, y })
    },
    [drag, patchNode],
  )

  const endDrag = useCallback(() => setDrag(null), [])

  const selected = doc.nodes.find((n) => n.id === selectedId) ?? null
  const rootNode = doc.nodes.find((n) => !n.parentId) ?? doc.nodes[0]

  function addChild() {
    const parent = selected ?? rootNode
    if (!parent) return
    const childCount = doc.nodes.filter((n) => n.parentId === parent.id).length
    const node = newOrgChartNode("New role", parent.id, parent.x + childCount * 40 - 40, parent.y + 116)
    updateDoc((prev) => ({ ...prev, nodes: [...prev.nodes, node] }))
    setSelectedId(node.id)
  }

  function removeSelected() {
    if (!selectedId) return
    updateDoc((prev) => ({
      ...prev,
      nodes: prev.nodes
        .filter((n) => n.id !== selectedId && n.parentId !== selectedId)
        .map((n) => (n.parentId === selectedId ? { ...n, parentId: null } : n)),
    }))
    setSelectedId(null)
  }

  function resetExample() {
    if (!window.confirm("Replace your org chart with the example layout?")) return
    updateDoc(createExampleOrganizationChart())
  }

  function shareWithAdmin() {
    const label = user?.email ?? userId ?? "Tradesman user"
    updateDoc((prev) => ({ ...prev, shared_with_admin_at: new Date().toISOString() }))
    window.location.href = buildOrgChartShareMailto(doc, label)
  }

  async function saveMemberJobTitle(memberId: string, jobTitle: string) {
    if (!supabase) return
    try {
      await saveJobTitleNicknameForProfile(supabase, memberId, jobTitle)
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, jobTitle: jobTitle.trim() } : m)))
    } catch (e: unknown) {
      setErr(formatAppError(e))
    }
  }

  const memberById = new Map(members.map((m) => [m.id, m]))

  function openContextMenu(e: React.MouseEvent, target: "node" | "canvas", id?: string) {
    e.preventDefault()
    e.stopPropagation()
    if (id) setSelectedId(id)
    setContextMenu({ x: e.clientX, y: e.clientY, target, id })
  }

  const contextMenuActions = useMemo((): DiagramMenuAction[] => {
    if (!contextMenu) return []
    if (contextMenu.target === "node" && contextMenu.id) {
      return [
        { id: "rename", label: "Rename (edit in box)" },
        { id: "copy", label: "Copy role" },
        { id: "paste", label: "Paste role", disabled: !clipboardRef.current },
        { id: "add_child", label: "Add child role" },
        { id: "remove", label: "Remove role", danger: true },
      ]
    }
    return [{ id: "paste", label: "Paste role", disabled: !clipboardRef.current }]
  }, [contextMenu])

  function handleContextAction(actionId: string) {
    if (!contextMenu) return
    if (contextMenu.target === "node" && contextMenu.id) {
      const node = doc.nodes.find((n) => n.id === contextMenu.id)
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
      if (actionId === "add_child") {
        setSelectedId(contextMenu.id)
        addChild()
      }
      if (actionId === "remove") {
        setSelectedId(contextMenu.id)
        removeSelected()
      }
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

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "16px 20px 40px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <button type="button" onClick={() => setPage("dashboard")} style={secondaryBtn}>
          ← Dashboard
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: theme.text, flex: 1 }}>Organization chart</h1>
        {saving ? <span style={{ fontSize: 12, color: "#64748b" }}>Saving…</span> : null}
      </div>

      <p style={{ margin: "0 0 16px", fontSize: 14, color: "#64748b", lineHeight: 1.55, maxWidth: 820 }}>
        Drag roles into your company structure. Link nodes to signed-in Tradesman users and set job titles — future
        estimates, purchase orders, work orders, scheduling, receipts, and approvals will route through this chart.
      </p>

      {err ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p> : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <input
          value={doc.title}
          onChange={(e) => updateDoc({ title: e.target.value })}
          style={{ ...theme.formInput, flex: "1 1 220px", fontWeight: 700 }}
          placeholder="Chart title"
        />
        <button type="button" onClick={addChild} style={primaryBtn}>
          + Add role
        </button>
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
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
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
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} aria-hidden>
              {doc.nodes.map((n) => {
                if (!n.parentId) return null
                const parent = doc.nodes.find((p) => p.id === n.parentId)
                if (!parent) return null
                const x1 = parent.x + NODE_W / 2
                const y1 = parent.y + NODE_H
                const x2 = n.x + NODE_W / 2
                const y2 = n.y
                return <line key={`${parent.id}-${n.id}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94a3b8" strokeWidth={2} />
              })}
            </svg>

            {doc.nodes.map((n) => (
              <OrgNodeCard
                key={n.id}
                node={n}
                linkedLabel={n.linkedUserId ? memberById.get(n.linkedUserId)?.displayName ?? "Linked user" : null}
                selected={selectedId === n.id}
                members={members}
                onSelect={() => setSelectedId(n.id)}
                onPatch={(patch) => patchNode(n.id, patch)}
                onDragStart={(offsetX, offsetY) => setDrag({ id: n.id, offsetX, offsetY })}
                onContextMenu={(e) => openContextMenu(e, "node", n.id)}
              />
            ))}
          </div>
        )}

        <DiagramEditorDock
          title={selected ? "Role" : "Properties"}
          subtitle={
            selected
              ? "Link a Tradesman user and set job title. Selection stays until you pick another role."
              : "Click a role on the chart to edit it here. Right-click for copy, paste, add child, and remove."
          }
        >
          {selected ? (
            <OrgRoleEditor
              node={selected}
              members={members}
              linkedLabel={selected.linkedUserId ? memberById.get(selected.linkedUserId)?.displayName ?? null : null}
              onPatch={(patch) => patchNode(selected.id, patch)}
              onRemove={removeSelected}
              onAddChild={addChild}
            />
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
                No role selected. Team job titles for signed-in users are listed below for quick nickname edits.
              </p>
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

function OrgNodeCard({
  node,
  linkedLabel,
  selected,
  members,
  onSelect,
  onPatch,
  onDragStart,
  onContextMenu,
}: {
  node: OrgChartNode
  linkedLabel: string | null
  selected: boolean
  members: LinkableOrgUser[]
  onSelect: () => void
  onPatch: (patch: Partial<OrgChartNode>) => void
  onDragStart: (offsetX: number, offsetY: number) => void
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
        border: selected ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
        background: "#fff",
        boxShadow: selected ? "0 4px 14px rgba(249,115,22,0.18)" : "0 2px 8px rgba(15,23,42,0.06)",
        padding: "8px 10px",
        cursor: "grab",
        touchAction: "none",
      }}
      onPointerDown={(e) => {
        onSelect()
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        onDragStart(e.clientX - rect.left, e.clientY - rect.top)
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onContextMenu={onContextMenu}
    >
      <input
        value={node.label}
        onChange={(e) => onPatch({ label: e.target.value })}
        onClick={(e) => e.stopPropagation()}
        placeholder="Role / department"
        style={{ width: "100%", border: "none", background: "transparent", fontSize: 13, fontWeight: 700, color: theme.text, outline: "none" }}
      />
      <input
        value={node.jobTitle}
        onChange={(e) => onPatch({ jobTitle: e.target.value })}
        onClick={(e) => e.stopPropagation()}
        placeholder="Job title"
        style={{ width: "100%", border: "none", background: "transparent", fontSize: 11, color: "#64748b", outline: "none", marginTop: 2 }}
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
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName}
            {m.jobTitle ? ` — ${m.jobTitle}` : ""}
          </option>
        ))}
      </select>
      {linkedLabel ? <div style={{ fontSize: 10, color: "#0ea5e9", marginTop: 4 }}>{linkedLabel}</div> : null}
    </div>
  )
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

function OrgRoleEditor({
  node,
  members,
  linkedLabel,
  onPatch,
  onRemove,
  onAddChild,
}: {
  node: OrgChartNode
  members: LinkableOrgUser[]
  linkedLabel: string | null
  onPatch: (patch: Partial<OrgChartNode>) => void
  onRemove: () => void
  onAddChild: () => void
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
              jobTitle: member?.jobTitle && !node.jobTitle ? member.jobTitle : node.jobTitle,
            })
          }}
          style={theme.formInput}
        >
          <option value="">Link Tradesman user…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
              {m.jobTitle ? ` — ${m.jobTitle}` : ""}
            </option>
          ))}
        </select>
      </label>
      {linkedLabel ? <div style={{ fontSize: 12, color: "#0ea5e9" }}>Linked: {linkedLabel}</div> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
