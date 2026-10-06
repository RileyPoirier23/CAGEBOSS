# Fighter Mode: design

Play one fighter's career instead of the promotion. Heavy inspiration from **Bruisers 2D Boxing** (real 2D boxing: slips, counters, head movement, distance control, light/medium/heavy punches, stamina, a life-sim career with meals, weight, vitals, a day job, stocking your corner, amateur → pro → bareknuckle circuits, real-time aging and accumulated damage). CAGE BOSS adapts that to MMA and keeps the Papers, Please desk feel and the R-rated satire.

## Pick your fighter
- Any fighter on the roster (parody legends, marquee parodies, generated fighters) or create one.
- Three base archetypes with distinct strengths and weaknesses: **Striker** (hand speed, counters, footwork), **Wrestler** (takedowns, top control, cardio), **Submission specialist** (scrambles, chains, off-back offence). Hybrids come from training.
- Content rule (unchanged): parodies of real people never get crime, doping or abuse storylines. When you play one of them, the PED, arrest and allegation systems are switched off and replaced by other drama (bad sparring partners, media beef, contract fights, injuries, a suspicious ex-manager suing over a sponsor deal). Generated and custom fighters get the full set.

## In the cage: controls
Controller first (Xbox layout); keyboard and touch pad mirror it. All bindings remappable.

| Action | Controller | Keyboard | Notes |
|---|---|---|---|
| Move / distance | Left stick | WASD | in/out controls range; up/down = level change |
| Lead hand | RB | J | tap = light, hold = heavy (slower, more stamina) |
| Rear hand | RT (analog) | K | stick toward = hook, down = uppercut, up = overhand |
| Block / parry | LB hold / LB tap | I | a timed parry opens a counter window |
| Slip / roll / pull | Right stick flick | Arrow keys | a successful slip slows time briefly: counter now |
| Kick | A | L | stick sets level: leg / body / head |
| Clinch / shoot | B hold | Space hold | toward the opponent |
| Sprawl | B tap when shot on | Space tap | timing window |
| Feint | Y | U | baits a counter or block |
| Ground: advance / reverse / stand up | Stick directions + A | WASD + L | positional ladder |
| Submission attack / escape | Stick rotation + button rhythm | WASD + J/K | tug of war meter |
| Get up after a knockdown | Alternate LT/RT on the beat | Alternate J/K | beat the count |

### Systems
- **Stamina:** one gas tank per round plus a long-term tank that drains across the fight. Heavy shots, missed shots, takedown attempts and being on the bottom cost the most. Low stamina slows hands and widens openings.
- **Damage:** head, body and legs tracked separately. Head damage leads to wobbles and knockdowns, body damage drains stamina recovery, and leg damage kills movement and kicks. Cuts and swelling come from specific strikes (elbows, heavy hooks).
- **Control time:** winning grappling exchanges and holding position demoralises the opponent (stamina and confidence drop), so you can win rounds without striking.
- **Gameplan:** chosen before the fight and adjusted between rounds (pressure, counter-strike, wrestle-heavy, leg-kick attrition, survive). It changes the AI opponent's reads, your stamina costs and the judges' lens.
- **Auto-sim option:** fights can also be simulated from the gameplan alone, using the existing fight sim, for players who want the career without the controls.

## Between rounds: you are the cutman
A 60-second corner mini-game (the round break):
- Ice pack on swelling (hold on the spot), Vaseline on brows and cheekbones, gauze pressure and adrenaline on cuts, the enswell to flatten a mouse, water and breathing to recover stamina.
- Coach advice with 2–3 choices that adjust the gameplan.
- Better staff = wider timing windows, slower bleeding, more stamina back. A bad cutman can get the fight stopped on a cut.
- You stock the corner before fight night with the budget you have (Bruisers-style "stock your corner").

## Fight week and career
- **Weekly planner:** train (skills), spar (gains, but bad sparring partners can injure you or leak footage), work a day job early on (money), media, rest. Every slot is a choice.
- **Meals and weight cut:** plan meals, track vitals (weight, hydration, energy, mood, damage). Cutting too hard hurts you on fight night or makes you miss weight, with a purse penalty and a news cycle.
- **Staff:** hire and fire a head coach, striking and grappling coaches, a cutman, a nutritionist and a manager. Your manager might be skimming: catch it on the desk.
- **Desk (Papers, Please feel kept):** inspect your own paperwork. Bout agreements (purse, weight, opponent), medicals, sponsor deals, manager invoices, commission forms. Spot the clause that screws you, the doctored opponent medical, the sponsor that's actually a crypto scam.
- **Media and rivalries:**
  - Bleet at other fighters, which can start a rivalry.
  - Watch other fights on the card and call people out.
  - When someone calls you out after their fight, choose how to respond (fire back, laugh it off, ignore, demand money). Every choice feeds storylines, matchmaking, hype and purses.
  - News outlets and reporters (including 1ton) cover it all.
- **Controversy:** exes spreading allegations (petty and ambiguous, played for satire), leaked sparring footage, bad interviews, contract disputes. For generated and custom fighters only: arrests and PEDs. PEDs are a real trade-off: faster gains now, test risk, suspension, stripped wins, long-term health cost.
- **Circuits:** amateur → regional promotions → CAGE BOSS (the promotion from the main mode) → title, plus an underground bareknuckle side circuit for fast cash and big risk.
- **Aging and damage:** the body accumulates damage across fights. Decline, injuries, comeback decisions and retirement end the run, and a legacy screen sums it up.

## Build order
1. Shared input layer and controller support (platform work in progress).
2. Real-time fight prototype: standing exchange (distance, punches, block, parry, slip, counter, stamina) using the existing rig and arena.
3. Clinch, takedowns, sprawl, ground ladder, submissions, get-ups.
4. Between-rounds cutman mini-game.
5. Fighter Mode career shell: pick a fighter, weekly planner, staff, weight cut, desk paperwork.
6. Media, callouts, rivalry responses and controversy chains.
7. Circuits, aging, legacy, balance pass, tutorial.
