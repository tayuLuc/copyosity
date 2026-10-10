#!/usr/bin/env bash
# Generate the Tauri updater manifest (latest.json) from built macOS updater
# artifacts. Upload the result to the GitHub release so installed copies can
# auto-update. Optionally pass release notes as $1.
#
# Fork changes, both of them behavioural:
#   * the release base URL is this repository (upstream's copy pointed at
#     vakovalskii/copyosity, i.e. a fork manifest would advertise someone
#     else's binaries), overridable with GH_REPO;
#   * both Mac platforms are emitted. Upstream only ever wrote darwin-aarch64,
#     so an Intel install was never offered an update at all.
# CI assembles the same document inline in .github/workflows/release-fork.yml;
# this script is the local path.
#
# Prereq: artifacts as <name>.app.tar.gz + <name>.app.tar.gz.sig with the arch
# (aarch64|x64) in the file name. Point ART_DIR at the directory holding them.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(python3 -c "import json;print(json.load(open('src-tauri/tauri.conf.json'))['version'])")
NOTES="${1:-Copyosity $VERSION}"
GH_REPO="${GH_REPO:-tayuLuc/copyosity}"
BASE="https://github.com/$GH_REPO/releases/download/v$VERSION"
ART_DIR="${ART_DIR:-src-tauri/target/release/bundle/macos}"

python3 - "$VERSION" "$NOTES" "$BASE" "$ART_DIR" > latest.json <<'PY'
import glob, json, os, sys
from datetime import datetime, timezone

version, notes, base, art = sys.argv[1:5]
keys = {"aarch64": "darwin-aarch64", "x64": "darwin-x86_64"}
platforms = {}
for path in sorted(glob.glob(os.path.join(art, "*.app.tar.gz"))):
    name = os.path.basename(path)
    arch = "aarch64" if "aarch64" in name else "x64"
    sig_path = f"{path}.sig"
    if not os.path.exists(sig_path):
        sys.exit(f"ERROR: {name} has no {os.path.basename(sig_path)} (build with TAURI_SIGNING_PRIVATE_KEY set)")
    signature = open(sig_path).read().strip()
    if not signature:
        sys.exit(f"ERROR: {os.path.basename(sig_path)} is empty")
    platforms[keys[arch]] = {"url": f"{base}/{name}", "signature": signature}
missing = set(keys.values()) - set(platforms)
if missing:
    sys.exit(f"ERROR: no updater artifact for {sorted(missing)} in {art}")
json.dump(
    {
        "version": version,
        "notes": notes,
        "pub_date": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "platforms": platforms,
    },
    sys.stdout,
    indent=2,
)
PY

echo "wrote latest.json for v$VERSION, platforms: $(python3 -c "import json;print(', '.join(json.load(open('latest.json'))['platforms']))")" >&2
