# CAGE BOSS

A satirical MMA-promoter management sim. You run a fight promotion as its bald, loud,
energy-drink-fuelled president: stamp paperwork, bail fighters out, build cards, survive
press conferences, watch the fights, and try to stay out of prison.

The full design spec lives in [`CAGE_BOSS_GAME_SPEC.md`](CAGE_BOSS_GAME_SPEC.md).

## Running the game

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

- Mouse for everything. `M` mutes.
- Desk: `I`/`Space` inspect mode, `R` rulebook (drag the title bar, `+`/`-` or `[`/`]` to zoom), `C` calculator
  (auto-tallies camp expense reports; type numbers while it's open), `A`/`D`/`E`/`B` stamps, arrow keys / `J`/`K` cycle the inbox.
- Fight view: `CAM` button switches wide / TV / top-down cameras; `SKIP INTRO` skips Juiced Butler.
- `Esc` closes windows.

## Modding

All content is JSON under `data/`: roster, storylets, headlines, reporters, outlets, sponsors,
venues, rules. See `CONTENT_GUIDE.md`.

All characters are fictional parodies. Any resemblance is a lawsuit waiting to happen.
