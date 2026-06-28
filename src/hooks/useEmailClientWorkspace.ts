import { useCallback, useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import {
  mergeEmailClientWorkspace,
  parseEmailClientWorkspace,
  type EmailClientInboxOption,
  type EmailClientWorkspaceV1,
} from "../lib/emailClientWorkspace"
import { syncOutOfOfficeToCalendar } from "../lib/workforceCalendarSync"

export function useEmailClientWorkspace(userId: string | null | undefined) {
  const [workspace, setWorkspace] = useState<EmailClientWorkspaceV1>(() => parseEmailClientWorkspace(null))
  const [metadata, setMetadata] = useState<Record<string, unknown>>({})
  const [orgInboxes, setOrgInboxes] = useState<EmailClientInboxOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!userId || !supabase) {
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      const [{ data: profile }, { data: routes }] = await Promise.all([
        supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle(),
        supabase
          .from("platform_email_routes")
          .select("id, local_part, domain, route_kind, department_key")
          .eq("account_id", userId)
          .order("local_part"),
      ])
      if (cancelled) return
      const meta =
        profile?.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
          ? (profile.metadata as Record<string, unknown>)
          : {}
      setMetadata(meta)
      setWorkspace(parseEmailClientWorkspace(meta))
      const inboxes: EmailClientInboxOption[] = []
      for (const row of routes ?? []) {
        const r = row as { id?: string; local_part?: string; domain?: string; route_kind?: string; department_key?: string }
        if (!r.id || !r.local_part) continue
        if (r.route_kind === "customer_primary") continue
        const address = `${r.local_part}@${r.domain ?? "tradesman-us.com"}`
        const label = r.department_key ? `${r.department_key} inbox` : address
        inboxes.push({ routeId: r.id, address, label })
      }
      setOrgInboxes(inboxes)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  const saveWorkspacePatch = useCallback(
    async (patch: Partial<EmailClientWorkspaceV1>) => {
      if (!userId || !supabase) return
      setSaving(true)
      const nextMeta = mergeEmailClientWorkspace(metadata, patch)
      let nextWs = parseEmailClientWorkspace(nextMeta)

      if (patch.outOfOffice && supabase) {
        const eventId = await syncOutOfOfficeToCalendar(
          supabase,
          userId,
          userId,
          nextWs.outOfOffice,
          nextWs.outOfOffice.calendarEventId,
        )
        if (eventId !== nextWs.outOfOffice.calendarEventId) {
          const withCal = mergeEmailClientWorkspace(nextMeta, {
            outOfOffice: { ...nextWs.outOfOffice, calendarEventId: eventId },
          })
          nextWs = parseEmailClientWorkspace(withCal)
          setMetadata(withCal)
          setWorkspace(nextWs)
          const { error } = await supabase.from("profiles").update({ metadata: withCal }).eq("id", userId)
          setSaving(false)
          if (error) throw new Error(error.message)
          return
        }
      }

      setMetadata(nextMeta)
      setWorkspace(nextWs)
      const { error } = await supabase.from("profiles").update({ metadata: nextMeta }).eq("id", userId)
      setSaving(false)
      if (error) throw new Error(error.message)
    },
    [metadata, userId],
  )

  return { workspace, orgInboxes, loading, saving, saveWorkspacePatch, setWorkspace }
}
