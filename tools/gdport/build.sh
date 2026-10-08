#!/usr/bin/env bash
# Translate the TypeScript into port/godot/gen, copy the game data and public assets
# (music: .m4a -> .ogg, which Godot plays), refresh Godot's import cache.
#   GODOT=/path/to/godot tools/gdport/build.sh
set -e
cd "$(dirname "$0")/../.."
rm -rf port/godot/gen
node tools/gdport/transpile.mjs $(grep -v '^#' tools/gdport/modules.txt | tr '\n' ' ') || true
rm -rf port/godot/data && cp -r data port/godot/data
mkdir -p port/godot/public
cp -r public/. port/godot/public/ && rm -f port/godot/public/music/*.m4a
for f in public/music/*.m4a; do
  o="port/godot/public/music/$(basename "${f%.m4a}").ogg"
  [ -f "$o" ] || ffmpeg -loglevel error -y -i "$f" -c:a libvorbis -q:a 5 "$o"
done
"${GODOT:-godot}" --headless --path port/godot --import >/dev/null 2>&1 || true
