/**
 * The tutorial's lessons: plain data and text, no Pixi (tests and tools load it as is).
 *
 * Every lesson is a few steps; every step has a title, the PC / console text, the phone text
 * and (usually) a picture. `pic` names a screenshot in src/ui/guidepics.ts (made by
 * tools/tutorial/capture.cjs), a diagram guide.ts draws at runtime ('dirs:punch',
 * 'pose:sprawl/shoot@grab', 'pose-g:mTopPunch/mBot@rear'), or '' for none.
 *
 * PC text is written once for keyboard + mouse and controller: [tokens] expand to the
 * device's words (see expand()), and 'keyboard text || controller text' splits a step that
 * needs different sentences. Phone text is written out in full (tap, the touch pad's labels).
 *
 * The runtime engine (cards, pictures, marks, the TUTORIALS list, when lessons run) is
 * src/ui/guide.ts; src/ui/tutorial.ts keeps the old entry points.
 */
import { DEFAULT_FIGHT_BINDINGS, type FightButton } from '../core/fightinput';
import { padName } from './hints';

export type LessonGroup = 'start' | 'promoter' | 'rtc' | 'fighting' | 'quick';
/** career = promoter careers, fighter = Road To Champion / Legacy, fight = hands-on fights, any = anywhere */
export type LessonMode = 'career' | 'fighter' | 'fight' | 'any';
export interface LessonStep {
  title: string;
  pc: string;
  phone: string;
  pic?: string;
}
export interface Lesson {
  key: string;
  group: LessonGroup;
  mode: LessonMode;
  title: string;
  blurb: string;
  steps: LessonStep[];
  /** after GOT IT on an auto lesson: point at this button (exact label, 'PREFIX*', or '@bout' = the desk's agreement row) */
  tryIt?: string;
}

