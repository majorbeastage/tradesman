import type { SupabaseClient } from "@supabase/supabase-js"

function formatUsPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return raw.trim()
}

/** Active Twilio voice/SMS public number assigned in Admin -> Communications. */
export async function fetchUserPublicTwilioNumber(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  if (!userId.trim()) return null
  const { data, error } = await supabase
    .from("client_communication_channels")
    .select("public_address, channel_kind, sms_enabled, voice_enabled, active, updated_at")
    .eq("user_id", userId)
    .eq("active", true)
    .eq("channel_kind", "voice_sms")
    .order("updated_at", { ascending: false })
    .limit(12)
  if (error) {
    console.warn("[fetchUserPublicTwilioNumber]", error.message)
    return null
  }
  const rows = (data ?? []) as Array<{ public_address?: string | null; sms_enabled?: boolean; voice_enabled?: boolean }>
  const withPublic = rows.find((r) => typeof r.public_address === "string" && r.public_address.trim())
  const pick = withPublic ?? rows[0]
  const raw = typeof pick?.public_address === "string" ? pick.public_address.trim() : ""
  if (!raw) return null
  return formatUsPhoneDisplay(raw)
}
