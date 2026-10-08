# ID@Xbox application (draft)

ID@Xbox is Microsoft's free program for independent developers. It gives you the Xbox
development kit (the GDK), dev kits, and the right to publish on Xbox Series X|S, Xbox One
and the Microsoft Store on PC.

**Where:** id.xbox.com → "Apply". It's free. Microsoft checks the studio, you sign an NDA,
then they approve the game concept. After that you sign the publishing agreements and get
access to the GDK and Partner Center.

Everything below is written to paste in. Fill in the `[brackets]`.

---

## Studio

| Field | Answer |
|---|---|
| Studio / company name | 506Clicks |
| Legal entity | [Registered sole proprietorship, New Brunswick, Canada: your business number] |
| Contact name | Riley Poirier |
| Role | Founder, designer, programmer, artist |
| Email | [a business address on 506clicks.ca] |
| Website | https://506clicks.ca |
| Country | Canada |
| Team size | 1 (solo developer; music licensed from local artists) |
| Previously shipped titles | CAGE BOSS (Windows, Mac, Linux, free on 506clicks.ca, v2.0, October 2026) |
| Engine / technology | TypeScript + WebGL (PixiJS). Runs in a browser engine on PC; see the runtime question below |

## The game

**Title:** CAGE BOSS

**Genre:** Sports / management / fighting. Satirical MMA game.

**One-line pitch:** A pixel-art MMA game where you either fight your way from a church-basement
smoker to a world title, or run the whole promotion from behind a desk covered in forged
medicals.

**Short description (≈100 words):**
CAGE BOSS is a satirical pixel-art MMA game with three ways to play. In Road To Champion you
are Han "The Pride Of The Maritimes" Tibular, a lightweight prodigy from Moncton fighting to
save his uncle's soup-kitchen gym. Over five chapters you face a boss in every league, and
the story ends in a title superfight against an undefeated six-foot-seven champion. You
throw every punch yourself: directional strikes, a real clinch, a full ground game. Or be
the president of the promotion: work the desk *Papers, Please*-style, catch the doctored
medical, book the cards and survive the press conference. Local two-player versus included.

**Key features:**
- Story mode: five chapters, cutscenes, choices that stick, a boss fight in every league.
- Hands-on fighting: directional strikes, clinch ties and the fence, sixteen submissions,
  knockdowns, taunts.
- Promoter career: document inspection, contracts, fight cards, money, rivals, the press.
- Quick Fight and local two-player versus.
- 370+ fighters, and an original soundtrack by Atlantic Canadian artists.

**Target platforms:** Xbox Series X|S, Xbox One (if performance allows), Microsoft Store (PC).
**Xbox features planned:** achievements (34, already in the game), cloud saves, controller
support (already complete), local multiplayer (two controllers).
**Online multiplayer:** No. **In-game purchases:** No (full game, one price).
**Planned price:** US$14.99. **Target release:** [about 6 months after concept approval].
**Current state:** Complete and released on PC (v2.0). The console version is a port with
the same gameplay.
**Languages:** English.

**Media to attach:** the 2.0 trailer, 5 to 8 screenshots (fight, story cutscene, desk,
title screen, trophy case), and a link to the free PC build so they can play it.

## Technical question: how it runs on Xbox

> CAGE BOSS is written in TypeScript and renders with WebGL. The PC version ships in
> Electron. For Xbox we'd like to keep the game code identical and host it in a
> WebView2-based shell. We'd appreciate guidance on the currently supported path for a
> WebGL/HTML5 game under the GDK (WebView2 under Win32 GDK, or UWP packaging). If a native
> runtime is required, we plan to work with a porting partner (see `ENGINE.md`).

## Content and rating (IARC questionnaire answers)

Microsoft and Sony both use the free **IARC** questionnaire. Answer it honestly. Expect
**ESRB M (Mature 17+) / PEGI 16**.

| Question area | Answer |
|---|---|
| Violence | Yes. Realistic sport violence (MMA): punches, kicks, submissions, cuts, blood. No gore, no killing. |
| Blood | Yes, small amounts (cuts) |
| Language | Strong language (can be bleeped with a setting) |
| Sexual content | Crude humour and innuendo; no nudity |
| Drugs | References to performance-enhancing drugs and a drug test; no use shown in detail |
| Alcohol / tobacco | References (sponsors, jokes) |
| Gambling | Fictional betting odds shown; no real or simulated gambling |
| User interaction / chat | No |
| In-game purchases | No |
| Discriminatory content | No. Satire of the sport and its media; parodies of public figures are never shown committing crimes |

## After approval: checklist

1. Sign the Title License Agreement and the GDK agreement.
2. Get into Partner Center; reserve the name "CAGE BOSS".
3. Request dev kits (or a dev-mode console to start; see `ENGINE.md`).
4. Build: host the game (see `ENGINE.md`), wire achievements, cloud saves, user sign-in,
   suspend/resume and the Xbox Requirements (XR) checklist.
5. Store page: description, art (box art, hero, screenshots), the IARC rating, the price.
6. Submit for certification. Fix what comes back. Release.