export const LESSONS: Lesson[] = [
  {
    key: "basics", group: "start", mode: "any", title: "THE BASICS", blurb: "Modes, menus, saving, where the help lives",
    steps: [
      {
        title: "PICK A MODE", pic: "basics_1",
        pc: "[click] MODES on the title screen. PROMOTER: run the company. ROAD TO CHAMPION: Han's story, with hands-on fights. QUICK FIGHT: one fight, right now. SANDBOX: the promoter game with no rules. LEGACY MODE unlocks when you finish the story.",
        phone: "Tap MODES on the title screen. PROMOTER: run the company. ROAD TO CHAMPION: Han's story, with hands-on fights. QUICK FIGHT: one fight, right now. SANDBOX: the promoter game with no rules. LEGACY MODE unlocks when you finish the story.",
      },
      {
        title: "SAVING", pic: "basics_2",
        pc: "Every mode autosaves each week and keeps its own save slots. MENU > SAVE puts the game in a slot of your own, and CONTINUE on the title screen picks up your latest game. Ironman careers only get the autosave. No pressure.",
        phone: "Every mode autosaves each week and keeps its own save slots. MENU > SAVE puts the game in a slot of your own, and CONTINUE on the title screen picks up your latest game. Ironman careers only get the autosave. No pressure.",
      },
      {
        title: "MENU, TUTORIALS, HELP", pic: "basics_3",
        pc: "MENU[k:ESC] sits on every main screen: save, load, SETTINGS (text size and speed, audio, hands-on fights), TUTORIALS (every lesson, any time) and HELP (every rule and move, written down). In a fight, [pause] pauses.",
        phone: "MENU sits on every main screen: save, load, SETTINGS (text size and speed, audio, hands-on fights), TUTORIALS (every lesson, any time) and HELP (every rule and move, written down). In a fight, PAUSE is top right.",
      },
    ],
  },
  {
    key: "paper", group: "promoter", mode: "career", title: "THE MORNING PAPER", blurb: "The news, the owner and your clout", tryIt: "TO THE DESK →",
    steps: [
      {
        title: "THE DAILY CLINCH", pic: "paper_1",
        pc: "Every week starts with the paper. The front page is whatever the internet is yelling about, plus whatever your fighters did last week. Injuries, scandals and grudges show up here first. THE FEED on the right is the comments section.",
        phone: "Every week starts with the paper. The front page is whatever the internet is yelling about, plus whatever your fighters did last week. Injuries, scandals and grudges show up here first. THE FEED on the right is the comments section.",
      },
      {
        title: "CLOUT & THE OWNER", pic: "paper_2",
        pc: "On the right: your league tier and CLOUT. The owner sets objectives (OWNER WANTS). Hit them for clout, and clout unlocks the good stuff: the Contender Series, scouting, bigger rooms, PPV, international shows.",
        phone: "On the right: your league tier and CLOUT. The owner sets objectives (OWNER WANTS). Hit them for clout, and clout unlocks the good stuff: the Contender Series, scouting, bigger rooms, PPV, international shows.",
      },
      {
        title: "THE CAREER PANEL", pic: "paper_3",
        pc: "[click] CAREER (bottom right) any time for the ladder, every unlock and its price in clout, and the owner's objectives with their deadlines. Miss too many and he starts interviewing other bald men.",
        phone: "Tap CAREER (bottom right) any time for the ladder, every unlock and its price in clout, and the owner's objectives with their deadlines. Miss too many and he starts interviewing other bald men.",
      },
      {
        title: "TO THE DESK", pic: "paper_4",
        pc: "Done reading? [click] TO THE DESK[k:ENTER]. That's where the actual work (and the actual lying) happens.",
        phone: "Done reading? Tap TO THE DESK. That's where the actual work (and the actual lying) happens.",
      },
    ],
  },
  {
    key: "desk", group: "promoter", mode: "career", title: "THE DESK", blurb: "Paperwork: read it, inspect it, stamp it", tryIt: "@bout",
    steps: [
      {
        title: "THE INBOX", pic: "desk_1",
        pc: "Paperwork lands in the INBOX (right). [click] a row to put it on the desk; bout agreements first. CALL and DOOR rows are people waiting for you. BAIL! means somebody is in a cell. Again.",
        phone: "Paperwork lands in the INBOX (right). Tap a row to put it on the desk; bout agreements first. CALL and DOOR rows are people waiting for you. BAIL! means somebody is in a cell. Again.",
      },
      {
        title: "READ IT", pic: "desk_2",
        pc: "The paper sits in the middle: fighter, weight class, purse, win bonus, date, signature. All of it has to line up with what you agreed and with the rulebook. Managers 'round up'. Forgers count on you skimming.",
        phone: "The paper sits in the middle. Tap READ (or the paper) to read it big, stamps underneath. Fighter, weight class, purse, bonus, date, signature: all of it has to match what you agreed. Managers 'round up'.",
      },
      {
        title: "THE FILE CARD", pic: "desk_3",
        pc: "Left: the FILE CARD, what's on record: his division, the purse and bonus you negotiated, his real signature. When the paper and the file card disagree, the paper is lying. Here: look at the purse.",
        phone: "Left: the FILE CARD, what's on record: his division, the purse and bonus you negotiated, his real signature. When the paper and the file card disagree, the paper is lying. Here: look at the purse.",
      },
      {
        title: "INSPECT", pic: "desk_4",
        pc: "[click] INSPECT[k:I] (the lamp). Then [click-l] a line on the paper, then the line it should match on the file card: SHOW PURSE, then PURSE. Wrong pair? 'No discrepancy.' Try another.",
        phone: "Tap INSPECT (the lamp). Then tap a line on the paper, then the line it should match on the file card: SHOW PURSE, then PURSE. Wrong pair? 'No discrepancy.' Try another.",
      },
      {
        title: "CAUGHT ONE", pic: "desk_5",
        pc: "Got it: a red string ties the two lines together and the strip says what's wrong. [click] ASK[k:Q] and the visitor explains: excuses, a corrected paper, or an envelope. Envelopes have a way of resurfacing.",
        phone: "Got it: a red string ties the two lines together and the strip says what's wrong. Tap ASK and the visitor explains: excuses, a corrected paper, or an envelope. Envelopes have a way of resurfacing.",
      },
      {
        title: "STAMP IT", pic: "desk_6",
        pc: "Clean: APPROVED[k:A]. Wrong: DENIED[k:D]. ESCALATE[k:E] sends it to legal (safe, but slow, and it costs a fee). BURY[k:B] makes it vanish, for now. Approve a broken rule and the Commission writes you a citation.",
        phone: "Clean: APPROVED. Wrong: DENIED. ESCALATE sends it to legal (safe, but slow, and it costs a fee). BURY makes it vanish, for now. Approve a broken rule and the Commission writes you a citation.",
      },
      {
        title: "THE RULEBOOK", pic: "desk_7",
        pc: "The blue RULEBOOK[k:R] (bottom left) lists every rule in force and opens on the page for the paper in front of you. New rules arrive as a Commission BULLETIN: read it, FILE IT, and expect to be tested on it.",
        phone: "The blue RULEBOOK (bottom left) lists every rule in force and opens on the right page; < > flips, + - zooms. New rules arrive as a Commission BULLETIN: read it, FILE IT, and expect a test.",
      },
      {
        title: "RUN IT, THEN GO HOME", pic: "desk_8",
        pc: "Up top: CASH and six meters (fans, fighters, media, Commission, network, sponsors). ROSTER signs fighters, CARDS books fights, INBOX holds offers and citations. Inbox done? END DAY. On fight week it takes you to fight night.",
        phone: "Up top: CASH and six meters (fans, fighters, media, Commission, network, sponsors). ROSTER signs fighters, CARDS books fights, INBOX holds offers and citations. Inbox done? END DAY. On fight week it takes you to fight night.",
      },
    ],
  },
  {
    key: "desk_calls", group: "promoter", mode: "career", title: "CALLS & VISITORS", blurb: "The wall phone, the doorway and the clock",
    steps: [
      {
        title: "THE PHONE IS RINGING", pic: "calls_1",
        pc: "That ringing is the wall phone. [click] it, or the CALL row in the inbox, to pick up. Let it ring out and the call waits in the inbox, light blinking, getting angrier.",
        phone: "That ringing (and buzzing) is the wall phone. Tap it, or the CALL row in the inbox, to pick up. Let it ring out and the call waits in the inbox, light blinking, getting angrier.",
      },
      {
        title: "PICK AN ANSWER", pic: "calls_2",
        pc: "A call or a visit plays as a scene: who it is, what they want, and two or three answers. [click] one. Every answer moves money, meters or people. There's rarely a right one. There's often a funny one.",
        phone: "A call or a visit plays as a scene: who it is, what they want, and two or three answers. Tap one. Every answer moves money, meters or people. There's rarely a right one. There's often a funny one.",
      },
      {
        title: "SOMEONE AT THE DOOR", pic: "calls_3",
        pc: "Visitors wait in the doorway: fighters, managers, reporters, men with 'opportunities'. [click] their DOOR row in the inbox to let them talk. Every call and visit eats 20 minutes of your shift.",
        phone: "Visitors wait in the doorway: fighters, managers, reporters, men with 'opportunities'. Tap their DOOR row in the inbox to let them talk. Every call and visit eats 20 minutes of your shift.",
      },
      {
        title: "THE CLOCK", pic: "calls_4",
        pc: "The wall clock runs 9 to 6 and everything costs minutes. At 6 the shift ends: paperwork rolls over (and rots), and every call or visit you dodged gets your default answer. It's usually the worst one.",
        phone: "The wall clock runs 9 to 6 and everything costs minutes. At 6 the shift ends: paperwork rolls over (and rots), and every call or visit you dodged gets your default answer. It's usually the worst one.",
      },
    ],
  },
  {
    key: "desk_docs", group: "promoter", mode: "career", title: "OTHER PAPERWORK", blurb: "Medicals, expense reports, weigh-in sheets, bail",
    steps: [
      {
        title: "MEDICALS", pic: "docs_1",
        pc: "Some papers have no file-card twin. A MEDICAL is checked against the RULEBOOK: is the doctor on the registry, are the scans the required ones, is the exam recent enough? INSPECT compares rulebook lines too.",
        phone: "Some papers have no file-card twin. A MEDICAL is checked against the RULEBOOK: is the doctor on the registry, are the scans the required ones, is the exam recent enough? INSPECT compares rulebook lines too.",
      },
      {
        title: "EXPENSE REPORTS", pic: "docs_2",
        pc: "Camp EXPENSE REPORTS bring out the CALC-U-LOSER 3000[k:C]: it adds up the line items for you. If SUM and CLAIMED don't match, hit CITE IT. Check each line against the expense cap in the rulebook, too.",
        phone: "Camp EXPENSE REPORTS bring out the CALC-U-LOSER 3000: it adds up the line items for you. If SUM and CLAIMED don't match, hit CITE IT. Check each line against the expense cap in the rulebook, too.",
      },
      {
        title: "WEIGH-IN SHEETS", pic: "docs_3",
        pc: "Fight week brings WEIGH-IN sheets, and the stamps change: FIGHT AS IS, CANCEL BOUT, ESCALATE for a catchweight (he forfeits 25% of his purse), BURY for 'the scale broke'. Cancel a bout and you pick a replacement.",
        phone: "Fight week brings WEIGH-IN sheets, and the stamps change: FIGHT AS IS, CANCEL BOUT, ESCALATE for a catchweight (he forfeits 25% of his purse), BURY for 'the scale broke'. Cancel a bout and you pick a replacement.",
      },
      {
        title: "BAIL, COURT, PRESS", pic: "",
        pc: "BAIL! means one of yours is in a cell: open it to visit the bail office. COURT papers decide whether a fighter with a case stays on the card. Press passes: check the outlet and the banned-reporter list.",
        phone: "BAIL! means one of yours is in a cell: open it to visit the bail office. COURT papers decide whether a fighter with a case stays on the card. Press passes: check the outlet and the banned-reporter list.",
      },
    ],
  },
  {
    key: "cards", group: "promoter", mode: "career", title: "BOOKING A CARD", blurb: "The corkboard: rooms, bouts, running order", tryIt: "+ ADD BOUT",
    steps: [
      {
        title: "THE CORKBOARD", pic: "cards_1",
        pc: "Each upcoming event has a tab along the top. The white card is the event: date, venue and seats, TV or PPV, and the money: DRAW, estimated GATE and the PURSES you owe. Book cards where the gate beats the purses.",
        phone: "Each upcoming event has a tab along the top. The white card is the event: date, venue and seats, TV or PPV, and the money: DRAW, estimated GATE and the PURSES you owe. Book cards where the gate beats the purses.",
      },
      {
        title: "PICK THE ROOM", pic: "cards_2",
        pc: "[click] VENUE to pick the room. Bigger rooms sell more tickets and cost more, and the owner unlocks the good ones. The Strip Mall Fight Pit holds 400 people and a nail salon. Empty seats look terrible on TV.",
        phone: "Tap VENUE to pick the room. Bigger rooms sell more tickets and cost more, and the owner unlocks the good ones. The Strip Mall Fight Pit holds 400 people and a nail salon. Empty seats look terrible on TV.",
      },
      {
        title: "ADD A BOUT", pic: "cards_3",
        pc: "+ ADD BOUT (bottom left) lists everyone you can book. Filter by division, [click-l] a fighter, then his opponent. OVR is how good we think he is (? = unscouted). STAR is how many tickets he sells.",
        phone: "+ ADD BOUT (bottom left) lists everyone you can book. Filter by division, tap a fighter, then his opponent. OVR is how good we think he is (? = unscouted). STAR is how many tickets he sells.",
      },
      {
        title: "THE RUNNING ORDER", pic: "cards_4",
        pc: "Top row is the MAIN EVENT (5 rounds), then co-main, main card, prelims. ↑ ↓ reorder, X cancels, TITLE makes it a title fight. A red PROBLEM (injured, arrested) gets a REPLACE button. Fighters need 5 weeks between fights.",
        phone: "Top row is the MAIN EVENT (5 rounds), then co-main, main card, prelims. ↑ ↓ reorder, X cancels, TITLE makes it a title fight. A red PROBLEM (injured, arrested) gets a REPLACE button. Fighters need 5 weeks between fights.",
      },
      {
        title: "AUTO-FILL & NEW SHOWS", pic: "cards_5",
        pc: "Busy (or lazy)? AUTO-FILL books a whole card; check what it did, because it doesn't care about grudges. + NEW EVENT schedules another show: a TV Fight Night, or a numbered event (PPV once you've unlocked it).",
        phone: "Busy (or lazy)? AUTO-FILL books a whole card; check what it did, because it doesn't care about grudges. + NEW EVENT schedules another show: a TV Fight Night, or a numbered event (PPV once you've unlocked it).",
      },
    ],
  },
  {
    key: "signing", group: "promoter", mode: "career", title: "SIGNING FIGHTERS", blurb: "The filing cabinet, scouting, contract talks",
    steps: [
      {
        title: "THE FILING CABINET", pic: "sign_1",
        pc: "ROSTER opens the filing cabinet. OURS is your roster, FREE is everyone you can sign, RIVALS work for the competition, LEGENDS are retired. [click] a name for the dossier: bio, skills, record, contract, legal trouble.",
        phone: "ROSTER opens the filing cabinet. OURS is your roster, FREE is everyone you can sign, RIVALS work for the competition, LEGENDS are retired. Tap a name for the dossier: bio, skills, record, contract, legal trouble.",
      },
      {
        title: "SCOUT FIRST", pic: "sign_2",
        pc: "OVR and POT with a ? are guesses. BUY TAPE, SEND SCOUT and FULL WORKUP sharpen them and reveal money sense and hidden traits. Signing an unscouted 'prospect' is how you end up paying a man who hates cardio.",
        phone: "OVR and POT with a ? are guesses. BUY TAPE, SEND SCOUT and FULL WORKUP sharpen them and reveal money sense and hidden traits. Signing an unscouted 'prospect' is how you end up paying a man who hates cardio.",
      },
      {
        title: "THE TABLE", pic: "sign_3",
        pc: "OFFER CONTRACT starts talks. Left: THEIR ASK (show money, win bonus, number of fights). Right: YOUR OFFER, set with - and +. Every offer they turn down costs a PATIENCE star (an insult costs two), and a rival bid raises the price.",
        phone: "OFFER CONTRACT starts talks. Left: THEIR ASK (show money, win bonus, number of fights). Right: YOUR OFFER, set with - and +. Every offer they turn down costs a PATIENCE star (an insult costs two), and a rival bid raises the price.",
      },
      {
        title: "HAGGLE", pic: "sign_4",
        pc: "MAKE OFFER and they answer: yes, a counter (they meet you partway and the sliders reset near it) or a walk. MEET THEIR ASK signs it now, LET THEM WALK ends it, LATER keeps it in your inbox as a $$ row.",
        phone: "MAKE OFFER and they answer: yes, a counter (they meet you partway and the sliders reset near it) or a walk. MEET THEIR ASK signs it now, LET THEM WALK ends it, LATER keeps it in your inbox as a $$ row.",
      },
    ],
  },
  {
    key: "fightnight", group: "promoter", mode: "career", title: "FIGHT NIGHT", blurb: "Press, the card, watching, bonuses", tryIt: "START THE EVENT →",
    steps: [
      {
        title: "PRESS, THEN FIGHTS", pic: "fn_1",
        pc: "Fight night opens on the main event face-off. Do up to two PRESS CONFERENCES first if you want (hype in, dignity out), then [click-l] START THE EVENT.",
        phone: "Fight night opens on the main event face-off. Do up to two PRESS CONFERENCES first if you want (hype in, dignity out), then tap START THE EVENT.",
      },
      {
        title: "WATCH OR SIM", pic: "fn_2",
        pc: "Prelims first, main event last. WATCH a bout to see it live with the booth and Bleeter, or SIM it for just the result. SIM ALL PRELIMS and SIM EVERYTHING (bottom) hurry things along.",
        phone: "Prelims first, main event last. WATCH a bout to see it live with the booth and Bleeter, or SIM it for just the result. SIM ALL PRELIMS and SIM EVERYTHING (bottom) hurry things along.",
      },
      {
        title: "WATCHING", pic: "fn_3",
        pc: "While you watch: the speed (SLOW to BLITZ), PAUSE, CAM (side, TV or top-down), NEXT RND and HIGHLIGHTS (rushes the quiet stretches), and SKIP TO END. Big moments get an instant replay. Between rounds the corners patch up their guys.",
        phone: "While you watch: the speed (SLOW to BLITZ), PAUSE, CAM (side, TV or top-down), NEXT RND and HIGHLIGHTS (rushes the quiet stretches), and SKIP TO END. Big moments get an instant replay. Between rounds the corners patch up their guys.",
      },
      {
        title: "BONUSES", pic: "fn_4",
        pc: "After the last bout: PERFORMANCE BONUSES (the price is at the top). [click] a fighter to pay him. Fighters remember who got paid and who got skipped, and they tell the press. Then the post-fight presser and the TV recap.",
        phone: "After the last bout: PERFORMANCE BONUSES (the price is at the top). Tap a fighter to pay him. Fighters remember who got paid and who got skipped, and they tell the press. Then the post-fight presser and the TV recap.",
      },
    ],
  },
  {
    key: "ledger", group: "promoter", mode: "career", title: "THE LEDGER", blurb: "Money in, money out, the owner's target", tryIt: "NEXT WEEK →",
    steps: [
      {
        title: "THE BOOKS", pic: "led_1",
        pc: "Sunday night: the books. INCOME on the left (gates, PPV, TV, sponsors), EXPENSES on the right (purses, staff, rent, fines, your 'lifestyle'). Your own wealth is separate, at the bottom. Keep it that way.",
        phone: "Sunday night: the books. INCOME on the left (gates, PPV, TV, sponsors), EXPENSES on the right (purses, staff, rent, fines, your 'lifestyle'). Your own wealth is separate, at the bottom. Keep it that way.",
      },
      {
        title: "THE TARGET", pic: "led_2",
        pc: "NET THIS WEEK is the bottom line. The owner's quarterly target (Q-TARGET, with SO FAR next to it) is what keeps you employed. The meter row shows who's happy with you this week.",
        phone: "NET THIS WEEK is the bottom line. The owner's quarterly target (Q-TARGET, with SO FAR next to it) is what keeps you employed. The meter row shows who's happy with you this week.",
      },
      {
        title: "THAT'S THE LOOP", pic: "led_3",
        pc: "[click] NEXT WEEK. Paper, desk, card, fight night, ledger, repeat, until you're a global juggernaut or in prison. Every lesson is in MENU > TUTORIALS whenever you need one.",
        phone: "Tap NEXT WEEK. Paper, desk, card, fight night, ledger, repeat, until you're a global juggernaut or in prison. Every lesson is in MENU > TUTORIALS whenever you need one.",
      },
    ],
  },
  {
    key: "contender", group: "promoter", mode: "career", title: "CONTENDER SERIES", blurb: "Prospects fight for a contract",
    steps: [
      {
        title: "TUESDAY NIGHT", pic: "",
        pc: "Every fourth Tuesday, hungry prospects fight for a contract. WATCH THE SHOW or SIM THE CARD, same as fight night. Nobody here is famous yet, which is what makes them cheap.",
        phone: "Every fourth Tuesday, hungry prospects fight for a contract. WATCH THE SHOW or SIM THE CARD, same as fight night. Nobody here is famous yet, which is what makes them cheap.",
      },
      {
        title: "WHO GETS SIGNED?", pic: "",
        pc: "DECISION TIME: OFFER A CONTRACT to the ones you want. Winners are cheaper now than they will ever be again. Losers go home, and some come back on a later card, angrier.",
        phone: "DECISION TIME: OFFER A CONTRACT to the ones you want. Winners are cheaper now than they will ever be again. Losers go home, and some come back on a later card, angrier.",
      },
      {
        title: "BACK TO WORK", pic: "",
        pc: "DONE takes you back to the week. New signings join your roster: book them low on the card and let them grow (or get exposed).",
        phone: "DONE takes you back to the week. New signings join your roster: book them low on the card and let them grow (or get exposed).",
      },
    ],
  },
  {
    key: "fmhub", group: "rtc", mode: "fighter", title: "YOUR WEEK", blurb: "You, your actions, offers, Bleeter", tryIt: "TRAIN*",
    steps: [
      {
        title: "THIS IS YOU", pic: "hub_1",
        pc: "Your record and rank, then your condition: ENERGY and MORALE decide how much training sticks, HYPE moves you up the card, HEALTH is what's left of you. WEIGHT is walk-around / limit, and the limit is the number that matters.",
        phone: "Your record and rank, then your condition: ENERGY and MORALE decide how much training sticks, HYPE moves you up the card, HEALTH is what's left of you. WEIGHT is walk-around / limit, and the limit is the number that matters.",
      },
      {
        title: "THREE ACTIONS A WEEK", pic: "hub_2",
        pc: "THIS WEEK has three actions (the gold pips). TRAIN, SPAR, CUT WEIGHT, WORK A SHIFT, REST, GO OUT and BLEETER cost one each. PAPERWORK, CONDITION & CLINIC, STAFF and RANKINGS are free. Use them.",
        phone: "Three actions a week (the gold pips). TRAIN, SPAR, CUT WEIGHT, WORK A SHIFT, REST, GO OUT and BLEETER cost one each. PAPERWORK, CLINIC, STAFF, RANKINGS and THE FEED are free. Use them.",
      },
      {
        title: "FIGHT OFFERS", pic: "hub_3",
        pc: "Promoters send FIGHT OFFERS: opponent, record, purse + win bonus, fight week. SIGN one and the bout agreement lands in PAPERWORK. No offers? Train, win the internet, hire a manager.",
        phone: "Promoters send offers: tap SEE OFFERS, then SIGN the one you want. The bout agreement lands in PAPERWORK. No offers? Train, win the internet, hire a manager.",
      },
      {
        title: "BLEETER", pic: "hub_4",
        pc: "BLEETER (one action) is the internet. Call out a ranked fighter to start beef (and maybe get the fight), DM Bradie for an Only Fighters account, or post something wholesome for morale. Hype sells tickets and moves you up the card.",
        phone: "BLEETER (one action) is the internet. Call out a ranked fighter to start beef (and maybe get the fight), DM Bradie for an Only Fighters account, or post something wholesome for morale. Hype sells tickets and moves you up the card.",
      },
      {
        title: "DIET, CLINIC, STAFF", pic: "hub_5",
        pc: "DIET (under your bars): Clean costs more and keeps weight off, Junk is cheap and it shows. CONDITION & CLINIC treats injuries. STAFF hires a coach, nutritionist, manager and cutman: better staff, better everything.",
        phone: "DIET (under your bars): Clean costs more and keeps weight off, Junk is cheap and it shows. CLINIC treats injuries. STAFF hires a coach, nutritionist, manager and cutman: better staff, better everything.",
      },
      {
        title: "END THE WEEK", pic: "hub_6",
        pc: "Out of actions? END WEEK. On fight week it turns into WEIGH-IN. MENU (bottom left) has saves, settings and TUTORIALS. Win your league's belt and the next promotion comes calling.",
        phone: "Out of actions? END WEEK. On fight week it turns into WEIGH-IN. MENU (bottom left) has saves, settings and TUTORIALS. Win your league's belt and the next promotion comes calling.",
      },
    ],
  },
  {
    key: "fm_train", group: "rtc", mode: "fighter", title: "TRAINING", blurb: "Skills, condition, mini games, sparring",
    steps: [
      {
        title: "PICK A SKILL", pic: "train_1",
        pc: "Each bar is a skill. The gold sliver is what one session adds, plus a bit to a related skill (in brackets). [click] TRAIN on whatever your next opponent will punish. HEART only comes from real fights.",
        phone: "Each bar is a skill. The gold sliver is what one session adds, plus a bit to a related skill (in brackets). Tap TRAIN on whatever your next opponent will punish. HEART only comes from real fights.",
      },
      {
        title: "CONDITION", pic: "train_2",
        pc: "The line at the bottom is your CONDITION: PEAK CONDITION trains at up to x1.6. Tired, sore or miserable and the same session is worth far less. REST and the odd night out are part of training. Mostly REST.",
        phone: "The line at the bottom is your CONDITION: PEAK CONDITION trains at up to x1.6. Tired, sore or miserable and the same session is worth far less. REST and the odd night out are part of training. Mostly REST.",
      },
      {
        title: "MINI GAMES", pic: "train_3",
        pc: "JUMP ROPE (cardio) and TYRE CHOP (power) replace a normal session: a good score beats it, a bad one doesn't. Same cost, one action. You get the controls when you start one.",
        phone: "JUMP ROPE (cardio) and TYRE CHOP (power) replace a normal session: a good score beats it, a bad one doesn't. Same cost, one action. You get the controls when you start one.",
      },
      {
        title: "SPARRING", pic: "train_4",
        pc: "SPAR is the big-gains option. PAID PROS ($150) are careful; WHOEVER SHOWS UP goes 100%, hurts you and sometimes films it. Good rounds earn SPARRING POINTS: spend them on any skill from the hub.",
        phone: "SPAR is the big-gains option. PAID PROS ($150) are careful; WHOEVER SHOWS UP goes 100%, hurts you and sometimes films it. Good rounds earn SPARRING POINTS: spend them on any skill from the hub.",
      },
    ],
  },
  {
    key: "fm_rope", group: "rtc", mode: "fighter", title: "JUMP ROPE", blurb: "Timing mini game for cardio",
    steps: [
      {
        title: "HIT THE LINE", pic: "rope_1",
        pc: "Blue markers slide toward the gold line. Press [ok] the moment one crosses it. Right on it is PERFECT, close is GOOD. Too early or too late and Han trips over his own rope.",
        phone: "Blue markers slide toward the gold line. Tap anywhere on the panel the moment one crosses it. Right on it is PERFECT, close is GOOD. Too early or too late and Han trips over his own rope.",
      },
      {
        title: "IT SPEEDS UP", pic: "rope_2",
        pc: "Twenty jumps, each a little faster (the count is top right). Your score is how many you landed, perfects worth more, and it scales the session's cardio gains and the weight it burns.",
        phone: "Twenty jumps, each a little faster (the count is top right). Your score is how many you landed, perfects worth more, and it scales the session's cardio gains and the weight it burns.",
      },
      {
        title: "OR SKIP IT", pic: "rope_3",
        pc: "Not feeling it? SKIP, top right[kp:ESC|B], ends it with a 40% score, worse than a normal session. Better to jump badly than not at all.",
        phone: "Not feeling it? SKIP (top right) ends it with a 40% score, worse than a normal session. Better to jump badly than not at all.",
      },
    ],
  },
  {
    key: "fm_tyre", group: "rtc", mode: "fighter", title: "TYRE & SLEDGEHAMMER", blurb: "Hold-and-release mini game for power",
    steps: [
      {
        title: "RAISE THE HAMMER", pic: "tyre_1",
        pc: "Hold [hold] to raise the sledgehammer. While you hold it, the gold needle on the meter (left) sweeps up and down, faster with every swing.",
        phone: "Hold a finger on the panel to raise the sledgehammer. While you hold, the gold needle on the meter (left) sweeps up and down, faster with every swing.",
      },
      {
        title: "LET GO IN THE GREEN", pic: "tyre_2",
        pc: "Let go while the needle is inside the green band: dead centre is CRUNCH!, close is SOLID, anything else is MEH or WHIFF. The green moves every swing. Ten swings, then the score sets your power gains.",
        phone: "Let go while the needle is inside the green band: dead centre is CRUNCH!, close is SOLID, anything else is MEH or WHIFF. The green moves every swing. Ten swings, then the score sets your power gains.",
      },
      {
        title: "OR SKIP IT", pic: "tyre_3",
        pc: "Not feeling it? SKIP, top right[kp:ESC|B], ends it with a 40% score, worse than a normal session. A bad swing still beats no swing.",
        phone: "Not feeling it? SKIP (top right) ends it with a 40% score, worse than a normal session. A bad swing still beats no swing.",
      },
    ],
  },
  {
    key: "fm_paper", group: "rtc", mode: "fighter", title: "YOUR PAPERWORK", blurb: "The kitchen table: inspect, sign, dispute", tryIt: "INSPECT*",
    steps: [
      {
        title: "THE KITCHEN TABLE", pic: "kt_1",
        pc: "Inbox on the left, the document in the middle, and on the right WHAT YOU AGREED: the offer you signed, your file, the Commission's rules. The two should match. Promoters 'forget' things. So does Bradie.",
        phone: "Inbox on the left, the document in the middle, and on the right WHAT YOU AGREED: the offer you signed, your file, the Commission's rules. The two should match. Promoters 'forget' things. So does Bradie.",
      },
      {
        title: "INSPECT IT", pic: "kt_2",
        pc: "[click] INSPECT[k:I], then a line on the document, then the line it should match on the right. This WIN BONUS says $0; you agreed $150. Catch it and a red string ties the two together.",
        phone: "Tap INSPECT, then a line on the document, then the line it should match on the right. This WIN BONUS says $0; you agreed $150. Catch it and a red string ties the two together.",
      },
      {
        title: "SIGN OR DISPUTE", pic: "kt_3",
        pc: "Matches what you agreed? SIGN IT[k:A]. Caught a problem with INSPECT? DISPUTE[k:D] and they send a corrected copy. Dispute without catching it and it goes through anyway, and you look paranoid. Sponsors say TURN DOWN.",
        phone: "Matches what you agreed? SIGN IT. Caught a problem with INSPECT? DISPUTE and they send a corrected copy. Dispute without catching it and it goes through anyway, and you look paranoid. Sponsors say TURN DOWN.",
      },
      {
        title: "THE NOTICE", pic: "kt_4",
        pc: "Every stamp prints a NOTICE: what happened and what it cost (or saved you). [click] it to read the whole thing. DONE[kp:ESC|B] goes back to your week.",
        phone: "Every stamp prints a NOTICE: what happened and what it cost (or saved you). Tap it to read the whole thing. DONE goes back to your week.",
      },
      {
        title: "DON'T SKIP IT", pic: "kt_5",
        pc: "Weigh in with unread paperwork and it gets signed as-is, mistakes and all. Your opponent's MEDICALS land here too: read them and you might hear about his bad knee before the cage does.",
        phone: "Weigh in with unread paperwork and it gets signed as-is, mistakes and all. Your opponent's MEDICALS land here too: read them and you might hear about his bad knee before the cage does.",
      },
    ],
  },
  {
    key: "fm_weight", group: "rtc", mode: "fighter", title: "MAKING WEIGHT", blurb: "Weight, the cut, the scale, the gameplan",
    steps: [
      {
        title: "YOUR WEIGHT", pic: "wt_1",
        pc: "WEIGHT reads walk-around / the limit you signed for. Training burns a little; DIET decides the rest (Clean keeps it off, Junk puts it back). The real cut happens in the last two weeks before the fight.",
        phone: "WEIGHT reads walk-around / the limit you signed for. Training burns a little; DIET decides the rest (Clean keeps it off, Junk puts it back). The real cut happens in the last two weeks before the fight.",
      },
      {
        title: "CUT WEIGHT", pic: "wt_2",
        pc: "CUT WEIGHT (one action) opens two weeks out. ROADWORK: -3 lbs, tiring. STRICT DIET: -2 lbs, grumpy. SAUNA: -4 lbs fast, but it's water, and it comes back unless you weigh in that same week.",
        phone: "CUT WEIGHT (one action) opens two weeks out. ROADWORK: -3 lbs, tiring. STRICT DIET: -2 lbs, grumpy. SAUNA: -4 lbs fast, but it's water, and it comes back unless you weigh in that same week.",
      },
      {
        title: "THE SCALE", pic: "wt_3",
        pc: "Fight week: WEIGH-IN. On weight? Step on the scale and flex. Over? SENSIBLE CUT costs less energy but can miss; BRUTAL SAUNA CUT nearly always makes it but you fight dried out; SKIP IT pays the fine.",
        phone: "Fight week: WEIGH-IN. On weight? Step on the scale and flex. Over? SENSIBLE CUT costs less energy but can miss; BRUTAL SAUNA CUT nearly always makes it but you fight dried out; SKIP IT pays the fine.",
      },
      {
        title: "MISSING WEIGHT", pic: "",
        pc: "Miss and you lose part of your purse, the crowd boos and Bleeter has a field day. Bigger fights add a press conference and a FACE-OFF: stare him down, talk, shove him (and pay for it) or touch fists.",
        phone: "Miss and you lose part of your purse, the crowd boos and Bleeter has a field day. Bigger fights add a press conference and a FACE-OFF: stare him down, talk, shove him (and pay for it) or touch fists.",
      },
      {
        title: "THE GAMEPLAN", pic: "wt_5",
        pc: "Then pick a GAMEPLAN. Read the scouting line first: stand-up guy, wrestler, glass chin? The plan drives the sim and autopilot, and your corner can change it between rounds.",
        phone: "Then pick a GAMEPLAN. Read the scouting line first: stand-up guy, wrestler, glass chin? The plan drives the sim and autopilot, and your corner can change it between rounds.",
      },
    ],
  },
  {
    key: "fm_fightnight", group: "rtc", mode: "fighter", title: "FIGHT NIGHT", blurb: "Your bout, from cageside",
    steps: [
      {
        title: "YOU'RE ON THE CARD", pic: "fmn_1",
        pc: "Fight night, from cageside. WATCH or SIM the other bouts. Yours has three buttons: FIGHT! (hands-on, you're in control), WATCH (your gameplan fights it) and SIM (just the result).",
        phone: "Fight night, from cageside. WATCH or SIM the other bouts. Yours has three buttons: FIGHT! (hands-on, you're in control), WATCH (your gameplan fights it) and SIM (just the result).",
      },
      {
        title: "THE CORNER", pic: "corner_1",
        pc: "Between rounds you're the cutman: a quick mini game on your own face. Then the coach asks for next round's plan. You get the details the first time you sit on the stool.",
        phone: "Between rounds you're the cutman: a quick mini game on your own face. Then the coach asks for next round's plan. You get the details the first time you sit on the stool.",
      },
      {
        title: "AFTER", pic: "",
        pc: "Then the purse (minus your team's cut and the rent), the rankings and Bleeter. Win, and you get the microphone: call somebody out, or thank everyone like a nerd.",
        phone: "Then the purse (minus your team's cut and the rent), the rankings and Bleeter. Win, and you get the microphone: call somebody out, or thank everyone like a nerd.",
      },
    ],
  },
  {
    key: "fm_corner", group: "rtc", mode: "fighter", title: "THE CORNER", blurb: "The cutman mini game and the next round's plan",
    steps: [
      {
        title: "WHAT NEEDS WORK", pic: "corner_1",
        pc: "Between rounds you're the cutman. The pink banner shouts what to use: ENSWELL or ICE for swelling, GAUZE or VASELINE for cuts. The list under PRESSURE (top right) is everything that needs fixing.",
        phone: "Between rounds you're the cutman. The pink banner shouts what to use: ENSWELL or ICE for swelling, GAUZE or VASELINE for cuts. The list under PRESSURE (top right) is everything that needs fixing.",
      },
      {
        title: "PICK THE TOOL", pic: "corner_2",
        pc: "Pick the tool the banner asks for from the row top left with [tool-switch]. Each one wears out (the bar under it): ice melts, gauze soaks through. [tool-fresh] gets a fresh one.",
        phone: "Tap the tool the banner asks for in the row top left. Each one wears out (the bar under it): ice melts, gauze soaks through. REFRESH TOOL (bottom left) gets a fresh one.",
      },
      {
        title: "WORK THE DAMAGE", pic: "corner_3",
        pc: "Move the tool onto the swelling or cut with [tool-move] and [tool-press]. Keep the white line on the PRESSURE bar inside the green: too hard makes it worse, too soft does nothing.",
        phone: "Hold a finger on the swelling or cut to work it. Keep the white line on the PRESSURE bar (top right) inside the green: too hard makes it worse, too soft does nothing.",
      },
      {
        title: "BEAT THE CLOCK", pic: "corner_4",
        pc: "TIME runs out fast (a better cutman gets more seconds and a wider green). Fix everything in the list before it does. SKIP[kp:ESC|B] lets the cutman do it alone, and he does it worse.",
        phone: "TIME runs out fast (a better cutman gets more seconds and a wider green). Fix everything in the list before it does. SKIP (top left) lets the cutman do it alone, and he does it worse.",
      },
      {
        title: "THE PLAN", pic: "corner_5",
        pc: "Then your coach: how the corner went, his read on the scorecards, and ROUND 2: WHAT'S THE PLAN? Losing? PRESSURE or WRESTLE. Ahead? Don't get clever. SURVIVE is for emergencies.",
        phone: "Then your coach: how the corner went, his read on the scorecards, and ROUND 2: WHAT'S THE PLAN? Losing? PRESSURE or WRESTLE. Ahead? Don't get clever. SURVIVE is for emergencies.",
      },
    ],
  },
  {
    key: "fm_live", group: "fighting", mode: "fight", title: "FIGHTING: THE BASICS", blurb: "Moving, punching, kicking, the HUD",
    steps: [
      {
        title: "THE SCREEN", pic: "fb_1",
        pc: "Bottom left is you, bottom right is him. BPM is your heart rate (redlining above ~165), GAS is your stamina, HEAD is how much punishment is left. The little body turns yellow, then red, where you're hurt.",
        phone: "Under the cage, left is you, right is him. BPM is your heart rate (redlining above ~165), GAS is your stamina, HEAD is how much punishment is left. The little body turns yellow, then red, where you're hurt.",
      },
      {
        title: "MOVE & PUNCH", pic: "fb_2",
        pc: "Walk in and out with [move]. [lead] throws your lead hand (jab), [rear] your rear hand (straight). Tap for a quick shot; hold a moment longer for a heavy one: slower, harder, and it costs more gas.",
        phone: "Put your left thumb down anywhere bottom left: that's your stick, and it walks you in and out. LEAD is a jab, REAR a straight. Tap for a quick shot; hold longer for a heavy one: slower, harder, more gas.",
      },
      {
        title: "THE STICK PICKS IT", pic: "dirs:punch",
        pc: "Push [stick] as you press a punch and it changes: toward him = hook, up = overhand (rear hand), down = body shot, down + toward = uppercut, away + rear = spinning backfist. Centred: jab and straight.",
        phone: "Push the stick as you press a punch and it changes: toward him = hook, up = overhand (REAR), down = body shot, down + toward = uppercut, away + REAR = spinning backfist. Centred: jab and straight.",
      },
      {
        title: "KICKS", pic: "dirs:kick",
        pc: "[kick] kicks, and the direction picks which: centred = body kick, down = leg kick (slows him down), up = head kick (slow, huge), toward = front kick (shoves him off), away = spinning back kick (big, very punishable).",
        phone: "KICK kicks, and the stick picks which: centred = body kick, down = leg kick (slows him down), up = head kick (slow, huge), toward = front kick (shoves him off), away = spinning back kick (big, very punishable).",
      },
      {
        title: "BODY, FEINT, TAUNT", pic: "fb_5",
        pc: "Hold [body] while you punch and it goes downstairs: body shots drain his gas and sneak under a high guard. [feint] fakes a shot to draw a flinch. [taunt] wins back a breath and makes him reckless.",
        phone: "Hold BODY while you punch and it goes downstairs: body shots drain his gas and sneak under a high guard. FEINT fakes a shot to draw a flinch. TAUNT wins back a breath and makes him reckless.",
      },
      {
        title: "PAUSE FOR HELP", pic: "fb_6",
        pc: "There are no button prompts in the cage. [pause] pauses: HELP has the full move list, AUTOPILOT lets the AI fight for you (and gives it back), SIM THE REST ends it now. More lessons come in your next fights.",
        phone: "There are no button prompts in the cage. PAUSE (top right of the panel) has HELP with the full move list, AUTOPILOT and SIM THE REST. More lessons come in your next fights.",
      },
    ],
  },
  {
    key: "fight_defence", group: "fighting", mode: "fight", title: "FIGHTING: DEFENCE", blurb: "Block, parry, dodge, sprawl, gas, getting up",
    steps: [
      {
        title: "BLOCK & PARRY", pic: "fd_1",
        pc: "Hold [block] for a high guard: it stops most of a head shot, less of a body shot or leg kick. Tap it just before a punch lands to PARRY: he's stunned and your next shot is a counter (1.5x damage).",
        phone: "Hold BLOCK for a high guard: it stops most of a head shot, less of a body shot or leg kick. Tap it just before a punch lands to PARRY: he's stunned and your next shot is a counter (1.5x damage).",
      },
      {
        title: "MOVE YOUR HEAD", pic: "dirs:dodge",
        pc: "[dodge-how]: up slips, down rolls under, away pulls back, toward leans in. Slips beat straights, rolls beat hooks, pulls beat nearly everything. Make him miss and your next shot is a counter.",
        phone: "Point the stick and tap DODGE: up slips, down rolls under, away pulls back, toward leans in. Slips beat straights, rolls beat hooks, pulls beat nearly everything. Make him miss for a counter.",
      },
      {
        title: "SPRAWL", pic: "pose:sprawl/shoot@grab",
        pc: "When he dives at your legs, press [grab] right away to SPRAWL. Stuff it and he's stunned and you score. Too late and you're on your back, which is a whole other lesson.",
        phone: "When he dives at your legs, press GRAB right away to SPRAWL. Stuff it and he's stunned and you score. Too late and you're on your back, which is a whole other lesson.",
      },
      {
        title: "GAS", pic: "fd_4",
        pc: "Everything costs gas: punches, kicks, grappling, getting hit. Low gas means slow, weak shots and no takedown defence. Back off, tie him up, or TAUNT from range to get a breath back.",
        phone: "Everything costs gas: punches, kicks, grappling, getting hit. Low gas means slow, weak shots and no takedown defence. Back off, tie him up, or TAUNT from range to get a breath back.",
      },
      {
        title: "KNOCKED DOWN", pic: "fd_5",
        pc: "Dropped? Alternate [getl] and [getr] in a steady rhythm, not too fast, to get up before he jumps on you. Hitting the same side twice fumbles. Three knockdowns in one round and the referee waves it off.",
        phone: "Dropped? Tap the two big GET UP buttons left, right, left, right in a steady rhythm, not too fast, before he jumps on you. Same side twice fumbles. Three knockdowns in a round and it's over.",
      },
    ],
  },
  {
    key: "fight_clinch", group: "fighting", mode: "fight", title: "FIGHTING: THE CLINCH", blurb: "Ties, takedowns, knees and the fence",
    steps: [
      {
        title: "TIE HIM UP", pic: "fc_1",
        pc: "Up close, hold [grab] to clinch. Push toward him while you hold it and you SHOOT for a takedown instead. Whoever starts the clinch gets the first tie.",
        phone: "Up close, hold GRAB to clinch. Hold it with the stick pushed toward him to SHOOT for a takedown instead. Whoever starts the clinch gets the first tie.",
      },
      {
        title: "FIGHT FOR THE TIE", pic: "dirs:clinch",
        pc: "In the clinch, tap [grab] with a direction: up = THAI PLUM (knees to the face), toward = UNDERHOOKS (march him to the fence), centred = PUMMEL (undo his tie), down = TRIP, away = BREAK free.",
        phone: "In the clinch GRAB becomes TIE. Tap it with a direction: up = THAI PLUM (knees to the face), toward = UNDERHOOKS (march him to the fence), centred = PUMMEL (undo his tie), down = TRIP, away = BREAK.",
      },
      {
        title: "KNEES & ELBOWS", pic: "pose:plumKnee/clinchDef@kick",
        pc: "In the clinch [kick] throws knees (up = to the head, from the plum). Punches turn into short hooks and uppercuts, and a heavy [rear] is an elbow. The man with the better tie hits harder.",
        phone: "In the clinch KICK becomes KNEE (stick up = to the head, from the plum). Punches turn into short hooks and uppercuts; a heavy REAR is an elbow. The man with the better tie hits harder.",
      },
      {
        title: "THE FENCE", pic: "pose:underhook/cageBack",
        pc: "Push toward him to walk him backwards; with underhooks you drive him into the fence. Pinned there, he burns gas and can't break away easily. Stall too long and the referee splits you up.",
        phone: "Push toward him to walk him backwards; with underhooks you drive him into the fence. Pinned there, he burns gas and can't break away easily. Stall too long and the referee splits you up.",
      },
    ],
  },
  {
    key: "fight_ground", group: "fighting", mode: "fight", title: "FIGHTING: THE GROUND", blurb: "Positions, passing, sweeps, submissions",
    steps: [
      {
        title: "POSITIONS", pic: "fg_1",
        pc: "On the mat the HUD names the position. Worst to best for the man on top: GUARD, HALF GUARD, SIDE CONTROL, MOUNT, THE BACK. Better spots mean harder ground and pound and more submissions.",
        phone: "On the mat the HUD names the position. Worst to best for the man on top: GUARD, HALF GUARD, SIDE CONTROL, MOUNT, THE BACK. Better spots mean harder ground and pound and more submissions.",
      },
      {
        title: "ON TOP", pic: "dirs:top",
        pc: "On top, tap [kick] with a direction: toward passes (guard, half, side, mount), up takes the back, away stands up, down is heavy pressure. Each tap fills the bar. Switch goals and it resets, so commit.",
        phone: "On top KICK becomes MOVE. Tap it with a direction: toward passes (guard, half, side, mount), up takes the back, away stands up, down is heavy pressure. Each tap fills the bar. Switch goals and it resets.",
      },
      {
        title: "UNDERNEATH", pic: "dirs:bottom",
        pc: "Underneath, [kick] + a direction: toward sweeps, away recovers guard, up stands back up (easiest from guard), down hip-escapes. Hold [block] to cover up from the ground and pound.",
        phone: "Underneath, MOVE + a direction: toward sweeps, away recovers guard, up stands back up (easiest from guard), down hip-escapes. Hold BLOCK to cover up from the ground and pound.",
      },
      {
        title: "SUBMISSIONS", pic: "fg_4",
        pc: "[grab] + a direction goes for a submission; which one depends on the position (HELP lists them all). Once it's on, mash [grab] or [kick] and roll round W, D, S, A to crank it, or to escape one. || [grab] + a direction goes for a submission; which one depends on the position (HELP lists them all). Once it's on, mash [grab] or [kick] and roll the left stick round to crank it, or to escape one.",
        phone: "On the mat GRAB becomes SUB: tap it with a direction (HELP lists them all). Once it's on, hammer the MASH buttons and roll the stick round to crank it, or to escape one.",
      },
      {
        title: "GROUND AND POUND", pic: "pose-g:mTopPunch/mBot@rear",
        pc: "Punch from the top for ground and pound; a heavy one is an elbow. Hurt or tired men tap and get finished faster. A failed submission costs you position, and a failed leg lock turns into a scramble.",
        phone: "Punch from the top for ground and pound; a heavy one is an elbow. Hurt or tired men tap and get finished faster. A failed submission costs you position, and a failed leg lock turns into a scramble.",
      },
    ],
  },
  {
    key: "quickfight", group: "quick", mode: "any", title: "QUICK FIGHT", blurb: "Two fighters, a room, and go", tryIt: "FIGHT!",
    steps: [
      {
        title: "PICK TWO FIGHTERS", pic: "qf_1",
        pc: "Red corner is you, blue is the CPU (or player 2). Flip through fighters with < >. RANDOM picks one for you; VS ANYONE grabs somebody from any division. Silly mismatches are encouraged.",
        phone: "Red corner is you, blue is the CPU (or player 2). Flip through fighters with < >. RANDOM picks one for you; VS ANYONE grabs somebody from any division. Silly mismatches are encouraged.",
      },
      {
        title: "THE RULES", pic: "qf_2",
        pc: "Middle column: DIVISION (beat Road To Champion chapters to unlock its fighters here), 1P vs CPU or 2P VERSUS, 3 or 5 rounds, and the CPU's gameplan. The note underneath says who plays with what.",
        phone: "Middle column: DIVISION (beat Road To Champion chapters to unlock its fighters here), 1P vs CPU or 2P VERSUS, 3 or 5 rounds, and the CPU's gameplan. The note underneath says who plays with what.",
      },
      {
        title: "TWO PLAYERS", pic: "qf_3",
        pc: "2P VERSUS works with two controllers, a controller and the keyboard, or one keyboard for two. P1: WASD, J K L to strike, I block, SPACE grab. P2: arrows, , . / to strike, right SHIFT block, ENTER grab. || 2P VERSUS: connect a second controller and each player gets their own. The note in the middle says who is who.",
        phone: "2P VERSUS: pair a controller with your phone or tablet. You fight on the touch screen, your friend on the controller (two controllers: one each). The note in the middle says who is who.",
      },
      {
        title: "THE VENUE", pic: "qf_4",
        pc: "Pick the room under the corners, sixteen of them: the CBFC's Ape-X, Fight Island, an aircraft carrier, a rooftop, a barn with a judgemental goat, a waffle house parking lot, or a warehouse with no gloves (bareknuckle rules).",
        phone: "Pick the room under the corners, sixteen of them: the CBFC's Ape-X, Fight Island, an aircraft carrier, a rooftop, a barn with a judgemental goat, a waffle house parking lot, or a warehouse with no gloves (bareknuckle rules).",
      },
      {
        title: "FIGHT!", pic: "qf_5",
        pc: "[click] FIGHT! Nothing is saved and nobody's career is touched. First time in the cage, you get the controls lesson first; they're all in TUTORIALS > FIGHTING.",
        phone: "Tap FIGHT! Nothing is saved and nobody's career is touched. First time in the cage, you get the controls lesson first; they're all in TUTORIALS > FIGHTING.",
      },
    ],
  },
];

