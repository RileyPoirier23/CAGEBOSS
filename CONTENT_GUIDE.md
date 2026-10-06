# CAGE BOSS: Content Guide

Everything the player reads lives in `data/` as plain JSON. You can edit the JSON
directly, but the big banks (storylets, commentary, pop-culture parodies, the
parody roster) are generated from small Python sources in `tools/`. Edit those
sources and rebuild, so your changes don't get overwritten.

After any content change:

```bash
python3 tools/storylets/build.py   # if you touched tools/storylets/*.py
npm run validate                   # catches broken expressions, unknown placeholders, bad ids
npm test                           # includes a validator run and content-size checks
npm run sim -- --seeds 3 --policy all --quiet   # storylet coverage & repetition report
```

## Where things live

| Folder / file | What | Source of truth |
|---|---|---|
| `data/storylets/*.json` | Events, phone calls, office visits, chains | `tools/storylets/*.py` |
| `data/documents/commentary.json` | Booth lines (Lon Anik, Blow Hogan, "Chicken Man" Sandwich Cormier, Braille Sonnen, Michael Biscuit) and Juiced Butler announcements | `tools/commentary_src.py` |
| `data/documents/popculture.json` | 700+ pop-culture parodies by kind | `tools/popculture_src.py` |
| `data/documents/templates.json` | Fight ticker lines, social posts, interview quotes, presser Q&A, the TV recap, slow-news filler | edit directly, or add R-rated lines in `tools/rrated_src.py` and run it (merges without duplicates) |
| R-rated booth lines | Extra-filthy commentary | `tools/commentary_rrated.py` (imported by `commentary_src.py`) |
| `data/documents/docs.json` | Paperwork ingredients: substances, doctors, scans, countries, expense items | edit directly |
| `data/roster/marquee.json`, `legends.json` | Hand-made parody fighters | `tools/roster_src.py` |
| `data/roster/generated.json` | Procedural depth roster | `npm run namegen -- --roster` (or `npx tsx tools/renick.ts` to re-roll just the nicknames) |
| `data/roster/names.json` nick tables | Nicknames by style, culture, trait, size and gender | edit directly |
| `data/roster/names.json` | Name tables per culture ("City\|Country" hometowns) | edit directly |
| `data/headlines/*.json` | Newspaper headlines, matched by tag | edit directly |
| `data/reporters`, `data/outlets` | The press | edit directly |
| `data/sponsors`, `data/venues` | Parody brands, arenas | edit directly |
| `data/rules/*.json` | Rulebook, officials (refs & judges and their quirks), rivals, networks, commissions, charges, acts, endings | edit directly |

## Storylets

A storylet is a little scene with choices. Write them with the Python DSL in
`tools/storylets/dsl.py`:

```python
S(FILE, 'stream_meltdown', 'Live Meltdown', 'fighter',
  [sc('social', "{subject.first} lost it live on stream to {subject.followers} people.")],
  [C("Make {him} take a break", "subject.morale -= 4", "media += 1", result="{He} lasts 36 hours.", default=True),
   C("Clip it as fight promo", "subject.hype += 8", "fans += 1", result="The promo is just the chair.", bot=2)],
  roles={"subject": F("f.ours && f.streaming")}, cd=30, chain='streamers')
```

- **Scenes**: `sc(type, text)`, or the shortcuts `phone(...)`, `visit(...)`, `doc(...)` and `memo(...)`. Types change the presentation: `phone`, `visit`, `doc`, `memo`, `social`, `headline`, `narration`, `presser`, `fightnight` and `boardroom`.
- **Roles**: who the story is about. `F(where, prefer)` binds a fighter, and the helpers `R()` reporter, `RIV()` rival promotion, `SP()` sponsor, `LEG()` legend and `FA()` free agent bind the others. Inside `where`, `f` is the candidate, e.g. `f.ours && f.age > 35 && f.traits.has('Hothead')`.
- **Conditions**: `cond="act >= 2 && fans > 40"`, built from globals such as `cash`, `debt`, `week`, `act`, the meters, `heat`, `patience`, `chaos`, `flag('x')` and `rivalsAlive`.
- **Choices**: `C(label, *effects, result=..., if_=..., bot=0..2, ethics=-3..3, default=True)`.
  - `bot` is how attractive the choice is to the greedy and chaos bots.
  - `ethics` feeds the endings.
  - Exactly one choice should be the `default` (used when a storylet expires).
