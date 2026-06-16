import type { SetupMiniWizardId } from "./setupGuideWizards"

export type SetupWizardQuestionType = "yesno" | "text" | "textarea" | "choice" | "voice_text"

export type SetupWizardQuestion = {
  id: string
  prompt: string
  help?: string
  type: SetupWizardQuestionType
  choices?: string[]
  defaultValue?: string
  placeholder?: string
  speakAloud?: boolean
}

export type SetupMiniWizardFlow = {
  id: SetupMiniWizardId
  title: string
  intro: string
  questions: SetupWizardQuestion[]
}

export const SETUP_MINI_WIZARD_FLOWS: Record<SetupMiniWizardId, SetupMiniWizardFlow> = {
  customers_auto_replies: {
    id: "customers_auto_replies",
    title: "Automatic replies",
    intro: "Quick setup for how Tradesman responds when customers reach out on your business line.",
    questions: [
      {
        id: "use_auto_replies",
        prompt: "Do you want automatic replies when a customer contacts you?",
        type: "yesno",
        defaultValue: "yes",
        speakAloud: true,
      },
      {
        id: "channels",
        prompt: "Which channel matters most for automatic replies?",
        type: "choice",
        choices: ["Email", "Text message", "Phone call", "All of them"],
        defaultValue: "Text message",
        speakAloud: true,
      },
      {
        id: "use_ai_drafts",
        prompt: "Should AI help draft replies when you are not sure what to say?",
        type: "yesno",
        defaultValue: "yes",
        speakAloud: true,
      },
    ],
  },
  customers_lead_filters: {
    id: "customers_lead_filters",
    title: "Lead filters & alerts",
    intro: "Tell us what work you want so new leads can be scored Hot, Maybe, or Bad.",
    questions: [
      {
        id: "job_types",
        prompt: "What types of jobs do you want? (comma or line separated)",
        type: "textarea",
        placeholder: "roofing, plumbing, HVAC",
        speakAloud: true,
      },
      {
        id: "min_job_size",
        prompt: "Minimum job size in dollars (optional)",
        type: "text",
        placeholder: "500",
      },
      {
        id: "enable_auto_filter",
        prompt: "Automatically score new leads using these rules?",
        type: "yesno",
        defaultValue: "yes",
        speakAloud: true,
      },
      {
        id: "use_ai_unclear",
        prompt: "Use AI when a lead is unclear?",
        type: "yesno",
        defaultValue: "yes",
      },
      {
        id: "notify_customer_activity",
        prompt: "Notify you when customer activity looks urgent?",
        type: "yesno",
        defaultValue: "yes",
        speakAloud: true,
      },
    ],
  },
  estimates_line_items: {
    id: "estimates_line_items",
    title: "Estimate line item",
    intro: "Describe one line item — speak or type. We will build title, description, quantity, and price.",
    questions: [
      {
        id: "line_item_phrase",
        prompt: "Describe the line item (voice or type)",
        type: "voice_text",
        placeholder: 'e.g. "Copper repipe labor 6 hours at 125" or "Permit fee 150 each"',
        speakAloud: true,
      },
    ],
  },
  estimates_job_types: {
    id: "estimates_job_types",
    title: "Job type",
    intro: "Create a reusable job type for scheduling and estimates.",
    questions: [
      {
        id: "job_type_name",
        prompt: "What do you call this type of job?",
        type: "voice_text",
        placeholder: "e.g. Water heater replacement",
        speakAloud: true,
      },
      {
        id: "duration_hours",
        prompt: "Typical duration in hours?",
        type: "text",
        defaultValue: "2",
        placeholder: "2",
      },
      {
        id: "color",
        prompt: "Calendar color",
        type: "choice",
        choices: ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"],
        defaultValue: "#0ea5e9",
      },
      {
        id: "materials_notes",
        prompt: "Default materials or notes (optional)",
        type: "textarea",
        placeholder: "Parts usually needed…",
      },
    ],
  },
  scheduling_alerts: {
    id: "scheduling_alerts",
    title: "Scheduling alerts",
    intro: "Choose how you want to be notified about calendar jobs.",
    questions: [
      {
        id: "notify_push",
        prompt: "Push notifications on your phone for job status changes?",
        type: "yesno",
        defaultValue: "yes",
        speakAloud: true,
      },
      {
        id: "notify_email",
        prompt: "Email when jobs are scheduled or completed?",
        type: "yesno",
        defaultValue: "yes",
      },
      {
        id: "notify_sms",
        prompt: "Text message alerts for key job updates?",
        type: "yesno",
        defaultValue: "no",
      },
      {
        id: "customer_en_route",
        prompt: "Send customers an “on the way” message when you start driving?",
        type: "yesno",
        defaultValue: "no",
        speakAloud: true,
      },
      {
        id: "en_route_email",
        prompt: "If yes — include email for on-the-way messages?",
        type: "yesno",
        defaultValue: "yes",
      },
      {
        id: "en_route_sms",
        prompt: "Include text message for on-the-way messages?",
        type: "yesno",
        defaultValue: "no",
      },
    ],
  },
  scheduling_add_to_calendar: {
    id: "scheduling_add_to_calendar",
    title: "Schedule a job",
    intro: "Answer a few questions and we will fill in the Add to calendar form for you to review.",
    questions: [
      {
        id: "job_title",
        prompt: "What should this calendar event be called?",
        type: "voice_text",
        placeholder: "e.g. Water heater install — Smith",
        speakAloud: true,
      },
      {
        id: "customer_name",
        prompt: "Which customer is this for? (name as saved in Customers, or leave blank)",
        type: "voice_text",
        placeholder: "e.g. Jane Smith",
        speakAloud: true,
      },
      {
        id: "job_type",
        prompt: "Job type (optional — must match a saved job type name)",
        type: "voice_text",
        placeholder: "e.g. Service call",
      },
      {
        id: "schedule_date",
        prompt: "Date (YYYY-MM-DD, or leave blank for today)",
        type: "text",
        placeholder: new Date().toISOString().slice(0, 10),
      },
      {
        id: "schedule_time",
        prompt: "Start time (24-hour, e.g. 09:00)",
        type: "text",
        defaultValue: "09:00",
        placeholder: "09:00",
      },
      {
        id: "duration_hours",
        prompt: "How long will it take (hours)?",
        type: "text",
        defaultValue: "2",
        placeholder: "2",
      },
      {
        id: "notes",
        prompt: "Notes for the crew (optional)",
        type: "textarea",
        placeholder: "Access instructions, parts to bring…",
      },
    ],
  },
  scheduling_receipt_template: {
    id: "scheduling_receipt_template",
    title: "Receipt template",
    intro: "Set the basics customers see on completion receipts.",
    questions: [
      {
        id: "receipt_intro",
        prompt: "Opening line on your receipts",
        type: "voice_text",
        defaultValue: "Thank you for choosing us. Here is your receipt for today's work.",
        speakAloud: true,
      },
      {
        id: "show_logo",
        prompt: "Show your logo on receipts?",
        type: "yesno",
        defaultValue: "yes",
      },
      {
        id: "itemize_lines",
        prompt: "Itemize labor, materials, and misc on the receipt?",
        type: "yesno",
        defaultValue: "yes",
        speakAloud: true,
      },
      {
        id: "use_ai_receipt",
        prompt: "Let AI polish receipt wording later?",
        type: "yesno",
        defaultValue: "no",
      },
    ],
  },
  myt_call_forwarding: {
    id: "myt_call_forwarding",
    title: "Call forwarding",
    intro: "Your Tradesman business number can ring your cell. We will explain each choice in plain language.",
    questions: [
      {
        id: "enable_forwarding",
        prompt: "Forward missed calls on your Tradesman line to your cell phone?",
        type: "yesno",
        defaultValue: "yes",
        speakAloud: true,
      },
      {
        id: "forward_outside_hours",
        prompt: "Also forward calls outside business hours?",
        type: "yesno",
        defaultValue: "no",
        speakAloud: true,
      },
      {
        id: "whisper_on_answer",
        prompt: "Play a short whisper so you know it is a business call before you answer?",
        type: "yesno",
        defaultValue: "yes",
      },
    ],
  },
  myt_voicemail_greeting: {
    id: "myt_voicemail_greeting",
    title: "Voicemail greeting",
    intro: "What callers hear when you do not answer.",
    questions: [
      {
        id: "use_recorded_greeting",
        prompt: "Will you record your own greeting (vs automatic voice reading text)?",
        type: "yesno",
        defaultValue: "no",
        speakAloud: true,
      },
      {
        id: "greeting_text",
        prompt: "Greeting message (read aloud to callers if not recorded)",
        type: "voice_text",
        defaultValue: "Sorry we missed your call. Please leave your name, number, and a brief message after the tone.",
        speakAloud: true,
      },
    ],
  },
}

export function getSetupMiniWizardFlow(id: SetupMiniWizardId): SetupMiniWizardFlow {
  return SETUP_MINI_WIZARD_FLOWS[id]
}
