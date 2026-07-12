export type EmailTemplate = {
  id: string
  label: string
  subject: string
  bodyHtml: string
  description?: string
}

export const STARTER_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "appointment_confirm",
    label: "Appointment confirmation",
    description: "Confirm date and time for a scheduled visit.",
    subject: "Appointment confirmed — {{appointment_date}}",
    bodyHtml: `<p>Hi {{customer_name}},</p>
<p>This confirms your appointment with <strong>{{company}}</strong> on <strong>{{appointment_date}}</strong> at <strong>{{appointment_time}}</strong> for: {{appointment_title}}</p>
<p>If you need to reschedule, reply to this email or call us.</p>
<p>Thank you,<br/>{{sender_name}}</p>`,
  },
  {
    id: "quote_follow_up",
    label: "Quote follow-up",
    description: "Check in after sending an estimate.",
    subject: "Following up on your estimate",
    bodyHtml: `<p>Hi {{customer_name}},</p>
<p>I wanted to follow up on the estimate we sent. Do you have any questions, or would you like to move forward with the work?</p>
<p>Reply to this email or call us anytime — we're happy to help.</p>
<p>Thanks,<br/>{{sender_name}}</p>`,
  },
  {
    id: "thank_you",
    label: "Thank you after job",
    description: "Post-job thank-you and review ask.",
    subject: "Thank you from {{company}}",
    bodyHtml: `<p>Hi {{customer_name}},</p>
<p>Thank you for choosing us. We appreciate your business and hope everything met your expectations.</p>
<p>If you have a moment, we'd love to hear how we did — a quick reply or review means a lot to our small team.</p>
<p>Best,<br/>{{sender_name}}</p>`,
  },
]

export function applyEmailTemplatePlaceholders(
  template: EmailTemplate,
  vars: Record<string, string>,
): { subject: string; bodyHtml: string } {
  const replace = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const v = vars[key]
      return v != null && v !== "" ? v : `{{${key}}}`
    })
  return {
    subject: replace(template.subject),
    bodyHtml: replace(template.bodyHtml),
  }
}

export function findEmailTemplate(id: string): EmailTemplate | undefined {
  return STARTER_EMAIL_TEMPLATES.find((t) => t.id === id)
}
