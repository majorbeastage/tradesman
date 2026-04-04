#!/usr/bin/env bash
# Run on macOS with Xcode. From repo root: bash scripts/build-ios.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm run mobile:sync
cd ios/App
# Open workspace in Xcode for Archive, or use xcodebuild when your scheme is set up:
# xcodebuild -workspace App.xcworkspace -scheme App -configuration Release archive -archivePath ./build/Tradesman.xcarchive
echo "Open ios/App in Xcode: npm run mobile:open:ios"
echo "Then: Product → Archive → Distribute App."
