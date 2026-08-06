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

export type TradesmanVoiceLine = {
  userId: string
  /** Purchased Tradesman / Twilio DID (public_address). */
  tradesmanNumber: string | null
  tradesmanNumberRaw: string | null
  /** Forward destination configured on that line in Admin → Communications. */
  forwardPhone: string | null
  forwardPhoneRaw: string | null
}

/** Active voice/SMS channels for ring hunting — one row per user (newest with forward wins). */
export async function loadTradesmanVoiceLinesByUserIds(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, TradesmanVoiceLine>> {
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))]
  const out = new Map<string, TradesmanVoiceLine>()
  if (!ids.length) return out

  const { data, error } = await supabase
    .from("client_communication_channels")
    .select("user_id, public_address, forward_to_phone, voice_enabled, active, updated_at")
    .in("user_id", ids)
    .eq("active", true)
    .eq("channel_kind", "voice_sms")
    .order("updated_at", { ascending: false })

  if (error) {
    console.warn("[loadTradesmanVoiceLinesByUserIds]", error.message)
    return out
  }

  for (const row of data ?? []) {
    const r = row as {
      user_id: string
      public_address?: string | null
      forward_to_phone?: string | null
      voice_enabled?: boolean
    }
    if (r.voice_enabled === false) continue
    if (out.has(r.user_id)) continue
    const publicRaw = (r.public_address || "").trim()
    const forwardRaw = (r.forward_to_phone || "").trim()
    if (!publicRaw && !forwardRaw) continue
    out.set(r.user_id, {
      userId: r.user_id,
      tradesmanNumber: publicRaw ? formatUsPhoneDisplay(publicRaw) : null,
      tradesmanNumberRaw: publicRaw || null,
      forwardPhone: forwardRaw ? formatUsPhoneDisplay(forwardRaw) : null,
      forwardPhoneRaw: forwardRaw || null,
    })
  }
  return out
}
