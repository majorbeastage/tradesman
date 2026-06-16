import type { SupabaseClient } from "@supabase/supabase-js"
import {
  parseEstimateLinePresetsFromMetadata,
  serializePresetForProfile,
  type EstimateLinePresetRow,
} from "./estimateLinePresets"
import { parseSpokenLineItem } from "./parseSpokenLineItem"
import type { SetupMiniWizardId } from "./setupGuideWizards"
import { NOTIFICATION_METADATA_KEY, type NotificationTabId, type TabNotificationPrefs } from "../types/notificationPreferences"
import { getPrefsForTab, parseTabNotificationsMap, setPrefsForTab } from "./tabNotificationPrefs"
import {
  notifySchedulingAddWizardPrefill,
  queueSchedulingAddWizardPrefill,
  type SchedulingAddWizardPrefill,
} from "./workflowNavigation"

export type WizardAnswers = Record<string, string>

async function loadProfileMetadata(supabase: SupabaseClient, userId: string): Promise<Record<string, unknown>> {
  const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  const meta = data?.metadata
  return meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {}
}

async function saveProfileMetadata(supabase: SupabaseClient, userId: string, meta: Record<string, unknown>) {
  const { error } = await supabase.from("profiles").update({ metadata: meta }).eq("id", userId)
  if (error) throw new Error(error.message)
}

function yes(v: string | undefined): boolean {
  return /^(yes|y|true|1|on|enable|enabled|sure|definitely)$/i.test((v ?? "").trim())
}

function patchTabNotifications(
  meta: Record<string, unknown>,
  tab: NotificationTabId,
  patch: Partial<TabNotificationPrefs>,
): Record<string, unknown> {
  const map = parseTabNotificationsMap(meta)
  const cur = getPrefsForTab(map, tab)
  const next: TabNotificationPrefs = {
    ...cur,
    ...patch,
    push: patch.push ? { ...cur.push, ...patch.push } : cur.push,
    email: patch.email ? { ...cur.email, ...patch.email } : cur.email,
    sms: patch.sms ? { ...cur.sms, ...patch.sms } : cur.sms,
  }
  const nextMap = setPrefsForTab(map, tab, next)
  return { ...meta, [NOTIFICATION_METADATA_KEY]: nextMap }
}

