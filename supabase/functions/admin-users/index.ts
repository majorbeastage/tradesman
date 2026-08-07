// Supabase Edge Function: create users (and optionally list) from Admin portal.
// Deploy: supabase functions deploy admin-users
// Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (set in Supabase Dashboard for the function)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  buildGraduateSandboxUpdates,
  cleanupSandboxTrainingMetadata,
  isSandboxProfileRow,
  type GraduateSandboxRow,
} from "../_shared/graduate-sandbox.ts"
import { assignOfficeManagerClient } from "../_shared/team-office-manager-sync.ts"

async function purgeSandboxSeedData(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ ok: true; customers_removed: number } | { ok: false; error: string }> {
  const { data, error } = await adminClient.rpc("purge_sandbox_seed_data", { p_user_id: userId })
  if (error) {
    const msg = error.message ?? String(error)
    if (msg.includes("purge_sandbox_seed_data") && msg.toLowerCase().includes("does not exist")) {
      return { ok: false, error: "purge_sandbox_seed_data is not deployed — run supabase/purge-sandbox-seed-on-graduate.sql" }
    }
    return { ok: false, error: msg }
  }
  const row = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null
  if (row?.ok === false) {
    return { ok: false, error: typeof row.error === "string" ? row.error : "purge_failed" }
  }
  const removed = typeof row?.customers_removed === "number" ? row.customers_removed : 0
  return { ok: true, customers_removed: removed }
}

