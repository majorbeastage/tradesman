import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import {
  blockPosition,
  buildDayLanePlan,
  formatBlockTime,
  FUNCTION_CATALOG,
  functionEnabled,
  isoDateLocal,
  laneGlyph,
  laneStyle,
  SCHEDULE_COLOR_PALETTE,
  SCHEDULE_DAY_END_HOUR,
  SCHEDULE_DAY_START_HOUR,
  SCHEDULE_ICON_OPTIONS,
  weekDatesContaining,
  type CallScheduleVisualSettings,
  type DayLanePlan,
  type LaneBlock,
  type ScheduleColorId,
  type ScheduleFunctionId,
  type ScheduleIconId,
  type TimeBlock,
} from "../../lib/callScheduleLanes"
import {
  applyBlockScheduleEdit,
  classifyBlockTimeKind,
  defaultBlockPatch,
  minutesToHhmm,
  hhmmToMinutes,
  type BlockEditContext,
  type BlockSchedulePatch,
  type ScheduleApplyScope,
} from "../../lib/callScheduleEdit"
import { dayKeyFromDate } from "../../lib/callScheduleRoute"
import {
  cloneCallRoutingProfile,
  DAY_LABELS,
  formatMinutesLabel,
  loadCallRoutingProfile,
  saveCallRoutingProfile,
  type CallRoutingProfile,
  type DayKey,
  DAY_KEYS,
} from "../../lib/callRoutingProfile"
import { theme } from "../../styles/theme"
import type { CallHuntMode } from "../../lib/callHunting"
import { newHuntExceptionId, type CallHuntException } from "../../lib/callHunting"
import { loadOrgRosterForUser, type OrgRosterEntry } from "../../lib/orgRoster"
import { canUsePortalViewBar } from "../../lib/portalViewRules"
import { CallForwardAdvancedOptions } from "../../components/CallForwardAdvancedOptions"
import { useLocale } from "../../i18n/LocaleContext"

type ScheduleView = "week" | "month" | "day" | "year"

type Props = {
  profileUserId: string
  onOpenMyT?: () => void
}

const HOUR_START = SCHEDULE_DAY_START_HOUR
const HOUR_END = SCHEDULE_DAY_END_HOUR
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

type ContextMenuState = {
  x: number
  y: number
  functionId: ScheduleFunctionId
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function LaneBlockView({
  block,
  lane,
  visual,
  hourStart,
  hourEnd,
  onContextMenu,
  onDoubleClick,
}: {
  block: TimeBlock
  lane: LaneBlock
  visual: CallScheduleVisualSettings
  hourStart: number
  hourEnd: number
  onContextMenu: (e: MouseEvent, functionId: ScheduleFunctionId) => void
  onDoubleClick: () => void
}) {
  const style = laneStyle(lane.functionId, visual)
  const pos = blockPosition(block, hourStart, hourEnd)
  const glyph = laneGlyph(lane.functionId, visual)
  const isTemp = lane.temporary
  const tall = pos.heightPct > 8

  return (
    <div
      role="button"
      tabIndex={0}
      title={`${lane.label} · ${formatBlockTime(block)}\nDouble-click to edit schedule`}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onDoubleClick()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(e, lane.functionId)
      }}
      style={{
        position: "absolute",
        left: 2,
        right: 2,
        top: `${pos.topPct}%`,
        height: `${pos.heightPct}%`,
        minHeight: 22,
        borderRadius: 6,
        background: style.background,
        border: `2px solid ${isTemp ? "#dc2626" : style.border}`,
        boxShadow: isTemp ? "inset 0 0 0 1px rgba(220,38,38,0.35)" : undefined,
        color: style.color,
        padding: "3px 4px",
        fontSize: 9,
        fontWeight: 800,
        lineHeight: 1.15,
        overflow: "hidden",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        boxSizing: "border-box",
      }}
    >
      <span style={{ fontSize: tall ? 14 : 11, lineHeight: 1 }}>{glyph}</span>
      {tall ? <span>{lane.label}</span> : null}
      {tall ? <span style={{ fontWeight: 600, opacity: 0.85, fontSize: 8 }}>{formatBlockTime(block)}</span> : null}
    </div>
  )
}