/** The TUTORIALS list: group, its label, its lessons in order. */
export const GROUPS: [LessonGroup, string, string[]][] = [
  ['start', 'STARTING OUT', ['basics']],
  ['promoter', 'PROMOTER', ['paper', 'desk', 'desk_calls', 'desk_docs', 'cards', 'signing', 'fightnight', 'ledger', 'contender']],
  ['rtc', 'ROAD TO CHAMPION', ['fmhub', 'fm_train', 'fm_rope', 'fm_tyre', 'fm_paper', 'fm_weight', 'fm_fightnight', 'fm_corner']],
  ['fighting', 'FIGHTING', ['fm_live', 'fight_defence', 'fight_clinch', 'fight_ground']],
  ['quick', 'QUICK FIGHT', ['quickfight']],
];

/** The fighting lessons, one before each hands-on fight, in this order. */
export const FIGHT_LESSONS = ['fm_live', 'fight_defence', 'fight_clinch', 'fight_ground'];

export function lessonByKey(key: string): Lesson | null {
  return LESSONS.find((l) => l.key === key) ?? null;
}

// ------------------------------------------------------------ device wording

/** kb = keyboard + mouse, pad = controller (and consoles), touch = phones / tablets */
export type CtlMode = 'kb' | 'pad' | 'touch';

