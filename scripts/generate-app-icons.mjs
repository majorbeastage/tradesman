/**
 * Generates Android + iOS launcher assets from public/icon.png (same asset as index.html favicon).
 *
 *   node scripts/generate-app-icons.mjs
 *
 * Requires: npm install (devDependency sharp)
 */
import sharp from "sharp"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const src = join(root, "public", "icon.png")
const androidRes = join(root, "android", "app", "src", "main", "res")
const iosIcon = join(root, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png")

/** Adaptive foreground (dp-based px); legacy launcher square. */
const DENSITIES = [
  { folder: "mipmap-mdpi", foreground: 108, legacy: 48 },
  { folder: "mipmap-hdpi", foreground: 162, legacy: 72 },
  { folder: "mipmap-xhdpi", foreground: 216, legacy: 96 },
  { folder: "mipmap-xxhdpi", foreground: 324, legacy: 144 },
  { folder: "mipmap-xxxhdpi", foreground: 432, legacy: 192 },
]

const BLACK = { r: 0, g: 0, b: 0, alpha: 1 }

async function squareIcon(size, outPath) {
  await sharp(src)
    .resize(size, size, {
      fit: "contain",
      position: "center",
      background: BLACK,
    })
    .png()
    .toFile(outPath)
}

async function main() {
  for (const d of DENSITIES) {
    const dir = join(androidRes, d.folder)
    await squareIcon(d.foreground, join(dir, "ic_launcher_foreground.png"))
    await squareIcon(d.legacy, join(dir, "ic_launcher.png"))
    await squareIcon(d.legacy, join(dir, "ic_launcher_round.png"))
    console.log("wrote", d.folder)
  }
  await squareIcon(1024, iosIcon)
  console.log("wrote iOS AppIcon-512@2x.png (1024)")
  console.log("Done. Android adaptive background: res/values/ic_launcher_background.xml should stay #000000 to match public/icon.png.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
