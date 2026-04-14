import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"

/**
 * True when the signed-in user appears as `user_id` in `office_manager_clients`.
 * Requires RLS policy "Managed users can read own office_manager link" (see supabase-office-manager-clients-managed-user-read.sql).
 */
export function useManagedByOfficeManager(): boolean {
  const { userId } = useAuth()
  const [managed, setManaged] = useState(false)

  useEffect(() => {
    if (!supabase || !userId) {
      setManaged(false)
      return
    }
    let cancelled = false
    void supabase
      .from("office_manager_clients")
      .select("user_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        setManaged(!error && data != null)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  return managed
}
