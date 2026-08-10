import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { resolveCustomerDataScope, type CustomerDataScope } from "../lib/orgCustomerSharing"
import { useScopedUserId } from "../contexts/OfficeManagerScopeContext"
import { useManagedOmCalendarPolicy } from "./useManagedOmCalendarPolicy"

const EMPTY_SCOPE: CustomerDataScope = {
  viewerUserId: "",
  dataUserId: "",
  sharingScope: "organization",
}

/**
 * Maps the signed-in / view-as user to the account owner row scope for customers,
 * quotes, calendar, and profile bundles. Default: full org customer mirror.
 */
export function useCustomerDataScope(): CustomerDataScope & { loading: boolean } {
  const viewerUserId = useScopedUserId()
  const memberPolicy = useManagedOmCalendarPolicy()
  const [scope, setScope] = useState<CustomerDataScope>({
    ...EMPTY_SCOPE,
    viewerUserId,
    dataUserId: viewerUserId,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase || !viewerUserId) {
      setScope({ ...EMPTY_SCOPE, viewerUserId })
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void resolveCustomerDataScope(supabase, viewerUserId, memberPolicy).then((next) => {
      if (cancelled) return
      setScope(next)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [viewerUserId, memberPolicy.assignee_customer_profiles_opt_out])

  return { ...scope, loading }
}
