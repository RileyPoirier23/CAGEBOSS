# Tutorial pictures

The lessons (`src/ui/guidelessons.ts`) show real screenshots of the game with animated marks
over them (boxes, a finger or mouse pointer tapping, arrows, the red string). This tool plays
the game into each state, takes the pictures at 1:1 game pixels and writes:

- `public/tutorial/pc/<name>.png` and `public/tutorial/phone/<name>.png` (a phone picture that
  comes out identical to the PC one is not stored twice)
- `src/ui/guidepics.ts`: the manifest (file, size, marks in picture pixels). Generated: never
  edit it by hand.

## Run it

```sh
npx vite --port 5299            # a dev server of this checkout (leave it running)
node tools/tutorial/capture.cjs  # every picture, PC then phone (about 10 minutes)
node tools/tutorial/capture.cjs --only=desk_,fn_3 --dev=pc   # retake some, merge into the manifest
node tools/tutorial/capture.cjs --list                        # what there is
npx vitest run tests/tutorial.test.ts                         # checks the manifest and the files
```

The first argument can be another URL (`http://localhost:5173/`). Playwright comes from
`PLAYWRIGHT=/path/to/playwright`, a local `playwright` package, or `/opt/node22/lib/node_modules/playwright`.

Don't edit files under `src/` while it runs: the dev server hot-reloads the page and the picture
being taken fails (retake it with `--only`).

PC pictures are taken in a 480x270 window (the game at scale 1), phone pictures in a 532x270
touch screen (the reference phone: the canvas widens to 532 game pixels, OX = 26). The tool
switches lessons, music and screen shake off and uses the pixel font, so nothing pops into a
picture.

## When to retake

After a screen changes (a button moves, a panel is redrawn), retake the pictures of that screen
with `--only`. The fight pictures (`fb_`, `fd_`, `fc_`, `fg_`, `fn_3`) need retaking whenever
the arena, the HUD or the touch fight pad change. The diagrams (`dirs:punch`, `pose:sprawl/shoot`
...) are drawn by `src/ui/guide.ts` at runtime and follow the rig and the pad by themselves.

## Adding a picture

1. Name it in a lesson step (`pic: 'cards_6'` in `src/ui/guidelessons.ts`).
2. Add an entry to `shots.cjs`: the setup (a game state from `setups.cjs`; add one if needed),
   the crop and the marks. Crops fit the card: at most 340 x 204 (beside the text) or
   468 x 152 (above it) on PC, 330 x 204 or 520 x 152 on the reference phone. Bigger pictures
   are shrunk to fit.
3. `node tools/tutorial/capture.cjs --only=cards_6`, then look at it in the game: MENU >
   TUTORIALS, or `openLesson(game, key, { mode: 'list' })` from the console.

Crop and mark positions are expressions run in the page, so they find buttons and lines by
their labels instead of fixed pixels (`btn('MAKE OFFER')`, `spot('doc.purse')`, `pad('LEAD')`,
`row(0)`, `win()`...); `shots.cjs` lists them all. Marks play in slots: slot 1 first, then 1+2,
then 1+2+3, then the loop starts over.
