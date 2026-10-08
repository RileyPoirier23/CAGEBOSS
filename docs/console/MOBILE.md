# Phones: price and unlocks (plan)

The phone apps already build with Capacitor (`ios/`, `android/`), with touch controls (a
fight pad with LEAD, REAR, KICK, BLOCK, GRAB, EVADE and BODY). This is the plan for charging
for it, which starts **after** the console versions are out.

## The model: a paid app, plus two paid unlocks

| What | Price (USD, suggested) | What you get |
|---|---|---|
| **CAGE BOSS** (the app) | $4.99 | Road To Champion (all five chapters), the Promoter career, Quick Fight vs the CPU, Legacy Mode once you finish the story. No ads. |
| **Sandbox** | $2.99 | The promoter game with the guard rails off: editors, money, roster packs. |
| **Unlock All Fighters** | $2.99 | Every fighter in Quick Fight from the start, story bosses included (normally unlocked by beating their chapter). |
| **Everything bundle** | $4.99 | Both unlocks, cheaper together. |

Why this split: the story and the career are the game, so they come with the price. Sandbox
and the full roster are for people who already love it, which is when they're happy to pay.
No ads and no energy timers: they'd fight the tone of the game and get bad reviews.

## Rules from the stores (they decide how payments work)

- On iOS and Android, digital unlocks **must** go through Apple's or Google's in-app
  purchases (one-time, "non-consumable" items). No links to outside payment.
- So SUPPORT THE DEV (Interac e-Transfer) is **hidden** in the phone apps. This is already
  done in the code.
- Purchases must be restorable on a new phone ("RESTORE PURCHASES" button).
- Apple and Google take 15% (small-business programs, under US$1M a year).

## What changes in the code (when we do it)

1. `src/core/entitlements.ts`: `owns('sandbox')`, `owns('allFighters')`. Always true on PC,
   web and console, so nothing changes there.
2. A purchases bridge with a Capacitor in-app-purchase plugin (StoreKit 2 / Google Play
   Billing). Product ids: `cageboss.sandbox`, `cageboss.allfighters`, `cageboss.bundle`.
3. **MODES** screen: the Sandbox card shows a padlock and the price; tapping it opens the
   purchase sheet.
4. **Quick Fight**: locked fighters show greyed out with a padlock and an "UNLOCK ALL"
   button. Story bosses still unlock for free when you beat their chapter.
5. Settings → RESTORE PURCHASES.
6. Tests: the gates only apply when `platform` is `ios` or `android`.

## Store checklist

- Apple Developer Program (US$99/year) and Google Play Console (US$25 once).
- Age rating: 17+ (Apple), Mature/PEGI 16 (Google, through IARC).
- Store art: icon, 6 to 8 screenshots per phone size, the trailer cut to 30 seconds in
  portrait and landscape.
- Privacy labels: the game collects nothing (saves stay on the phone).
