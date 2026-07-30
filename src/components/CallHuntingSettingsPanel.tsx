import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import { resolveAccountStructureOwnerId } from "../lib/accountStructureOwner"
import { loadActiveTeamMembers } from "../lib/teamMembers"
import {
  DEFAULT_CALL_HUNTING,
  mergeCallHuntingMetadata,
  newHuntExceptionId,
  newHuntTargetId,
  parseCallHunting,
  type CallHuntException,
  type CallHuntMode,
  type CallHuntSchedule,
  type CallHuntTarget,
  type CallHuntingSettings,
} from "../lib/callHunting"

type RingPerson = {
  profileId: string
  displayName: string
  phone: string
  isSelf?: boolean
}

type Props = {
  profileUserId: string
  primaryForwardHint?: string
}

const btnPrimary: CSSProperties = {
  border: "none",
  background: theme.primary,
  color: "#ffffff",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
  width: "fit-content",
  fontSize: 14,
  WebkitTextFillColor: "#ffffff",
}

const btnSecondary: CSSProperties = {
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: "#0f172a",
  borderRadius: 8,
  padding: "8px 12px",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 13,
  WebkitTextFillColor: "#0f172a",
}

const btnDanger: CSSProperties = {
  ...btnSecondary,
  color: "#991b1b",
  borderColor: "#fecaca",
  background: "#fff",
  WebkitTextFillColor: "#991b1b",
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function phoneForProfile(row: {
  primary_phone?: string | null
  best_contact_phone?: string | null
}): string {
  return (row.best_contact_phone || row.primary_phone || "").trim()
}

export function CallHuntingSettingsPanel({ profileUserId, primaryForwardHint }: Props) {
  const [settings, setSettings] = useState<CallHuntingSettings>({ ...DEFAULT_CALL_HUNTING, targets: [], exceptions: [] })
  const [people, setPeople] = useState<RingPerson[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const peopleById = useMemo(() => new Map(people.map((p) => [p.profileId, p])), [people])

  const load = useCallback(async () => {
    if (!supabase || !profileUserId) return
    setLoading(true)
    try {
      const { data } = await supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
      const meta =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {}
      setSettings(parseCallHunting(meta.call_hunting_v1))

      const ownerId = await resolveAccountStructureOwnerId(supabase, profileUserId)
      const { data: self } = await supabase
        .from("profiles")
        .select("id, display_name, primary_phone, best_contact_phone")
        .eq("id", profileUserId)
        .maybeSingle()

      const roster: RingPerson[] = []
      if (self) {
        roster.push({
          profileId: self.id,
          displayName: (self.display_name || "You").trim() || "You",
          phone: phoneForProfile(self),
          isSelf: true,
        })
      }

      try {
        const members = await loadActiveTeamMembers(supabase, ownerId)
        const ids = members.map((m) => m.profileId).filter((id) => id !== profileUserId)
        if (ids.length) {
          const { data: memberProfiles } = await supabase
            .from("profiles")
            .select("id, display_name, primary_phone, best_contact_phone")
            .in("id", ids)
          for (const member of members) {
            if (member.profileId === profileUserId) continue
            const row = (memberProfiles ?? []).find((p) => p.id === member.profileId)
            roster.push({
              profileId: member.profileId,
              displayName: member.displayName || row?.display_name || "Team member",
              phone: row ? phoneForProfile(row) : "",
            })
          }
        }
      } catch {
        /* team roster optional if RLS blocks */
      }

      setPeople(roster)
    } finally {
      setLoading(false)
    }
  }, [profileUserId])

  useEffect(() => {
    void load()
  }, [load])

  async function persist(next: CallHuntingSettings) {
    if (!supabase || !profileUserId) return
    setSaving(true)
    setMessage("")
    const { data } = await supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
    const prev =
      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {}
    const { error } = await supabase
      .from("profiles")
      .update({ metadata: mergeCallHuntingMetadata(prev, next), updated_at: new Date().toISOString() })
      .eq("id", profileUserId)
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setSettings(next)
    setMessage("Ring group saved.")
  }

  function applyPersonToTarget(target: CallHuntTarget, personId: string): CallHuntTarget {
    if (personId === "__custom__") {
      return { ...target, userId: null, label: target.label || "Custom number" }
    }
    const person = peopleById.get(personId)
    if (!person) return target
    return {
      ...target,
      userId: person.profileId,
      label: person.displayName,
      phone: person.phone || target.phone,
    }
  }

  function applyPersonToException(exception: CallHuntException, field: "unavailable" | "cover", personId: string): CallHuntException {
    if (field === "unavailable") {
      return { ...exception, unavailableUserId: personId === "__none__" ? null : personId }
    }
    if (personId === "__custom__") {
      return { ...exception, coverUserId: null, coverLabel: exception.coverLabel || "Cover number" }
    }
    const person = peopleById.get(personId)
    if (!person) return exception
    return {
      ...exception,
      coverUserId: person.profileId,
      coverLabel: person.displayName,
      coverPhone: person.phone || exception.coverPhone,
    }
  }

  if (loading) return <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Loading ring options…</p>

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, color: "#334155", lineHeight: 1.55 }}>
        Build who rings and <strong>when</strong>. Use business-hours vs after-hours targets for 24-hour coverage, and temporary
        exceptions when someone is out. Primary forward number
        {primaryForwardHint ? ` (${primaryForwardHint})` : ""} still comes from Admin → Communications. Team phones come from each
        person’s My T primary / best-contact number.
      </p>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: theme.text }}>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) =>
            void persist({
              ...settings,
              enabled: e.target.checked,
              mode: e.target.checked && settings.mode === "primary_only" ? "sequential" : settings.mode,
            })
          }
          style={{ marginTop: 3 }}
        />
        <span>
          <strong style={{ color: theme.text }}>Enable ring group / hunting</strong>
          <span style={{ display: "block", fontSize: 12, color: "#64748b", marginTop: 2 }}>
            Off = only the primary Twilio channel number rings.
          </span>
        </span>
      </label>

      {settings.enabled ? (
        <>
          <label style={{ display: "grid", gap: 6, maxWidth: 480 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: theme.text }}>Primary forward number rings</span>
            <select
              value={settings.primarySchedule || "always"}
              onChange={(e) => void persist({ ...settings, primarySchedule: e.target.value as CallHuntSchedule })}
              style={{ ...theme.formInput, color: theme.text, fontWeight: 600 }}
            >
              <option value="always">Always (day and night)</option>
              <option value="business_hours">Business hours only</option>
              <option value="after_hours">After hours only</option>
            </select>
            <span style={{ fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>
              For 24-hour coverage: set primary to business hours, then add overnight teammates as “After hours only”.
            </span>
          </label>

          <label style={{ display: "grid", gap: 6, maxWidth: 480 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: theme.text }}>How should phones ring?</span>
            <select
              value={settings.mode}
              onChange={(e) => void persist({ ...settings, mode: e.target.value as CallHuntMode })}
              style={{ ...theme.formInput, color: theme.text, fontWeight: 600 }}
            >
              <option value="sequential">One at a time (hunt) — try next if no answer</option>
              <option value="simultaneous">All at once — first to answer wins</option>
              <option value="primary_only">Primary only (ignore hunt targets)</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6, maxWidth: 220 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: theme.text }}>Ring time (seconds)</span>
            <input
              type="number"
              min={8}
              max={45}
              value={settings.ringSeconds}
              onChange={(e) => setSettings((prev) => ({ ...prev, ringSeconds: Number(e.target.value) || 22 }))}
              onBlur={() => void persist(settings)}
              style={theme.formInput}
            />
          </label>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: theme.text }}>Additional ring targets</div>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
              Pick a team member to use their saved phone, or choose Custom number. Set “When to ring” so daytime and overnight
              routes can differ.
            </p>

            {settings.targets.map((target, index) => (
              <div
                key={target.id}
                style={{
                  display: "grid",
                  gap: 8,
                  padding: 12,
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="checkbox"
                    checked={target.enabled}
                    onChange={(e) => {
                      const targets = settings.targets.map((row, i) => (i === index ? { ...row, enabled: e.target.checked } : row))
                      void persist({ ...settings, targets })
                    }}
                  />
                  <select
                    value={target.userId || "__custom__"}
                    onChange={(e) => {
                      const targets = settings.targets.map((row, i) =>
                        i === index ? applyPersonToTarget(row, e.target.value) : row,
                      )
                      void persist({ ...settings, targets })
                    }}
                    style={{ ...theme.formInput, flex: "1 1 180px", minWidth: 160, color: theme.text, fontWeight: 600 }}
                  >
                    <option value="__custom__">Custom number…</option>
                    {people.map((person) => (
                      <option key={person.profileId} value={person.profileId}>
                        {person.displayName}
                        {person.isSelf ? " (you)" : ""}
                        {person.phone ? ` · ${person.phone}` : " — no phone in My T yet"}
                      </option>
                    ))}
                  </select>
                  <select
                    value={target.schedule}
                    onChange={(e) => {
                      const targets = settings.targets.map((row, i) =>
                        i === index ? { ...row, schedule: e.target.value as CallHuntSchedule } : row,
                      )
                      void persist({ ...settings, targets })
                    }}
                    style={{ ...theme.formInput, flex: "1 1 160px", minWidth: 150, color: theme.text, fontWeight: 600 }}
                  >
                    <option value="always">Ring always</option>
                    <option value="business_hours">Business hours only</option>
                    <option value="after_hours">After hours only</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void persist({ ...settings, targets: settings.targets.filter((_, i) => i !== index) })}
                    style={btnDanger}
                  >
                    Remove
                  </button>
                </div>
                {!target.userId ? (
                  <input
                    value={target.phone}
                    placeholder="+15551234567"
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        targets: prev.targets.map((row, i) => (i === index ? { ...row, phone: e.target.value } : row)),
                      }))
                    }
                    onBlur={() => void persist(settings)}
                    style={theme.formInput}
                  />
                ) : (
                  <div style={{ fontSize: 12, color: target.phone ? "#64748b" : "#b45309" }}>
                    {target.phone
                      ? `Rings ${target.phone} (from My T) · ${target.label || "—"}`
                      : "This teammate has no phone saved yet — add their primary / best-contact number in My T before they can ring."}
                  </div>
                )}
              </div>
            ))}

            {settings.targets.length < 4 ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  const first = people.find((p) => p.phone)
                  void persist({
                    ...settings,
                    targets: [
                      ...settings.targets,
                      first
                        ? {
                            id: newHuntTargetId(),
                            label: first.displayName,
                            phone: first.phone,
                            enabled: true,
                            userId: first.profileId,
                            schedule: "always" as CallHuntSchedule,
                          }
                        : {
                            id: newHuntTargetId(),
                            label: "Custom number",
                            phone: "",
                            enabled: true,
                            userId: null,
                            schedule: "always" as CallHuntSchedule,
                          },
                    ],
                  })
                }}
                style={btnPrimary}
              >
                Add ring target
              </button>
            ) : null}
          </div>

          <div
            style={{
              marginTop: 4,
              paddingTop: 14,
              borderTop: `1px solid ${theme.border}`,
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: theme.text }}>Temporary coverage (out of office)</div>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
              While an exception is active, that teammate is skipped in the ring group and the cover number is added. Edit here
              or under Team Management → Call coverage — both save the same live routing settings.
            </p>

            {settings.exceptions.map((exception, index) => (
              <div
                key={exception.id}
                style={{
                  display: "grid",
                  gap: 8,
                  padding: 12,
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                }}
              >
                <input
                  value={exception.label}
                  placeholder="Vacation cover, overnight tech…"
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      exceptions: prev.exceptions.map((row, i) => (i === index ? { ...row, label: e.target.value } : row)),
                    }))
                  }
                  onBlur={() => void persist(settings)}
                  style={theme.formInput}
                />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                  <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#64748b" }}>
                    Starts
                    <input
                      type="date"
                      value={exception.startsOn}
                      onChange={(e) => {
                        const exceptions = settings.exceptions.map((row, i) =>
                          i === index ? { ...row, startsOn: e.target.value } : row,
                        )
                        void persist({ ...settings, exceptions })
                      }}
                      style={theme.formInput}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#64748b" }}>
                    Ends
                    <input
                      type="date"
                      value={exception.endsOn}
                      onChange={(e) => {
                        const exceptions = settings.exceptions.map((row, i) =>
                          i === index ? { ...row, endsOn: e.target.value } : row,
                        )
                        void persist({ ...settings, exceptions })
                      }}
                      style={theme.formInput}
                    />
                  </label>
                </div>
                <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#64748b" }}>
                  Person who is unavailable
                  <select
                    value={exception.unavailableUserId || "__none__"}
                    onChange={(e) => {
                      const exceptions = settings.exceptions.map((row, i) =>
                        i === index ? applyPersonToException(row, "unavailable", e.target.value) : row,
                      )
                      void persist({ ...settings, exceptions })
                    }}
                    style={theme.formInput}
                  >
                    <option value="__none__">Nobody specific (just add cover)</option>
                    {people.map((person) => (
                      <option key={person.profileId} value={person.profileId}>
                        {person.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 11, fontWeight: 700, color: "#64748b" }}>
                  Cover with
                  <select
                    value={exception.coverUserId || "__custom__"}
                    onChange={(e) => {
                      const exceptions = settings.exceptions.map((row, i) =>
                        i === index ? applyPersonToException(row, "cover", e.target.value) : row,
                      )
                      void persist({ ...settings, exceptions })
                    }}
                    style={theme.formInput}
                  >
                    <option value="__custom__">Custom number…</option>
                    {people.map((person) => (
                      <option key={person.profileId} value={person.profileId}>
                        {person.displayName}
                        {person.phone ? ` · ${person.phone}` : " — no phone"}
                      </option>
                    ))}
                  </select>
                </label>
                {!exception.coverUserId ? (
                  <input
                    value={exception.coverPhone}
                    placeholder="Cover phone +1…"
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        exceptions: prev.exceptions.map((row, i) =>
                          i === index ? { ...row, coverPhone: e.target.value } : row,
                        ),
                      }))
                    }
                    onBlur={() => void persist(settings)}
                    style={theme.formInput}
                  />
                ) : null}
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: theme.text }}>
                  <input
                    type="checkbox"
                    checked={exception.skipPrimary === true}
                    onChange={(e) => {
                      const exceptions = settings.exceptions.map((row, i) =>
                        i === index ? { ...row, skipPrimary: e.target.checked } : row,
                      )
                      void persist({ ...settings, exceptions })
                    }}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong>Skip primary forward number</strong> while this cover is active (use when the main phone is out)
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    void persist({
                      ...settings,
                      exceptions: settings.exceptions.filter((_, i) => i !== index),
                    })
                  }
                  style={btnDanger}
                >
                  Remove exception
                </button>
              </div>
            ))}

            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void persist({
                  ...settings,
                  exceptions: [
                    ...settings.exceptions,
                    {
                      id: newHuntExceptionId(),
                      label: "Out of office cover",
                      startsOn: todayIso(),
                      endsOn: addDaysIso(7),
                      unavailableUserId: null,
                      coverUserId: null,
                      coverPhone: "",
                      coverLabel: "",
                      skipPrimary: false,
                    },
                  ],
                })
              }
              style={btnPrimary}
            >
              Add temporary coverage
            </button>
          </div>
        </>
      ) : null}

      {message ? (
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: message.includes("saved") ? "#15803d" : "#b91c1c" }}>
          {message}
        </p>
      ) : null}
      {saving ? <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Saving…</p> : null}
    </div>
  )
}
