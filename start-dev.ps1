# Run this after every restart (or double-click) to start the dev server.
# Uses the project's Node/npm.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Clear Vite cache in case it's stale after restart
if (Test-Path "node_modules\.vite") { Remove-Item -Recurse -Force "node_modules\.vite" }

Write-Host "Starting dev server... (Open http://localhost:5173 after it's ready)" -ForegroundColor Cyan
& npm run dev
