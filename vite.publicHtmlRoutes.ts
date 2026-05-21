import type { Connect, Plugin } from "vite"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/** Vercel rewrites these paths to static HTML in `public/`; mirror in dev so /sms-cta does not fall through to the SPA. */
const PUBLIC_HTML_ROUTES: Record<string, string> = {
  "/sms-cta": "sms-cta.html",
  "/sms-cta/": "sms-cta.html",
  "/sms-cts": "sms-cta.html",
  "/sms-cts/": "sms-cta.html",
  "/account-deletion": "account-deletion.html",
  "/account-deletion/": "account-deletion.html",
}

function publicHtmlRoutesMiddleware(publicDir: string): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = (req.url ?? "").split("?")[0]
    const file = PUBLIC_HTML_ROUTES[url]
    if (!file) {
      next()
      return
    }
    try {
      const html = readFileSync(resolve(publicDir, file), "utf-8")
      res.statusCode = 200
      res.setHeader("Content-Type", "text/html; charset=utf-8")
      res.end(html)
    } catch {
      next()
    }
  }
}

export function publicHtmlRoutesPlugin(): Plugin {
  return {
    name: "public-html-routes",
    configureServer(server) {
      const publicDir = server.config.publicDir
      server.middlewares.use(publicHtmlRoutesMiddleware(publicDir))
    },
    configurePreviewServer(server) {
      const publicDir = server.config.publicDir
      server.middlewares.use(publicHtmlRoutesMiddleware(publicDir))
    },
  }
}
