# CAGE BOSS on consoles and phones

The order things happen in, and what is ready in the code already. The two console
applications are drafted in `XBOX.md` and `PLAYSTATION.md`, ready to paste in. Only Riley can
send them: they need his studio details and signatures.

| Step | Who | Status |
|---|---|---|
| 1. Apply to ID@Xbox (Microsoft) | Riley | Draft ready: `XBOX.md` |
| 2. Register on PlayStation Partners (Sony) | Riley | Draft ready: `PLAYSTATION.md` |
| 3. Pick the console runtime (keeps the gameplay identical) | Riley + porting partner | Plan: `ENGINE.md` |
| 4. Console build flag: pad-only prompts, PlayStation button names | code | **Done** (see below) |
| 5. Age ratings (IARC questionnaire, free on both stores) | Riley | Answers drafted in `XBOX.md` |
| 6. Certification (Xbox XR / PlayStation TRC), dev kits, store pages | Riley + partner | After approval |
| 7. Ads: one per console, one with all of them | code + Riley | Plan: `ADS.md` |
| 8. Phones: paid app with paid unlocks (Sandbox, every fighter) | code + Riley | Plan: `MOBILE.md` |

## Already in the game

- **Console mode.** `src/core/platform.ts` knows `xbox` and `playstation`. A console host
  sets it (`cagebossHost.platform`), or add `?platform=xbox` or `?platform=playstation` to the
  URL to preview it in a browser.
- **No keyboard or mouse anywhere on a console.** Every prompt is a pad button
  (`src/ui/hints.ts`, `src/ui/glyphs.ts`). Help drops keyboard keys and keyboard-only
  shortcuts. "Click" becomes "select". PC, web and phones are unchanged.
- **The right button names.** Xbox shows A/B/X/Y, LB/RB, LT/RT, VIEW/MENU. PlayStation shows
  CROSS/CIRCLE/SQUARE/TRIANGLE, L1/R1, L2/R2, CREATE/OPTIONS, with PlayStation face-button
  glyphs.
- **Controller-first.** The whole game already plays on a pad: a virtual cursor for menus
  and the desk, and full fight controls.
- **No outside payments in store builds.** SUPPORT THE DEV (Interac e-Transfer) only shows
  on the desktop and web builds. Console and phone stores don't allow payments that bypass
  them.
- **10-foot UI.** A TV-safe margin setting appears on consoles.
- **Achievements** map one-to-one to platform achievements and trophies
  (`src/sim/achievements.ts`). **Saves** are plain files, so they can map to console
  cloud saves.

## Things to decide before applying

- **A business name.** Both programs want a company or registered business. "506Clicks" as
  a registered sole proprietorship in New Brunswick is the simplest route. Use the same
  name, address and website (506clicks.ca) on both.
- **A business email** on the 506clicks.ca domain looks more credible than a personal one.
- **Price.** Suggested US$14.99 on console (the whole game, no paywalls) and US$4.99 on
  phones plus unlocks (see `MOBILE.md`).
- **Content.** The game is crude on purpose (R-rated language with a bleep toggle,
  cartoon violence, drug references, satire of real fighters). Expect an M (ESRB) / PEGI 16
  rating. The bleep toggle (streamer mode) helps with the language.
