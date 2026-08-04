import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import {
  analyzeRouteSegment,
  dayKeyFromDate,
  ROUTE_LEGEND,
  routeStyle,
  segmentForDay,
  type RouteKind,
  type RouteSegment,
} from "../../lib/callScheduleRoute"
import {
  cloneCallRoutingProfile,
  DAY_KEYS,
  DAY_LABELS,
  formatMinutesLabel,
  huntModeLabel,
  loadCallRoutingProfile,
  saveCallRoutingProfile,
  timeToMinutes,
  type BusinessHours,
  type CallRoutingProfile,
  type DayKey,
} from "../../lib/callRoutingProfile"
import { theme } from "../../styles/theme"
import type { CallHuntMode } from "../../lib/callHunting"
import { loadOrgRosterForUser, type OrgRosterEntry } from "../../lib/orgRoster"
import { canUsePortalViewBar } from "../../lib/portalViewRules"

type RosterEntry = OrgRosterEntry

type ScheduleView = "week" | "month" | "day"

type SegmentEditFocus = {
  dayKey: DayKey
  duringBusinessHours: boolean
  segment: RouteSegment
}

type Props = {
  profileUserId: string
  onOpenMyT?: () => void
}

const HOUR_START = 6
const HOUR_END = 22
const HOUR_COUNT = HOUR_END - HOUR_START

const btnPrimary: CSSProperties = {
  border: "none",
  background: theme.primary,
  color: "#fff",
  borderRadius: 8,
  padding: "8px 14px",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 13,
}

const btnSecondary: CSSProperties = {
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: "#0f172a",
  borderRadius: 8,
  padding: "8px 12px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
}

function isoDateLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function blocksForDay(
  profile: CallRoutingProfile,
  dayKey: DayKey,
): { topPct: number; heightPct: number; segment: RouteSegment; duringBusinessHours: boolean }[] {
  const day = profile.businessHours[dayKey]
  const openMin = day.enabled ? timeToMinutes(day.open) : null
  const closeMin = day.enabled ? timeToMinutes(day.close) : null
  const dayStart = HOUR_START * 60
  const dayEnd = HOUR_END * 60
  const span = dayEnd - dayStart

  if (!day.enabled || openMin == null || closeMin == null || closeMin <= openMin) {
    return [{ topPct: 0, heightPct: 100, segment: segmentForDay(profile, dayKey), duringBusinessHours: false }]
  }

  const beforePct = ((openMin - dayStart) / span) * 100
  const openPct = ((closeMin - openMin) / span) * 100
  const afterPct = ((dayEnd - closeMin) / span) * 100
  const blocks: { topPct: number; heightPct: number; segment: RouteSegment; duringBusinessHours: boolean }[] = []

  if (beforePct > 0.5) {
    blocks.push({ topPct: 0, heightPct: beforePct, segment: analyzeRouteSegment(profile, false), duringBusinessHours: false })
  }
  blocks.push({
    topPct: Math.max(0, beforePct),
    heightPct: Math.max(2, openPct),
    segment: analyzeRouteSegment(profile, true),
    duringBusinessHours: true,
  })
  if (afterPct > 0.5) {
    blocks.push({
      topPct: Math.min(100 - afterPct, beforePct + openPct),
      heightPct: afterPct,
      segment: analyzeRouteSegment(profile, false),
      duringBusinessHours: false,
    })
  }
  return blocks
}

