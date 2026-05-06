// Sync full profile after the browser runs supabase.auth.signUp() (that sends the confirm-email).
// Deploy: supabase functions deploy complete-signup
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (only — no anon key required)
//
// Why browser signUp first: GoTrue sends confirmation mail from the same path as any SPA; server-side
// signUp from Edge was unreliable for some projects. This function only upserts public.profiles and
// verifies auth.users.id matches the email in the body.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const SIGNUP_REQ_KEY = "tradesman_signup_requirements"

type Body = {
  /** From client after auth.signUp — required (camelCase alias: userId) */
  user_id?: string
  userId?: string
  email?: string
  display_name?: string
  website_url?: string | null
  primary_phone?: string | null
  best_contact_phone?: string | null
  address_line_1?: string | null
  address_line_2?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
  business_address?: string | null
  timezone?: string | null
  signup_extras?: Record<string, string | null> | null
  ack_terms?: boolean
  ack_privacy?: boolean
  ack_sms?: boolean
  use_ai_automation?: boolean
  ui_language?: string
}

type FieldRule = "required" | "optional"

type SignupRules = {
  fields: Record<string, FieldRule>
  custom_fields: { id: string; label: string; required: boolean }[]
  require_terms_ack: boolean
  require_privacy_ack: boolean
  require_sms_consent_ack: boolean
  show_terms_link: boolean
  show_privacy_link: boolean
  show_sms_consent_link: boolean
}

const DEFAULT_RULES: SignupRules = {
  fields: {
    email: "required",
    password: "required",
    display_name: "required",
    website_url: "optional",
    primary_phone: "required",
    best_contact_phone: "optional",
    address: "required",
    timezone: "required",
  },
  custom_fields: [],
  require_terms_ack: false,
  require_privacy_ack: false,
  require_sms_consent_ack: true,
  show_terms_link: true,
  show_privacy_link: true,
  show_sms_consent_link: true,
}

function parseSignupRules(raw: unknown): SignupRules {
  const base: SignupRules = {
    fields: { ...DEFAULT_RULES.fields },
    custom_fields: [],
    require_terms_ack: DEFAULT_RULES.require_terms_ack,
    require_privacy_ack: DEFAULT_RULES.require_privacy_ack,
    require_sms_consent_ack: DEFAULT_RULES.require_sms_consent_ack,
    show_terms_link: DEFAULT_RULES.show_terms_link,
    show_privacy_link: DEFAULT_RULES.show_privacy_link,
    show_sms_consent_link: DEFAULT_RULES.show_sms_consent_link,
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  const fr = o.fields
  if (fr && typeof fr === "object" && !Array.isArray(fr)) {
    for (const key of Object.keys(base.fields)) {
      const v = (fr as Record<string, unknown>)[key]
      if (v === "required" || v === "optional") base.fields[key] = v
    }
  }
  const cf = o.custom_fields
  if (Array.isArray(cf)) {
    base.custom_fields = cf
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null
        const row = item as Record<string, unknown>
        const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : ""
        const label = typeof row.label === "string" ? row.label.trim() : ""
        if (!id || !label) return null
        return { id, label, required: row.required === true }
      })
      .filter(Boolean) as SignupRules["custom_fields"]
  }
  if (typeof o.require_terms_ack === "boolean") base.require_terms_ack = o.require_terms_ack
  if (typeof o.require_privacy_ack === "boolean") base.require_privacy_ack = o.require_privacy_ack
  if (typeof o.require_sms_consent_ack === "boolean") base.require_sms_consent_ack = o.require_sms_consent_ack
  if (typeof o.show_terms_link === "boolean") base.show_terms_link = o.show_terms_link
  if (typeof o.show_privacy_link === "boolean") base.show_privacy_link = o.show_privacy_link
  if (typeof o.show_sms_consent_link === "boolean") base.show_sms_consent_link = o.show_sms_consent_link
  return base
}

function reqField(rules: SignupRules, key: string): boolean {
  return rules.fields[key] === "required"
}

async function loadSignupRules(adminClient: ReturnType<typeof createClient>): Promise<SignupRules> {
  const { data } = await adminClient.from("platform_settings").select("value").eq("key", SIGNUP_REQ_KEY).maybeSingle()
  return parseSignupRules(data?.value)
}

