/** Prefill login after training sandbox provisioning. */

export const SANDBOX_LOGIN_EMAIL_KEY = "tradesman_sandbox_login_email"

export function queueSandboxLogin(email: string): void {
  try {
    sessionStorage.setItem(SANDBOX_LOGIN_EMAIL_KEY, email.trim())
  } catch {
    /* ignore */
  }
}

export function readSandboxLoginEmail(): string {
  try {
    return sessionStorage.getItem(SANDBOX_LOGIN_EMAIL_KEY)?.trim() ?? ""
  } catch {
    return ""
  }
}

export function clearSandboxLoginEmail(): void {
  try {
    sessionStorage.removeItem(SANDBOX_LOGIN_EMAIL_KEY)
  } catch {
    /* ignore */
  }
}