function RouteBlock({
  segment,
  compact,
  editable,
  onEdit,
}: {
  segment: RouteSegment
  compact?: boolean
  editable?: boolean
  onEdit?: () => void
}) {
  const style = routeStyle(segment.kind)
  const vmHint =
    segment.maxRingSeconds === 0
      ? "Direct to VM"
      : segment.maxRingSeconds === segment.ringSeconds
        ? `${segment.ringSeconds}s → VM`
        : `Up to ${segment.maxRingSeconds}s → VM`
  return (
    <div
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      title={`${segment.label}: ${segment.detail}${editable ? " — double-click to edit" : ""}`}
      onDoubleClick={editable ? onEdit : undefined}
      onKeyDown={
        editable
          ? (e) => {
              if (e.key === "Enter") onEdit?.()
            }
          : undefined
      }
      style={{
        borderRadius: 6,
        background: style.background,
        border: `1px solid ${style.border}`,
        padding: compact ? "3px 5px" : "4px 6px",
        fontSize: compact ? 9 : 10,
        fontWeight: 700,
        color: style.color,
        lineHeight: 1.25,
        overflow: "hidden",
        boxSizing: "border-box",
        height: "100%",
        cursor: editable ? "pointer" : undefined,
      }}
    >
      <div>{segment.label}</div>
      {!compact ? <div style={{ fontWeight: 600, opacity: 0.9, marginTop: 2 }}>{vmHint}</div> : null}
    </div>
  )
}

function DayColumn({
  dayKey,
  profile,
  onEditDay,
  editable,
  onSegmentEdit,
}: {
  dayKey: DayKey
  profile: CallRoutingProfile
  onEditDay?: (dayKey: DayKey) => void
  editable?: boolean
  onSegmentEdit?: (focus: SegmentEditFocus) => void
}) {
  const day = profile.businessHours[dayKey]
  const openMin = day.enabled ? timeToMinutes(day.open) : null
  const closeMin = day.enabled ? timeToMinutes(day.close) : null
  const blocks = blocksForDay(profile, dayKey)

  return (
    <div style={{ flex: 1, minWidth: 80, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 800, textAlign: "center", color: theme.text }}>
        {DAY_LABELS[dayKey]}
        {!day.enabled ? (
          <span style={{ display: "block", fontSize: 10, fontWeight: 600, color: "#94a3b8" }}>Closed</span>
        ) : (
          <span style={{ display: "block", fontSize: 10, fontWeight: 600, color: "#64748b" }}>
            {formatMinutesLabel(openMin!)} – {formatMinutesLabel(closeMin!)}
          </span>
        )}
        {onEditDay ? (
          <button type="button" onClick={() => onEditDay(dayKey)} style={{ ...btnSecondary, marginTop: 4, fontSize: 10, padding: "4px 8px", width: "100%" }}>
            Edit hours
          </button>
        ) : null}
      </div>
      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 300,
          borderRadius: 8,
          border: `1px solid ${theme.border}`,
          background: "#f8fafc",
          overflow: "hidden",
        }}
      >
        {blocks.map((block, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 4,
                right: 4,
                top: `${block.topPct}%`,
                height: `${block.heightPct}%`,
              }}
            >
              <RouteBlock
                segment={block.segment}
                editable={editable}
                onEdit={() => onSegmentEdit?.({ dayKey, duringBusinessHours: block.duringBusinessHours, segment: block.segment })}
              />
            </div>
          ))}
      </div>
    </div>
  )
}

