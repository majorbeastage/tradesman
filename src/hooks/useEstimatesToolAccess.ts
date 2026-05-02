import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"
import { useManagedByOfficeManager } from "./useManagedByOfficeManager"
import { estimatesToolAllowedForUser } from "../lib/estimatesToolPolicy"

/** Quotes / Estimates tab: managed-by-OM users need OM to enable the tool; others always allowed. */
export function useEstimatesToolAccess(): { allowed: boolean; loading: boolean } {
  const managed = useManagedByOfficeManager()
  const { userId } = useAuth()
  const [loading, setLoading] = useState(managed)
  const [metadata, setMetadata] = useState<unknown>(null)

  useEffect(() => {
    if (!managed) {
      setLoading(false)
      return
    }
    if (!supabase || !userId) {
      setLoading(false)
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
        setMetadata(data?.metadata ?? null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [managed, userId])

  const allowed = !managed || (!loading && estimatesToolAllowedForUser(true, metadata))
  return { allowed, loading: managed && loading }
}
