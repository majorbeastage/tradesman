import { useCallback, useEffect, useState } from "react"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"
import {
  activeDashboardTodos,
  addDashboardTodo,
  completeDashboardTodo,
  loadDashboardTodosDoc,
  loadTodoAssigneeOptions,
  type DashboardTodoItem,
  type DashboardTodoPriority,
  type TodoAssigneeOption,
} from "../lib/dashboardTodos"
import type { PressingWorkItem } from "../lib/pressingWorkQueue"

type Props = {
  accountOwnerId: string
  viewerUserId: string
  pressingItems: PressingWorkItem[]
  onRefresh: () => void
  compact?: boolean
}

export default function DashboardTodoManageBlock({
  accountOwnerId,
  viewerUserId,
  pressingItems,
  onRefresh,
  compact,
}: Props) {
  const [customTodos, setCustomTodos] = useState<DashboardTodoItem[]>([])
  const [teamTodos, setTeamTodos] = useState<DashboardTodoItem[]>([])
  const [assignees, setAssignees] = useState<TodoAssigneeOption[]>([])
  const [title, setTitle] = useState("")
  const [assigneeId, setAssigneeId] = useState("")
  const [priority, setPriority] = useState<DashboardTodoPriority>("normal")
  const [dueDate, setDueDate] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  const reloadCustom = useCallback(async () => {
    if (!supabase) return
    const doc = await loadDashboardTodosDoc(supabase, accountOwnerId)
    const active = activeDashboardTodos(doc)
    setCustomTodos(active.filter((t) => t.assigneeUserId === viewerUserId))
    setTeamTodos(active.filter((t) => t.assigneeUserId !== viewerUserId))
  }, [accountOwnerId, viewerUserId])

  useEffect(() => {
    void reloadCustom()
  }, [reloadCustom])

  useEffect(() => {
    if (!supabase) return
    void loadTodoAssigneeOptions(supabase, accountOwnerId, viewerUserId).then((opts) => {
      setAssignees(opts)
      setAssigneeId((prev) => prev || opts.find((o) => o.isSelf)?.id || opts[0]?.id || viewerUserId)
    })
  }, [accountOwnerId, viewerUserId])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !title.trim()) return
    setBusy(true)
    setErr("")
    try {
      await addDashboardTodo(supabase, accountOwnerId, {
        title: title.trim(),
        assigneeUserId: assigneeId || viewerUserId,
        createdByUserId: viewerUserId,
        priority,
        dueAt: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
      })
      setTitle("")
      setDueDate("")
      await reloadCustom()
      onRefresh()
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setBusy(false)
    }
  }

  async function handleComplete(todoId: string) {
    if (!supabase) return
    setBusy(true)
    try {
      await completeDashboardTodo(supabase, accountOwnerId, todoId)
      await reloadCustom()
      onRefresh()
    } finally {
      setBusy(false)
    }
  }

  const pressingSlice = pressingItems.slice(0, compact ? 5 : 10)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <section>
        <h3 style={sectionTitleStyle}>Next up — most pressing</h3>
        <p style={sectionHintStyle}>Ranked by urgency: critical customers, renewals, upcoming jobs, and assigned tasks.</p>
        {pressingSlice.length === 0 ? (
          <p style={emptyStyle}>Nothing urgent right now. Add a custom task below or check back after new activity.</p>
        ) : (
          <ul style={listStyle}>
            {pressingSlice.map((item) => (
              <li key={item.id} style={listItemStyle(item.kind === "critical_customer" || item.urgencyScore >= 90)}>
                <div style={{ fontWeight: 700, fontSize: 13, color: theme.text }}>{item.title}</div>
                {item.subtitle ? <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{item.subtitle}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 style={sectionTitleStyle}>My custom tasks</h3>
        {customTodos.length === 0 ? (
          <p style={emptyStyle}>No open custom tasks assigned to you.</p>
        ) : (
          <ul style={listStyle}>
            {customTodos.map((t) => (
              <li key={t.id} style={listItemStyle(t.priority === "urgent")}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: theme.text }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                      {t.priority === "urgent" ? "Urgent" : t.priority === "low" ? "Low priority" : "Normal"}
                      {t.dueAt ? ` · Due ${new Date(t.dueAt).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                  <button type="button" disabled={busy} onClick={() => void handleComplete(t.id)} style={doneBtnStyle}>
                    Done
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {teamTodos.length > 0 ? (
        <section>
          <h3 style={sectionTitleStyle}>Team tasks (your org)</h3>
          <ul style={listStyle}>
            {teamTodos.map((t) => {
              const who = assignees.find((a) => a.id === t.assigneeUserId)?.label ?? "Team member"
              return (
                <li key={t.id} style={listItemStyle(false)}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: theme.text }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Assigned to {who}</div>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <section
        style={{
          padding: "12px 12px",
          borderRadius: 10,
          border: `1px solid ${theme.border}`,
          background: "#f8fafc",
        }}
      >
        <h3 style={{ ...sectionTitleStyle, marginBottom: 8 }}>Add custom task</h3>
        <form onSubmit={(e) => void handleAdd(e)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to get done?"
            style={{ ...theme.formInput, fontSize: 13, color: theme.text }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={fieldLabelStyle}>
              Assign to
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="dashboard-todo-assignee-select"
                style={{ ...theme.formInput, fontSize: 13, color: theme.text, background: "#fff", colorScheme: "light" }}
              >
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                    {a.jobTitle ? ` · ${a.jobTitle}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldLabelStyle}>
              Priority
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as DashboardTodoPriority)}
                style={{ ...theme.formInput, fontSize: 13, color: theme.text, background: "#fff" }}
              >
                <option value="urgent">Urgent</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </label>
          </div>
          <label style={fieldLabelStyle}>
            Due date (optional)
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={{ ...theme.formInput, fontSize: 13, color: theme.text, background: "#fff", colorScheme: "light" }}
            />
          </label>
          {err ? <p style={{ margin: 0, fontSize: 12, color: "#b91c1c" }}>{err}</p> : null}
          <button type="submit" disabled={busy || !title.trim()} style={addBtnStyle}>
            {busy ? "Saving…" : "Add task"}
          </button>
        </form>
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.45 }}>
          Assign to yourself or team members who report to you on the organization chart.
        </p>
      </section>
    </div>
  )
}

const sectionTitleStyle = { margin: "0 0 4px", fontSize: 13, fontWeight: 800, color: "#334155" } as const
const sectionHintStyle = { margin: "0 0 8px", fontSize: 11, color: "#64748b", lineHeight: 1.45 } as const
const emptyStyle = { margin: 0, fontSize: 12, color: "#94a3b8" } as const
const listStyle = { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" as const, gap: 6 }

function listItemStyle(hot: boolean) {
  return {
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${hot ? "#fecaca" : theme.border}`,
    background: hot ? "#fff7ed" : "#fff",
  }
}

const fieldLabelStyle = { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 11, fontWeight: 700, color: "#334155" }
const doneBtnStyle = {
  flexShrink: 0,
  padding: "4px 8px",
  borderRadius: 6,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontWeight: 700,
  fontSize: 11,
  cursor: "pointer",
} as const
const addBtnStyle = {
  alignSelf: "flex-start",
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
} as const
