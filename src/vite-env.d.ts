/// <reference types="vite/client" />

/** Injected in `vite.config.ts` from `package.json` → `version`. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_HELCIM_JS_TOKEN?: string
  readonly VITE_PUBLIC_APP_ORIGIN?: string
  /** When `"true"`, allowlisted users see long Payments / Helcim setup copy on deployed builds (e.g. preview). */
  readonly VITE_SHOW_PAYMENTS_DEV_NOTES?: string
}