async function applySandboxSampleDataPurge(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<
  | { ok: true; customers_removed: number; metadata_cleaned: boolean }
  | { ok: false; error: string }
> {
  const purge = await purgeSandboxSeedData(adminClient, userId)
  if (!purge.ok) return purge

  const { data: prof, error: profErr } = await adminClient
    .from("profiles")
    .select("metadata")
    .eq("id", userId)
    .maybeSingle()
  if (profErr) return { ok: false, error: profErr.message }

  const prevMeta =
    prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
      ? (prof.metadata as Record<string, unknown>)
      : {}
  const cleanedMeta = cleanupSandboxTrainingMetadata(prevMeta)
  const metadataJson = JSON.stringify(cleanedMeta)
  const metadataChanged = metadataJson !== JSON.stringify(prevMeta)

  if (metadataChanged) {
    const { error: patchErr } = await adminClient
      .from("profiles")
      .update({ metadata: cleanedMeta, updated_at: new Date().toISOString() })
      .eq("id", userId)
    if (patchErr) return { ok: false, error: patchErr.message }
  }

  return {
    ok: true,
    customers_removed: purge.customers_removed,
    metadata_cleaned: metadataChanged,
  }
}

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
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, email, role, display_name, account_disabled, portal_config, metadata")
      .in("id", ids)
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]))
    const list = users.users.map((u) => {
      const prof = profileMap.get(u.id)
      const meta =
        prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
          ? (prof.metadata as Record<string, unknown>)
          : null
      const graduatedFromSandboxAt =
        typeof meta?.graduated_from_sandbox_at === "string" ? meta.graduated_from_sandbox_at : null
      return {
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        role: prof?.role ?? "user",
        display_name: prof?.display_name ?? null,
        account_disabled: prof?.account_disabled === true,
        is_sandbox: isSandboxProfileRow(prof ?? null),
        graduated_from_sandbox_at: graduatedFromSandboxAt,
      }
    })
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
    const allowedRoles = [
      "user",
      "new_user",
      "demo_user",
      "office_manager",
      "admin",
      "corporate_management",
      "corporate_external",
      "corporate_internal",
    ]
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
    const newUserPortal =
      roleVal === "new_user"
        ? {
            tabs: {
              dashboard: true,
              leads: false,
              conversations: false,
              quotes: false,
              calendar: false,
              customers: false,
              account: true,
              "web-support": false,
              "tech-support": true,
              settings: false,
            },
          }
        : roleVal === "demo_user"
          ? {}
          : undefined
    await adminClient.from("profiles").upsert(
      {
        id: newUser.user.id,
        email: trimmedEmail,
        role: roleVal,
        display_name: displayName,
        ...(newUserPortal ? { portal_config: newUserPortal } : {}),
        account_disabled: false,
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

  if (req.method === "PATCH") {
    let body: {
      user_id?: string
      account_disabled?: boolean
      action?: string
      office_manager_id?: string | null
    }
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const targetId = typeof body.user_id === "string" ? body.user_id.trim() : ""

    if (body.action === "assign_office_manager" || body.action === "sync_team_member") {
      const managedUserId = targetId
      const officeManagerId =
        typeof body.office_manager_id === "string" && body.office_manager_id.trim()
          ? body.office_manager_id.trim()
          : null
      if (!managedUserId) {
        return new Response(JSON.stringify({ error: "user_id (managed team member) required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      try {
        await assignOfficeManagerClient(adminClient, managedUserId, officeManagerId)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return new Response(JSON.stringify({ ok: true, synced: Boolean(officeManagerId) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (!targetId) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (body.action === "graduate_sandbox_to_live") {
      const { data: prof, error: profErr } = await adminClient
        .from("profiles")
        .select("id, role, portal_config, metadata")
        .eq("id", targetId)
        .maybeSingle()
      if (profErr) {
        return new Response(JSON.stringify({ error: profErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      if (!prof?.id) {
        return new Response(JSON.stringify({ error: "No profile row for that user." }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      const updates = buildGraduateSandboxUpdates(prof as {
        role?: string
        portal_config?: Record<string, unknown> | null
        metadata?: Record<string, unknown> | null
      })
      if (!updates) {
        return new Response(JSON.stringify({ error: "This account is not in sandbox mode." }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      const nowIso = new Date().toISOString()
      const { data: updated, error: patchErr } = await adminClient
        .from("profiles")
        .update({
          role: updates.role,
          portal_config: updates.portal_config,
          metadata: updates.metadata,
          updated_at: nowIso,
        })
        .eq("id", targetId)
        .select("id, role, portal_config, metadata")
        .maybeSingle()
      if (patchErr) {
        return new Response(JSON.stringify({ error: patchErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      if (!updated?.id) {
        return new Response(JSON.stringify({ error: "Profile update did not apply." }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      const purge = await applySandboxSampleDataPurge(adminClient, targetId)
      if (!purge.ok) {
        return new Response(
          JSON.stringify({
            error: `Graduated to live, but sample data purge failed: ${purge.error}`,
            partial: true,
            id: updated.id,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }
      try {
        await adminClient.auth.admin.updateUserById(targetId, {
          user_metadata: { sandbox_account: null },
        })
      } catch {
        /* best-effort auth metadata cleanup */
      }
      return new Response(
        JSON.stringify({
          ok: true,
          id: updated.id,
          role: updates.role,
          portal_config: updates.portal_config,
          is_sandbox: false,
          customers_removed: purge.customers_removed,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (body.action === "purge_sandbox_sample_data") {
      if (!targetId) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      const { data: prof, error: profErr } = await adminClient
        .from("profiles")
        .select("id, role, portal_config, metadata")
        .eq("id", targetId)
        .maybeSingle()
      if (profErr) {
        return new Response(JSON.stringify({ error: profErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      if (!prof?.id) {
        return new Response(JSON.stringify({ error: "No profile row for that user." }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      if (isSandboxProfileRow(prof as GraduateSandboxRow)) {
        return new Response(
          JSON.stringify({ error: "Use Go live first — this account is still in sandbox mode." }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }
      const purge = await applySandboxSampleDataPurge(adminClient, targetId)
      if (!purge.ok) {
        return new Response(JSON.stringify({ error: purge.error }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return new Response(
        JSON.stringify({
          ok: true,
          id: targetId,
          customers_removed: purge.customers_removed,
          metadata_cleaned: purge.metadata_cleaned,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (typeof body.account_disabled !== "boolean") {
      return new Response(JSON.stringify({ error: "account_disabled must be true or false" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    if (targetId === user.id) {
      return new Response(JSON.stringify({ error: "Cannot change your own access from here" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const { data: updated, error: patchErr } = await adminClient
      .from("profiles")
      .update({
        account_disabled: body.account_disabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetId)
      .select("id")
      .maybeSingle()
    if (patchErr) {
      return new Response(JSON.stringify({ error: patchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    if (!updated?.id) {
      return new Response(
        JSON.stringify({
          error:
            "No profile row for that user. Add a profiles row or ensure account_disabled column exists (run supabase-run-this.sql).",
        }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }
    return new Response(JSON.stringify({ ok: true, id: updated.id, account_disabled: body.account_disabled }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
