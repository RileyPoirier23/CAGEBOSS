# CAGE BOSS — Game Design & Build Spec (for Claude Code)

> **How to use this file:** Put it in an empty project folder and tell Claude Code:
> "Read CAGE_BOSS_GAME_SPEC.md. Build the game milestone by milestone as described. After each milestone, run the tests and the headless balance sim, then stop and summarize before starting the next one."

---

## 0. Role & ground rules for Claude Code

You are building **CAGE BOSS**, a satirical MMA-promoter management sim. The player runs a fight promotion as its bald, loud, energy-drink-fueled president. The tone is dark comedy and bureaucratic satire in the spirit of *Papers, Please*: grim, mundane paperwork with absurd stakes.

Rules:
- **All fighters, promoters, journalists, outlets, companies and events are fictional.** Characters are satirical *archetypes* of combat-sports culture with original pun names. Do not use real people's names, likenesses or verbatim quotes. Scandals are generated from generic templates assigned to fictional characters by their traits — not retellings of specific real incidents tied to specific real people.
- Roster data lives in editable JSON (`data/roster/*.json`) so players can mod names, bios and portraits themselves.
- Do not copy any assets, UI layouts pixel-for-pixel, or text from *Papers, Please*. Take inspiration from its *feel*: desk-centric UI, document inspection, stamps, a rulebook, daily newspaper, low-res muted palette, family/expense pressure.
- Build in small, playable milestones. Keep the game runnable at every commit.
- Everything content-related is **data-driven** (JSON/YAML) so content volume can scale without code changes.

---

## 1. Tech stack

- **TypeScript + Vite**, rendering with **PixiJS v8** (or Phaser 3 if you judge it simpler — pick one and stick with it).
- Fixed internal resolution **480×270**, integer-scaled to the window, nearest-neighbor filtering, pixel font (bundle an open-licensed pixel font, e.g. from Google Fonts or OFL sources).
- **Seeded RNG** (e.g. mulberry32) everywhere. Every save stores its seed. Same seed + same choices = same outcome.
- State management: a single serializable `GameState` object; pure functions for simulation (`simulateWeek(state, choices) -> state`), so the sim is unit-testable and runnable headless.
- Saves: `localStorage` for browser plus export/import as JSON file. 3 manual slots + autosave each week.
- Testing: **Vitest**. A headless script `npm run sim -- --years 10 --seed 123 --policy greedy|balanced|chaos` that plays the game with a bot policy and prints a balance report (money curve, scandal counts, repetition stats, which storylets fired, how many never fired).
- Audio: simple procedural/8-bit SFX via WebAudio (stamp thunk, paper shuffle, crowd roar, phone ring, cash register). Optional chiptune loop. Mute toggle.
- Packaging later: optional Electron/Tauri wrapper for desktop.

Folder layout:
```
src/
  core/        (state, rng, time, save/load, event bus)
  sim/         (fighters, fights, rankings, finance, media, scandals, legal, rivals)
  storylets/   (storylet engine, condition evaluator, effect applier)
  ui/          (desk, documents, stamps, newspaper, phone, board, fight night, menus)
  art/         (procedural portrait generator, palettes, sprite helpers)
  audio/
data/
  roster/ divisions/ storylets/ documents/ outlets/ reporters/ headlines/ sponsors/ venues/ rules/
tools/         (headless sim, content validator, name generator)
tests/
```

---

## 2. Art direction

