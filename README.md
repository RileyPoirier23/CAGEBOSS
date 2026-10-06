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
npm run sim -- --years 10 --seed 123 --policy balanced   # headless balance sim (greedy|balanced|chaos)
npm run validate                           # content validator
npm run namegen                            # sample fighter names; --roster regenerates data/roster/generated.json
```

## Controls

- Mouse for everything. `M` mutes.
- Desk: `I`/`Space` inspect mode, `R` rulebook, `A`/`D`/`E`/`B` stamps, arrow keys / `J`/`K` cycle the inbox.
- `Esc` closes windows.

## Modding

All content is JSON under `data/`: roster, storylets, headlines, reporters, outlets, sponsors,
venues, rules. See `CONTENT_GUIDE.md`.

All characters are fictional parodies. Any resemblance is a lawsuit waiting to happen.
