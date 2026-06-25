import { supabase } from "./supabase"

export async function shareCustomerContactWithOrgMember(params: {
  recipientUserId: string
  customerId: string
  eventId?: string
}): Promise<void> {
  if (!supabase) throw new Error("Not signed in")

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error("Not signed in")

  const res = await fetch("/api/platform-tools?__route=share-org-contact", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  })

  const raw = await res.text()
  if (!res.ok) {
    try {
      const j = JSON.parse(raw) as { error?: string }
      throw new Error(j.error ?? raw.slice(0, 200))
    } catch (e) {
      if (e instanceof Error && e.message !== raw.slice(0, 200)) throw e
      throw new Error(raw.slice(0, 200) || res.statusText)
    }
  }
}
