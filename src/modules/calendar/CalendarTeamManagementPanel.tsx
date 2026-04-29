import { useEffect, useMemo, useState } from "react"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import type { ManagedClientRow } from "../../contexts/OfficeManagerScopeContext"
import {
  defaultTeamRibbonColor,
  mergeOmCalendarPolicy,
  mergeTeamRibbonColors,
  parseOmCalendarPolicy,
  parseTeamRibbonColors,
  type OmCalendarPolicyV1,
} from "../../lib/teamCalendarPolicy"

type ProfileLite = {
  id: string
  display_name: string | null
  email: string | null
  metadata: unknown
}

type PrefLite = {
  owner_user_id: string
  ribbon_color: string | null
  auto_assign_enabled: boolean | null
}

type Props = {
  officeManagerUserId: string
  roster: ManagedClientRow[]
  /** Managed users only (excludes OM row) for policy cards */
  managedOnly: ManagedClientRow[]
}

export default function CalendarTeamManagementPanel({ officeManagerUserId, roster, managedOnly }: Props) {
  const [omMeta, setOmMeta] = useState<Record<string, unknown>>({})
  const [profilesById, setProfilesById] = useState<Record<string, ProfileLite>>({})
  const [prefsByUser, setPrefsByUser] = useState<Record<string, PrefLite>>({})
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [message, setMessage] = useState<string>("")

  const teamColors = useMemo(() => parseTeamRibbonColors(omMeta), [omMeta])

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    void supabase
      .from("profiles")
      .select("metadata")
      .eq("id", officeManagerUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const m = data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata) ? (data.metadata as Record<string, unknown>) : {}
        setOmMeta(m)
      })
    return () => {
      cancelled = true
    }
  }, [officeManagerUserId])

  useEffect(() => {
    if (!supabase || roster.length === 0) return
    const ids = roster.map((r) => r.userId).filter(Boolean)
    let cancelled = false
    void (async () => {
      const { data: profs, error: e1 } = await supabase.from("profiles").select("id, display_name, email, metadata").in("id", ids)
      if (cancelled || e1 || !profs) return
      const map: Record<string, ProfileLite> = {}
      for (const p of profs as ProfileLite[]) map[p.id] = p
      setProfilesById(map)
      const { data: prefs, error: e2 } = await supabase.from("user_calendar_preferences").select("owner_user_id, ribbon_color, auto_assign_enabled").in("owner_user_id", ids)
      if (cancelled || e2) return
      const pm: Record<string, PrefLite> = {}
      for (const row of (prefs ?? []) as PrefLite[]) pm[row.owner_user_id] = row
      setPrefsByUser(pm)
    })()
    return () => {
      cancelled = true
    }
  }, [roster])

  async function persistOmColorForMember(memberUserId: string, hex: string) {
    if (!supabase) return
    setSavingUserId("__om__")
    setMessage("")
    try {
      const { data: row, error: e1 } = await supabase.from("profiles").select("metadata").eq("id", officeManagerUserId).maybeSingle()
      if (e1) throw e1
      const merged = mergeTeamRibbonColors(row?.metadata, memberUserId, hex)
      const { error: e2 } = await supabase.from("profiles").update({ metadata: merged, updated_at: new Date().toISOString() }).eq("id", officeManagerUserId)
      if (e2) throw e2
      setOmMeta(merged)
      setMessage("Color saved.")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingUserId(null)
    }
  }

  async function persistManagedPolicy(targetUserId: string, patch: Partial<OmCalendarPolicyV1>) {
    if (!supabase) return
    setSavingUserId(targetUserId)
    setMessage("")
    try {
      const { data: row, error: e1 } = await supabase.from("profiles").select("metadata").eq("id", targetUserId).maybeSingle()
      if (e1) throw e1
      const nextMeta = mergeOmCalendarPolicy(row?.metadata, patch)
      const { error: e2 } = await supabase.from("profiles").update({ metadata: nextMeta, updated_at: new Date().toISOString() }).eq("id", targetUserId)
      if (e2) throw e2
      setProfilesById((prev) => ({
        ...prev,
        [targetUserId]: { ...prev[targetUserId], id: targetUserId, metadata: nextMeta } as ProfileLite,
      }))
      setMessage("Team settings saved for user.")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingUserId(null)
    }
  }

  async function persistUserPref(targetUserId: string, ribbon: string, autoAssign: boolean) {
    if (!supabase) return
    setSavingUserId(targetUserId)
    setMessage("")
    try {
      const payload = {
        owner_user_id: targetUserId,
        ribbon_color: ribbon,
        auto_assign_enabled: autoAssign,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from("user_calendar_preferences").upsert(payload, { onConflict: "owner_user_id" })
      if (error) throw error
      setPrefsByUser((prev) => ({ ...prev, [targetUserId]: { owner_user_id: targetUserId, ribbon_color: ribbon, auto_assign_enabled: autoAssign } }))
      setMessage("Calendar ribbon saved.")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingUserId(null)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, fontSize: 14, color: "#475569", lineHeight: 1.55, maxWidth: 900 }}>
        Configure roster members linked to your office. Colors are saved on your profile; per-user calendar toggles are saved on each
        user&apos;s profile (managed accounts). More scheduling rules and job-type routing will layer on this foundation.
      </p>
      {message ? (
        <p style={{ margin: 0, fontSize: 13, color: message.includes("saved") ? "#059669" : "#b91c1c" }}>{message}</p>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {roster.map((member, idx) => {
          const p = profilesById[member.userId]
          const meta = p?.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata) ? (p.metadata as Record<string, unknown>) : {}
          const photo =
            typeof meta.profile_photo_url === "string" && meta.profile_photo_url.trim().startsWith("http")
              ? meta.profile_photo_url.trim()
              : null
          const ribbonOm = teamColors[member.userId] ?? defaultTeamRibbonColor(member.userId, idx)
          const pref = prefsByUser[member.userId]
          const ribbonPref = pref?.ribbon_color?.trim() || ribbonOm
          const policy = member.isSelf ? ({ allow_add_to_calendar: true, job_types_access: "edit" } as OmCalendarPolicyV1) : parseOmCalendarPolicy(p?.metadata)

          return (
            <div
              key={member.userId}
              style={{
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                overflow: "hidden",
                boxShadow: "0 2px 10px rgba(15,23,42,0.06)",
                display: "flex",
                flexDirection: "column",
                minHeight: 200,
              }}
            >
              <div
                style={{
                  position: "relative",
                  height: 56,
                  background: ribbonOm,
                  flexShrink: 0,
                }}
              >
                {photo ? (
                  <img
                    src={photo}
                    alt=""
                    style={{
                      position: "absolute",
                      left: "50%",
                      bottom: 4,
                      transform: "translateX(-50%)",
                      width: 56,
                      height: 56,
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: "3px solid #fff",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    }}
                  />
                ) : null}
              </div>
              <div style={{ padding: "14px 14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: theme.text }}>{member.label}</div>
                  {member.email ? <div style={{ fontSize: 12, color: "#64748b" }}>{member.email}</div> : null}
                  {member.isSelf ? <div style={{ fontSize: 11, fontWeight: 700, color: theme.primary, marginTop: 4 }}>Office manager</div> : null}
                </div>

                <label style={{ fontSize: 12, fontWeight: 600, color: theme.text, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  Team color
                  <input
                    type="color"
                    value={ribbonOm}
                    disabled={savingUserId === "__om__"}
                    onChange={(e) => {
                      const hex = e.target.value
                      setOmMeta((prev) => mergeTeamRibbonColors(prev, member.userId, hex))
                    }}
                    onBlur={(e) => void persistOmColorForMember(member.userId, e.currentTarget.value)}
                    style={{ width: 40, height: 32, padding: 0, border: `1px solid ${theme.border}`, borderRadius: 6, cursor: "pointer" }}
                  />
                </label>

                <label style={{ fontSize: 12, fontWeight: 600, color: theme.text, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  Calendar ribbon (map / pins)
                  <input
                    type="color"
                    value={ribbonPref}
                    disabled={savingUserId === member.userId}
                    onChange={(e) => setPrefsByUser((prev) => ({
                      ...prev,
                      [member.userId]: {
                        owner_user_id: member.userId,
                        ribbon_color: e.target.value,
                        auto_assign_enabled: pref?.auto_assign_enabled ?? true,
                      },
                    }))}
                    style={{ width: 40, height: 32, padding: 0, border: `1px solid ${theme.border}`, borderRadius: 6, cursor: "pointer" }}
                  />
                  <button
                    type="button"
                    disabled={savingUserId === member.userId}
                    onClick={() => void persistUserPref(member.userId, ribbonPref, pref?.auto_assign_enabled ?? true)}
                    style={{
                      padding: "4px 10px",
                      fontSize: 12,
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      background: "#f8fafc",
                      cursor: savingUserId === member.userId ? "wait" : "pointer",
                      fontWeight: 600,
                    }}
                  >
                    Save ribbon
                  </button>
                </label>

                <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={pref?.auto_assign_enabled !== false}
                    disabled={savingUserId === member.userId}
                    onChange={(e) => {
                      const v = e.target.checked
                      setPrefsByUser((prev) => ({
                        ...prev,
                        [member.userId]: {
                          owner_user_id: member.userId,
                          ribbon_color: ribbonPref,
                          auto_assign_enabled: v,
                        },
                      }))
                    }}
                  />
                  Auto-assign new items to this user
                </label>
                <button
                  type="button"
                  disabled={savingUserId === member.userId}
                  onClick={() => void persistUserPref(member.userId, ribbonPref, pref?.auto_assign_enabled !== false)}
                  style={{
                    alignSelf: "flex-start",
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    border: "none",
                    background: theme.primary,
                    color: "#fff",
                    fontWeight: 600,
                    cursor: savingUserId === member.userId ? "wait" : "pointer",
                  }}
                >
                  Save calendar prefs
                </button>

                {!member.isSelf ? (
                  <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 10, display: "grid", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>Managed user access</span>
                    <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={policy.allow_add_to_calendar !== false}
                        disabled={savingUserId === member.userId}
                        onChange={(e) => void persistManagedPolicy(member.userId, { allow_add_to_calendar: e.target.checked })}
                      />
                      Allow &quot;Add item to calendar&quot; on their Calendar tab
                    </label>
                    <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={policy.scheduling_tools === true}
                        disabled={savingUserId === member.userId}
                        onChange={(e) => void persistManagedPolicy(member.userId, { scheduling_tools: e.target.checked })}
                      />
                      Scheduling tools (extra Calendar + Alerts options)
                    </label>
                    <label style={{ fontSize: 12, color: theme.text, display: "flex", alignItems: "center", gap: 6 }}>
                      Job types on their tab
                      <select
                        value={policy.job_types_access ?? "edit"}
                        disabled={savingUserId === member.userId}
                        onChange={(e) =>
                          void persistManagedPolicy(member.userId, {
                            job_types_access: e.target.value as OmCalendarPolicyV1["job_types_access"],
                          })
                        }
                        style={{ ...theme.formInput, maxWidth: 160, fontSize: 12 }}
                      >
                        <option value="off">Hidden</option>
                        <option value="read">Read-only</option>
                        <option value="edit">Edit</option>
                      </select>
                    </label>
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {managedOnly.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No linked contractors yet. Add clients under your office manager account.</p>
      ) : null}
    </div>
  )
}
