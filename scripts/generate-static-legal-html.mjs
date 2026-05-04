import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const lpPath = path.join(root, "src/types/legal-pages.ts")
const lp = fs.readFileSync(lpPath, "utf8")

function grab(constName) {
  const re = new RegExp(
    `export const ${constName}: SimpleLegalPage = \\{[\\s\\S]*?title: "([^"]+)"[\\s\\S]*?subtitle:[\\s\\S]*?"([\\s\\S]*?)",[\\s\\S]*?body: \`([\\s\\S]*?)\`,`,
    "m",
  )
  const m = lp.match(re)
  if (!m) throw new Error(`No match for ${constName}`)
  return { title: m[1], subtitle: m[2], body: m[3] }
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function wrap({ title, subtitle, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)} | Tradesman Systems</title>
<meta name="description" content="${esc(subtitle.slice(0, 240))}"/>
<meta name="robots" content="index,follow"/>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.65;color:#111827;max-width:920px;margin:0 auto;padding:24px 16px 48px;background:#f3f4f6;}
main{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:22px;}
.subtitle{color:#4b5563;font-size:15px;margin:0 0 20px;}
pre.legal{white-space:pre-wrap;word-wrap:break-word;font-size:15px;margin:0;}
footer{font-size:13px;color:#6b7280;margin-top:20px;}
a{color:#ea580c;font-weight:600}
</style>
</head>
<body>
<header>
<h1 style="margin:0 0 8px;font-size:1.75rem">${esc(title)}</h1>
<p class="subtitle">${esc(subtitle)}</p>
</header>
<main><pre class="legal">${esc(body)}</pre></main>
<footer>
<p>Tradesman Systems — public legal document (readable without JavaScript). <a href="/">Home</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/sms-consent">SMS consent</a></p>
</footer>
</body>
</html>`
}

const priv = grab("DEFAULT_PRIVACY_PAGE")
const terms = grab("DEFAULT_TERMS_PAGE")
fs.writeFileSync(path.join(root, "public/privacy-policy.html"), wrap(priv))
fs.writeFileSync(path.join(root, "public/terms-conditions.html"), wrap(terms))
console.log("OK: public/privacy-policy.html, public/terms-conditions.html")
