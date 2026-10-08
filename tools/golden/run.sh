#!/usr/bin/env bash
# Golden tests: run each scenario in Node and in Godot (a fresh process each, so module state
# starts clean), then compare. Usage: tools/golden/run.sh [name,name,...]   (GODOT=path/to/godot)
set -e
cd "$(dirname "$0")/../.."
NAMES=${1:-rng,content,generate,newgame,eligible,startweek,weeks,fights,live,road}
for n in $(echo $NAMES | tr ',' ' '); do npx tsx tools/golden/run-node.ts $n; done
for n in $(echo $NAMES | tr ',' ' '); do
  (cd port/godot && timeout ${T:-1800} "${GODOT:-godot}" --headless --path . -s tests/golden.gd -- $n 2>&1 | grep -v "^Godot Engine" | grep -v "^$" | grep -v "^content:" | head -${N:-30})
done
node tools/golden/compare.mjs $NAMES
