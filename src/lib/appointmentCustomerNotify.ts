import { clampAutomatedNotifyInnerText } from "./smsComplianceLimits"

export function buildAppointmentConfirmSmsInner(input: {
  customerName: string
  appointmentDate: string
  appointmentTime: string
  businessName: string
  appointmentTitle: string
}): string {
  const title = input.appointmentTitle.trim() || "your appointment"
  return `Hi ${input.customerName}, your appointment is confirmed for ${input.appointmentDate} at ${input.appointmentTime}, with ${input.businessName} for: ${title}`
}

export function buildAppointmentRescheduleSmsInner(input: {
  customerName: string
  appointmentDate: string
  appointmentTime: string
  businessName: string
  appointmentTitle: string
}): string {
  const title = input.appointmentTitle.trim() || "your appointment"
  return `Hi ${input.customerName}, your appointment with ${input.businessName} has been rescheduled to ${input.appointmentDate} at ${input.appointmentTime} for: ${title}`
}

export function buildAppointmentCancelSmsInner(input: {
  customerName: string
  appointmentDate: string
  appointmentTime: string
  businessName: string
  appointmentTitle: string
}): string {
  const title = input.appointmentTitle.trim() || "your appointment"
  return `Hi ${input.customerName}, your appointment with ${input.businessName} on ${input.appointmentDate} at ${input.appointmentTime} for ${title} has been cancelled.`
}

/**
 * @deprecated Calendar customer SMS now sends inner text only; `/api/outbound-messages`
 * appends the STOP/HELP footer once. Kept for call-site compatibility (clamp only).
 */
export function wrapAppointmentSmsBody(inner: string): string {
  return clampAutomatedNotifyInnerText(inner)
}
