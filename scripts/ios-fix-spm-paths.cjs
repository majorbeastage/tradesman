/** Capacitor on Windows writes CapApp-SPM/Package.swift with backslashes. SPM on Mac needs slashes. */
const fs = require("fs")
const path = require("path")
const file = path.join(__dirname, "..", "ios", "App", "CapApp-SPM", "Package.swift")
if (!fs.existsSync(file)) process.exit(0)
const next = fs.readFileSync(file, "utf8").replace(/\\/g, "/")
fs.writeFileSync(file, next)
console.log("ok: iOS SPM paths use forward slashes")
