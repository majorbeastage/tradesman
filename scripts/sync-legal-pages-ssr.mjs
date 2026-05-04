/**
 * Copies `src/types/legal-pages.ts` → `api/legal-pages-ssr.ts` and restores the serverless banner.
 * Run after editing legal defaults/parsers: `npm run legal:sync-ssr`
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const srcPath = path.join(root, "src/types/legal-pages.ts")
const destPath = path.join(root, "api/legal-pages-ssr.ts")
const src = fs.readFileSync(srcPath, "utf8")
const banner = `/**
 * Serverless bundle copy of \`src/types/legal-pages.ts\` — imported only from \`api/_renderPublicLegalHtml.ts\`
 * so Vercel always packages this file with the function (avoids missing \`../src/...\` at runtime).
 * Regenerate after editing the source file: \`npm run legal:sync-ssr\`
 */
`
const body = src.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*\n\/\*\* Stored in platform_settings/s, "/** Stored in platform_settings")
fs.writeFileSync(destPath, banner + body, "utf8")
console.log("OK:", destPath)
