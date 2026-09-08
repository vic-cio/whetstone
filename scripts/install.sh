#!/bin/bash
#
# Install Whetstone on somebody else's Mac, in one command and with no dialog.
#
#   curl -fsSL https://github.com/vic-cio/whetstone/releases/latest/download/install.sh | bash
#
# Whetstone is not signed with a Developer ID certificate, because that needs a paid Apple
# Developer Program membership. An unsigned app that arrives by browser, AirDrop or Messages
# is quarantined, and macOS refuses to open it until somebody goes to System Settings and
# says to open it anyway.
#
# This gets around that honestly rather than cleverly: `curl` sets no quarantine attribute
# in the first place, and the app is unpacked straight into /Applications. There is no
# warning to click through because there is nothing quarantined to warn about. The
# `xattr -dr` below is belt and braces, for a copy that arrived some other way.
#
# It is the same trust either way: you are running a script from the internet, so read it
# first. It downloads one file, unzips it into /Applications, and opens it.
set -euo pipefail

REPO="vic-cio/whetstone"
APP="/Applications/Whetstone.app"

red=$(tput setaf 1 2>/dev/null || true)
green=$(tput setaf 2 2>/dev/null || true)
dim=$(tput dim 2>/dev/null || true)
off=$(tput sgr0 2>/dev/null || true)

fail() {
  echo "${red}✗${off} $1" >&2
  exit 1
}

[ "$(uname -s)" = "Darwin" ] || fail "Whetstone is a macOS app."
[ "$(uname -m)" = "arm64" ] || fail "This build is Apple Silicon only, and this Mac is $(uname -m)."

echo "Fetching the latest Whetstone."
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# The release's own zip. `latest/download` follows to whatever the newest release is, so
# this script does not go stale when a new one is published.
url="https://github.com/$REPO/releases/latest/download/Whetstone-mac-arm64.zip"
curl -fL --progress-bar "$url" -o "$work/whetstone.zip" \
  || fail "could not download it. Check https://github.com/$REPO/releases"

echo "Unpacking."
ditto -x -k "$work/whetstone.zip" "$work/unpacked" || fail "the download did not unzip; try again"
[ -d "$work/unpacked/Whetstone.app" ] || fail "that zip holds no Whetstone.app"

# A running copy cannot be replaced underneath itself.
if pgrep -f "$APP/Contents/MacOS/Whetstone" >/dev/null 2>&1; then
  echo "${dim}Quitting the copy that is running.${off}"
  osascript -e 'quit app "Whetstone"' >/dev/null 2>&1 || true
  sleep 2
fi

echo "Installing to /Applications."
rm -rf "$APP"
ditto "$work/unpacked/Whetstone.app" "$APP" || fail "could not write to /Applications"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

echo
echo "${green}✓${off} Whetstone is in your Applications folder."
echo "${dim}It is opening now, and from now on it is in Spotlight and Launchpad.${off}"
open -a "$APP"
