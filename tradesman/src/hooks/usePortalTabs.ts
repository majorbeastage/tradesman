import { useState, useEffect } from "react"
import { fetchPortalTabs } from "../lib/portal-builder-api"
import type { PortalTab } from "../types/portal-builder"

export function usePortalTabs(
  clientId: string | null,
  portalType: "user" | "office_manager"
): { tabs: PortalTab[]; loading: boolean } {
  const [tabs, setTabs] = useState<PortalTab[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clientId) {
      setTabs([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetchPortalTabs(clientId, portalType).then((data) => {
      if (!cancelled) {
        setTabs(data.filter((t) => t.visible).sort((a, b) => a.sort_order - b.sort_order))
        setLoading(false)
      }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [clientId, portalType])

  return { tabs, loading }
}
