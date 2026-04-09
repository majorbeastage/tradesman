import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

/**
 * Respects profiles.ai_assistant_visible for the portal user (scoped user when office manager acts as a client).
 * When false, end-user portals should hide AI-specific controls (thread summary, Fill with AI, template AI toggles).
 */
export function useScopedAiAutomationsEnabled(userId: string | undefined): boolean {
  const [enabled, setEnabled] = useState(true)
  useEffect(() => {
    if (!supabase || !userId) {
      setEnabled(true)
      return
    }
    let cancelled = false
    void supabase
      .from("profiles")
      .select("ai_assistant_visible")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const v = (data as { ai_assistant_visible?: boolean } | null)?.ai_assistant_visible
        setEnabled(v !== false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])
  return enabled
}