function MonthGrid({
  profile,
  monthAnchor,
  selectedDate,
  onSelectDate,
}: {
  profile: CallRoutingProfile
  monthAnchor: Date
  selectedDate: Date
  onSelectDate: (d: Date) => void
}) {
  const year = monthAnchor.getFullYear()
  const month = monthAnchor.getMonth()
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const startPad = (first.getDay() + 6) % 7
  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
        {DAY_KEYS.map((k) => (
          <div key={k} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: "#64748b" }}>
            {DAY_LABELS[k]}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {cells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} style={{ minHeight: 72 }} />
          const iso = isoDateLocal(date)
          const dayKey = dayKeyFromDate(date)
          const segment = segmentForDay(profile, dayKey, iso)
          const style = routeStyle(segment.kind)
          const selected = isoDateLocal(selectedDate) === iso
          const isToday = isoDateLocal(new Date()) === iso
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDate(date)}
              style={{
                minHeight: 72,
                borderRadius: 8,
                border: selected ? `2px solid ${theme.primary}` : `1px solid ${style.border}`,
                background: style.background,
                cursor: "pointer",
                padding: "6px 8px",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                boxShadow: isToday ? "inset 0 0 0 1px rgba(249,115,22,0.5)" : undefined,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 800, color: style.color }}>{date.getDate()}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: style.color, lineHeight: 1.2 }}>{segment.label}</span>
              <span style={{ fontSize: 9, fontWeight: 600, color: style.color, opacity: 0.85 }}>
                {segment.maxRingSeconds === 0 ? "Direct VM" : `${segment.maxRingSeconds}s max`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SettingsEditor({
  draft,
  setDraft,
  dirty,
  saving,
  message,
  onSave,
  onReset,
  editDayKey,
  setEditDayKey,
}: {
  draft: CallRoutingProfile
  setDraft: (next: CallRoutingProfile) => void
  dirty: boolean
  saving: boolean
  message: string
  onSave: () => void
  onReset: () => void
  editDayKey: DayKey | null
  setEditDayKey: (k: DayKey | null) => void
}) {
  const updateHours = (key: DayKey, patch: Partial<BusinessHours[DayKey]>) => {
    setDraft({
      ...draft,
      businessHours: {
        ...draft.businessHours,
        [key]: { ...draft.businessHours[key], ...patch },
      },
    })
  }

  const updateHunting = (patch: Partial<typeof draft.callHunting>) => {
    setDraft({ ...draft, callHunting: { ...draft.callHunting, ...patch } })
  }

  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: 16,
        background: "#fafafa",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Call routing settings</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={onReset} disabled={!dirty || saving} style={{ ...btnSecondary, opacity: dirty ? 1 : 0.5 }}>
            Reset
          </button>
          <button type="button" onClick={onSave} disabled={!dirty || saving} style={{ ...btnPrimary, opacity: dirty ? 1 : 0.5 }}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
      {message ? (
        <p style={{ margin: 0, fontSize: 13, color: message.startsWith("Could") || message.startsWith("Save failed") ? "#b45309" : "#166534" }}>
          {message}
        </p>
      ) : null}
      <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
        Saves to the same MyT profile fields — calendar and MyT stay in sync.
      </p>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={draft.callForwardingEnabled}
            onChange={(e) => setDraft({ ...draft, callForwardingEnabled: e.target.checked })}
          />
          Answer & forward calls
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={draft.callForwardingOutsideBusinessHours}
            onChange={(e) => setDraft({ ...draft, callForwardingOutsideBusinessHours: e.target.checked })}
          />
          Forward outside business hours (24-hr / after-hours service)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={draft.callHunting.enabled}
            onChange={(e) => updateHunting({ enabled: e.target.checked })}
          />
          Ring group / hunt enabled
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={draft.autoAttendant.enabled}
            onChange={(e) =>
              setDraft({
                ...draft,
                autoAttendant: {
                  ...draft.autoAttendant,
                  enabled: e.target.checked,
                  mode: e.target.checked && draft.autoAttendant.mode === "off" ? "ai_menu" : draft.autoAttendant.mode,
                },
              })
            }
          />
          Auto-attendant before forward
        </label>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
          Ring seconds (per leg, 8–45)
          <input
            type="number"
            min={8}
            max={45}
            value={draft.callHunting.ringSeconds}
            onChange={(e) => updateHunting({ ringSeconds: Math.min(45, Math.max(8, Number(e.target.value) || 22)) })}
            style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}` }}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
          Ring mode
          <select
            value={draft.callHunting.mode}
            onChange={(e) => updateHunting({ mode: e.target.value as CallHuntMode })}
            style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}` }}
          >
            <option value="primary_only">Primary only</option>
            <option value="simultaneous">Ring all at once</option>
            <option value="sequential">Ring in order</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
          Timezone
          <input
            value={draft.timezone}
            onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
            style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}` }}
          />
        </label>
      </div>

      {editDayKey ? (
        <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>{DAY_LABELS[editDayKey]} business hours</strong>
            <button type="button" onClick={() => setEditDayKey(null)} style={btnSecondary}>
              Done
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={draft.businessHours[editDayKey].enabled}
                onChange={(e) => updateHours(editDayKey, { enabled: e.target.checked })}
              />
              Open this day
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Opens
              <input
                type="time"
                value={draft.businessHours[editDayKey].open}
                disabled={!draft.businessHours[editDayKey].enabled}
                onChange={(e) => updateHours(editDayKey, { open: e.target.value })}
                style={{ padding: "6px 8px", borderRadius: 8, border: `1px solid ${theme.border}` }}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Closes
              <input
                type="time"
                value={draft.businessHours[editDayKey].close}
                disabled={!draft.businessHours[editDayKey].enabled}
                onChange={(e) => updateHours(editDayKey, { close: e.target.value })}
                style={{ padding: "6px 8px", borderRadius: 8, border: `1px solid ${theme.border}` }}
              />
            </label>
          </div>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
          Tip: click <strong>Edit hours</strong> under any day in week view, or pick a day in month view to edit hours here.
        </p>
      )}
    </div>
  )
}

function SegmentEditModal({
  focus,
  draft,
  setDraft,
  onClose,
  onSave,
  saving,
}: {
  focus: SegmentEditFocus
  draft: CallRoutingProfile
  setDraft: (next: CallRoutingProfile) => void
  onClose: () => void
  onSave: () => void
  saving: boolean
}) {
  const style = routeStyle(focus.segment.kind)
  const updateHours = (patch: Partial<BusinessHours[DayKey]>) => {
    setDraft({
      ...draft,
      businessHours: {
        ...draft.businessHours,
        [focus.dayKey]: { ...draft.businessHours[focus.dayKey], ...patch },
      },
    })
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 12000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 20,
          maxWidth: 480,
          width: "100%",
          border: `1px solid ${theme.border}`,
          boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ ...routeStyle(focus.segment.kind), border: `1px solid ${style.border}`, borderRadius: 8, padding: 10, marginBottom: 14 }}>
          <strong>{DAY_LABELS[focus.dayKey]} · {focus.duringBusinessHours ? "Business hours" : "After hours / closed"}</strong>
          <div style={{ fontSize: 13, marginTop: 4 }}>{focus.segment.label}</div>
          <div style={{ fontSize: 12, marginTop: 4, opacity: 0.9 }}>{focus.segment.detail}</div>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={draft.businessHours[focus.dayKey].enabled}
              onChange={(e) => updateHours({ enabled: e.target.checked })}
            />
            Open on {DAY_LABELS[focus.dayKey]}
          </label>
          {focus.duringBusinessHours ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
                Opens
                <input type="time" value={draft.businessHours[focus.dayKey].open} onChange={(e) => updateHours({ open: e.target.value })} style={{ padding: "6px 8px", borderRadius: 8, border: `1px solid ${theme.border}` }} />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
                Closes
                <input type="time" value={draft.businessHours[focus.dayKey].close} onChange={(e) => updateHours({ close: e.target.value })} style={{ padding: "6px 8px", borderRadius: 8, border: `1px solid ${theme.border}` }} />
              </label>
            </div>
          ) : null}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={draft.callForwardingEnabled} onChange={(e) => setDraft({ ...draft, callForwardingEnabled: e.target.checked })} />
            Answer & forward calls
          </label>
          {!focus.duringBusinessHours ? (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={draft.callForwardingOutsideBusinessHours}
                onChange={(e) => setDraft({ ...draft, callForwardingOutsideBusinessHours: e.target.checked })}
              />
              Forward outside business hours
            </label>
          ) : null}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={draft.callHunting.enabled}
              onChange={(e) => setDraft({ ...draft, callHunting: { ...draft.callHunting, enabled: e.target.checked } })}
            />
            Ring group enabled
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
            Ring seconds before voicemail
            <input
              type="number"
              min={8}
              max={45}
              value={draft.callHunting.ringSeconds}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  callHunting: { ...draft.callHunting, ringSeconds: Math.min(45, Math.max(8, Number(e.target.value) || 22)) },
                })
              }
              style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}`, maxWidth: 120 }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={draft.autoAttendant.enabled}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  autoAttendant: {
                    ...draft.autoAttendant,
                    enabled: e.target.checked,
                    mode: e.target.checked && draft.autoAttendant.mode === "off" ? "ai_menu" : draft.autoAttendant.mode,
                  },
                })
              }
            />
            Auto-attendant before forward
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={btnSecondary}>
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={saving} style={btnPrimary}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  )
}