/** The step's text for this device, tokens expanded. */
export function stepText(step: LessonStep, mode: CtlMode): string {
  if (mode === 'touch') return expand(step.phone, mode);
  const cut = step.pc.indexOf(' || ');
  const pc = cut < 0 ? step.pc : mode === 'pad' ? step.pc.slice(cut + 4) : step.pc.slice(0, cut);
  return expand(pc, mode);
}

/** Fight-button tokens: [lead] -> the action in fightinput's default bindings. */
const FIGHT_TOKENS: Record<string, FightButton> = {
  lead: 'lead', rear: 'rear', kick: 'kick', block: 'block', grab: 'grab', feint: 'feint', taunt: 'taunt', body: 'body', getl: 'getupLeft', getr: 'getupRight',
};

/** A keyboard code as a keycap label: KeyJ -> J, Space -> SPACE. */
function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code === 'Space') return 'SPACE';
  if (code.startsWith('Arrow')) return code.slice(5).toUpperCase();
  return code.toUpperCase();
}

/** The keyboard key bound to a fight action (the first letter key, else the first key). */
function fightKey(a: FightButton): string {
  const keys = DEFAULT_FIGHT_BINDINGS[a]?.keys ?? [];
  const letter = keys.find((k) => k.startsWith('Key'));
  return keyLabel(letter ?? keys[0] ?? '?');
}