- *Papers, Please*-adjacent: muted desaturated palette (~16–24 colors), hard pixel edges, chunky UI, heavy use of paper textures, stamps, ink, carbon copies.
- **Main screen = the President's desk** seen top-down, with a window at the top showing who's in the office (fighters, managers, lawyers, reporters, cops, network execs walk in and stand there).
- **Procedural pixel portraits** (64×64 and 24×24): layered parts — head shape, skin tone, hair/beard, cauliflower ears (scales with career damage), broken nose, scars, tattoos, eyebrow cut, swelling after fights, mugshot variant (height chart background), press-photo variant, belt-holding variant. Portraits age over the career (grey hair, receding line, weight changes).
- Fight Night uses a side-on, low-res arena view with tiny sprites, a crowd made of flickering pixels, and a chunky text ticker. No need for real-time fighting animation fidelity — stylized exchanges are enough.
- Distinct paper styles per document type (contract = cream w/ legalese, medical = blue form, drug test = lab printout w/ barcode, police report = carbon copy, newspaper = grey newsprint, sponsor deal = glossy letterhead).
- UI juice: stamping shakes the desk, papers slide, phone vibrates, cash counter ticks, newspaper spins in at day start.

---

## 3. Core concept & loop

Each **turn = one week**. A career runs ~10 in-game years (~520 weeks), but "dead" weeks are compressed — the player only plays weeks where something needs them (most weeks do).

### Weekly loop
1. **Morning Paper** (*Papers, Please* homage): newspaper front page + sidebar of social-media posts summarizing last week's consequences. Headlines change based on what you did. Some headlines quietly announce new rules ("ATHLETIC COMMISSION TIGHTENS WEIGH-IN RULES").
2. **The Desk (core gameplay, 5–10 min):** a queue of visitors and documents arrives. The player inspects, cross-references and stamps **APPROVE / DENY / ESCALATE / BURY**. Timer pressure: the work day is a clock (9am–6pm); unprocessed paperwork rolls over and causes problems.
3. **Phone & Office Visits:** branching dialogue with fighters, managers, the network, sponsors, cops, lawyers, the commission, your own corporate owners.
4. **Matchmaking Board:** a corkboard with fighter cards and string. Build upcoming cards, sign fights, pick main events, handle short-notice replacements.
5. **Fight Night** (every 2–3 weeks; mandatory "numbered" big events ~monthly): weigh-ins → press conference → live event ticker → post-fight press conference. Choices during the event (bonus handouts, stoppage reviews, handling a brawl in the crowd, a fighter calling you out on the mic).
6. **End of Week Ledger:** income/expenses breakdown in a ledger book, meters update, family/home expenses (the President's personal life: divorce lawyer, kid's private school, Vegas habits).

### Papers-Please-style inspection mechanics
The **Rulebook** (a physical book on the desk) grows over time, adding new things to check. Discrepancies are found by clicking two fields to compare (e.g., contract weight vs weigh-in sheet). Examples:
- **Bout agreements:** weight class matches, purse matches what you promised on the phone, signature matches the signature on file, manager is licensed, exclusivity clause present, bouts remaining.
- **Medicals:** expiry dates, required scans (MRI, eye exam), suspension periods after KO losses, doctor license number is real (fake doctors exist).
- **Drug test results:** banned-substance codes vs current banned list, "tainted supplement" exemptions with documentation, picogram thresholds that change when the rules change, missed-whereabouts strikes.
- **Visas/travel:** fighter needs a work visa for an overseas card; check passport expiry, country entry rules, a prior arrest that blocks entry.
- **Weigh-in sheets:** missed weight → choose: cancel, catchweight with % purse fine, or let them fight anyway (commission angry).
- **Sponsor contracts:** banned categories (rule changes: e.g., "no betting sponsors in Region X"), conflicting exclusive sponsors on the same fighter.
- **Police/court docs:** bail amounts, court dates conflicting with fight dates, no-travel orders, ankle monitors.
- **Expense reports:** fighters' camps padding expenses; managers double-billing.
- **Press credentials:** a reporter you banned trying to sneak back in with a fake credential.

