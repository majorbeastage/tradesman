// Supabase Edge Function: AI helper for Portal builder (admin only).
// Secrets: OPENAI_API_KEY (required). Optional: OPENAI_MODEL (default gpt-4o-mini)
// Deploy: supabase functions deploy portal-assistant

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const SYSTEM = `You are an expert assistant for a low-code "portal builder" inside a trades contractor SaaS admin UI.

## Data model
- Per-user JSON \`portal_config\` on table \`profiles\` includes:
  - \`controlItems\`: Record<string, PortalSettingItem[]> keyed EXACTLY as \`tabId:controlId\` (e.g. \`calendar:add_item_to_calendar\`, \`leads:settings\`).
  - \`leads:settings\` may also be mirrored in legacy \`leadsSettingsItems\` — prefer explaining \`controlItems["leads:settings"]\`.
  - Dropdown option lists for toolbar dropdowns often live in \`optionValues[controlId]\` (e.g. job_type) — separate from modal "items".

## PortalSettingItem shape
- id: string, unique within that control (snake_case)
- type: "checkbox" | "dropdown" | "custom_field"
- label: string
- options?: string[] (required for dropdown; for custom_field with customFieldSubtype "dropdown")
- defaultChecked?: boolean (checkbox)
- customFieldSubtype?: "text" | "textarea" | "dropdown" (when type is custom_field)
- visibleToUser?: boolean (default true)
- dependency?: { dependsOnItemId: string, showWhenValue: string }
  - Parent checkbox: showWhenValue is "checked" or "unchecked"
  - Parent dropdown: showWhenValue must match one of the parent's option strings exactly

## Which controls support item lists (most common confusion)
- leads: settings, filter, sort_by, lead_source, status, priority
- conversations: add_conversation, conversation_settings
- quotes: add_customer_to_quotes, auto_response_options, quote_settings, status
- calendar: add_item_to_calendar, auto_response_options, job_types, working_hours, customize_user, job_type
- settings: custom_fields

## Behavioral truth (be honest)
- Items only appear in the live app where the React page calls \`getControlItemsForUser(portalConfig, tabId, controlId)\` for that modal/button. If the user added items to a control that is not wired, say clearly: "Saved in config but this screen may not read that control yet — use X instead or needs a dev wiring pass."
- Calendar "Add item to calendar" modal uses \`calendar:add_item_to_calendar\`. Recurrence checkboxes belong there if the product reads them; recurrence *logic* may still be unimplemented — say so.
- Office manager vs user: same \`portal_config\` shape per profile; office manager views use the managed user's config in this app.

## How to answer
1. Short diagnosis: which \`tabId:controlId\` key they should use.
2. Step-by-step in the admin UI (click preview tab → click control → add item).
3. When proposing concrete JSON, end your message with a single fenced block:
   \`\`\`json
   { "tabId": "calendar", "controlId": "add_item_to_calendar", "items": [ ... ] }
   \`\`\`
   or
   \`\`\`json
   { "controlItemsPatch": { "calendar:add_item_to_calendar": [ ... ] } }
   \`\`\`
Use only valid PortalSettingItem objects. Do not invent tab or control ids outside the lists above for item lists.`

type ChatMessage = { role: "user" | "assistant"; content: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const openaiKey = Deno.env.get("OPENAI_API_KEY")
  const model = Deno.env.get("OPENAI_MODEL")?.trim() || "gpt-4o-mini"

  if (!openaiKey) {
    return new Response(
      JSON.stringify({
        error: "OPENAI_API_KEY is not set for this function. Add it in Supabase Dashboard → Edge Functions → Secrets.",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const token = authHeader.replace("Bearer ", "")
  const { data: { user }, error: authError } = await adminClient.auth.getUser(token)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Admin only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  let body: { messages?: ChatMessage[]; pageContext?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const messages = Array.isArray(body.messages) ? body.messages : []
  const trimmed = messages
    .filter((m): m is ChatMessage =>
      m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length > 0
    )
    .slice(-24)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }))

  if (trimmed.length === 0 || !trimmed.some((m) => m.role === "user")) {
    return new Response(JSON.stringify({ error: "messages must include at least one user message" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const ctx =
    typeof body.pageContext === "string" && body.pageContext.trim()
      ? body.pageContext.trim().slice(0, 16000)
      : ""

  const openaiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM + (ctx ? `\n\n## Current builder context (from client)\n${ctx}` : "") },
    ...trimmed.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ]

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: openaiMessages,
      temperature: 0.4,
      max_tokens: 2500,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    return new Response(JSON.stringify({ error: `OpenAI error: ${res.status}`, detail: errText.slice(0, 500) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const reply = data.choices?.[0]?.message?.content?.trim() ?? ""
  if (!reply) {
    return new Response(JSON.stringify({ error: "Empty model response" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  return new Response(JSON.stringify({ reply }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