function MultiLaneDayColumn({
  plan,
  visual,
  onContextMenu,
  onBlockDoubleClick,
  onEditHours,
  onDropFunction,
}: {
  plan: DayLanePlan
  visual: CallScheduleVisualSettings
  onContextMenu: (e: MouseEvent, functionId: ScheduleFunctionId) => void
  onBlockDoubleClick: (ctx: BlockEditContext) => void
  onEditHours?: () => void
  onDropFunction?: (functionId: ScheduleFunctionId, plan: DayLanePlan) => void
}) {
  const date = new Date(plan.isoDate + "T12:00:00")
  const dayNum = date.getDate()
  const lanes = plan.lanes

  const hourLines = Array.from({ length: HOUR_COUNT + 1 }, (_, i) => HOUR_START + i)

  return (
    <div
      style={{ flex: "1 1 120px", minWidth: lanes.length > 2 ? 140 : 100, display: "flex", flexDirection: "column", gap: 4 }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/tradesman-schedule-fn")) e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        const fnId = e.dataTransfer.getData("text/tradesman-schedule-fn") as ScheduleFunctionId
        if (fnId && onDropFunction) onDropFunction(fnId, plan)
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b" }}>{DAY_LABELS[plan.dayKey]}</div>
        <div style={{ fontSize: 16, fontWeight: 900, color: theme.text }}>{dayNum}</div>
        {plan.closed ? (
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8" }}>Closed</div>
        ) : plan.openMin != null && plan.closeMin != null ? (
          <div style={{ fontSize: 9, fontWeight: 600, color: "#64748b" }}>
            {formatMinutesLabel(plan.openMin)}–{formatMinutesLabel(plan.closeMin)}
          </div>
        ) : null}
        {onEditHours ? (
          <button type="button" onClick={onEditHours} style={{ ...btnSecondary, marginTop: 4, fontSize: 9, padding: "3px 6px", width: "100%" }}>
            Hours
          </button>
        ) : null}
      </div>

      {lanes.length === 0 ? (
        <div
          style={{
            flex: 1,
            minHeight: 280,
            borderRadius: 8,
            border: `1px dashed ${theme.border}`,
            background: "#f8fafc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            color: "#94a3b8",
            fontWeight: 600,
            padding: 8,
            textAlign: "center",
          }}
        >
          No call flow
        </div>
      ) : (
        <div style={{ display: "flex", gap: 3, flex: 1, minHeight: 300 }}>
          {lanes.map((lane) => {
            const fn = FUNCTION_CATALOG.find((f) => f.id === lane.functionId)
            return (
              <div key={`${lane.functionId}-${lane.exceptionId ?? ""}`} style={{ flex: 1, minWidth: 32, display: "flex", flexDirection: "column", gap: 2 }}>
                <div
                  style={{
                    fontSize: 8,
                    fontWeight: 800,
                    textAlign: "center",
                    color: laneStyle(lane.functionId, visual).color,
                    lineHeight: 1.1,
                    minHeight: 22,
                  }}
                >
                  {fn?.title ?? lane.label}
                </div>
                <div
                  style={{
                    flex: 1,
                    position: "relative",
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: "#fff",
                    overflow: "hidden",
                  }}
                >
                  {hourLines.map((h) => (
                    <div
                      key={h}
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: `${blockPosition({ startMin: h * 60, endMin: h * 60 }, HOUR_START, HOUR_END).topPct}%`,
                        borderTop: h === HOUR_START ? undefined : "1px solid #f1f5f9",
                        pointerEvents: "none",
                      }}
                    />
                  ))}
                  {lane.blocks.map((block, i) => (
                    <LaneBlockView
                      key={i}
                      block={block}
                      lane={lane}
                      visual={visual}
                      hourStart={HOUR_START}
                      hourEnd={HOUR_END}
                      onContextMenu={onContextMenu}
                      onDoubleClick={() =>
                        onBlockDoubleClick({
                          functionId: lane.functionId,
                          isoDate: plan.isoDate,
                          dayKey: plan.dayKey,
                          block,
                          timeKind: classifyBlockTimeKind(block, plan.openMin, plan.closeMin),
                          exceptionId: lane.exceptionId,
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function VisualContextMenu({
  menu,
  visual,
  onPickColor,
  onPickIcon,
  onClose,
}: {
  menu: ContextMenuState
  visual: CallScheduleVisualSettings
  onPickColor: (functionId: ScheduleFunctionId, color: ScheduleColorId) => void
  onPickIcon: (functionId: ScheduleFunctionId, icon: ScheduleIconId) => void
  onClose: () => void
}) {
  const fn = FUNCTION_CATALOG.find((f) => f.id === menu.functionId)
  return (
    <div
      style={{
        position: "fixed",
        left: menu.x,
        top: menu.y,
        zIndex: 13000,
        background: "#fff",
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: 10,
        boxShadow: "0 12px 32px rgba(0,0,0,0.15)",
        minWidth: 200,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>{fn?.title ?? "Block style"}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Color</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {(Object.keys(SCHEDULE_COLOR_PALETTE) as ScheduleColorId[]).map((color) => (
          <button
            key={color}
            type="button"
            title={SCHEDULE_COLOR_PALETTE[color].label}
            onClick={() => {
              onPickColor(menu.functionId, color)
              onClose()
            }}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: `2px solid ${SCHEDULE_COLOR_PALETTE[color].border}`,
              background: SCHEDULE_COLOR_PALETTE[color].background,
              cursor: "pointer",
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Icon</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {SCHEDULE_ICON_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            title={opt.label}
            onClick={() => {
              onPickIcon(menu.functionId, opt.id)
              onClose()
            }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              border: `1px solid ${theme.border}`,
              background: visual.lanes?.[menu.functionId]?.icon === opt.id ? "#eff6ff" : "#fff",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            {opt.glyph}
          </button>
        ))}
      </div>
    </div>
  )
}

function AddFunctionBar({
  profile,
  onAdd,
}: {
  profile: CallRoutingProfile
  onAdd: (id: ScheduleFunctionId, plan?: DayLanePlan) => void
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: "#64748b" }}>+ Add</span>
      {FUNCTION_CATALOG.filter((f) => f.id !== "backup" && f.id !== "voicemail").map((fn) => {
        const on = functionEnabled(profile, fn.id)
        return (
          <button
            key={fn.id}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/tradesman-schedule-fn", fn.id)
              e.dataTransfer.effectAllowed = "copy"
            }}
            onClick={() => onAdd(fn.id)}
            style={{
              ...btnSecondary,
              border: on ? `2px solid ${laneStyle(fn.id, profile.scheduleVisual).border}` : btnSecondary.border,
              background: on ? laneStyle(fn.id, profile.scheduleVisual).background : "#fff",
              color: on ? laneStyle(fn.id, profile.scheduleVisual).color : "#0f172a",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
            }}
          >
            <span style={{ fontSize: 16 }}>{laneGlyph(fn.id, profile.scheduleVisual)}</span>
            <span>{fn.title}</span>
            {on ? <span style={{ fontSize: 10, opacity: 0.8 }}>On</span> : null}
          </button>
        )
      })}
    </div>
  )
}

function ScheduleScopeSection({
  ctx,
  patch,
  setPatch,
}: {
  ctx: BlockEditContext
  patch: BlockSchedulePatch
  setPatch: (p: BlockSchedulePatch) => void
}) {
  const scopes: { id: ScheduleApplyScope; label: string }[] =
    ctx.functionId === "temporary" || ctx.functionId === "backup"
      ? [
          { id: "date_range", label: "Date range" },
          { id: "this_day", label: "This day" },
        ]
      : [
          { id: "this_day", label: "This day" },
          { id: "weekday", label: `Every ${DAY_LABELS[ctx.dayKey]}` },
          { id: "weekdays", label: "Mon–Fri" },
          { id: "all_days", label: "Every day" },
          { id: "custom_days", label: "Pick days…" },
        ]

  const toggleCustomDay = (key: DayKey) => {
    const cur = patch.customDays ?? [ctx.dayKey]
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]
    setPatch({ ...patch, scope: "custom_days", customDays: next.length ? next : [ctx.dayKey] })
  }

  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        padding: 12,
        background: "#f8fafc",
        display: "grid",
        gap: 10,
        marginBottom: 14,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800 }}>When active</div>
      <div style={{ fontSize: 11, color: "#64748b" }}>
        {formatBlockTime(ctx.block)}
        {ctx.timeKind === "after_hours" ? " · After hours" : ctx.timeKind === "business_hours" ? " · Business hours" : ""}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {scopes.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setPatch({ ...patch, scope: s.id })}
            style={{
              ...btnSecondary,
              fontSize: 11,
              padding: "5px 8px",
              border: patch.scope === s.id ? `2px solid ${theme.primary}` : btnSecondary.border,
              background: patch.scope === s.id ? "#eff6ff" : "#fff",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      {patch.scope === "custom_days" && ctx.functionId !== "temporary" && ctx.functionId !== "backup" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {DAY_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleCustomDay(key)}
              style={{
                ...btnSecondary,
                fontSize: 11,
                padding: "4px 8px",
                border: (patch.customDays ?? [ctx.dayKey]).includes(key) ? `2px solid ${theme.primary}` : btnSecondary.border,
                background: (patch.customDays ?? [ctx.dayKey]).includes(key) ? "#eff6ff" : "#fff",
              }}
            >
              {DAY_LABELS[key].slice(0, 3)}
            </button>
          ))}
        </div>
      ) : null}
      {ctx.functionId !== "temporary" && ctx.functionId !== "backup" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button
            type="button"
            style={{ ...btnSecondary, fontSize: 11, padding: "5px 8px" }}
            onClick={() => setPatch({ ...patch, startMin: 9 * 60, endMin: 17 * 60 })}
          >
            Business hours (9–5)
          </button>
          <button
            type="button"
            style={{ ...btnSecondary, fontSize: 11, padding: "5px 8px" }}
            onClick={() => setPatch({ ...patch, startMin: 6 * 60, endMin: 9 * 60 })}
          >
            Before open
          </button>
          <button
            type="button"
            style={{ ...btnSecondary, fontSize: 11, padding: "5px 8px" }}
            onClick={() => setPatch({ ...patch, startMin: 17 * 60, endMin: 22 * 60 })}
          >
            After close
          </button>
        </div>
      ) : null}
      {(patch.scope === "date_range" || ctx.functionId === "temporary") && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="date"
            value={patch.rangeStart ?? ctx.isoDate}
            onChange={(e) => setPatch({ ...patch, rangeStart: e.target.value })}
            style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}` }}
          />
          <input
            type="date"
            value={patch.rangeEnd ?? ctx.isoDate}
            onChange={(e) => setPatch({ ...patch, rangeEnd: e.target.value })}
            style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}` }}
          />
        </div>
      )}
      {ctx.functionId !== "temporary" && ctx.functionId !== "backup" ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 2, fontSize: 11, fontWeight: 700 }}>
            From
            <input
              type="time"
              value={minutesToHhmm(patch.startMin)}
              onChange={(e) => setPatch({ ...patch, startMin: hhmmToMinutes(e.target.value) })}
              style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}` }}
            />
          </label>
          <label style={{ display: "grid", gap: 2, fontSize: 11, fontWeight: 700 }}>
            To
            <input
              type="time"
              value={minutesToHhmm(patch.endMin)}
              onChange={(e) => setPatch({ ...patch, endMin: hhmmToMinutes(e.target.value) })}
              style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}` }}
            />
          </label>
        </div>
      ) : null}
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
        <input
          type="checkbox"
          checked={patch.enabled}
          onChange={(e) => setPatch({ ...patch, enabled: e.target.checked })}
        />
        Product on during this window
      </label>
    </div>
  )
}

