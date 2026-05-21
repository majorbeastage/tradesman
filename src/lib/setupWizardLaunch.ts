import type { SetupMiniWizardId } from "./setupGuideWizards"

export const SETUP_WIZARD_LAUNCH_STORAGE_KEY = "tradesman_setup_wizard_launch_v1"

export type SetupWizardLaunchPayload = {
  wizardId: SetupMiniWizardId
  fromSetupGuide?: boolean
  at: string
}

export function writeSetupWizardLaunch(payload: Omit<SetupWizardLaunchPayload, "at">) {
  const full: SetupWizardLaunchPayload = { ...payload, at: new Date().toISOString() }
  try {
    sessionStorage.setItem(SETUP_WIZARD_LAUNCH_STORAGE_KEY, JSON.stringify(full))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("tradesman-setup-wizard-launch", { detail: full }))
}

export function readSetupWizardLaunch(): SetupWizardLaunchPayload | null {
  try {
    const raw = sessionStorage.getItem(SETUP_WIZARD_LAUNCH_STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as SetupWizardLaunchPayload
    if (!o?.wizardId) return null
    return o
  } catch {
    return null
  }
}

export function clearSetupWizardLaunch() {
  try {
    sessionStorage.removeItem(SETUP_WIZARD_LAUNCH_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
