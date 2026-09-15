#!/usr/bin/env python3
"""Keep the iOS Info.plist App Review-safe.

- Ensures NSCameraUsageDescription is present (missing key TCC-kills Take Photo).
- Forces UIBackgroundModes to push only (guideline 2.5.4). Capacitor Geolocation
  must not leave "location" in the archived binary.

Used after `npx cap sync` and as an Xcode Run Script (pass the built plist path).
"""
from __future__ import annotations

import os
import plistlib
import sys

CAMERA_KEY = "NSCameraUsageDescription"
CAMERA_TEXT = (
    "Tradesman uses the camera for in-app video calls. Photos you attach to jobs "
    "and your profile come from your photo library."
)
MIC_KEY = "NSMicrophoneUsageDescription"
MIC_TEXT = "Tradesman uses the microphone for voice greetings, in-app calls, and optional voice commands."
PHOTO_KEY = "NSPhotoLibraryUsageDescription"
PHOTO_TEXT = (
    "Tradesman uses your photo library so you can attach existing photos to jobs, "
    "messages, and your business profile."
)


def load(path: str) -> dict:
    with open(path, "rb") as f:
        return plistlib.load(f)


def save(path: str, data: dict) -> None:
    with open(path, "wb") as f:
        plistlib.dump(data, f, sort_keys=False)


def sanitize(data: dict, *, fail_if_missing_camera: bool) -> dict:
    existing_camera = data.get(CAMERA_KEY)
    if not existing_camera:
        if fail_if_missing_camera:
            raise SystemExit(f"error: {CAMERA_KEY} missing from {sys.argv[-1]}")
        data[CAMERA_KEY] = CAMERA_TEXT
    elif "Take Photo" in str(existing_camera):
        data[CAMERA_KEY] = CAMERA_TEXT
    if not data.get(MIC_KEY):
        data[MIC_KEY] = MIC_TEXT
    if not data.get(PHOTO_KEY):
        data[PHOTO_KEY] = PHOTO_TEXT

    modes = data.get("UIBackgroundModes")
    if not isinstance(modes, list):
        modes = []
    kept = [m for m in modes if isinstance(m, str) and m.strip().lower() not in {"location", "location-updates"}]
    if "remote-notification" not in kept:
        kept.insert(0, "remote-notification")
    data["UIBackgroundModes"] = kept
    if any(str(m).lower() == "location" for m in data["UIBackgroundModes"]):
        raise SystemExit("error: UIBackgroundModes still contains location")
    return data


def main() -> None:
    paths = [p for p in sys.argv[1:] if p and not p.startswith("-")]
    if not paths:
        src = os.path.join(os.path.dirname(__file__), "..", "ios", "App", "App", "Info.plist")
        paths = [os.path.normpath(src)]
    for path in paths:
        if not os.path.isfile(path):
            print(f"warning: plist not found: {path}", file=sys.stderr)
            continue
        data = load(path)
        fail = os.environ.get("IOS_PLIST_REQUIRE_CAMERA", "1") != "0"
        data = sanitize(data, fail_if_missing_camera=fail)
        save(path, data)
        print(f"ok: sanitized {path}")
        print(f"  {CAMERA_KEY}: yes")
        print(f"  UIBackgroundModes: {data.get('UIBackgroundModes')}")


if __name__ == "__main__":
    main()
