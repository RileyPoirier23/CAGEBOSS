# The engine: Godot 4 (consoles and phones)

**Decision: port CAGE BOSS to Godot 4, written in GDScript.** One codebase then ships
everywhere: Windows, Mac, Linux, iPhone, Android, Xbox Series X|S, PlayStation 5 (and
Switch if we want it).

## Why Godot

| | Godot 4 | Unity | GameMaker | Defold | Keep TypeScript + a custom console host |
|---|---|---|---|---|---|
| Xbox | Yes (W4 Consoles; Microsoft documents Godot with its GDK) | Yes | Yes | **No** (on hold) | Unclear (WebView2 for games unconfirmed) |
| PlayStation 5 | Yes (W4 Consoles) | Yes | Yes | Yes | Custom C++ host by a porting studio |
| iPhone / Android | Built in, free | Built in | Built in | Built in | Already works (Capacitor) |
| Cost for consoles | **W4 Starter: about US$2,000/yr for all three consoles** (US$800/yr for one), for small studios under US$300k revenue | Unity **Pro** required for consoles (about US$2,000+/yr per seat, 12-month minimum) | Enterprise about US$800/yr + Professional US$100 | Free | A porting studio contract (much more) |
| Engine cost | Free, open source, no royalties | Free under US$200k, then paid | Paid | Free | n/a |
| Fits this game | **Best:** 2D pixel art, and its drawing calls (polygons, circles, lines) map almost one-to-one onto how CAGE BOSS draws everything | Good, heavier | Good for 2D, weak for a 37,000-line typed codebase | Lua; no Xbox | Same code, but the riskiest and most expensive host |

Godot wins: it reaches every platform you want, it's the cheapest route to consoles, it's
built for 2D pixel art, and its drawing model is the closest to what the game already does.
GDScript rather than C#: GDScript runs on every Godot platform (C# is experimental on phones
and has no web export), and console middleware supports it first.

## Keeping the gameplay identical

A port is only acceptable if fights, careers and the story come out **exactly** the same.
So the rules are not rewritten by hand. They are **translated automatically**:

1. **One source of truth.** The TypeScript game stays the master copy. The translator
   (`tools/gdport/transpile.mjs`) reads it with the TypeScript compiler and writes the
   matching GDScript into `port/godot/gen/`. Every change to the rules reaches both
   versions with one command: `tools/gdport/build.sh`.
2. **JavaScript behaviour in Godot.** `port/godot/rt/js.gd` reproduces the JavaScript
   details the rules depend on, such as 32-bit integer maths for the random numbers, number
   formatting, stable sorting, key order and string handling.
3. **Golden tests.** `tools/golden/scenarios.ts` holds seeded scenarios: the random numbers,
   content, fighter generation, a new career, 20 weeks of a career, 200 sim fights, live
   fights with AI on both sides, and a Road To Champion run. `tools/golden/run.sh` runs each
   one in Node and in Godot and checks the outputs are identical, value for value. **All of
   them match today.** Any difference is a porting bug, found by a test, not by a player.
4. **The screens come next.** The drawing code (`src/ui`, `src/art`) goes through the same
   translator against a small Godot stand-in for the PixiJS calls it uses. Screens are
   checked side by side with screenshots.

## What happens to the current version

The TypeScript game stays the live PC/web version and the master copy. The Godot build is
made from it for consoles and phones, so there is still one game to maintain, not two.

## Costs and accounts

- Godot: free. W4 Consoles Starter: about US$2,000/yr for Xbox + PlayStation + Switch
  (or US$800/yr for one console), bought once the console programs approve you.
- ID@Xbox and PlayStation Partners: free to join (drafts in `XBOX.md`, `PLAYSTATION.md`).
  Dev kits are arranged through each program.
- Apple US$99/yr, Google US$25 once (`MOBILE.md`).

## Sources

- W4 Games console pricing: https://www.w4games.com/w4consoles and
  https://gamefromscratch.com/w4-games-release-godot-w4-console-pricing/
- Godot console support: https://docs.godotengine.org/en/4.5/tutorials/platform/consoles.html
- Microsoft GDK and Godot: https://devdocs.xbox.com/build/gdk-and-engines/godot
- Unity Pro needed for consoles: https://unity.com/products/unity-personal
- GameMaker console exports: https://gamemaker.io/get
- Defold and Xbox: https://defold.com/manuals/microsoft-xbox
