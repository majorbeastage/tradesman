/**
 * Inbound Resend routing: match `To` to client_communication_channels and platform_email_routes.
 * Shared by `resend-inbound` Edge Function (keep api/_communications.resolveInboundEmailChannel in sync for messages).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

export const PLATFORM_EMAIL_ROOT_DOMAIN = "tradesman-us.com"

export type InboundCommunicationChannel = {
  id: string
  user_id: string
  channel_kind: "voice_sms" | "email"
  public_address: string
  forward_to_email: string | null
  email_enabled?: boolean
  active: boolean
}

type PlatformEmailRouteRow = {
  id: string
  account_id: string
  local_part: string
  domain: string
  forward_to_email: string | null
  channel_id: string | null
  route_kind: string
  department_key: string | null
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

function parsePlatformRootEmailAddress(addr: string): { localPart: string; domain: string } | null {
  const trimmed = addr.trim().toLowerCase()
  const at = trimmed.lastIndexOf("@")
  if (at <= 0) return null
  return { localPart: trimmed.slice(0, at), domain: trimmed.slice(at + 1) }
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

async function lookupPlatformEmailRoute(
  supabase: SupabaseClient,
  emailAddress: string
): Promise<PlatformEmailRouteRow | null> {
  const parsed = parsePlatformRootEmailAddress(emailAddress)
  if (!parsed) return null

  let q = supabase
    .from("platform_email_routes")
    .select("id, account_id, local_part, domain, forward_to_email, channel_id, route_kind, department_key")
    .eq("domain", parsed.domain)
    .ilike("local_part", escapeIlikeExact(parsed.localPart))
  if (parsed.domain !== PLATFORM_EMAIL_ROOT_DOMAIN) {
    q = q.not("verified_at", "is", null)
  }
  const { data, error } = await q.limit(1).maybeSingle()

  if (error && !String(error.message || "").includes("platform_email_routes")) throw error
  return (data as PlatformEmailRouteRow | null) ?? null
}

async function ensureEmailChannelForPlatformRoute(
  supabase: SupabaseClient,
  route: PlatformEmailRouteRow,
  matchedTo: string
): Promise<InboundCommunicationChannel | null> {
  if (!route.account_id) return null
  if (
    route.route_kind !== "customer_primary" &&
    route.route_kind !== "department" &&
    route.route_kind !== "customer_custom"
  ) {
    return null
  }

  const publicAddress = matchedTo.trim().toLowerCase()
  const forwardTo = route.forward_to_email?.trim() || null

  if (route.route_kind === "customer_custom" && route.channel_id) {
    const { data: customCh, error: customErr } = await supabase
      .from("client_communication_channels")
      .select("id, user_id, channel_kind, public_address, forward_to_email, email_enabled, active")
      .eq("id", route.channel_id)
      .maybeSingle()
    if (customErr) throw customErr
    if (
      customCh?.id &&
      customCh.active &&
      customCh.channel_kind === "email" &&
      customCh.email_enabled === true &&
      customCh.user_id === route.account_id
    ) {
      return customCh as InboundCommunicationChannel
    }
  }

  if (route.route_kind === "department" && route.channel_id) {
    const { data: deptChannel, error: deptErr } = await supabase
      .from("client_communication_channels")
      .select("id, user_id, channel_kind, public_address, forward_to_email, email_enabled, active")
      .eq("id", route.channel_id)
      .maybeSingle()
    if (deptErr) throw deptErr
    if (
      deptChannel?.id &&
      deptChannel.active &&
      deptChannel.channel_kind === "email" &&
      deptChannel.email_enabled === true &&
      deptChannel.user_id === route.account_id
    ) {
      return deptChannel as InboundCommunicationChannel
    }
  }

  if (route.route_kind === "department") {
    const { data: primaryRoute, error: primaryErr } = await supabase
      .from("platform_email_routes")
      .select("channel_id")
      .eq("account_id", route.account_id)
      .eq("domain", PLATFORM_EMAIL_ROOT_DOMAIN)
      .eq("route_kind", "customer_primary")
      .limit(1)
      .maybeSingle()
    if (primaryErr) throw primaryErr
    if (primaryRoute?.channel_id) {
      const { data: primaryCh, error: pchErr } = await supabase
        .from("client_communication_channels")
        .select("id, user_id, channel_kind, public_address, forward_to_email, email_enabled, active")
        .eq("id", primaryRoute.channel_id)
        .maybeSingle()
      if (pchErr) throw pchErr
      if (primaryCh?.id) {
        await supabase.from("platform_email_routes").update({ channel_id: primaryCh.id }).eq("id", route.id)
        return primaryCh as InboundCommunicationChannel
      }
    }
  }

  if (route.channel_id) {
    const { data: linked, error: linkedErr } = await supabase
      .from("client_communication_channels")
      .select("id, user_id, channel_kind, public_address, forward_to_email, email_enabled, active")
      .eq("id", route.channel_id)
      .maybeSingle()
    if (linkedErr) throw linkedErr
    if (linked?.id) {
      const ch = linked as InboundCommunicationChannel
      if (
        ch.active &&
        ch.channel_kind === "email" &&
        ch.email_enabled === true &&
        ch.public_address.trim().toLowerCase() === publicAddress
      ) {
        return ch
      }
    }
  }

  const existing = await lookupChannelByPublicAddress(supabase, publicAddress)
  if (
    existing &&
    existing.user_id === route.account_id &&
    existing.channel_kind === "email" &&
    existing.email_enabled === true
  ) {
    if (!route.channel_id && existing.id) {
      await supabase.from("platform_email_routes").update({ channel_id: existing.id }).eq("id", route.id)
    }
    return existing
  }

  const { data: userChannel, error: userChannelErr } = await supabase
    .from("client_communication_channels")
    .select("id, user_id, channel_kind, public_address, forward_to_email, email_enabled, active")
    .eq("user_id", route.account_id)
    .eq("channel_kind", "email")
    .eq("provider", "resend")
    .order("active", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (userChannelErr) throw userChannelErr

  if (userChannel?.id) {
    const { error: updateErr } = await supabase
      .from("client_communication_channels")
      .update({
        public_address: publicAddress,
        forward_to_email: forwardTo,
        email_enabled: true,
        active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userChannel.id)
    if (updateErr) throw updateErr
    await supabase.from("platform_email_routes").update({ channel_id: userChannel.id }).eq("id", route.id)
    return {
      ...(userChannel as InboundCommunicationChannel),
      public_address: publicAddress,
      forward_to_email: forwardTo,
      email_enabled: true,
      active: true,
    }
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("client_communication_channels")
    .insert({
      user_id: route.account_id,
      provider: "resend",
      channel_kind: "email",
      public_address: publicAddress,
      forward_to_email: forwardTo,
      email_enabled: true,
      active: true,
      friendly_name: "Tradesman business email",
    })
    .select("id, user_id, channel_kind, public_address, forward_to_email, email_enabled, active")
    .single()
  if (insertErr) throw insertErr
  await supabase.from("platform_email_routes").update({ channel_id: inserted.id }).eq("id", route.id)
  return inserted as InboundCommunicationChannel
}

export async function resolveInboundEmailChannel(
  supabase: SupabaseClient,
  toAddresses: string[]
): Promise<
  | {
      ok: true
      channel: InboundCommunicationChannel
      matchedTo: string
      routeId?: string | null
      routeKind?: string | null
      departmentKey?: string | null
    }
  | { ok: false; reasons: string[] }
> {
  const reasons: string[] = []
  for (const addr of toAddresses) {
    const trimmed = addr.trim()
    if (!trimmed) continue
    const normalizedTo = trimmed.includes("@") ? trimmed.toLowerCase() : trimmed

    let ch = await lookupChannelByPublicAddress(supabase, trimmed)
    let routeId: string | null = null
    let routeKind: string | null = null
    let departmentKey: string | null = null

    const route = await lookupPlatformEmailRoute(supabase, normalizedTo)
    if (route) {
      routeId = route.id
      routeKind = route.route_kind
      departmentKey = route.department_key ?? null
      if (!ch) {
        ch = await ensureEmailChannelForPlatformRoute(supabase, route, normalizedTo)
      }
    }

    if (!ch) {
      reasons.push(
        `No active channel or platform route for "${normalizedTo}". Claim your address in myT → Account → Tradesman email, or ask Admin to add an Email channel.`,
      )
      continue
    }
    if (ch.channel_kind !== "email") {
      reasons.push(
        `A channel exists for "${normalizedTo}" but Kind is "${ch.channel_kind}" (phone/SMS). Inbound mail needs Kind = Email.`,
      )
      continue
    }
    if (ch.email_enabled !== true) {
      reasons.push(`Email is disabled for "${normalizedTo}". Enable it in myT Account or Admin → Communications.`)
      continue
    }
    return { ok: true, channel: ch, matchedTo: normalizedTo, routeId, routeKind, departmentKey }
  }
  if (reasons.length === 0) {
    reasons.push("No To addresses in the message to match.")
  }
  return { ok: false, reasons }
}
