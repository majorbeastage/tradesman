import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"
import { usePortalViewOptional } from "../contexts/PortalViewContext"
import { useManagedByOfficeManager } from "./useManagedByOfficeManager"
import { isSandboxDemoUserId } from "../lib/sandboxDemoTeam"
import { resolveDemoTeamPolicyFromOwnerMetadata } from "../lib/sandboxDemoTeamPolicies"
import { parseOmCalendarPolicy, type OmCalendarPolicyV1 } from "../lib/teamCalendarPolicy"

/** Managed user's `profiles.metadata.om_calendar_policy` (same source as Calendar tab). */
export function useManagedOmCalendarPolicy(): OmCalendarPolicyV1 {
  const { userId } = useAuth()
  const managedByOfficeManager = useManagedByOfficeManager()
  const portalView = usePortalViewOptional()
  const viewAsDemoId =
    portalView?.showViewBar && isSandboxDemoUserId(portalView.targetUserId) ? portalView.targetUserId : null
  const [policy, setPolicy] = useState(() => parseOmCalendarPolicy({}))

  useEffect(() => {
    if (!supabase || !userId) {
      setPolicy(parseOmCalendarPolicy({}))
      return
    }
    if (viewAsDemoId) {
      let cancelled = false
      void supabase
        .from("profiles")
        .select("metadata")
        .eq("id", userId)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled) return
          setPolicy(resolveDemoTeamPolicyFromOwnerMetadata(data?.metadata, viewAsDemoId))
        })
      return () => {
        cancelled = true
      }
    }
    if (!managedByOfficeManager) {
      setPolicy(parseOmCalendarPolicy({}))
      return
    }
    let cancelled = false
    void supabase
      .from("profiles")
      .select("metadata")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setPolicy(parseOmCalendarPolicy(data?.metadata))
      })
    return () => {
      cancelled = true
    }
  }, [managedByOfficeManager, userId, supabase, viewAsDemoId])

  return policy
}