/** The pad button bound to a fight action (raw Xbox-layout name: 'RB', 'A'...). */
function fightPad(a: FightButton): string {
  return DEFAULT_FIGHT_BINDINGS[a]?.pad?.[0] ?? 'A';
}

/** The on-screen touch pad button for a fight action ('LEAD', 'GRAB', 'UPL'...). */
export function fightTouch(token: string): string {
  const a = FIGHT_TOKENS[token];
  return (a && DEFAULT_FIGHT_BINDINGS[a]?.touch?.[0]) || token.toUpperCase();
}

/**
 * One [token] in words, or null when it isn't a token. Keyboard words on 'kb' (and 'touch',
 * as a safety net: phone text never uses tokens), the pad's names on 'pad'.
 */
function tokenWords(tok: string, mode: CtlMode): string | null {
  const pad = mode === 'pad';
  if (tok.startsWith('k:')) return pad ? '' : ` (${tok.slice(2)})`;
  if (tok.startsWith('kp:')) {
    const bar = tok.indexOf('|');
    if (bar < 0) return null;
    return pad ? ` (${padName(tok.slice(bar + 1))})` : ` (${tok.slice(3, bar)})`;
  }
  const f = FIGHT_TOKENS[tok];
  if (f) return pad ? padName(fightPad(f)) : fightKey(f);
  switch (tok) {
    case 'click': return pad ? 'Select' : 'Click';
    case 'click-l': return pad ? 'select' : 'click';
    case 'ok': return pad ? padName('A') : 'SPACE (or click)';
    case 'hold': return pad ? padName('A') : 'SPACE (or the mouse button)';
    case 'pause': return pad ? padName('Menu') : 'ESC';
    case 'move': return pad ? 'the left stick' : 'A / D';
    case 'stick': return pad ? 'the left stick' : 'a direction (W A S D)';
    case 'dodge-how': return pad ? 'Flick the right stick' : 'Tap an arrow key';
    case 'tool-move': return pad ? 'the left stick' : 'the mouse';
    case 'tool-press': return pad ? 'hold ' + padName('Y') : 'hold the mouse button (or SPACE)';
    case 'tool-switch': return pad ? padName('LB') + ' / ' + padName('RB') : 'Q / E (or 1-4)';
    case 'tool-fresh': return pad ? padName('X') : 'R';
  }
  return null;
}