- **Effects** are statements:
  - meters: `fans += 3`;
  - fighter fields: `subject.morale -= 5`;
  - flags: `flag.x = 1`;
  - functions: `follow('next_id', weeks)`, `earn('cat', amt)`, `spend('cat', amt)`, `injure(subject, weeks, 'name')`, `raise(subject, pct)`, `rivalry(a, b)`, `news('tag', tone, weight)`, `unlockVenue('id')`, `comeback(legend)`, `retire(subject)`, `release(subject)`, `toRival(subject)`, `meter('fans', d)`, `setFlag('k', v)`, `addFlag('k', d)`, `allFighters('morale', d)`, `endGame('id')`, and the others listed in `tools/validate.ts`.
  - Money uses `money(lo, hi)`, which scales with the promotion's size.
- **Chains**: give related storylets the same `chain=` id. Later beats are follow-ups: set `fu=True` and trigger them with `follow('id', weeks)` from an earlier choice. Follow-ups keep the same roles.
- **Pacing**: `cd` (cooldown in weeks), `weight`, `once=True`, `acts=[2, 3]`.

### Text placeholders

| Placeholder | Fills in |
|---|---|
| `{subject.first}`, `{subject.last}`, `{subject.nick}`, `{subject.gym}`… | Any role field |
| `{he} {his} {him} {He} {His}` | Pronouns for the first role |
| `{president}`, `{presidentLast}`, `{promotion}`, `{owner}` | The player's world |
| `{$fee}` | A storylet var, formatted as money (`vars={"fee": money(5, 15)}`) |
| `{pop}`, `{pop_movie}`, `{pop_show}`, `{pop_musician}`, `{pop_celeb}`, `{pop_game}`, `{pop_athlete}`, `{pop_food}`, `{pop_app}`, `{pop_streamer}`, `{pop_meme}`, `{pop_car}`, `{pop_brand}` | A random pop-culture parody of that kind. Works in storylets, news, social posts, commentary and fun facts. |

### Rating

The game is rated R: swearing and crude jokes are welcome. Players can switch on
**Settings → Bleep the swearing (streamer mode)**, which swaps swears for grawlix
(`#$%&!`) at render time (see `SWEARS` in `src/ui/text.ts`). No slurs, ever.

### The parody rule (important)

Marquee and legend fighters are pun-name parodies of real people (`"parody": "..."`).
They are **never** cast in criminal, doping, abuse or hate-speech material:

- Storylets in the `legal`, `doping` and `speech` categories skip parody fighters automatically.
- Put anything else that's dicey in one of those categories, or tag it `tags=['serious']`.
- The commentary engine only brings up "safe" controversy for parodies: weight misses, feuds, trash talk, losing streaks.

Keep parody jokes affectionate: their persona, fight style, catchphrases and famous moments.

## Commentary & the ring announcer

`tools/commentary_src.py` builds `commentary.json`.

- **Booth lines** are grouped by speaker and situation: `add('blow', 'bjj', "line", ...)`.
  - The engine (`src/sim/commentary.ts`) maps fight ticker events to situations: `wrestling`, `bjj`, `hurt`, `knockdown`, `finish_ko`, `decision`, `robbery`, `lull`, `round_end` and so on.
  - Each speaker has personal banks: `texted` and `name_mixup` for Sandwich Cormier, `controversy` and `stats` for Lon Anik, `fav_bjj`, `fav_wrestler` and `bias` for Blow Hogan, and `any` for the guests.
- **Placeholders** in booth lines:
  - `{x}`, `{y}` (the fighters), `{wn}` (Sandwich's mangled name), `{fact}` (a controversy), `{home}`, `{gym}`, `{coach}`, `{kids}`, `{ref}`, `{belt}`, `{winner}`, `{loser}`, `{venue}`, `{event}`.
  - Lines written in ALL CAPS stay shouted, names included.
- **Juiced Butler** keys: `open_*`, `its_time`, `blue`/`red`, `height`, `weight`, `origin`, `gym`, `record`, `fact_lead`, `champ_lead`, `juiced` (stage directions), `decision_*`, `new_champ`/`still_champ`, and `facts_generic`.

## Pop-culture parodies

Add lines to `tools/popculture_src.py` as `Real Thing|Parody Name`, under one of
these kinds: movie, show, musician, celeb, game, athlete, food, app, streamer,
meme, car or brand. Then run `python3 tools/popculture_src.py`. Use `{pop_<kind>}`
anywhere in text.

## Roster

`tools/roster_src.py` holds the marquee and legend tables. Each entry covers:

- name and nickname;
- the real person it parodies;
- look (head, skin, hair, beard, build and so on);
- skills;
- styles;
- traits;
- arc;
- animation stance, signature moves and celebration;
- starting promotion;
- purse.

Run `python3 tools/roster_src.py` afterwards.

## Checking your work

- `npm run validate` must say `Content OK`.
- `npm run sim -- --seeds 3 --policy all` reports which storylets never fire, and which fire in more than 40% of the weeks they're eligible. Lower the `weight` or raise the `cd` of anything flagged.
- `npm test` runs the whole suite, including a check for unfilled `{placeholders}` in commentary.
