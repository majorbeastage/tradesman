import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { useEffectiveUserId } from "../contexts/PortalViewContext"

/**
 * True when the previewed (or signed-in) user appears as `user_id` in `office_manager_clients`.
 */
export function useManagedByOfficeManager(): boolean {
  const userId = useEffectiveUserId()
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