/** Expand every [token] in a text (a plain scanner: no RegExp, for the Godot port). */
export function expand(text: string, mode: CtlMode): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const a = text.indexOf('[', i);
    if (a < 0) {
      out += text.slice(i);
      break;
    }
    const b = text.indexOf(']', a);
    if (b < 0) {
      out += text.slice(i);
      break;
    }
    const w = tokenWords(text.slice(a + 1, b), mode);
    out += text.slice(i, a) + (w === null ? text.slice(a, b + 1) : w);
    i = b + 1;
  }
  return out;
}

/**
 * The glyphs for a token (legends, diagram badges): keycap labels on 'kb', pad glyph names on
 * 'pad' ('RB', 'LStick'...). Empty when the token has none.
 */
export function tokenGlyphs(tok: string, mode: CtlMode): string[] {
  const t = tok.startsWith('[') ? tok.slice(1, tok.length - 1) : tok;
  const pad = mode === 'pad';
  const f = FIGHT_TOKENS[t];
  if (f) return [pad ? fightPad(f) : fightKey(f)];
  switch (t) {
    case 'move': return pad ? ['LStick'] : ['A', 'D'];
    case 'stick': return pad ? ['LStick'] : ['W', 'A', 'S', 'D'];
    case 'ok':
    case 'hold': return pad ? ['A'] : ['SPACE'];
    case 'pause': return pad ? ['Menu'] : ['ESC'];
  }
  return [];
}

