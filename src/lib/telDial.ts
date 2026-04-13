/** Normalize for tel: — enough digits for NANP. */

export function phoneToTelHref(phone: string): string | null {
  const t = phone.trim()
  if (!t) return null
  const digits = t.replace(/\D/g, "")
  if (digits.length < 10) return null
  if (digits.length === 10) return `tel:+1${digits}`
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`
  return `tel:+${digits}`
}

/** Opens native dialer (Capacitor WebView supports tel: on device). */
export function openPhoneDialer(phone: string): boolean {
  const href = phoneToTelHref(phone)
  if (!href) return false
  window.location.href = href
  return true
}
