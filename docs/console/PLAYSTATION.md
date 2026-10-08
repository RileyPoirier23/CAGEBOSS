# PlayStation Partners registration (draft)

Sony's program for developers. You register on the **PlayStation Partners** site, pick the
partnership type, enter the studio details, and send a short **Project Plan** (an "elevator
pitch", not a design document). Once approved you sign the **Global Developer and Publisher
Agreement (GDPA)**, and then you get the tools, documentation and dev kit ordering. Approval
doesn't mean Sony promotes the game; most indies on PlayStation succeed without a special
deal.

Use the same studio details as the Xbox application (`XBOX.md`). Fill in the `[brackets]`.

---

## Registration

| Field | Answer |
|---|---|
| Partnership type | Developer and publisher (self-publishing) |
| Company | 506Clicks [registered business, New Brunswick, Canada] |
| Contact | Riley Poirier, founder |
| Email | [business address on 506clicks.ca] |
| Website | https://506clicks.ca |
| Team size | 1 |
| Previous titles | CAGE BOSS (PC, Mac, Linux, 2026) |
| Target platforms | PlayStation 5 (PlayStation 4 if performance and budget allow) |

## Project Plan (the pitch)

**Title:** CAGE BOSS
**Style:** Satirical pixel-art MMA game: a story-driven fighting career plus a promotion
management sim. Hand-drawn pixel art, a scrolling-street title screen, broadcast-style fight
presentation with commentary and a fake social feed.

**Elevator pitch:**
Fight your way from a church-basement smoker to a world title, or run the whole promotion
from behind a desk covered in forged medicals. CAGE BOSS is MMA through a funhouse mirror:
five story chapters as Han "The Pride Of The Maritimes" Tibular, a boss in every league
(including a pickpocket leprechaun and a ref on the take), real hands-on fighting, and a
*Papers, Please*-style promoter mode.

**Two key features:**
1. **You throw every punch.** Directional strikes, clinch ties against the fence, a full
   ground game with sixteen submissions, knockdowns you have to jump on, and a taunt for
   every fighter. DualSense rumble on hits.
2. **Two games in one.** A five-chapter story career with cutscenes and choices, and a
   promoter career: inspect documents, book cards, manage money, rivals and the press.

**Other:** Quick Fight with local two-player versus. 34 trophies. An original soundtrack by
Atlantic Canadian artists. English only at launch.
**Business model:** premium, US$14.99, no in-game purchases.
**Target release:** [6 to 9 months after approval, depending on the porting route].
**Current state:** complete and released on PC (v2.0). The PlayStation version is a port
with the same gameplay.
**Rating expected:** ESRB M / PEGI 16 (IARC questionnaire answers are in `XBOX.md`).

**Attach:** trailer link, screenshots, a link to the free PC build.

## Technical note

There's no browser engine on PlayStation, so the PC build (TypeScript + WebGL in Electron)
can't just be wrapped. The plan in `ENGINE.md` keeps the gameplay code identical and swaps
only the platform layer, through a porting partner with PlayStation experience. Say this
plainly in the application: Sony will ask how the game gets onto the console.

## After approval: checklist

1. Sign the GDPA. Get the PS Partners portal, docs and the dev kit order form.
2. Choose and contract the porting partner (`ENGINE.md`), with a feasibility study first.
3. Wire trophies (the 34 achievements), saves, user accounts, suspend/resume, DualSense
   rumble, and the Technical Requirements Checklist (TRC).
4. IARC rating, store page (art, description, price, age rating).
5. Submit for certification. Fix, resubmit, release.
6. Optional: the **Independent Partner Title Form** in the portal puts the game on the radar
   of Sony's editorial and social teams (no guarantee of a feature).