// ------------------------------------------------------------ runtime diagrams

export type DirName = 'centre' | 'up' | 'toward' | 'down' | 'downToward' | 'away';
/** Which touch-pad labels a diagram shows (fightpad.ts modes). */
export type DiagramPadMode = 'stand' | 'clinch' | 'ground';

export interface DirSet {
  /** the direction labels, in the order they light up */
  dirs: [DirName, string][];
  /** the button tokens drawn as the badge ([lead], [kick]...); none = the stick is the move */
  badge: string[];
  pad: DiagramPadMode;
  /** the right stick (pad) / arrow keys (keyboard) instead of the movement stick */
  rstick?: boolean;
}

export const DIR_SETS: Record<string, DirSet> = {
  punch: { pad: 'stand', badge: ['lead', 'rear'], dirs: [['centre', 'JAB / STRAIGHT'], ['toward', 'HOOK'], ['up', 'LEAD HOOK / OVERHAND (REAR)'], ['down', 'BODY JAB / BODY STRAIGHT'], ['downToward', 'UPPERCUT'], ['away', 'PULL-COUNTER / SPIN BACKFIST (REAR)']] },
  kick: { pad: 'stand', badge: ['kick'], dirs: [['centre', 'BODY KICK'], ['down', 'LEG KICK'], ['up', 'HEAD KICK'], ['toward', 'FRONT KICK'], ['away', 'SPINNING BACK KICK']] },
  dodge: { pad: 'stand', badge: [], rstick: true, dirs: [['up', 'SLIP'], ['down', 'ROLL'], ['away', 'PULL BACK'], ['toward', 'LEAN IN']] },
  clinch: { pad: 'clinch', badge: ['grab'], dirs: [['centre', 'PUMMEL'], ['up', 'THAI PLUM'], ['toward', 'UNDERHOOKS'], ['down', 'TRIP'], ['away', 'BREAK']] },
  top: { pad: 'ground', badge: ['kick'], dirs: [['toward', 'PASS'], ['up', 'TAKE THE BACK'], ['away', 'STAND UP'], ['down', 'PRESSURE']] },
  bottom: { pad: 'ground', badge: ['kick'], dirs: [['toward', 'SWEEP'], ['away', 'RECOVER GUARD'], ['up', 'STAND UP'], ['down', 'HIP ESCAPE']] },
};

