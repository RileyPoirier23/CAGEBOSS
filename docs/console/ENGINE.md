# How CAGE BOSS gets onto consoles without changing the gameplay

## The rule

The game must play exactly the same everywhere. So we **don't rewrite it** in another
engine (Unity, Godot, Unreal): a rewrite means re-tuning every fight, every number and every
animation, and some of it would drift. We keep the TypeScript code and only change what sits
under it.

## What the game is made of

| Layer | Where | Portable? |
|---|---|---|
| Rules: fights, story, careers, money, AI | `src/sim`, `src/core` | **Pure TypeScript.** No browser APIs. Runs in any JavaScript engine as is. Covered by the tests. |
| Drawing | PixiJS (WebGL) in `src/ui`, `src/art` | Needs WebGL (or a WebGL-compatible layer) |
| Sound | HTML audio (`src/audio`) | Needs an audio bridge |
| Input | Gamepad API + keyboard (`src/core/input.ts`) | Needs a pad bridge (pad only on consoles) |
| Saves | a key/value store mirrored to files (`setStorage`) | Needs a file bridge (console save APIs) |

So the work on each console is a **host**: something that runs JavaScript and provides
WebGL, audio, pads and save files. Everything above it is the same code as the PC game.

## Xbox: two routes, in order of preference

1. **WebView2 host (zero changes).** A small native shell that shows the built game
   (`npm run build` → `dist/`) in WebView2, injects `cagebossHost = { platform: 'xbox' }`,
   and bridges saves, achievements and sign-in. This is the cheapest route **if Microsoft
   supports WebView2 for GDK games on Xbox at the time we apply**. Public information is
   mixed and dated (WebView2 has been available to Xbox apps; tool makers have reported that
   it was UWP-only, not Win32/GDK). **Ask ID@Xbox directly** (the question is written in
   `XBOX.md`).
2. **The native host (same as PlayStation, below).** If WebView2 isn't allowed for games,
   Xbox uses the same native host as PlayStation, so we only build it once.

## PlayStation (and Xbox route 2): a native host

PlayStation has no browser engine, so the PC build can't be wrapped. The minimal-change route:

- **A small C++ host** with an embedded JavaScript engine (for example QuickJS, which is
  plain C and portable to console SDKs), running our bundled game file.
- **A WebGL-compatible drawing layer** on the console's graphics API. PixiJS only uses a
  small part of WebGL (textured quads, a few shaders), so this is a contained job. A
  simpler alternative: give PixiJS a custom renderer that calls the host's own 2D draw
  calls.
- **Audio, pad and save bridges** behind the same interfaces the game already uses
  (`src/audio`, `src/core/input.ts`, `setStorage`).

This is specialist work that needs the console SDKs (only available after approval) and dev
kits. A solo developer should **contract a porting studio** for the host and certification,
starting with a paid **feasibility study**. Tell them the codebase is TypeScript/WebGL and
the gameplay must not change. Ask each studio for:
- shipped PS5 / Xbox titles, and their certification record (TRC / XR);
- any experience bringing web-based (HTML5/JavaScript) games to consoles;
- a fixed quote for the host, plus a separate one for certification support.

There is precedent for HTML5 games reaching consoles through a native pipeline instead of
a browser (CrossCode went through a JavaScript-to-C++ route for Switch).

## What I'll do in the code meanwhile (no gameplay changes)

- Keep `src/sim` free of browser APIs (it already is; the tests run it in Node).
- Keep every platform call behind one small module per concern, so a host only has to
  implement those.
- The pad-only console mode is done: `?platform=xbox` / `?platform=playstation`.
- Performance pass for TV resolutions (1080p and 4K output; the game renders at 480×270 and
  scales up, so the GPU cost is small).

## Cost and time (rough)

- Programs: free (ID@Xbox and PlayStation Partners). Dev kits: loaned or bought, depending on
  the program and the year.
- Porting partner: a feasibility study first, then a quote. Budget months, not weeks.
- IARC rating: free.
