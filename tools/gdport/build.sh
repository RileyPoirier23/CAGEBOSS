#!/usr/bin/env bash
# Translate the TypeScript into port/godot/gen, copy the game data, refresh Godot's class cache.
#   GODOT=/path/to/godot tools/gdport/build.sh
set -e
cd "$(dirname "$0")/../.."
node tools/gdport/transpile.mjs $(grep -v '^#' tools/gdport/modules.txt | tr '\n' ' ') || true
rm -rf port/godot/data && cp -r data port/godot/data
"${GODOT:-godot}" --headless --path port/godot --import >/dev/null 2>&1 || true
