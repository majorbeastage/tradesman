/**
 * Inbound Resend routing: match `To` to client_communication_channels.
 * Shared by `resend-inbound` Edge Function (keep api/_communications.resolveInboundEmailChannel in sync for messages).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

export type InboundCommunicationChannel = {
  id: string
  user_id: string
  channel_kind: "voice_sms" | "email"
  public_address: string
  forward_to_email: string | null
  email_enabled?: boolean
  active: boolean
}

function normalizePhone(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const keepPlus = trimmed.startsWith("+")
  const digits = trimmed.replace(/\D/g, "")
  if (!digits) return ""
  return `${keepPlus ? "+" : ""}${digits}`
}

function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

export async function lookupChannelByPublicAddress(
  supabase: SupabaseClient,
  publicAddress: string
): Promise<InboundCommunicationChannel | null> {
  const trimmed = publicAddress.trim()
  const normalized = trimmed.includes("@") ? trimmed.toLowerCase() : normalizePhone(publicAddress) || trimmed
  const isEmail = trimmed.includes("@")
  let q = supabase
    .from("client_communication_channels")
    .select("id, user_id, channel_kind, public_address, forward_to_email, email_enabled, active")
    .eq("active", true)
  q = isEmail
    ? q.ilike("public_address", escapeIlikeExact(normalized))
    : q.eq("public_address", normalized)
  const { data, error } = await q.limit(1).maybeSingle()
  if (error) throw error
  return (data as InboundCommunicationChannel | null) ?? null
}

export async function resolveInboundEmailChannel(
  supabase: SupabaseClient,
  toAddresses: string[]
): Promise<
  | { ok: true; channel: InboundCommunicationChannel; matchedTo: string }
  | { ok: false; reasons: string[] }
> {
  const reasons: string[] = []
  for (const addr of toAddresses) {
    const trimmed = addr.trim()
    if (!trimmed) continue
    const ch = await lookupChannelByPublicAddress(supabase, trimmed)
    if (!ch) {
      reasons.push(
        `No active channel with Business email "${trimmed}". In Tradesman: Admin → Communications → add a row with Kind = Email, set Business email address to exactly this address, Active on, Email enabled on, then Save.`,
      )
      continue
    }
    if (ch.channel_kind !== "email") {
      reasons.push(
        `A channel exists for "${trimmed}" but Kind is "${ch.channel_kind}" (phone/SMS). Inbound mail needs a separate row with Kind = Email and the same Business email address.`,
      )
      continue
    }
    if (ch.email_enabled !== true) {
      reasons.push(
        `Email row for "${trimmed}" has "Email enabled" off. Turn it on in Admin → Communications for that row and Save.`,
      )
      continue
    }
    return { ok: true, channel: ch, matchedTo: trimmed }
  }
  if (reasons.length === 0) {
    reasons.push("No To addresses in the message to match.")
  }
  return { ok: false, reasons }
}
