/**
 * Merged serverless routes (Hobby-friendly): public lead capture, AI thread summary.
 * POST /api/platform-tools?__route=public-lead
 * POST /api/platform-tools?__route=ai-summarize  (Authorization: Bearer <supabase jwt>)
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"
import {
  createServiceSupabase,
  ensureOpenLeadForInbound,
  firstEnv,
  getOrCreateCustomerByEmail,
  getOrCreateCustomerByPhone,
  normalizePhone,
  pickFirstString,
} from "./_communications.js"

function jsonBody(req: VercelRequest): Record<string, unknown> {
  const raw = req.body
  if (raw == null || raw === "") return {}
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw) as unknown
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>
  return {}
}

async function handlePublicLead(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const body = jsonBody(req)
  const honeypot = pickFirstString(body.website, body.url, body.hp)
  if (honeypot) {
    res.status(200).json({ ok: true })
    return
  }
  const slug = pickFirstString(body.slug, body.embedSlug).toLowerCase().replace(/[^a-z0-9-]/g, "")
  const name = pickFirstString(body.name, body.customerName).slice(0, 200)
  const phone = normalizePhone(pickFirstString(body.phone, body.phoneNumber))
  const email = pickFirstString(body.email).toLowerCase().slice(0, 320)
  const message = pickFirstString(body.message, body.notes).slice(0, 4000)

  if (!slug || slug.length < 3) {
    res.status(400).json({ error: "Invalid slug" })
    return
  }
  if (!phone && !email) {
    res.status(400).json({ error: "Phone or email required" })
    return
  }

  let supabase: ReturnType<typeof createServiceSupabase>
  try {
    supabase = createServiceSupabase()
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Server misconfiguration" })
    return
  }

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, embed_lead_enabled, embed_lead_slug")
    .eq("embed_lead_slug", slug)
    .maybeSingle()

  if (profErr || !profile?.id) {
    res.status(404).json({ error: "Form not found" })
    return
  }
  const row = profile as { id: string; embed_lead_enabled?: boolean; embed_lead_slug?: string }
  if (!row.embed_lead_enabled) {
    res.status(404).json({ error: "Form not available" })
    return
  }

  const userId = row.id
  let customerId: string
  try {
    if (phone) {
      const c = await getOrCreateCustomerByPhone(supabase, userId, phone)
      customerId = c.customerId
    } else {
      const c = await getOrCreateCustomerByEmail(supabase, userId, email)
      customerId = c.customerId
    }
    if (name) {
      await supabase.from("customers").update({ display_name: name }).eq("id", customerId).eq("user_id", userId)
    }
    if (email && phone) {
      const { error: ieErr } = await supabase.from("customer_identifiers").insert({
        user_id: userId,
        customer_id: customerId,
        type: "email",
        value: email,
        is_primary: false,
        verified: false,
      })
      if (ieErr && !String(ieErr.message || "").includes("duplicate")) {
        console.warn("[public-lead] email identifier", ieErr.message)
      }
    }
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Could not save customer" })
    return
  }

  const title = name ? `Web lead: ${name.slice(0, 60)}` : phone ? `Web lead: ${phone}` : `Web lead: ${email.slice(0, 40)}`
  const description = [message, email && !phone ? `Email: ${email}` : null, phone ? `Phone: ${phone}` : null]
    .filter(Boolean)
    .join("\n\n")

  try {
    await ensureOpenLeadForInbound(supabase, userId, customerId, title, description || "Submitted from embed form.")
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Could not create lead" })
    return
  }

  res.status(200).json({ ok: true })
}

async function handleAiSummarize(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization" })
    return
  }
  const token = authHeader.slice("Bearer ".length).trim()
  const supabaseUrl = firstEnv("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/+$/, "")
  const anonKey = firstEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
  if (!supabaseUrl || !anonKey) {
    res.status(500).json({ error: "Missing Supabase URL/anon key on server" })
    return
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(token)
  if (userErr || !userData.user) {
    res.status(401).json({ error: "Invalid session" })
    return
  }
  const userId = userData.user.id

  let service: ReturnType<typeof createServiceSupabase>
  try {
    service = createServiceSupabase()
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Server misconfiguration" })
    return
  }

  const { data: profile } = await service
    .from("profiles")
    .select("ai_thread_summary_enabled")
    .eq("id", userId)
    .maybeSingle()
  const aiOk = (profile as { ai_thread_summary_enabled?: boolean } | null)?.ai_thread_summary_enabled === true
  if (!aiOk) {
    res.status(403).json({ error: "AI thread summary is not enabled for your account." })
    return
  }

  const body = jsonBody(req)
  const conversationId = pickFirstString(body.conversationId).trim()
  if (!conversationId) {
    res.status(400).json({ error: "conversationId required" })
    return
  }

  const { data: convo, error: convoErr } = await service
    .from("conversations")
    .select("id, user_id")
    .eq("id", conversationId)
    .maybeSingle()
  if (convoErr || !convo || (convo as { user_id: string }).user_id !== userId) {
    res.status(404).json({ error: "Conversation not found" })
    return
  }

  const { data: msgs } = await service
    .from("messages")
    .select("sender, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(80)

  const { data: evs } = await service
    .from("communication_events")
    .select("event_type, direction, body, subject, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(80)

  const parts: string[] = []
  for (const m of msgs || []) {
    const r = m as { sender?: string; content?: string; created_at?: string }
    parts.push(`[${r.created_at || ""}] ${r.sender || "?"}: ${(r.content || "").slice(0, 2000)}`)
  }
  for (const e of evs || []) {
    const r = e as { event_type?: string; direction?: string; body?: string; subject?: string; created_at?: string }
    const head = `${r.event_type || "event"} ${r.direction || ""} ${r.created_at || ""}`
    const text = (r.subject ? `Subject: ${r.subject}\n` : "") + (r.body || "")
    parts.push(`[${head}] ${text.slice(0, 2000)}`)
  }
  const transcript = parts.join("\n\n").slice(0, 14000)
  if (!transcript.trim()) {
    res.status(400).json({ error: "No messages or events to summarize." })
    return
  }

  const openaiKey = firstEnv("OPENAI_API_KEY")
  if (!openaiKey) {
    res.status(503).json({
      error: "OpenAI is not configured on the server.",
      hint: "Set OPENAI_API_KEY on Vercel for this deployment.",
    })
    return
  }

  const oa = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: firstEnv("OPENAI_MODEL") || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You summarize customer conversation threads for a home-services contractor. Output clear bullet points: what the customer wants, status, open questions, and suggested next actions. Stay under 250 words.",
        },
        { role: "user", content: transcript },
      ],
      max_tokens: 600,
      temperature: 0.4,
    }),
  })

  const raw = await oa.text()
  if (!oa.ok) {
    res.status(502).json({ error: "OpenAI request failed", detail: raw.slice(0, 800) })
    return
  }
  let summary = ""
  try {
    const j = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    summary = j.choices?.[0]?.message?.content?.trim() || ""
  } catch {
    summary = ""
  }
  if (!summary) {
    res.status(502).json({ error: "Could not parse OpenAI response", detail: raw.slice(0, 400) })
    return
  }

  res.status(200).json({ ok: true, summary })
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type")

  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }

  const route = pickFirstString(req.query?.__route, req.query?.route).toLowerCase()

  if (req.method === "GET") {
    res.status(200).json({
      ok: true,
      route: "platform-tools",
      post: ["public-lead", "ai-summarize"],
    })
    return
  }

  try {
    if (route === "public-lead") {
      await handlePublicLead(req, res)
      return
    }
    if (route === "ai-summarize") {
      await handleAiSummarize(req, res)
      return
    }
    res.status(400).json({ error: "Unknown __route", hint: "Use public-lead or ai-summarize" })
  } catch (e) {
    console.error("[platform-tools]", e instanceof Error ? e.message : e)
    res.status(500).json({ error: e instanceof Error ? e.message : "platform-tools failed" })
  }
}
