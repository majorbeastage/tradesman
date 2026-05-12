/// <reference types="vite/client" />

/** Injected in `vite.config.ts` from `package.json` → `version`. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_HELCIM_PAYMENT_PORTAL_URL?: string
  readonly VITE_HELCIM_JS_TOKEN?: string
  readonly VITE_PUBLIC_APP_ORIGIN?: string
  /** When set, Vite dev proxies `/api/*` here (e.g. `http://127.0.0.1:3000` for `vercel dev`). */
  readonly VITE_DEV_API_PROXY_TARGET?: string
  readonly VITE_PUBLIC_ACCOUNT_DELETION_URL?: string
}
