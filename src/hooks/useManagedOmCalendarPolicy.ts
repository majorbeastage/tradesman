import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"
import { useManagedByOfficeManager } from "./useManagedByOfficeManager"
import { parseOmCalendarPolicy, type OmCalendarPolicyV1 } from "../lib/teamCalendarPolicy"

/** Managed user's `profiles.metadata.om_calendar_policy` (same source as Calendar tab). */
export function useManagedOmCalendarPolicy(): OmCalendarPolicyV1 {
  const { userId } = useAuth()
  const managedByOfficeManager = useManagedByOfficeManager()
  const [policy, setPolicy] = useState(() => parseOmCalendarPolicy({}))

  useEffect(() => {
    if (!managedByOfficeManager || !supabase || !userId) {
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
  }, [managedByOfficeManager, userId])

  return policy
}