/** Accept any hex UUID shape (v4, v7, etc.); older regex only allowed version nibble 1–5 and broke v7 IDs. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  let body: Body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const userIdRaw =
    (typeof body.user_id === "string" ? body.user_id.trim() : "") ||
    (typeof body.userId === "string" ? body.userId.trim() : "")
  if (!userIdRaw || !UUID_RE.test(userIdRaw)) {
    return new Response(
      JSON.stringify({
        error:
          "Missing or invalid user_id. The app must call auth.signUp in the browser first, then send that user id here.",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }

  const rules = await loadSignupRules(adminClient)

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  let display_name = typeof body.display_name === "string" ? body.display_name.trim() : ""

  if (!email) {
    return new Response(JSON.stringify({ error: "Email is required." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  if (reqField(rules, "display_name") && !display_name) {
    return new Response(JSON.stringify({ error: "Business / display name is required." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  if (!display_name) display_name = email.split("@")[0] || "Account"

  const t = (s: string | null | undefined) => (typeof s === "string" ? s.trim() : "")
  const primary_phone = t(body.primary_phone) || null
  const best_contact_phone = t(body.best_contact_phone) || null
  const website_url = t(body.website_url) || null
  const address_line_1 = t(body.address_line_1) || null
  const address_line_2 = t(body.address_line_2) || null
  const address_city = t(body.address_city) || null
  const address_state = t(body.address_state) || null
  const address_zip = t(body.address_zip) || null
  const timezone = t(body.timezone) || "America/New_York"

  if (reqField(rules, "primary_phone") && !primary_phone) {
    return new Response(JSON.stringify({ error: "Primary phone is required." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  if (reqField(rules, "best_contact_phone") && !best_contact_phone) {
    return new Response(JSON.stringify({ error: "Best contact phone is required." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  if (reqField(rules, "website_url") && !website_url) {
    return new Response(JSON.stringify({ error: "Website URL is required." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  if (reqField(rules, "address")) {
    if (!address_line_1 || !address_city || !address_state || !address_zip) {
      return new Response(
        JSON.stringify({ error: "Address line 1, city, state, and zip are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }
  }
  if (reqField(rules, "timezone") && !timezone) {
    return new Response(JSON.stringify({ error: "Timezone is required." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const extras =
    body.signup_extras && typeof body.signup_extras === "object" && !Array.isArray(body.signup_extras)
      ? body.signup_extras
      : {}

  for (const f of rules.custom_fields) {
    if (!f.required) continue
    const v = t(extras[f.id] ?? null)
    if (!v) {
      return new Response(JSON.stringify({ error: `Missing required field: ${f.label}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
  }

  if (rules.require_terms_ack && rules.show_terms_link && body.ack_terms !== true) {
    return new Response(JSON.stringify({ error: "Terms acknowledgment is required." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  if (rules.require_privacy_ack && rules.show_privacy_link && body.ack_privacy !== true) {
    return new Response(JSON.stringify({ error: "Privacy acknowledgment is required." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  if (rules.require_sms_consent_ack && rules.show_sms_consent_link && body.ack_sms !== true) {
    return new Response(JSON.stringify({ error: "SMS consent acknowledgment is required." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const business_address =
    typeof body.business_address === "string" && body.business_address.trim()
      ? body.business_address.trim()
      : [address_line_1, address_line_2, [address_city, address_state, address_zip].filter(Boolean).join(", ")]
          .filter(Boolean)
          .join("\n") || null

  const { data: authData, error: authLookupErr } = await adminClient.auth.admin.getUserById(userIdRaw)
  if (authLookupErr || !authData?.user) {
    return new Response(
      JSON.stringify({ error: "Could not verify your new account. Try signing up again from the beginning." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }
  const authEmail = (authData.user.email ?? "").trim().toLowerCase()
  if (!authEmail || authEmail !== email) {
    return new Response(JSON.stringify({ error: "Email does not match this signup session." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const uid = userIdRaw
  const now = new Date().toISOString()

  const productPackage =
    extras &&
    typeof extras === "object" &&
    !Array.isArray(extras) &&
    typeof (extras as Record<string, unknown>).product_package === "string"
      ? String((extras as Record<string, unknown>).product_package).trim()
      : ""

  const portal_config_default = {
    tabs: {
      dashboard: true,
      leads: false,
      conversations: false,
      quotes: false,
      calendar: false,
      customers: false,
      payments: false,
      account: true,
      "web-support": false,
      "tech-support": true,
      settings: false,
    },
  }

  const portal_config_estimate_tools_only = {
    tabs: {
      dashboard: true,
      leads: false,
      conversations: false,
      quotes: true,
      calendar: false,
      customers: false,
      payments: true,
      account: true,
      "web-support": true,
      "tech-support": true,
      settings: false,
    },
    estimate_tools_only_package: true,
  }

  const portal_config =
    productPackage === "estimate_tools_only" ? portal_config_estimate_tools_only : portal_config_default

  const useAi = body.use_ai_automation !== false
  const uiLang = body.ui_language === "es" ? "es" : "en"

  const metadata: Record<string, unknown> = { ui_language: uiLang }
  if (productPackage) metadata.product_package = productPackage

  const { error: profileErr } = await adminClient.from("profiles").upsert(
    {
      id: uid,
      email,
      display_name,
      role: "new_user",
      portal_config,
      website_url,
      primary_phone,
      best_contact_phone,
      address_line_1,
      address_line_2,
      address_city,
      address_state,
      address_zip,
      business_address,
      timezone,
      signup_extras: extras,
      ai_assistant_visible: useAi,
      metadata,
      updated_at: now,
    },
    { onConflict: "id" },
  )

  if (profileErr) {
    return new Response(JSON.stringify({ error: profileErr.message, userId: uid, profileSaved: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      userId: uid,
      profileSaved: true,
      signupFlow: "browser_signup_edge_profile",
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  )
})