export function CallSchedulePanel({ profileUserId, onOpenMyT }: Props) {
  const { user, role: authRole } = useAuth()
  const authUserId = user?.id ?? null
  const canScheduleForOrg = canUsePortalViewBar(authRole)
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [selectedUserId, setSelectedUserId] = useState(profileUserId)
  const [profile, setProfile] = useState<CallRoutingProfile | null>(null)
  const [draft, setDraft] = useState<CallRoutingProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [view, setView] = useState<ScheduleView>("week")
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [editDayKey, setEditDayKey] = useState<DayKey | null>(null)
  const [showSettings, setShowSettings] = useState(true)
  const [segmentEdit, setSegmentEdit] = useState<SegmentEditFocus | null>(null)

  useEffect(() => {
    setSelectedUserId(profileUserId)
  }, [profileUserId])

  useEffect(() => {
    if (!supabase || !profileUserId) return
    let cancelled = false
    ;(async () => {
      if (!canScheduleForOrg) {
        if (!cancelled) {
          setRoster([{ userId: profileUserId, label: "My account", isSelf: true }])
        }
        return
      }
      try {
        const rows = await loadOrgRosterForUser(supabase, profileUserId, authUserId)
        if (!cancelled) setRoster(rows)
      } catch {
        if (!cancelled) setRoster([{ userId: profileUserId, label: "My account", isSelf: true }])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profileUserId, authUserId, canScheduleForOrg])

  const load = useCallback(async () => {
    if (!supabase || !selectedUserId) return
    setLoading(true)
    setMessage("")
    try {
      const row = await loadCallRoutingProfile(supabase, selectedUserId)
      setProfile(row)
      setDraft(row ? cloneCallRoutingProfile(row) : null)
    } finally {
      setLoading(false)
    }
  }, [selectedUserId])

  useEffect(() => {
    void load()
  }, [load])

  const dirty = useMemo(() => {
    if (!profile || !draft) return false
    return JSON.stringify(profile) !== JSON.stringify(draft)
  }, [profile, draft])

  const showUserPicker = canScheduleForOrg && roster.length > 1
  const active = draft ?? profile
  const canEdit = Boolean(draft)

  async function handleSaveAndCloseModal() {
    await handleSave()
    setSegmentEdit(null)
  }

  function openSegmentEdit(focus: SegmentEditFocus) {
    if (!draft) return
    setSegmentEdit(focus)
    setEditDayKey(focus.dayKey)
    setShowSettings(true)
  }

  async function handleSave() {
    if (!supabase || !draft) return
    setSaving(true)
    setMessage("")
    const { error } = await saveCallRoutingProfile(supabase, draft.profileUserId, {
      businessHours: draft.businessHours,
      timezone: draft.timezone,
      callForwardingEnabled: draft.callForwardingEnabled,
      callForwardingOutsideBusinessHours: draft.callForwardingOutsideBusinessHours,
      callHunting: draft.callHunting,
      autoAttendant: {
        enabled: draft.autoAttendant.enabled,
        mode: draft.autoAttendant.enabled ? draft.autoAttendant.mode : "off",
      },
    })
    setSaving(false)
    if (error) {
      setMessage(`Save failed: ${error}`)
      return
    }
    setMessage("Saved — MyT call settings updated.")
    await load()
  }

  function handleReset() {
    if (profile) setDraft(cloneCallRoutingProfile(profile))
    setMessage("")
  }

  function pickDayFromMonth(d: Date) {
    setSelectedDate(d)
    setView("day")
    setEditDayKey(dayKeyFromDate(d))
    setShowSettings(true)
  }

  const dayViewKey = dayKeyFromDate(selectedDate)
  const daySegment = active ? segmentForDay(active, dayViewKey, isoDateLocal(selectedDate)) : null

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, color: theme.text }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["week", "month", "day"] as ScheduleView[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              style={{
                ...btnSecondary,
                border: view === v ? `2px solid ${theme.primary}` : btnSecondary.border,
                background: view === v ? "#eff6ff" : "#fff",
                fontWeight: view === v ? 800 : 700,
                textTransform: "capitalize",
              }}
            >
              {v}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setShowSettings((s) => !s)} style={btnSecondary}>
          {showSettings ? "Hide settings" : "Show settings"}
        </button>
      </div>

      {showUserPicker ? (
        <label style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 360, fontSize: 13, fontWeight: 700 }}>
          Schedule for
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 14 }}
          >
            {roster.map((r) => (
              <option key={r.userId} value={r.userId}>
                {r.label}
                {r.isSelf ? " (you)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {loading ? (
        <p style={{ margin: 0, fontSize: 14, opacity: 0.8 }}>Loading call schedule…</p>
      ) : !active ? (
        <p style={{ margin: 0, fontSize: 14, color: "#b45309" }}>Could not load call settings for this user.</p>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${theme.border}`,
              background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)",
            }}
          >
            <div style={{ flex: "1 1 200px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>
                Business line (Twilio)
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", marginTop: 4 }}>
                {active.communicationLine?.publicNumber ?? "— not assigned —"}
              </div>
              {active.communicationLine?.isSharedLine ? (
                <div style={{ fontSize: 11, color: "#b45309", marginTop: 4, fontWeight: 700 }}>
                  Shared account line (assigned via organization)
                </div>
              ) : active.communicationLine?.publicNumber ? (
                <div style={{ fontSize: 11, color: "#15803d", marginTop: 4, fontWeight: 700 }}>
                  Line assigned to this profile
                </div>
              ) : null}
              {active.communicationLine?.friendlyName ? (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{active.communicationLine.friendlyName}</div>
              ) : null}
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>
                Primary forward (rings first)
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", marginTop: 4 }}>
                {active.communicationLine?.forwardToPhone ?? "— not set —"}
              </div>
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>
                Account
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{active.displayName}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{active.timezone.replace(/_/g, " ")}</div>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#64748b", marginRight: 4 }}>Legend</span>
            {ROUTE_LEGEND.map((item) => (
              <span
                key={item.kind}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: item.swatch,
                  border: `1px solid ${item.border}`,
                  color: routeStyle(item.kind as RouteKind).color,
                }}
              >
                {item.label}
              </span>
            ))}
          </div>

          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
            Double-click any colored block to edit routing for that time window. Changes sync with MyT.
          </p>

          {draft && showSettings ? (
            <SettingsEditor
              draft={draft}
              setDraft={setDraft}
              dirty={dirty}
              saving={saving}
              message={message}
              onSave={() => void handleSave()}
              onReset={handleReset}
              editDayKey={editDayKey}
              setEditDayKey={setEditDayKey}
            />
          ) : null}

          {view === "week" ? (
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <div
                style={{
                  width: 44,
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  paddingTop: 72,
                  paddingBottom: 4,
                  fontSize: 10,
                  color: "#94a3b8",
                  fontWeight: 600,
                }}
              >
                {Array.from({ length: HOUR_COUNT + 1 }, (_, i) => HOUR_START + i).map((h) => (
                  <span key={h} style={{ lineHeight: 1 }}>
                    {h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`}
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, flex: 1, overflowX: "auto", paddingBottom: 4 }}>
                {DAY_KEYS.map((dayKey) => (
                  <DayColumn
                    key={dayKey}
                    dayKey={dayKey}
                    profile={active}
                    editable={canEdit}
                    onSegmentEdit={openSegmentEdit}
                    onEditDay={
                      draft
                        ? (k) => {
                            setEditDayKey(k)
                            setShowSettings(true)
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}

          {view === "month" ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <button type="button" style={btnSecondary} onClick={() => setMonthAnchor((m) => addMonths(m, -1))}>
                  ←
                </button>
                <strong style={{ fontSize: 15, minWidth: 160, textAlign: "center" }}>
                  {monthAnchor.toLocaleString(undefined, { month: "long", year: "numeric" })}
                </strong>
                <button type="button" style={btnSecondary} onClick={() => setMonthAnchor((m) => addMonths(m, 1))}>
                  →
                </button>
                <button type="button" style={btnSecondary} onClick={() => setMonthAnchor(startOfMonth(new Date()))}>
                  Today
                </button>
              </div>
              <MonthGrid profile={active} monthAnchor={monthAnchor} selectedDate={selectedDate} onSelectDate={pickDayFromMonth} />
            </div>
          ) : null}

          {view === "day" ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <button type="button" style={btnSecondary} onClick={() => setSelectedDate((d) => addDays(d, -1))}>
                  ← Prev
                </button>
                <strong style={{ fontSize: 15 }}>
                  {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </strong>
                <button type="button" style={btnSecondary} onClick={() => setSelectedDate((d) => addDays(d, 1))}>
                  Next →
                </button>
                <button type="button" style={btnSecondary} onClick={() => setSelectedDate(new Date())}>
                  Today
                </button>
              </div>
              {daySegment ? (
                <div style={{ marginBottom: 12, padding: 12, borderRadius: 8, ...routeStyle(daySegment.kind), border: `1px solid ${routeStyle(daySegment.kind).border}` }}>
                  <strong>{daySegment.label}</strong>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{daySegment.detail}</div>
                  <div style={{ fontSize: 12, marginTop: 4, fontWeight: 700 }}>
                    {daySegment.maxRingSeconds === 0
                      ? "Inbound callers go straight to voicemail."
                      : `Rings up to ${daySegment.maxRingSeconds} second${daySegment.maxRingSeconds === 1 ? "" : "s"}, then voicemail.`}
                  </div>
                </div>
              ) : null}
              <DayColumn
                dayKey={dayViewKey}
                profile={active}
                editable={canEdit}
                onSegmentEdit={openSegmentEdit}
                onEditDay={
                  draft
                    ? (k) => {
                        setEditDayKey(k)
                        setShowSettings(true)
                      }
                    : undefined
                }
              />
            </div>
          ) : null}

          {segmentEdit && draft ? (
            <SegmentEditModal
              focus={segmentEdit}
              draft={draft}
              setDraft={setDraft}
              onClose={() => setSegmentEdit(null)}
              onSave={() => void handleSaveAndCloseModal()}
              saving={saving}
            />
          ) : null}

          {active.callHunting.exceptions.length > 0 ? (
            <div>
              <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Coverage exceptions</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55 }}>
                {active.callHunting.exceptions.map((ex) => (
                  <li key={ex.id}>
                    {ex.label}: {ex.startsOn} → {ex.endsOn}
                    {ex.coverLabel ? ` — cover ${ex.coverLabel}` : ""}
                  </li>
                ))}
              </ul>
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>
                Edit exceptions in MyT → Answer, forward & ring hunting{onOpenMyT ? " or " : "."}
                {onOpenMyT ? (
                  <button type="button" onClick={onOpenMyT} style={{ border: "none", background: "none", color: theme.primary, fontWeight: 800, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                    open MyT
                  </button>
                ) : null}
              </p>
            </div>
          ) : null}

          {active.callHunting.enabled && active.callHunting.targets.filter((t) => t.enabled).length > 0 ? (
            <div>
              <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Ring group · {huntModeLabel(active.callHunting.mode)}</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55 }}>
                {active.callHunting.targets
                  .filter((t) => t.enabled)
                  .map((t) => (
                    <li key={t.id}>
                      {t.label || t.phone || "Target"} —{" "}
                      {t.schedule === "always" ? "always" : t.schedule === "business_hours" ? "business hours" : "after hours"}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
