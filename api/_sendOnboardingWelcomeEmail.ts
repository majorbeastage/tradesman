/**
 * Send post-signup onboarding checklist email to the new customer.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { firstEnv } from "./_communications.js"
import {
  buildOnboardingWelcomeEmailText,
  DEFAULT_ONBOARDING_MATERIALS,
  ONBOARDING_MATERIALS_KEY,
  parseOnboardingMaterials,
} from "./_onboardingMaterialsShared.js"

async function loadOnboardingMaterials(service: SupabaseClient) {
  const { data } = await service.from("platform_settings").select("value").eq("key", ONBOARDING_MATERIALS_KEY).maybeSingle()
  return parseOnboardingMaterials(data?.value ?? DEFAULT_ONBOARDING_MATERIALS)
}

export async function sendOnboardingWelcomeEmail(params: {
  service: SupabaseClient
  toEmail: string
  displayName: string
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const apiKey = firstEnv("RESEND_API_KEY")
  const from = firstEnv("RESEND_FROM_EMAIL")
  if (!apiKey || !from) {
    return { ok: false, skipped: true, error: "RESEND not configured" }
  }

  const materials = await loadOnboardingMaterials(params.service)
  const { subject, text } = buildOnboardingWelcomeEmailText({
    displayName: params.displayName,
    materials,
  })

  try {
    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [params.toEmail.trim().toLowerCase()],
        subject,
        text,
      }),
    })
    if (!sendRes.ok) {
      const t = await sendRes.text()
      console.error("[onboarding-welcome-email] Resend", sendRes.status, t)
      return { ok: false, error: "Resend rejected the send" }
    }
    return { ok: true }
  } catch (e) {
    console.error("[onboarding-welcome-email]", e instanceof Error ? e.message : e)
    return { ok: false, error: "Resend request failed" }
  }
}
