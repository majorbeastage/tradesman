// Supabase Edge Function: create users (and optionally list) from Admin portal.
// Deploy: supabase functions deploy admin-users
// Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (set in Supabase Dashboard for the function)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const url = new URL(req.url)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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

  if (req.method === "GET") {
    const { data: users, error: listError } = await adminClient.auth.admin.listUsers({ perPage: 500 })
    if (listError) {
      return new Response(JSON.stringify({ error: listError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const ids = users.users.map((u) => u.id)
    const { data: profiles } = await adminClient.from("profiles").select("id, email, role, display_name").in("id", ids)
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]))
    const list = users.users.map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      role: profileMap.get(u.id)?.role ?? "user",
      display_name: profileMap.get(u.id)?.display_name ?? null,
    }))
    return new Response(JSON.stringify({ users: list }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  if (req.method === "POST") {
    let body: { email?: string; password?: string; role?: string; display_name?: string | null }
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const { email, password, role, display_name } = body
    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return new Response(JSON.stringify({ error: "email and password required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const allowedRoles = ["user", "office_manager", "admin"]
    const roleVal = allowedRoles.includes(role) ? role : "user"

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
    })
    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    if (!newUser.user) {
      return new Response(JSON.stringify({ error: "User not created" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const displayName =
      typeof display_name === "string" && display_name.trim() ? display_name.trim() : null
    const trimmedEmail = email.trim()
    await adminClient.from("profiles").upsert(
      {
        id: newUser.user.id,
        email: trimmedEmail,
        role: roleVal,
        display_name: displayName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )

    return new Response(
      JSON.stringify({
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
          role: roleVal,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
