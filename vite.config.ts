import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8")) as { version: string }

// Single source of truth for the footer "Version x.y.z": bump only `package.json` → `version`.
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    proxy: {
      // Local `npm run dev` has no `/api` server unless you run `vercel dev` (default http://127.0.0.1:3000).
      // Override with VITE_DEV_API_PROXY_TARGET if your API listens elsewhere.
      "/api": {
        target: process.env.VITE_DEV_API_PROXY_TARGET || "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
})
