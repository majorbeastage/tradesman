/// <reference types="vite/client" />

/** Injected in `vite.config.ts` from `package.json` → `version`. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_HELCIM_PAYMENT_PORTAL_URL?: string
  readonly VITE_HELCIM_JS_TOKEN?: string
  readonly VITE_PUBLIC_APP_ORIGIN?: string
}