export interface PoseDiagram {
  ground: boolean;
  red: string;
  blue: string;
  badge: string;
  pad: DiagramPadMode;
}

/** 'pose:red/blue@token' / 'pose-g:top/bottom@token' -> its parts (null when it isn't one). */
export function parsePose(pic: string): PoseDiagram | null {
  const ground = pic.startsWith('pose-g:');
  if (!ground && !pic.startsWith('pose:')) return null;
  let rest = pic.slice(ground ? 7 : 5);
  let badge = '';
  const at = rest.indexOf('@');
  if (at >= 0) {
    badge = rest.slice(at + 1);
    rest = rest.slice(0, at);
  }
  const slash = rest.indexOf('/');
  if (slash < 0) return null;
  const red = rest.slice(0, slash);
  const blue = rest.slice(slash + 1);
  const clinchy = red === 'plumKnee' || red === 'plum' || red === 'underhook' || red === 'clinch' || red === 'collar';
  return { ground, red, blue, badge, pad: ground ? 'ground' : clinchy ? 'clinch' : 'stand' };
}

/** A picture drawn at runtime instead of a PNG. */
export function isDiagram(pic: string): boolean {
  return pic.startsWith('dirs:') || pic.startsWith('pose:') || pic.startsWith('pose-g:');
}
