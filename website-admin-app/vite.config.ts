import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

const mainApiOrigin = (process.env.VITE_PUBLIC_APP_ORIGIN ?? "https://www.tradesman-us.com").replace(/\/+$/, "")

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5181,
    proxy: {
      "/api/website-admin-handoff": {
        target: mainApiOrigin,
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