function FunctionEditModal({
  functionId,
  draft,
  setDraft,
  blockEdit,
  roster,
  onClose,
  onSave,
  saving,
}: {
  functionId: ScheduleFunctionId
  draft: CallRoutingProfile
  setDraft: (next: CallRoutingProfile) => void
  blockEdit?: BlockEditContext | null
  roster?: OrgRosterEntry[]
  onClose: () => void
  onSave: (merged?: CallRoutingProfile) => void
  saving: boolean
}) {
  const fn = FUNCTION_CATALOG.find((f) => f.id === functionId)
  const { t } = useLocale()
  const [schedulePatch, setSchedulePatch] = useState<BlockSchedulePatch | null>(
    blockEdit ? defaultBlockPatch(blockEdit) : null,
  )
  const updateHunting = (patch: Partial<typeof draft.callHunting>) => {
    setDraft({ ...draft, callHunting: { ...draft.callHunting, ...patch } })
  }
  const wide = functionId === "forwarding" || functionId === "auto_attendant"

  function applyScheduleThenSave() {
    let next = draft
    if (blockEdit && schedulePatch) {
      next = applyBlockScheduleEdit(draft, blockEdit, schedulePatch)
      setDraft(next)
    }
    void onSave(next)
  }

  function handleRemoveFromCalendar() {
    let next = draft
    if (blockEdit && schedulePatch) {
      next = applyBlockScheduleEdit(draft, blockEdit, { ...schedulePatch, enabled: false })
    } else if (functionId === "forwarding") {
      next = { ...draft, callForwardingEnabled: false, callForwardingOutsideBusinessHours: false }
    } else if (functionId === "ring_group") {
      next = { ...draft, callHunting: { ...draft.callHunting, enabled: false } }
    } else if (functionId === "auto_attendant") {
      next = { ...draft, autoAttendant: { ...draft.autoAttendant, enabled: false, mode: "off" } }
    }
    setDraft(next)
    void onSave(next)
  }

  const canRemove =
    functionId === "forwarding" ||
    functionId === "ring_group" ||
    functionId === "auto_attendant" ||
    functionId === "temporary" ||
    functionId === "backup"

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
          maxWidth: wide ? 480 : 420,
          width: "100%",
          border: `1px solid ${theme.border}`,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 28 }}>{laneGlyph(functionId, draft.scheduleVisual)}</span>
          <div>
            <strong style={{ fontSize: 16 }}>{fn?.title}</strong>
            <div style={{ fontSize: 12, color: "#64748b" }}>{fn?.blurb}</div>
          </div>
        </div>

        {blockEdit && schedulePatch ? (
          <ScheduleScopeSection ctx={blockEdit} patch={schedulePatch} setPatch={setSchedulePatch} />
        ) : null}

        {functionId === "forwarding" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={draft.callForwardingEnabled}
                onChange={(e) => setDraft({ ...draft, callForwardingEnabled: e.target.checked })}
              />
              Forward live calls
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={draft.callForwardingOutsideBusinessHours}
                onChange={(e) => setDraft({ ...draft, callForwardingOutsideBusinessHours: e.target.checked })}
              />
              Include nights & weekends
            </label>
            <CallForwardAdvancedOptions
              compact
              primaryPhoneHint={draft.communicationLine?.forwardToPhone}
              values={{
                callForwardingEnabled: draft.callForwardingEnabled,
                forwardDialCallerIdMode: draft.forwardDialCallerIdMode,
                forwardWhisperOnAnswer: draft.forwardWhisperOnAnswer,
                forwardWhisperOnlyOutsideBusinessHours: draft.forwardWhisperOnlyOutsideBusinessHours,
                forwardWhisperRequireKeypress: draft.forwardWhisperRequireKeypress,
                forwardWhisperAnnouncementTemplate: draft.forwardWhisperAnnouncementTemplate,
              }}
              onChange={(patch) => setDraft({ ...draft, ...patch })}
            />
          </div>
        ) : null}

        {functionId === "ring_group" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={draft.callHunting.enabled}
                onChange={(e) =>
                  updateHunting({
                    enabled: e.target.checked,
                    mode: e.target.checked && draft.callHunting.mode === "primary_only" ? "simultaneous" : draft.callHunting.mode,
                  })
                }
              />
              Ring team members
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Ring style
              <select
                value={draft.callHunting.mode}
                disabled={!draft.callHunting.enabled}
                onChange={(e) => updateHunting({ mode: e.target.value as CallHuntMode })}
                style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}` }}
              >
                <option value="simultaneous">All at once</option>
                <option value="sequential">One after another</option>
                <option value="primary_only">Primary only</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Seconds before voicemail
              <input
                type="number"
                min={8}
                max={45}
                disabled={!draft.callHunting.enabled}
                value={draft.callHunting.ringSeconds}
                onChange={(e) => updateHunting({ ringSeconds: Math.min(45, Math.max(8, Number(e.target.value) || 22)) })}
                style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}`, maxWidth: 100 }}
              />
            </label>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Manage ring list in MyT → Ring hunting (team members with Tradesman lines only).</p>
          </div>
        ) : null}

        {functionId === "auto_attendant" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
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
              Play menu before connecting
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Menu type
              <select
                value={draft.autoAttendant.mode}
                disabled={!draft.autoAttendant.enabled}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    autoAttendant: { ...draft.autoAttendant, mode: e.target.value as typeof draft.autoAttendant.mode },
                  })
                }
                style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}` }}
              >
                <option value="ai_menu">AI menu</option>
                <option value="recorded_menu">Hannah recordings</option>
                <option value="record_own_menu">{t("account.callScreening.modeRecordOwn")}</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={draft.autoAttendant.spamScreenEnabled}
                disabled={!draft.autoAttendant.enabled}
                onChange={(e) =>
                  setDraft({ ...draft, autoAttendant: { ...draft.autoAttendant, spamScreenEnabled: e.target.checked } })
                }
              />
              {t("account.callScreening.spamScreen")}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={draft.autoAttendant.forwardGoodLeads}
                disabled={!draft.autoAttendant.enabled}
                onChange={(e) =>
                  setDraft({ ...draft, autoAttendant: { ...draft.autoAttendant, forwardGoodLeads: e.target.checked } })
                }
              />
              {t("account.callScreening.forwardLeads")}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={draft.autoAttendant.unknownCallerShowTradesmanId}
                disabled={!draft.autoAttendant.enabled}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    autoAttendant: { ...draft.autoAttendant, unknownCallerShowTradesmanId: e.target.checked },
                  })
                }
              />
              {t("account.callScreening.unknownCallerId")}
            </label>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Edit menu steps in MyT → Auto-attendant.</p>
          </div>
        ) : null}

        {functionId === "temporary" ? (
          <TemporaryCoverageForm draft={draft} setDraft={setDraft} roster={roster ?? []} />
        ) : null}

        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "space-between", flexWrap: "wrap" }}>
          {canRemove ? (
            <button type="button" onClick={handleRemoveFromCalendar} disabled={saving} style={{ ...btnSecondary, color: "#991b1b", borderColor: "#fca5a5" }}>
              Remove from calendar
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>
            Cancel
          </button>
          <button type="button" onClick={applyScheduleThenSave} disabled={saving} style={btnPrimary}>
            {saving ? "Saving…" : "Save"}
          </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function YearGrid({
  profile,
  year,
  visual,
  onSelectMonth,
}: {
  profile: CallRoutingProfile
  year: number
  visual: CallScheduleVisualSettings
  onSelectMonth: (month: number) => void
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
      {Array.from({ length: 12 }, (_, m) => {
        const anchor = new Date(year, m, 1)
        const label = anchor.toLocaleString(undefined, { month: "short" })
        let activeDays = 0
        let tempDays = 0
        const last = new Date(year, m + 1, 0).getDate()
        for (let d = 1; d <= last; d++) {
          const iso = isoDateLocal(new Date(year, m, d))
          const plan = buildDayLanePlan(profile, dayKeyFromDate(new Date(year, m, d)), iso)
          if (plan.lanes.length > 0) activeDays++
          if (plan.activeException) tempDays++
        }
        return (
          <button
            key={m}
            type="button"
            onClick={() => onSelectMonth(m)}
            style={{
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              padding: 12,
              background: "#fff",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 15 }}>{label}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
              {activeDays} days with call flow
              {tempDays > 0 ? ` · ${tempDays} temp` : ""}
            </div>
            <div style={{ display: "flex", gap: 3, marginTop: 8, flexWrap: "wrap" }}>
              {FUNCTION_CATALOG.slice(0, 4).map((fn) =>
                functionEnabled(profile, fn.id) ? (
                  <span
                    key={fn.id}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: laneStyle(fn.id, visual).border,
                    }}
                  />
                ) : null,
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function TemporaryCoverageForm({
  draft,
  setDraft,
  roster,
}: {
  draft: CallRoutingProfile
  setDraft: (next: CallRoutingProfile) => void
  roster: OrgRosterEntry[]
}) {
  const today = isoDateLocal(new Date())
  const endDefault = isoDateLocal(addDays(new Date(), 1))

  function addException() {
    const ex: CallHuntException = {
      id: newHuntExceptionId(),
      label: "Out of office",
      startsOn: today,
      endsOn: endDefault,
      unavailableUserId: draft.profileUserId,
      coverUserId: null,
      coverPhone: "",
      coverLabel: "",
      skipPrimary: false,
    }
    setDraft({
      ...draft,
      callHunting: { ...draft.callHunting, exceptions: [...draft.callHunting.exceptions, ex] },
    })
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
        Shows <strong style={{ color: "#dc2626" }}>red</strong> on the calendar — adjust call flow for these dates.
      </p>
      {draft.callHunting.exceptions.map((ex, i) => (
        <div key={ex.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
          <input
            value={ex.label}
            onChange={(e) => {
              const exceptions = draft.callHunting.exceptions.map((row, idx) =>
                idx === i ? { ...row, label: e.target.value } : row,
              )
              setDraft({ ...draft, callHunting: { ...draft.callHunting, exceptions } })
            }}
            placeholder="Label"
            style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}` }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="date"
              value={ex.startsOn}
              onChange={(e) => {
                const exceptions = draft.callHunting.exceptions.map((row, idx) =>
                  idx === i ? { ...row, startsOn: e.target.value } : row,
                )
                setDraft({ ...draft, callHunting: { ...draft.callHunting, exceptions } })
              }}
              style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}` }}
            />
            <input
              type="date"
              value={ex.endsOn}
              onChange={(e) => {
                const exceptions = draft.callHunting.exceptions.map((row, idx) =>
                  idx === i ? { ...row, endsOn: e.target.value } : row,
                )
                setDraft({ ...draft, callHunting: { ...draft.callHunting, exceptions } })
              }}
              style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}` }}
            />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>Unavailable team member</label>
            <select
              value={ex.unavailableUserId ?? ""}
              onChange={(e) => {
                const exceptions = draft.callHunting.exceptions.map((row, idx) =>
                  idx === i ? { ...row, unavailableUserId: e.target.value || null } : row,
                )
                setDraft({ ...draft, callHunting: { ...draft.callHunting, exceptions } })
              }}
              style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}` }}
            >
              <option value="">Select…</option>
              {roster.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>Cover with team member</label>
            <select
              value={ex.coverUserId ?? ""}
              onChange={(e) => {
                const val = e.target.value || null
                const member = roster.find((m) => m.userId === val)
                const exceptions = draft.callHunting.exceptions.map((row, idx) =>
                  idx === i
                    ? { ...row, coverUserId: val, coverLabel: member?.label ?? row.coverLabel }
                    : row,
                )
                setDraft({ ...draft, callHunting: { ...draft.callHunting, exceptions } })
              }}
              style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}` }}
            >
              <option value="">None — use phone below</option>
              {roster.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <input
            value={ex.coverPhone ?? ""}
            onChange={(e) => {
              const exceptions = draft.callHunting.exceptions.map((row, idx) =>
                idx === i ? { ...row, coverPhone: e.target.value } : row,
              )
              setDraft({ ...draft, callHunting: { ...draft.callHunting, exceptions } })
            }}
            placeholder="Backup phone number (optional)"
            style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}` }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={ex.skipPrimary === true}
              onChange={(e) => {
                const exceptions = draft.callHunting.exceptions.map((row, idx) =>
                  idx === i ? { ...row, skipPrimary: e.target.checked } : row,
                )
                setDraft({ ...draft, callHunting: { ...draft.callHunting, exceptions } })
              }}
            />
            Skip primary line during this window
          </label>
          <button
            type="button"
            onClick={() => {
              const exceptions = draft.callHunting.exceptions.filter((_, idx) => idx !== i)
              setDraft({ ...draft, callHunting: { ...draft.callHunting, exceptions } })
            }}
            style={{ ...btnSecondary, color: "#991b1b", fontSize: 11 }}
          >
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={addException} style={{ ...btnSecondary, borderColor: "#fca5a5", color: "#991b1b" }}>
        + Mark out of office
      </button>
    </div>
  )
}

function HoursEditModal({
  dayKey,
  draft,
  setDraft,
  onClose,
  onSave,
  saving,
}: {
  dayKey: DayKey
  draft: CallRoutingProfile
  setDraft: (next: CallRoutingProfile) => void
  onClose: () => void
  onSave: () => void
  saving: boolean
}) {
  const day = draft.businessHours[dayKey]
  const update = (patch: Partial<typeof day>) => {
    setDraft({
      ...draft,
      businessHours: { ...draft.businessHours, [dayKey]: { ...day, ...patch } },
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
        style={{ background: "#fff", borderRadius: 12, padding: 20, maxWidth: 360, width: "100%", border: `1px solid ${theme.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <strong style={{ fontSize: 15 }}>{DAY_LABELS[dayKey]} hours</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 14, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
            <input type="checkbox" checked={day.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
            Open
          </label>
          <input type="time" value={day.open} disabled={!day.enabled} onChange={(e) => update({ open: e.target.value })} style={{ padding: "6px 8px", borderRadius: 8, border: `1px solid ${theme.border}` }} />
          <span>–</span>
          <input type="time" value={day.close} disabled={!day.enabled} onChange={(e) => update({ close: e.target.value })} style={{ padding: "6px 8px", borderRadius: 8, border: `1px solid ${theme.border}` }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={btnSecondary}>
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={saving} style={btnPrimary}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function MonthMiniGrid({
  profile,
  monthAnchor,
  visual,
  onSelectDate,
}: {
  profile: CallRoutingProfile
  monthAnchor: Date
  visual: CallScheduleVisualSettings
  onSelectDate: (d: Date) => void
}) {
  const year = monthAnchor.getFullYear()
  const month = monthAnchor.getMonth()
  const last = new Date(year, month + 1, 0)
  const first = new Date(year, month, 1)
  const startPad = (first.getDay() + 6) % 7
  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d))

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
      {cells.map((date, i) => {
        if (!date) return <div key={`e-${i}`} style={{ minHeight: 64 }} />
        const iso = isoDateLocal(date)
        const plan = buildDayLanePlan(profile, dayKeyFromDate(date), iso)
        const hasTemp = plan.activeException != null
        return (
          <button
            key={iso}
            type="button"
            onClick={() => onSelectDate(date)}
            style={{
              minHeight: 64,
              borderRadius: 8,
              border: hasTemp ? "2px solid #dc2626" : `1px solid ${theme.border}`,
              background: hasTemp ? "rgba(254,202,202,0.4)" : "#fff",
              cursor: "pointer",
              padding: 6,
              textAlign: "left",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13 }}>{date.getDate()}</div>
            <div style={{ display: "flex", gap: 2, marginTop: 4, flexWrap: "wrap" }}>
              {plan.lanes.slice(0, 4).map((lane) => (
                <span
                  key={lane.functionId + (lane.exceptionId ?? "")}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: laneStyle(lane.functionId, visual).border,
                  }}
                  title={lane.label}
                />
              ))}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function CallSchedulePanel({ profileUserId, onOpenMyT }: Props) {
  const { user, role: authRole } = useAuth()
  const authUserId = user?.id ?? null
  const canScheduleForOrg = canUsePortalViewBar(authRole)
  const [roster, setRoster] = useState<OrgRosterEntry[]>([])
  const [selectedUserId, setSelectedUserId] = useState(profileUserId)
  const [profile, setProfile] = useState<CallRoutingProfile | null>(null)
  const [draft, setDraft] = useState<CallRoutingProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [view, setView] = useState<ScheduleView>("week")
  const [weekAnchor, setWeekAnchor] = useState(() => new Date())
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [editFunction, setEditFunction] = useState<ScheduleFunctionId | null>(null)
  const [blockEdit, setBlockEdit] = useState<BlockEditContext | null>(null)
  const [yearAnchor, setYearAnchor] = useState(() => new Date().getFullYear())
  const [editHoursDay, setEditHoursDay] = useState<DayKey | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSelectedUserId(profileUserId)
  }, [profileUserId])

  useEffect(() => {
    if (!supabase || !profileUserId) return
    let cancelled = false
    ;(async () => {
      if (!canScheduleForOrg) {
        if (!cancelled) setRoster([{ userId: profileUserId, label: "My account", isSelf: true }])
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

  useEffect(() => {
    const close = () => setContextMenu(null)
    window.addEventListener("click", close)
    return () => window.removeEventListener("click", close)
  }, [])

  const dirty = useMemo(() => {
    if (!profile || !draft) return false
    return JSON.stringify(profile) !== JSON.stringify(draft)
  }, [profile, draft])

  const active = draft ?? profile
  const weekDates = useMemo(() => weekDatesContaining(weekAnchor), [weekAnchor])
  const weekPlans = useMemo(() => {
    if (!active) return []
    return weekDates.map((d) => buildDayLanePlan(active, dayKeyFromDate(d), isoDateLocal(d)))
  }, [active, weekDates])

  async function handleSave(profileOverride?: CallRoutingProfile) {
    const toSave = profileOverride ?? draft
    if (!supabase || !toSave) return
    setSaving(true)
    setMessage("")
    const { error } = await saveCallRoutingProfile(supabase, toSave.profileUserId, {
      businessHours: toSave.businessHours,
      timezone: toSave.timezone,
      callForwardingEnabled: toSave.callForwardingEnabled,
      callForwardingOutsideBusinessHours: toSave.callForwardingOutsideBusinessHours,
      forwardDialCallerIdMode: toSave.forwardDialCallerIdMode,
      forwardWhisperOnAnswer: toSave.forwardWhisperOnAnswer,
      forwardWhisperOnlyOutsideBusinessHours: toSave.forwardWhisperOnlyOutsideBusinessHours,
      forwardWhisperRequireKeypress: toSave.forwardWhisperRequireKeypress,
      forwardWhisperAnnouncementTemplate: toSave.forwardWhisperAnnouncementTemplate,
      callHunting: toSave.callHunting,
      autoAttendant: {
        enabled: toSave.autoAttendant.enabled,
        mode: toSave.autoAttendant.enabled ? toSave.autoAttendant.mode : "off",
        spamScreenEnabled: toSave.autoAttendant.spamScreenEnabled,
        forwardGoodLeads: toSave.autoAttendant.forwardGoodLeads,
        unknownCallerShowTradesmanId: toSave.autoAttendant.unknownCallerShowTradesmanId,
      },
      scheduleVisual: toSave.scheduleVisual,
    })
    setSaving(false)
    if (error) {
      setMessage(`Save failed: ${error}`)
      return
    }
    setMessage("Saved")
    setEditFunction(null)
    setBlockEdit(null)
    setEditHoursDay(null)
    await load()
  }

  function patchVisual(functionId: ScheduleFunctionId, patch: { color?: ScheduleColorId; icon?: ScheduleIconId }) {
    if (!draft) return
    const lanes = { ...(draft.scheduleVisual.lanes ?? {}) }
    lanes[functionId] = { ...lanes[functionId], ...patch }
    setDraft({ ...draft, scheduleVisual: { lanes } })
  }

  function handleAddFunction(id: ScheduleFunctionId, plan?: DayLanePlan) {
    if (!draft) return
    const targetPlan =
      plan ??
      ({
        isoDate: isoDateLocal(selectedDate),
        dayKey: dayKeyFromDate(selectedDate),
        openMin: 9 * 60,
        closeMin: 17 * 60,
      } as DayLanePlan)
    const block: TimeBlock = {
      startMin: targetPlan.openMin ?? 9 * 60,
      endMin: targetPlan.closeMin ?? 17 * 60,
    }
    const timeKind = classifyBlockTimeKind(block, targetPlan.openMin ?? null, targetPlan.closeMin ?? null)
    setBlockEdit({
      functionId: id,
      isoDate: targetPlan.isoDate,
      dayKey: targetPlan.dayKey,
      block,
      timeKind,
    })
    if (id === "forwarding" && !draft.callForwardingEnabled) {
      setDraft({ ...draft, callForwardingEnabled: true })
    } else if (id === "ring_group" && !draft.callHunting.enabled) {
      setDraft({
        ...draft,
        callHunting: { ...draft.callHunting, enabled: true, mode: draft.callHunting.mode === "primary_only" ? "simultaneous" : draft.callHunting.mode },
      })
    } else if (id === "auto_attendant" && !draft.autoAttendant.enabled) {
      setDraft({
        ...draft,
        autoAttendant: { ...draft.autoAttendant, enabled: true, mode: draft.autoAttendant.mode === "off" ? "ai_menu" : draft.autoAttendant.mode },
      })
    }
    setEditFunction(id)
  }

  function openBlockEdit(ctx: BlockEditContext) {
    setBlockEdit(ctx)
    setEditFunction(ctx.functionId)
  }

  const dayPlan = active ? buildDayLanePlan(active, dayKeyFromDate(selectedDate), isoDateLocal(selectedDate)) : null

  return (
    <div ref={rootRef} style={{ display: "flex", flexDirection: "column", gap: 14, color: theme.text }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["week", "month", "day", "year"] as ScheduleView[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              style={{
                ...btnSecondary,
                border: view === v ? `2px solid ${theme.primary}` : btnSecondary.border,
                background: view === v ? "#eff6ff" : "#fff",
                textTransform: "capitalize",
              }}
            >
              {v}
            </button>
          ))}
        </div>
        {dirty ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => profile && setDraft(cloneCallRoutingProfile(profile))} style={btnSecondary}>
              Undo
            </button>
            <button type="button" onClick={() => void handleSave()} disabled={saving} style={btnPrimary}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        ) : null}
      </div>

      {canScheduleForOrg && roster.length > 1 ? (
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          style={{ maxWidth: 320, padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}`, fontWeight: 700 }}
        >
          {roster.map((r) => (
            <option key={r.userId} value={r.userId}>
              {r.label}
              {r.isSelf ? " (you)" : ""}
            </option>
          ))}
        </select>
      ) : null}

      {loading ? (
        <p style={{ margin: 0, opacity: 0.7 }}>Loading…</p>
      ) : !active || !draft ? (
        <p style={{ margin: 0, color: "#b45309" }}>Could not load call schedule.</p>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${theme.border}`,
              background: "#f8fafc",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Line</div>
              <div style={{ fontSize: 17, fontWeight: 900 }}>{active.communicationLine?.publicNumber ?? "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Rings</div>
              <div style={{ fontSize: 17, fontWeight: 900 }}>{active.communicationLine?.forwardToPhone ?? "—"}</div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <AddFunctionBar profile={draft} onAdd={handleAddFunction} />
            </div>
          </div>

          {message ? (
            <p style={{ margin: 0, fontSize: 12, color: message.startsWith("Save failed") ? "#b45309" : "#166534" }}>{message}</p>
          ) : null}

          <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>
            Blocks show only when each product is live. Double-click a block to edit schedule & settings. Right-click for color/icon.
          </p>

          {view === "week" ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <button type="button" style={btnSecondary} onClick={() => setWeekAnchor((d) => addDays(d, -7))}>
                  ←
                </button>
                <strong style={{ fontSize: 14 }}>
                  {weekDates[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} –{" "}
                  {weekDates[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </strong>
                <button type="button" style={btnSecondary} onClick={() => setWeekAnchor((d) => addDays(d, 7))}>
                  →
                </button>
                <button type="button" style={btnSecondary} onClick={() => setWeekAnchor(new Date())}>
                  Today
                </button>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
                <div
                  style={{
                    width: 36,
                    flexShrink: 0,
                    paddingTop: 52,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    fontSize: 10,
                    color: "#94a3b8",
                    fontWeight: 600,
                  }}
                >
                  {Array.from({ length: HOUR_COUNT + 1 }, (_, i) => HOUR_START + i).map((h) => (
                    <span key={h}>{h === 12 ? "12" : h > 12 ? h - 12 : h}</span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, flex: 1, overflowX: "auto" }}>
                  {weekPlans.map((plan) => (
                    <MultiLaneDayColumn
                      key={plan.isoDate}
                      plan={plan}
                      visual={draft.scheduleVisual}
                      onContextMenu={(e, functionId) => setContextMenu({ x: e.clientX, y: e.clientY, functionId })}
                      onBlockDoubleClick={openBlockEdit}
                      onEditHours={() => setEditHoursDay(plan.dayKey)}
                      onDropFunction={(fnId, droppedPlan) => handleAddFunction(fnId, droppedPlan)}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {view === "month" ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <button type="button" style={btnSecondary} onClick={() => setMonthAnchor((m) => addMonths(m, -1))}>
                  ←
                </button>
                <strong>{monthAnchor.toLocaleString(undefined, { month: "long", year: "numeric" })}</strong>
                <button type="button" style={btnSecondary} onClick={() => setMonthAnchor((m) => addMonths(m, 1))}>
                  →
                </button>
              </div>
              <MonthMiniGrid
                profile={draft}
                monthAnchor={monthAnchor}
                visual={draft.scheduleVisual}
                onSelectDate={(d) => {
                  setSelectedDate(d)
                  setView("day")
                }}
              />
            </div>
          ) : null}

          {view === "day" && dayPlan ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <button type="button" style={btnSecondary} onClick={() => setSelectedDate((d) => addDays(d, -1))}>
                  ←
                </button>
                <strong>{selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</strong>
                <button type="button" style={btnSecondary} onClick={() => setSelectedDate((d) => addDays(d, 1))}>
                  →
                </button>
              </div>
              {dayPlan.activeException ? (
                <div
                  style={{
                    marginBottom: 10,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "rgba(254,202,202,0.5)",
                    border: "2px solid #dc2626",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#991b1b",
                  }}
                >
                  {dayPlan.activeException.label} — adjust call flow for this day
                  {dayPlan.activeException.coverLabel ? ` · Backup: ${dayPlan.activeException.coverLabel}` : ""}
                </div>
              ) : null}
              <div style={{ maxWidth: 480 }}>
                <MultiLaneDayColumn
                  plan={dayPlan}
                  visual={draft.scheduleVisual}
                  onContextMenu={(e, functionId) => setContextMenu({ x: e.clientX, y: e.clientY, functionId })}
                  onBlockDoubleClick={openBlockEdit}
                  onEditHours={() => setEditHoursDay(dayPlan.dayKey)}
                />
              </div>
            </div>
          ) : null}

          {view === "year" ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <button type="button" style={btnSecondary} onClick={() => setYearAnchor((y) => y - 1)}>
                  ←
                </button>
                <strong style={{ fontSize: 16 }}>{yearAnchor}</strong>
                <button type="button" style={btnSecondary} onClick={() => setYearAnchor((y) => y + 1)}>
                  →
                </button>
                <button type="button" style={btnSecondary} onClick={() => setYearAnchor(new Date().getFullYear())}>
                  This year
                </button>
              </div>
              <YearGrid
                profile={draft}
                year={yearAnchor}
                visual={draft.scheduleVisual}
                onSelectMonth={(m) => {
                  setMonthAnchor(new Date(yearAnchor, m, 1))
                  setView("month")
                }}
              />
            </div>
          ) : null}

          {onOpenMyT ? (
            <button type="button" onClick={onOpenMyT} style={{ ...btnSecondary, alignSelf: "flex-start", fontSize: 12 }}>
              Open MyT for ring list & line setup →
            </button>
          ) : null}
        </>
      )}

      {contextMenu && draft ? (
        <VisualContextMenu
          menu={contextMenu}
          visual={draft.scheduleVisual}
          onPickColor={(fid, color) => patchVisual(fid, { color })}
          onPickIcon={(fid, icon) => patchVisual(fid, { icon })}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      {editFunction && draft ? (
        <FunctionEditModal
          functionId={editFunction}
          draft={draft}
          setDraft={setDraft}
          blockEdit={blockEdit}
          roster={roster}
          onClose={() => {
            setEditFunction(null)
            setBlockEdit(null)
          }}
          onSave={(merged) => void handleSave(merged)}
          saving={saving}
        />
      ) : null}

      {editHoursDay && draft ? (
        <HoursEditModal
          dayKey={editHoursDay}
          draft={draft}
          setDraft={setDraft}
          onClose={() => setEditHoursDay(null)}
          onSave={() => void handleSave()}
          saving={saving}
        />
      ) : null}
    </div>
  )
}
