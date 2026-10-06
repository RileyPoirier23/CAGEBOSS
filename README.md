# CAGE BOSS

A satirical MMA-promoter management sim. You run a fight promotion as its bald, loud,
energy-drink-fuelled president: stamp paperwork, bail fighters out, build cards, survive
press conferences, watch the fights, and try to stay out of prison.

The full design spec lives in [`CAGE_BOSS_GAME_SPEC.md`](CAGE_BOSS_GAME_SPEC.md).

## Playing (Windows)

CAGE BOSS is a desktop game. Grab `CAGE-BOSS-<version>-setup.exe` (installer, adds a desktop
shortcut) or `CAGE-BOSS-<version>-portable.exe` (no install, just double-click) from the
repo's **Releases** page, or from the **Actions → Desktop build** run artifacts.

Rated R: swearing, crude jokes, violence. Settings has a streamer-safe bleep mode.

It starts fullscreen; `F11` or `Alt+Enter` toggles windowed. Saves live in your user profile
(`%APPDATA%/CAGE BOSS`).

### Building the .exe yourself

```bash
npm install
npm run dist:win       # -> release/CAGE-BOSS-<version>-setup.exe and -portable.exe
npm run desktop        # run the desktop build without packaging
```

Pushing a tag like `v0.2.0` runs the GitHub workflow that builds both .exe files on Windows
and attaches them to a Release.

## Running from source (dev)

Requires **Node.js 18+**.

```bash
npm install
npm run dev        # then open the printed URL (usually http://localhost:5173)
```

Production build:

```bash
npm run build      # outputs to dist/ (static files, open with any web server)
npm run preview    # serve the built game locally
```

## Tools

```bash
npm test                                   # unit tests (Vitest)
npm run sim -- --years 10 --seed 123 --policy balanced   # headless balance sim + report
npm run sim -- --seeds 3 --policy all --quiet            # every bot policy, storylet coverage report
npm run validate                           # content validator
npm run namegen                            # sample fighter names; --roster regenerates data/roster/generated.json
python3 tools/storylets/build.py           # rebuild storylets from tools/storylets/*.py
python3 tools/commentary_src.py            # rebuild commentary & ring announcer lines
python3 tools/popculture_src.py            # rebuild the pop-culture parody bank
```

## Controls

- Mouse for everything. `M` mutes, `N` skips to the next soundtrack song, `F11` fullscreen (desktop).
- Desk: `I`/`Space` inspect mode, `R` rulebook (drag the title bar, `+`/`-` or `[`/`]` to zoom), `C` calculator
  (auto-tallies camp expense reports; type numbers while it's open), `A`/`D`/`E`/`B` stamps, arrow keys / `J`/`K` cycle the inbox.
- Fight view: `CAM` button switches wide / TV / top-down cameras; `SKIP INTRO` skips Juiced Butler.
- `Esc` closes windows.

## Modding

All content is JSON under `data/`: roster, storylets, headlines, reporters, outlets, sponsors,
venues, rules. See `CONTENT_GUIDE.md`.

All characters are fictional parodies. Any resemblance is a lawsuit waiting to happen.