Mistakes get **citations** from your corporate owner (like *Papers, Please*'s penalty slips), costing money or reputation. Deliberate rule-breaking for personal gain is allowed and tracked.

---

## 4. Meters & economy

**Money:** Promotion cash, the President's personal wealth, and corporate valuation (the score that matters to the owners).

**Six relationship meters (0–100), each with its own consequences:**
| Meter | High | Low |
|---|---|---|
| **Fans** | PPV buys, ticket sellouts | Boos, empty seats, "boycott" trends |
| **Fighters** (locker room) | Easier negotiations, loyalty | Union push, public pay complaints, walkouts, defections |
| **Media** | Favorable coverage | Hit pieces, investigative series |
| **Commission/Regulators** | Lenient rulings | Stricter rules, event license threats, fines |
| **Network/Broadcaster** | Better TV deal renewals | Bad time slots, deal not renewed |
| **Sponsors** | More deals, bigger checks | Pullouts after scandals |

**Hidden meters:** Heat (how much legal/government attention the President personally has), Owner Patience (corporate parent's tolerance), Chaos (frequency multiplier for scandals; rises with risky behavior).

**Income:** gate, PPV buys (driven by star power × rivalry heat × hype × card depth × Fans meter), broadcast deal, sponsors, merch, international licensing, side ventures (slap league, reality show, energy drink).
**Expenses:** fighter purses/bonuses, venue, production, legal fees, bail, settlements, fines, insurance, staff salaries, PR firms, the President's lifestyle.

Pay tension is central: underpaying is profitable but drains Fighters meter and fuels a long-term union/antitrust arc.

---

## 5. Fighters

### Roster size & structure
- ~**250 active fighters** across men's divisions (Fly, Bantam, Feather, Light, Welter, Middle, Light Heavy, Heavy) and women's (Straw, Fly, Bantam), plus **~60 legends** (retired, available for comeback events, commentary, broadcast, or as Hall of Fame entries) and a regional "prospects pool" that regenerates.
- **~60 hand-authored "marquee" characters** with deep bespoke storylines; the rest are **procedurally generated** from archetypes with generated backstories. Both use the same data schema.
- Names: original pun/parody names generated from syllable tables + nickname tables ("Dmitri 'The Tax Audit' Volkhov", "Brayden 'Southern Fried' Pruitt"). Provide `tools/namegen.ts`. Everything editable in `data/roster/`.

### Fighter schema (each fighter has)
- Identity: name, nickname, age, hometown/country, languages, religion/beliefs (flavor only), height/reach, stance, gym, coach, manager.
- **Skills (1–100):** striking, power, wrestling, grappling/BJJ, cardio, chin, fight IQ, durability (decays with damage), weight-cut difficulty.
- **Style tags:** pressure striker, counter striker, wrestler, sub hunter, brawler, point fighter, "boring but effective".
- **Personality traits (multi-select, drive storylets):** Trash Talker, Devout, Party Animal, Hothead, Conspiracy Poster, Business Savvy, Loyal, Mercenary, Shy, Showman, Family Man/Woman, Reckless Driver, Gambler, Crypto Bro, Political, Prankster, Perfectionist, Injury Prone, Paranoid, Wholesome.
- **Off-cage life:** family members (spouse/kids/parents), finances (debt, spending habits), vices, side businesses, social-media following and posting style, legal record, "skeletons" (hidden facts that can surface later).
- **Backstory:** generated multi-paragraph bio from templates (rough childhood, ex-wrestler, refugee story, rich-kid, ex-cop, former bouncer, etc.) + a "career log" auto-written as they fight.
- **Status:** morale, loyalty to you, hype, star power, injury list, medical suspension, contract (bouts left, purse, win bonus, champion clause, exclusivity), legal status (free, arrested, on bail, on probation, suspended, banned).
- **Relationships:** rivalries, friendships, teammates (won't fight each other unless loyalty breaks), beefs with reporters, beefs with you.

### Marquee archetype library (write ~60 of these, original names, generic arcs)
Examples of the *kinds* of characters to author (not mapped to real people):
- **The Troubled GOAT** — generational talent who never truly loses in the cage but keeps detonating his life outside it; the eternal "do we keep him?" dilemma.
- **The Loudmouth Superstar** — sells more PPVs than the whole division combined; demands equity; may leave for boxing.
- **The Pious Grappler** — dominant, refuses alcohol sponsors, family-first; may retire suddenly at the peak.
- **The Unfiltered Podcaster** — good fighter, says something wildly offensive on a stream; sponsors flee; fans split.
- **The Pay Protester** — top heavyweight who publicly fights you over pay and fighter rights.
- **The Wholesome Fan Favorite** — everyone loves them; "too nice to build hype."
- **The Moneyweight Gatekeeper** — tough veteran nobody wants to fight.
- **The Weight-Miss Repeat Offender.**
- **The Meme Kid** — viral knockout, zero fundamentals, huge following.
- **The Influencer Crossover** — internet celebrity who wants to fight in your cage.
- **The Comeback Legend** — 44 years old, "one more fight," commission skeptical.
- **The Rival-Promotion Defector**, **The Ref With A Grudge**, **The Overprotective Coach**, **The Shady Manager**, **The Dad Who Lives Through His Son**.

Legends get a "Hall of Fame" wing, comeback storylets, commentary-booth jobs, and nostalgia "superfights".

---

## 6. Fight simulation

- Round-by-round sim (3 or 5 rounds), exchange-level using skills, style matchups, cardio decay, damage accumulation, and randomness weighted by power/chin. Outcomes: KO/TKO, submission (named holds), decision (unanimous/split/majority), draw, DQ, no contest, doctor stoppage.
- **Judging** with three fictional judges, each with bias tendencies (one loves takedowns, one is just bad). "Robbery" decisions spawn controversy storylets.
- **Referees** with tendencies (late stoppage, early stoppage).
- Live **ticker text** ("Volkhov lands a jab... a body kick... HE'S HURT!") + mini arena animation + crowd volume meter.
- Player interventions on fight night: approve "Performance of the Night" bonuses, react to brawls, handle a fighter calling you out on the mic, decide whether to put the injured fighter's opponent in a short-notice fight.
- Damage persists: chin erodes, cauliflower ears grow, CTE-themed retirement storylets (handled seriously, not as a joke).

### Rankings & belts
- Media-panel rankings (affected by your Media meter and by "favorites" reporters).
- Belts, interim belts (creating them earns money but angers purists), "symbolic" belts (a goofy novelty belt you can invent), stripping champions, vacating, double-champ chases.

---

## 7. Scandals, controversy & the storylet engine (the heart of replayability)

Build a **storylet engine**: each storylet is a JSON object with
```
id, title, weight, cooldownWeeks, oncePerCareer?, act[] (which career acts it can fire in),
conditions (fighter traits, meters, money, legal status, recent events, flags),
roles (e.g. "subject": fighter with trait Reckless Driver, "reporter": any reporter with grudge),
scenes[] (desk documents, phone call, office visit, press conference, newspaper headline),
choices[] -> effects (meters, money, flags, follow-up storylets with delays)
```
Conditions use a small expression language (`fighter.traits.has("Hothead") && meters.media < 40`). Effects can schedule follow-ups weeks later so stories unfold across many weeks (arrest → bail → court date → plea deal → suspension → comeback).

**Target content volume: 350+ storylets**, with **120+ multi-week chains**. The validator tool flags storylets whose conditions can never be met.

### Scandal categories (generic templates, assigned by traits)
- **Legal:** arrests (bar fight, DUI, reckless driving/vehicle incident and fleeing the scene, domestic incident — handled seriously with a "do the right thing" path), tax evasion, gym-owner fraud, weapons charge, assault on a fan's phone, airport brawl.
- **Bail Office mini-game:** jail visitor window; review charge sheet, bail amount, lawyer options (cheap/public, mid, "the shark"), check court dates against scheduled fights, decide whether to pay bail from promotion funds, from your own pocket, or let them sit. Spin it to the press afterward.
- **Speech/culture-war:** fighter posts something offensive or conspiratorial → sponsors pull out, segments of fans rally behind them, media pile-on. Choices: cut them, suspend, defend "free speech," force an apology video (rendered as a cringe little scene), ignore and let it sell tickets.
- **Doping:** failed tests, tainted supplements, picogram debates, mysterious "rapid recovery," a lab mix-up, a whistleblower.
- **Business:** fighter pay leaks, union drive, antitrust lawsuit (multi-year chain), fighter jumps to rival promotion, manager poaching, PPV piracy, broadcast deal renegotiation, corporate merger.
- **The President's own scandals:** caught on video at a casino, fighting with a reporter, leaked texts, getting too cozy with politicians, a slap-fighting league side hustle everyone hates, a reality show, a feud with a celebrity boxer.
- **Fight-night chaos:** robbery decision, bad stoppage, fan invades the cage, fighter refuses to leave the cage, mic callout of the President, post-fight melee, a cornerman fight.
- **Weird/funny:** fighter starts a crypto coin that rugs, fighter's pet tiger, fighter claims the earth is flat, fighter runs for mayor, fighter's mom becomes a better trash talker than him, energy drink sponsor recall.

**Anti-repetition rules:** per-storylet cooldowns; per-category rate limits; "freshness" weighting that strongly favors unseen storylets; each fighter has a personal "storylet history"; act-gating so new content keeps unlocking; trait mutations after events (a fighter who gets cancelled may gain "Martyr Complex" or "Reformed").

---

## 8. Media, reporters & outlets

- **~10 fictional outlets**, each a parody *type* with a bias and readership: the hardcore MMA insider site, the tabloid, the sports-network giant, the serious newspaper doing an investigative series, the hype podcast, the fan-blog empire, the conspiracy streamer, the international outlet, the betting site, the "fighters' rights" newsletter.
- **~40 recurring reporters** with personalities, relationships to you, and memory. One is your nemesis: an insider reporter who breaks every story before you announce it — you can ban them (backfires), feed them leaks, or try to find their source (a mole hunt chain).
- **Press conferences:** reporters raise their hands; pick who to call on; answer with dialogue options (deflect, attack, joke, truth, "we'll see what happens," storm off). Each answer generates headlines.
- **Social feed** in the morning paper sidebar: procedurally generated posts reacting to events, with fighter accounts posting in their own style.
- **Headline generator:** 200+ templates with slot filling, varied by outlet bias.

---

## 9. Rival promotions & the world

- 3–4 AI rival promotions (a struggling regional one, a deep-pocketed foreign one, a "fighters-first" startup, a boxing promoter muscling in). They sign free agents, poach your fighters, hold events on your dates, and can collapse or merge.
- Your **corporate owner** (a faceless conglomerate) sets quarterly targets; missing them triggers memos, then audits, then a boardroom confrontation.
- **Athletic Commissions** per region with different rules; international events need visas and local permits.
- **Venues:** small arenas → big arenas → stadiums → "sphere-like" mega venue, outdoor rooftop events, a military base event, a desert-kingdom mega deal with ethics dilemmas.

---

## 10. CAREER MODE (target 15–25 hours)

Five acts. Each act introduces new mechanics and new rulebook pages so the game never plateaus.

**Act I — The Bus Tour (Year 1–2, ~3 hrs):** You've just bought a bankrupt cage-fighting league. Tiny venues, broke, shady regional fighters. Tutorialized desk mechanics: contracts, medicals, weigh-ins. Goal: land a cable TV deal. First marquee stars appear. Personal: the bank is calling.

**Act II — The Boom (Year 2–4, ~4 hrs):** A legendary fight goes viral; reality-TV recruitment show unlocked (pick contestants, house drama storylets). Drug testing program arrives (new document type). First big PPV stars, first big scandals, the Bail Office opens. Rival promotion #1 attacks.

**Act III — The Empire (Year 4–6, ~4 hrs):** International expansion (visas, foreign commissions), major network deal, women's divisions launch, superstar crossover-boxing temptation, the union drive begins. Choose a side venture (slap league / reality show / energy drink) — each with its own storylet chain.

**Act IV — The Sale (Year 6–8, ~4 hrs):** Corporate owner sells the promotion for billions to a mega-conglomerate. You stay as President but now answer to suits. Antitrust lawsuit escalates. Investigative journalist series. The President's personal Heat rises. Political-entanglement chain.

**Act V — The Legacy (Year 8–10, ~3–5 hrs):** Mega-venue event, the Troubled GOAT's final chapter, union showdown, lawsuit verdict, your own exit.

**Endings (8+), determined by meters and key flags:** e.g. "Billion-Dollar Ghost" (rich, hated), "The Fighters' Promoter" (paid fighters fairly, lower valuation, beloved), "Indicted", "Forced Out by the Board", "Sold Out to the Desert Kingdom", "Slap League Forever", "Went Into Politics", "Collapsed — Promotion Bankrupt", plus a secret ending. Each ending has an epilogue newspaper and fates for every marquee fighter.

**Difficulty:** Easy (more money, lenient citations), Normal, "Fight Week" (strict rules, tight clock), Ironman (one save).

---

## 11. SANDBOX MODE

- Pick starting scenario: tiny league, established mid-tier promotion, the dominant giant, or "just bought the giant with the union about to strike."
- Sliders: starting cash, scandal frequency, Chaos level, realism of fight sim, fighter greed, media hostility, commission strictness, rival aggression.
- Toggles: no corporate owner, infinite years, all legends active, cross-era "dream matches" (fight legends vs current stars), god mode (edit any fighter's stats/traits mid-game).
- **Editors:** fighter creator (portrait builder + traits + backstory writing), event builder, belt designer, import/export roster packs as JSON.
- Sandbox achievements separate from career.

---

## 12. UI screens checklist
Title screen (stylized arena facade, rain), New Career / Sandbox / Load / Settings / Credits; Morning Paper; The Desk (visitor window, document tray, rulebook, stamp tool, phone, inbox, calendar, cash box); Matchmaking Corkboard; Roster Filing Cabinet (fighter dossiers with tabs: bio, record, contract, legal, relationships, timeline); Rankings Wall; Fight Night (weigh-ins, presser, arena, post-fight); Bail Office; Boardroom; Ledger; Settings (text speed, UI scale, color-blind palette, reduce screen shake, mute).

---

## 13. Milestones (build in this order, keep each playable)

1. **Skeleton:** Vite + Pixi, pixel scaling, scene manager, seeded RNG, GameState, save/load, title screen.
2. **Fighter data & generator:** schema, namegen, procedural backstory generator, 250 generated fighters + 10 placeholder marquee, procedural portrait generator. Dossier screen.
3. **Fight sim + rankings + belts** (headless first, with tests), then Fight Night ticker UI.
4. **The Desk:** documents, stamping, rulebook, discrepancy-click system, citations, day clock. 6 document types.
5. **Week loop + economy + meters + ledger + morning paper** with headline generator.
6. **Storylet engine + validator + 60 storylets**, phone and office-visit dialogue UI, press conferences.
7. **Legal system + Bail Office**, scandal chains.
8. **Matchmaking corkboard**, contracts/negotiations, injuries, short-notice replacements.
9. **Media outlets & reporters with memory**, social feed.
10. **Rival promotions, corporate owner, commissions, venues.**
11. **Career Acts I–V, endings.**
12. **Sandbox mode + editors.**
13. **Content pass:** scale to 350+ storylets, 60 marquee fighters, 60 legends, 200+ headlines; run `npm run sim` across 50 seeds and fix anything that repeats too often or never fires.
14. **Polish:** audio, juice, accessibility, balance, bug bash.

## 14. Definition of done
- A full career is completable start → ending with no dead ends.
- Headless sim: across 50 seeds × 10 years, no single storylet fires in more than ~40% of weeks it's eligible; ≥85% of storylets fire in at least one seed; money curves stay in a sane band for balanced policy.
- All content files pass the validator; all tests pass; no console errors.
- A `CONTENT_GUIDE.md` explaining how to add fighters, storylets, documents and headlines.