export async function applySetupMiniWizard(
  supabase: SupabaseClient,
  userId: string,
  wizardId: SetupMiniWizardId,
  answers: WizardAnswers,
): Promise<string> {
  const meta = await loadProfileMetadata(supabase, userId)

  switch (wizardId) {
    case "customers_auto_replies": {
      const vals =
        meta.conversationsAutomaticRepliesValues && typeof meta.conversationsAutomaticRepliesValues === "object"
          ? { ...(meta.conversationsAutomaticRepliesValues as Record<string, string>) }
          : {}
      vals.conv_auto_reply_enabled = yes(answers.use_auto_replies) ? "checked" : "unchecked"
      vals.conv_auto_reply_ai = yes(answers.use_ai_drafts) ? "checked" : "unchecked"
      const ch = (answers.channels ?? "Email, Text message").toLowerCase()
      if (ch.includes("text") || ch.includes("sms")) vals.conv_auto_reply_method = "Text message"
      else if (ch.includes("phone") || ch.includes("call")) vals.conv_auto_reply_method = "Phone call"
      else vals.conv_auto_reply_method = "Email"
      meta.conversationsAutomaticRepliesValues = vals
      await saveProfileMetadata(supabase, userId, meta)
      return yes(answers.use_auto_replies)
        ? "Automatic replies enabled with your channel and AI preferences."
        : "Automatic replies left off — you can turn them on anytime under Customers."
    }

    case "customers_lead_filters": {
      meta.lead_filter_preferences = {
        v: 1,
        accepted_job_types: (answers.job_types ?? "").trim(),
        minimum_job_size: (answers.min_job_size ?? "").trim(),
        service_radius_miles: (answers.service_radius ?? "25").trim() || "25",
        use_account_service_radius: yes(answers.use_account_radius),
        availability: yes(answers.need_asap) ? "asap" : "flexible",
        enable_auto_filter: yes(answers.enable_auto_filter),
        use_ai_for_unclear: yes(answers.use_ai_unclear),
      }
      let nextMeta = meta
      if (yes(answers.notify_customer_activity)) {
        nextMeta = patchTabNotifications(nextMeta, "customers", {
          push: { onStatusChange: true, statuses: ["Hot", "Qualified", "Waiting"] },
          email: { onStatusChange: true, statuses: ["Hot", "Qualified"] },
        })
      }
      await saveProfileMetadata(supabase, userId, nextMeta)
      return "Lead filter rules saved. Hot / Maybe / Bad scoring will use these preferences on new leads."
    }

    case "estimates_line_items": {
      const phrase = (answers.line_item_phrase ?? answers.voice_line ?? "").trim()
      const parsed = parseSpokenLineItem(phrase)
      if (!parsed) throw new Error("Could not understand that line item. Try: “Water heater install 4 hours at 95”.")
      const existing = parseEstimateLinePresetsFromMetadata(meta)
      const row: EstimateLinePresetRow = {
        id: crypto.randomUUID(),
        description: `${parsed.title}${parsed.description !== parsed.title ? ` — ${parsed.description}` : ""}`.slice(0, 500),
        quantity: parsed.quantity,
        unit_price: parsed.unit_price,
        line_kind: parsed.line_kind,
        unit_basis: parsed.unit_basis,
      }
      meta.estimate_line_presets = [...existing, row].map(serializePresetForProfile)
      await saveProfileMetadata(supabase, userId, meta)
      return `Added line item “${parsed.title}” (${parsed.quantity} × $${parsed.unit_price.toFixed(2)}).`
    }

    case "estimates_job_types": {
      const name = (answers.job_type_name ?? "").trim()
      if (!name) throw new Error("Job type name is required.")
      const hours = Number.parseFloat(answers.duration_hours ?? "2") || 2
      const duration_minutes = Math.max(15, Math.round(hours * 60))
      const color_hex = (answers.color ?? "#0ea5e9").trim() || "#0ea5e9"
      let patch: Record<string, unknown> = {
        name: name.slice(0, 120),
        description: null,
        duration_minutes,
        color_hex,
        materials_list: (answers.materials_notes ?? "").trim() || null,
      }
      let r = await supabase.from("job_types").insert({ user_id: userId, ...patch }).select("id").single()
      const lower = (m: string) => m.toLowerCase()
      if (r.error && lower(r.error.message).includes("materials_list")) {
        const { materials_list: _m, ...rest } = patch
        patch = rest
        r = await supabase.from("job_types").insert({ user_id: userId, ...patch }).select("id").single()
      }
      if (r.error) throw new Error(r.error.message)
      return `Created job type “${name}” (${hours}h default).`
    }

    case "scheduling_alerts": {
      let nextMeta = meta
      const statuses = ["Scheduled", "In progress", "Completed"]
      if (yes(answers.notify_push)) {
        nextMeta = patchTabNotifications(nextMeta, "calendar", {
          push: { onStatusChange: true, statuses },
        })
      }
      if (yes(answers.notify_email)) {
        nextMeta = patchTabNotifications(nextMeta, "calendar", {
          email: { onStatusChange: true, statuses },
        })
      }
      if (yes(answers.notify_sms)) {
        nextMeta = patchTabNotifications(nextMeta, "calendar", {
          sms: { onStatusChange: true, statuses: ["Scheduled", "Completed"] },
        })
      }
      if (yes(answers.customer_en_route)) {
        const map = parseTabNotificationsMap(nextMeta)
        const cur = getPrefsForTab(map, "calendar")
        nextMeta = {
          ...nextMeta,
          [NOTIFICATION_METADATA_KEY]: setPrefsForTab(map, "calendar", {
            ...cur,
            calendarCustomerEnRouteEmail: yes(answers.en_route_email),
            calendarCustomerEnRouteSms: yes(answers.en_route_sms),
          }),
        }
      }
      await saveProfileMetadata(supabase, userId, nextMeta)
      return "Scheduling alert preferences saved."
    }

    case "scheduling_add_to_calendar": {
      const title = (answers.job_title ?? "").trim()
      if (!title) throw new Error("Job title is required.")
      const customerName = (answers.customer_name ?? "").trim()
      let customerId: string | null = null
      if (customerName) {
        const { data } = await supabase
          .from("customers")
          .select("id, display_name")
          .eq("user_id", userId)
          .ilike("display_name", `%${customerName.replace(/[%_]/g, "")}%`)
          .limit(1)
          .maybeSingle()
        customerId = (data as { id?: string } | null)?.id ?? null
      }
      const jobTypeName = (answers.job_type ?? "").trim()
      let jobTypeId: string | null = null
      if (jobTypeName) {
        const { data } = await supabase
          .from("job_types")
          .select("id")
          .eq("user_id", userId)
          .ilike("name", `%${jobTypeName.replace(/[%_]/g, "")}%`)
          .limit(1)
          .maybeSingle()
        jobTypeId = (data as { id?: string } | null)?.id ?? null
      }
      const dateRaw = (answers.schedule_date ?? "").trim()
      const startDate = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : new Date().toISOString().slice(0, 10)
      const timeRaw = (answers.schedule_time ?? "09:00").trim()
      const timeMatch = timeRaw.match(/^(\d{1,2}):(\d{2})$/)
      const startTime = timeMatch
        ? `${String(Math.min(23, Math.max(0, Number.parseInt(timeMatch[1], 10)))).padStart(2, "0")}:${String(Math.min(59, Math.max(0, Number.parseInt(timeMatch[2], 10)))).padStart(2, "0")}`
        : "09:00"
      const hours = Number.parseFloat(answers.duration_hours ?? "2") || 2
      const durationMinutes = Math.max(15, Math.round(hours * 60))
      const notes = (answers.notes ?? "").trim()
      const prefill: SchedulingAddWizardPrefill = {
        customerId,
        title,
        startDate,
        startTime,
        durationMinutes,
        jobTypeId,
        notes: notes || undefined,
      }
      queueSchedulingAddWizardPrefill(prefill)
      notifySchedulingAddWizardPrefill()
      const customerNote = customerName && !customerId ? ` Could not match customer “${customerName}” — pick from the list.` : ""
      const jobTypeNote = jobTypeName && !jobTypeId ? ` Job type “${jobTypeName}” was not found — choose one manually.` : ""
      return `Add to calendar is ready to review.${customerNote}${jobTypeNote}`.trim()
    }

    case "scheduling_receipt_template": {
      meta.receipt_template_intro = (answers.receipt_intro ?? "Thank you for your business.").trim()
      meta.receipt_template_show_logo = yes(answers.show_logo) ? "checked" : "unchecked"
      meta.receipt_template_use_ai = yes(answers.use_ai_receipt) ? "checked" : "unchecked"
      meta.receipt_template_itemize = yes(answers.itemize_lines) ? "checked" : "unchecked"
      await saveProfileMetadata(supabase, userId, meta)
      return "Receipt template basics saved — open Scheduling → Receipt template for logo and mileage."
    }

    case "myt_call_forwarding": {
      const { error } = await supabase
        .from("profiles")
        .update({
          call_forwarding_enabled: yes(answers.enable_forwarding),
          call_forwarding_outside_business_hours: yes(answers.forward_outside_hours),
          forward_whisper_on_answer: yes(answers.whisper_on_answer),
        })
        .eq("id", userId)
      if (error) throw new Error(error.message)
      return yes(answers.enable_forwarding)
        ? "Call forwarding preferences saved. Confirm your cell number under My T → Call forwarding."
        : "Call forwarding left off."
    }

    case "myt_voicemail_greeting": {
      const mode = yes(answers.use_recorded_greeting) ? "recorded" : "ai_text"
      const { error } = await supabase
        .from("profiles")
        .update({
          voicemail_greeting_mode: mode,
          voicemail_greeting_text: (answers.greeting_text ?? "Sorry we missed your call. Please leave a message after the tone.").trim(),
        })
        .eq("id", userId)
      if (error) throw new Error(error.message)
      return mode === "recorded"
        ? "Voicemail set to recorded greeting — use My T to upload or record by phone."
        : "Voicemail greeting text saved (text-to-speech for callers)."
    }

    default:
      return "Saved."
  }
}
