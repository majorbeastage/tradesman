import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { publicHtmlRoutesPlugin } from "./vite.publicHtmlRoutes"

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8")) as { version: string }

// Single source of truth for the footer "Version x.y.z": bump only `package.json` → `version`.
export default defineConfig({
  plugins: [publicHtmlRoutesPlugin(), react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    proxy: {
      // Local Vite has no serverless `/api`. Default to production so Send email/SMS works
      // without `vercel dev`. Override with VITE_DEV_API_PROXY_TARGET (e.g. http://127.0.0.1:3000).
      "/api": {
        target: process.env.VITE_DEV_API_PROXY_TARGET || "https://www.tradesman-us.com",
        changeOrigin: true,
      },
    },
  },
})
