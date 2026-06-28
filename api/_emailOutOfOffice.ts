import type { SupabaseClient } from "@supabase/supabase-js"
import { parseEmailClientWorkspace, type EmailClientOutOfOffice } from "../src/lib/emailClientWorkspace.js"
import { dispatchOutboundEmail } from "./_conversationAutoReply.js"

export function isEmailOutOfOfficeActive(ooo: EmailClientOutOfOffice, at = new Date()): boolean {
  if (!ooo.enabled || !ooo.message.trim()) return false
  const now = at.getTime()
  if (ooo.startAt) {
    const start = Date.parse(ooo.startAt)
    if (Number.isFinite(start) && now < start) return false
  }
  if (ooo.endAt) {
    const end = Date.parse(ooo.endAt)
    if (Number.isFinite(end) && now > end) return false
  }
  return true
}

export function readOutOfOfficeFromProfileMetadata(metadata: unknown): EmailClientOutOfOffice {
  return parseEmailClientWorkspace(metadata).outOfOffice
}

/** Sends OOO auto-reply when active. Returns true if a reply was dispatched. */
export async function runOutOfOfficeEmailReply(
  supabase: SupabaseClient,
  opts: {
    userId: string
    customerId: string
    customerEmail: string
    conversationId?: string | null
    leadId?: string | null
    subject?: string
  },
): Promise<boolean> {
  const to = opts.customerEmail.trim()
  if (!to) return false

  const { data: prof } = await supabase.from("profiles").select("metadata").eq("id", opts.userId).maybeSingle()
  const ooo = readOutOfOfficeFromProfileMetadata(prof?.metadata)
  if (!isEmailOutOfOfficeActive(ooo)) return false

  const subjectBase = opts.subject?.trim() || "Your message"
  const replySubject = subjectBase.toLowerCase().startsWith("re:") ? subjectBase : `Re: ${subjectBase}`

  await dispatchOutboundEmail({
    supabase,
    userId: opts.userId,
    to,
    subject: `[Out of office] ${replySubject}`,
    body: ooo.message.trim(),
    customerId: opts.customerId,
    conversationId: opts.conversationId,
    leadId: opts.leadId,
  })
  return true
}
