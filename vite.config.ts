import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8")) as { version: string }

/** Matches vercel.json: crawlable legal URLs serve static HTML from `public/` (same as production `dist/`). */
function legalStaticRewritesDev(): Plugin {
  const map: Record<string, string> = {
    "/privacy": "/privacy-policy.html",
    "/privacy/": "/privacy-policy.html",
    "/terms": "/terms-conditions.html",
    "/terms/": "/terms-conditions.html",
    "/sms-consent": "/sms-consent.html",
    "/sms-consent/": "/sms-consent.html",
    "/sms": "/sms-consent.html",
    "/sms/": "/sms-consent.html",
    "/account-deletion": "/account-deletion.html",
    "/account-deletion/": "/account-deletion.html",
  }
  return {
    name: "legal-static-rewrites-dev",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const raw = req.url ?? ""
        const pathOnly = raw.split("?")[0] ?? ""
        const target = map[pathOnly]
        if (target) {
          const q = raw.includes("?") ? raw.slice(raw.indexOf("?")) : ""
          req.url = target + q
        }
        next()
      })
    },
  }
}

// Single source of truth for the footer "Version x.y.z": bump only `package.json` → `version`.
export default defineConfig({
  plugins: [react(), legalStaticRewritesDev()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
