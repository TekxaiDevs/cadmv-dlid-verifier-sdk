#!/usr/bin/env bash
# Build, install, and launch the CA DL/ID verifier demo on a running emulator
# (or start Cadmv_API34_arm64 if none is connected).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$ROOT/env.sh"

AVD_NAME="${AVD_NAME:-Cadmv_API34_arm64}"
PROJ="$ROOT/Cadmv.DlidVerifier.Demo"
PKG="gov.ca.dmv.dlidverifier.demo"

if ! adb devices | grep -qE 'device$'; then
  echo "No device connected — starting emulator $AVD_NAME ..."
  if ! emulator -list-avds | grep -qx "$AVD_NAME"; then
    echo "AVD '$AVD_NAME' not found. Create it (see SETUP.md)." >&2
    exit 1
  fi
  emulator -avd "$AVD_NAME" -netdelay none -netspeed full >/tmp/cadmv-emulator.log 2>&1 &
  echo "Waiting for emulator boot..."
  adb wait-for-device
  # Wait until boot completed
  until [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
    sleep 2
  done
  echo "Emulator ready."
fi

echo "Building + installing..."
dotnet build -t:Install -c Debug "$PROJ/Cadmv.DlidVerifier.Demo.csproj"

echo "Launching $PKG ..."
# .NET Android mangles the activity name (crc…DemoActivity); resolve it each install.
ACTIVITY="$(adb shell cmd package resolve-activity --brief -c android.intent.category.LAUNCHER "$PKG" \
  | tr -d '\r' | tail -n 1)"
if [[ -z "$ACTIVITY" || "$ACTIVITY" == *"No activity"* ]]; then
  echo "Could not resolve launcher activity for $PKG" >&2
  exit 1
fi
adb shell am force-stop "$PKG"
adb shell am start -n "$ACTIVITY"
echo "Started $ACTIVITY"

echo "Done. Prod Real / Prod Fake (UAT off) or Load UAT Valid (UAT on) → Verify."
