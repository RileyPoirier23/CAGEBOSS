# CAGE BOSS

A satirical MMA-promoter management sim. You run a fight promotion as its bald, loud,
energy-drink-fuelled president: stamp paperwork, bail fighters out, build cards, survive
press conferences, watch the fights, and try to stay out of prison.

The full design spec lives in [`CAGE_BOSS_GAME_SPEC.md`](CAGE_BOSS_GAME_SPEC.md).

## Playing (Windows, Mac, Linux)

CAGE BOSS is a desktop game. Everything is on the repo's **Releases** page:

| | |
|---|---|
| Windows | `CAGE-BOSS-Setup.exe` (installer, updates itself) or `CAGE-BOSS-Portable.exe` (no install) |
| Mac | `CAGE-BOSS-Mac-AppleSilicon.dmg` (M1 and newer) or `CAGE-BOSS-Mac-Intel.dmg` |
| Linux | `CAGE-BOSS-Linux.AppImage` (`chmod +x`, then run; updates itself) or `CAGE-BOSS-Linux.tar.gz` |

**Mac:** the game isn't signed with a paid Apple developer certificate, so the first time you
open it macOS says it "can't be checked". Right-click the app → **Open** → **Open** (or System
Settings → Privacy & Security → **Open Anyway**). After that it opens normally. The Mac build
tells you when there's a new version instead of updating itself.

Rated R: swearing, crude jokes, violence. Settings has a streamer-safe bleep mode.

It starts fullscreen; `F11` or `Alt+Enter` toggles windowed. Saves live in your user profile
(`%APPDATA%/CAGE BOSS` on Windows, `~/Library/Application Support/CAGE BOSS` on Mac,
`~/.config/CAGE BOSS` on Linux), and are mirrored as plain files in its `saves/` folder (back
that folder up, copy it to another computer, or let Steam Cloud sync it: see
[`docs/STEAM.md`](docs/STEAM.md)).

### Building it yourself

```bash
npm install
npm run dist:win       # -> release/CAGE-BOSS-<version>-setup.exe and -portable.exe
npm run dist:mac       # on a Mac -> release/CAGE-BOSS-<version>-mac-arm64.dmg / -x64.dmg
npm run dist:linux     # -> release/CAGE-BOSS-<version>-linux-x86_64.AppImage / .tar.gz
npm run desktop        # run the desktop build without packaging
```

Every push builds Windows. Bumping the version in `package.json` (or pushing a tag like
`v1.7.0`) runs the GitHub workflow on Windows, Mac and Linux runners and publishes a Release
with all of them attached; installed copies pick the update up from there.

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

## The final round (2.1.0)

The last update before the full release, all of it in the cage:
- **Fights that read themselves.** The AI tallies what lands on it (hooks, straights, kicks, body shots, takedowns) and what of its own is working: hooks that keep catching it get rolled under, kicks checked, straights slipped, a man who's been shot on sprawls sooner, and what lands gets thrown more. It reads the cards and the tank too: behind in the last round it comes forward and swings for the head, ahead and tired it cruises, on an empty tank it rests behind the jab, and a hurt man gets hunted. A losing plan changes at the bell.
- **Damage that adds up.** Every knockdown makes the next one likelier. A body that's been worked over has no snap left in its punches. Landing in a row builds momentum. A cut man doesn't see the head shots coming, and bad legs make the slip late. A knockdown round is a 10-8 unless the other man answered.
- **Models that wear the fight.** Weight classes show in the frame. Sweat with the rounds, the eye swelling shut, a cut over it, blood down the face, bruised ribs, and a gassed man's mouth open with his hands coming down.
- **Shots that land.** Big strikes coil first, snap out, stop the frame for a beat and shake it by how hard they hit. Leg kicks buckle the knee. Three ways out: on your back, in a heap, or on your face.

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
