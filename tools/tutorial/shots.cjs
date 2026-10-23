/**
 * Every tutorial picture: the game state it's taken in (a setup in setups.cjs), the crop and
 * the marks drawn over it. Same-setup pictures are kept together (the setup runs once for them).
 *
 * Expressions (crop, at, to) run in the page with these in scope (capture.cjs, HELPERS):
 *   btn('LABEL' | /re/, i)  a button's rect (top window first, then the screen)
 *   btns(/re/)               every matching button's rect      union(r, r, ...) / union([r, ...])
 *   row(i)                   the i-th row of the first scroll list   rowText(/re/) the row with that text
 *   text(/re/)               the first text that matches         inboxRow(i | 'dodgy') a desk inbox row
 *   spot('doc.purse')        a document line (desk or kitchen table)  field(/label/) its key
 *   pad('LEAD')              a touch fight pad button            stick() the touch stick's centre
 *   win()                    the top window                      top(r, h) its top h px
 *   shell(x, y[, w, h])      mini game panel coordinates          C(x, y, w, h) design coords on a centred screen
 *   S(x, y, w, h)            screen coords                        pt(x, y) a point
 *   around(r, w, h)          a w x h crop centred on r           grow(r, d)
 *   cutR(r, x)               r with its right edge cut at x       phone (bool), OX, SW
 * Rects are [x, y, w, h] in screen game pixels; tap / hold / arrow / swipe use a rect's centre.
 * hires: true takes a PC picture at 2x (for a whole screen or window that has to shrink to fit the card).
 * Crops: at most 340 x 204 (beside the text) or 468 x 152 (above it) on PC; on the 532-wide
 * reference phone at most 330 x 204 or 520 x 152.
 *
 * Mark: { k: 'box'|'tap'|'hold'|'arrow'|'line'|'swipe'|'legend', at, to?, n? (slot), label?, dir?, items?, dev? ('pc'|'phone') }
 */
const C = (x, y, w, h) => `C(${x},${y},${w},${h})`;

module.exports = [
  // ---------------------------------------------------------------- STARTING OUT
  { name: 'basics_1', setup: 'S_title', crop: 'S(8,84,168,172)', marks: [{ k: 'tap', at: "btn('MODES')" }] },
  { name: 'basics_2', setup: 'S_gamemenu', crop: 'top(win(), 200)', marks: [{ k: 'box', at: 'union(btn(/^SLOT 1/), btn(/^SLOT 3/))' }] },
  { name: 'basics_3', setup: 'S_gamemenu', png: 'basics_2', marks: [{ k: 'tap', at: "btn('TUTORIALS')", n: 1 }, { k: 'box', at: "btn('HELP')", n: 2 }, { k: 'box', at: "btn('SETTINGS')", n: 3 }] },

  // ---------------------------------------------------------------- PROMOTER: the paper
  { name: 'paper_1', setup: 'S_paper', crop: "phone ? C(24,10,330,200) : C(20,10,336,200)", marks: [{ k: 'box', at: C(26, 46, 224, 34), n: 1 }, { k: 'box', at: C(254, 44, 100, 166), n: 2 }] },
  { name: 'paper_2', setup: 'S_paper', crop: C(376, 12, 104, 200), marks: [{ k: 'box', at: C(382, 46, 94, 50), n: 1 }, { k: 'box', at: C(382, 95, 94, 32), n: 2 }] },
  { name: 'paper_4', setup: 'S_paper', crop: C(376, 202, 104, 66), marks: [{ k: 'tap', at: "btn('TO THE DESK →')", n: 1 }, { k: 'box', at: "btn('CAREER')", n: 2 }] },
  { name: 'paper_3', setup: 'S_paper_career', crop: 'phone ? S(166,10,330,200) : S(140,10,336,200)', marks: [{ k: 'box', at: C(148, 32, 170, 170), n: 1 }, { k: 'box', at: C(330, 32, 136, 30), n: 2 }] },

  // ---------------------------------------------------------------- the desk
  { name: 'desk_1', setup: 'S_desk_bout', crop: 'phone ? S(198,78,330,124) : S(144,78,336,124)', marks: [{ k: 'box', at: 'phone ? S(366,84,SW-370,108) : S(366,84,110,108)', n: 1 }, { k: 'tap', at: "inboxRow('dodgy')", n: 2 }] },
  { name: 'desk_2', setup: 'S_desk_bout', crop: 'S(118,80,248,170)', marks: [{ k: 'box', at: "union(spot('doc.name'), spot('doc.sig'))", n: 1 }, { k: 'tap', at: "btn('READ')", n: 2, dev: 'phone' }] },
  { name: 'desk_3', setup: 'S_desk_bout', crop: 'S(0,80,250,100)', marks: [{ k: 'box', at: 'S(4,84,114,72)', n: 1 }, { k: 'box', at: "spot('file.purse')", n: 2 }, { k: 'box', at: "spot('doc.purse')", n: 3 }] },
  { name: 'desk_8', setup: 'S_desk_bout', crop: 'phone ? S(200,0,332,80) : S(240,0,240,80)', marks: [{ k: 'box', at: 'S(320,6,72,66)', n: 1 }, { k: 'box', at: "union(btn('ROSTER'), btn('MENU'))", n: 2 }, { k: 'tap', at: 'btn(/^END DAY/)', n: 3 }] },
  { name: 'calls_4', setup: 'S_desk_bout', crop: 'S(176,0,150,72)', marks: [{ k: 'box', at: 'S(200,4,44,58)' }] },
  { name: 'desk_4', setup: 'S_desk_inspect', crop: 'S(0,78,336,192)', marks: [{ k: 'tap', at: 'S(44,240,46,26)', n: 1 }, { k: 'tap', at: "spot('doc.purse')", n: 2 }, { k: 'tap', at: "spot('file.purse')", n: 3 }, { k: 'line', at: "spot('doc.purse')", to: "spot('file.purse')", n: 3 }] },
  { name: 'desk_5', setup: 'S_desk_found', crop: 'S(28,110,336,160)', marks: [{ k: 'box', at: 'S(120,250,244,18)', n: 1 }, { k: 'tap', at: 'btn(/^ASK/)', n: 2 }] },
  { name: 'desk_6', setup: 'S_desk_found', crop: 'phone ? S(196,150,330,120) : S(196,150,284,120)', marks: [{ k: 'box', at: 'phone ? S(369,199,76,34) : S(369,199,52,34)', label: 'CLEAN', n: 1 }, { k: 'box', at: 'phone ? S(448,199,76,34) : S(422,199,52,34)', label: 'WRONG', n: 2 }, { k: 'box', at: 'union(btn(/^ESCALATE/), btn(/^BURY/))', n: 3 }] },
  { name: 'desk_7', setup: 'S_desk_rulebook', crop: 'S(144,80,336,190)', marks: [{ k: 'box', at: 'S(248,110,224,150)', n: 1 }, { k: 'box', at: 'S(248,96,224,13)', n: 2 }] },

  // ---------------------------------------------------------------- calls and visitors
  { name: 'calls_1', setup: 'S_desk_call', crop: 'phone ? S(176,0,330,116) : S(176,0,304,112)', marks: [{ k: 'tap', at: 'S(262,42,46,36)', n: 1 }, { k: 'box', at: 'inboxRow(0)', label: 'OR', n: 2 }] },
  { name: 'calls_2', setup: 'S_desk_callopen', hires: true, crop: 'win()', marks: [{ k: 'box', at: 'union(btns())' }] },
  { name: 'calls_3', setup: 'S_desk_door', crop: 'phone ? S(0,0,330,170) : S(0,0,336,170)', marks: [{ k: 'box', at: 'S(6,4,190,70)', n: 1 }, { k: 'box', at: 'S(122,84,240,80)', n: 2 }] },

  // ---------------------------------------------------------------- other paperwork
  { name: 'docs_1', setup: 'S_desk_medical', crop: 'S(122,80,336,190)', marks: [{ k: 'box', at: "cutR(spot('doc.doctor'), spot('rule.doctors')[0] - 10)", n: 1 }, { k: 'box', at: "spot('rule.doctors')", n: 2 }, { k: 'line', at: "cutR(spot('doc.doctor'), spot('rule.doctors')[0] - 10)", to: "spot('rule.doctors')", n: 2 }] },
  { name: 'docs_3', setup: 'S_desk_weighin', crop: 'phone ? S(198,80,330,190) : S(140,80,340,190)', marks: [{ k: 'box', at: "union(spot('doc.weightA'), spot('doc.weightB'))", n: 1 }, { k: 'box', at: 'union(phone ? S(369,199,SW-374,34) : S(369,199,105,34), btn(/^ESCALATE/), btn(/^BURY/))', n: 2 }] },
  { name: 'docs_2', setup: 'S_desk_expense', crop: 'S(0,80,336,190)', marks: [{ k: 'box', at: 'S(8,188,106,64)', n: 1 }, { k: 'tap', at: "btn('CITE IT')", n: 2 }, { k: 'box', at: "spot('doc.total')", n: 3 }] },

  // ---------------------------------------------------------------- the corkboard
  { name: 'cards_1', setup: 'S_cork', crop: C(4, 13, 468, 48), marks: [{ k: 'box', at: 'union(btns(/( #\\d+| FN)$/))', n: 1 }, { k: 'box', at: C(228, 32, 236, 10), n: 2 }] },
  { name: 'cards_5', setup: 'S_cork', crop: 'phone ? S(326,10,180,52) : S(300,10,180,52)', marks: [{ k: 'tap', at: "btn('AUTO-FILL')", n: 1 }, { k: 'tap', at: "btn('+ NEW EVENT')", n: 2 }] },
  { name: 'cards_2', setup: 'S_cork_venue', crop: 'phone ? top(win(), 250) : top(win(), 204)', marks: [{ k: 'box', at: 'rowText(window.__cap.venue)' }] },
  { name: 'cards_3', setup: 'S_cork_pick', crop: 'phone ? top(win(), 152) : S(20,15,336,200)', marks: [{ k: 'box', at: "union(btnsInRowOf('ALL'))", n: 1 }, { k: 'tap', at: 'pt(row(0)[0] + 60, row(0)[1] + row(0)[3] / 2)', n: 2 }] },
  { name: 'cards_4', setup: 'S_cork_problem', crop: C(6, 61, 468, 90), marks: [{ k: 'box', at: "union(btn('↑', 0), btn('X', 1))", n: 1 }, { k: 'box', at: 'text(/PROBLEM/)', n: 2 }, { k: 'tap', at: "btn('REPLACE')", n: 3 }] },

  // ---------------------------------------------------------------- signing
  { name: 'sign_1', setup: 'S_roster_free', crop: 'phone ? S(30,4,330,200) : S(4,4,336,200)', marks: [{ k: 'tap', at: "btn('FREE')", n: 1 }, { k: 'box', at: 'row(0)', n: 2 }] },
  { name: 'sign_2', setup: 'S_roster_free', crop: 'phone ? S(210,62,296,200) : S(184,62,296,200)', marks: [{ k: 'box', at: C(258, 66, 214, 18), n: 1 }, { k: 'tap', at: 'btn(/^BUY TAPE/)', n: 2 }, { k: 'box', at: "btn('OFFER CONTRACT')", n: 3 }] },
  { name: 'sign_3', setup: 'S_neg', crop: 'phone ? D(40,100,400,126) : D(40,100,400,150)', marks: [{ k: 'box', at: 'D(48,106,180,58)', n: 1 }, { k: 'box', at: 'union(btns(/^[-+]$/))', n: 2 }, { k: 'box', at: 'text(/^Patience/)', n: 3 }] },
  { name: 'sign_4', setup: 'S_neg_counter', crop: 'D(40,160,400,90)', marks: [{ k: 'box', at: 'D(48,195,384,30)', n: 1 }, { k: 'tap', at: "btn('MAKE OFFER')", n: 2 }, { k: 'box', at: "btn('MEET THEIR ASK')", n: 3 }, { k: 'box', at: "btn('LATER')", n: 4 }] },

  // ---------------------------------------------------------------- fight night
  { name: 'fn_1', setup: 'S_fn_intro', hires: true, crop: C(4, 4, 472, 264), marks: [{ k: 'box', at: 'btn(/^PRESS CONFERENCE/)', n: 1 }, { k: 'tap', at: "btn('START THE EVENT →')", n: 2 }] },
  { name: 'fn_2', setup: 'S_fn_card', crop: C(8, 16, 468, 150), marks: [{ k: 'tap', at: "btn('WATCH', 0)", n: 1 }, { k: 'tap', at: "btn('SIM', 0)", n: 2 }] },
  { name: 'fn_3', setup: 'S_fn_watch', hires: true, crop: C(0, 0, 480, 270), marks: [{ k: 'box', at: 'btn(/^SPEED/)', n: 1 }, { k: 'box', at: "btn('PAUSE')", n: 2 }, { k: 'box', at: 'btn(/^CAM/)', n: 3 }, { k: 'box', at: 'btn(/^SKIP/)', n: 4 }] },
  { name: 'fn_4', setup: 'S_fn_bonus', crop: C(8, 0, 468, 150), marks: [{ k: 'tap', at: 'firstBonus()', n: 1 }, { k: 'box', at: 'text(/^Each bonus costs/)', n: 2 }] },

  // ---------------------------------------------------------------- the ledger
  { name: 'led_1', setup: 'S_ledger', crop: C(8, 18, 404, 150), marks: [{ k: 'box', at: C(12, 22, 192, 96), n: 1 }, { k: 'box', at: C(212, 22, 192, 96), n: 2 }] },
  { name: 'led_2', setup: 'S_ledger', crop: 'phone ? S(34,140,330,90) : S(8,140,336,90)', marks: [{ k: 'box', at: C(14, 152, 194, 13), n: 1 }, { k: 'box', at: C(14, 174, 194, 10), n: 2 }, { k: 'box', at: C(14, 186, 190, 16), n: 3 }] },
  { name: 'led_3', setup: 'S_ledger', crop: C(296, 200, 184, 70), marks: [{ k: 'tap', at: "btn('NEXT WEEK →')" }] },

  // ---------------------------------------------------------------- Road To Champion: the hub
  { name: 'hub_1', setup: 'S_hub', crop: 'phone ? S(2,20,152,200) : S(4,20,152,200)', marks: [{ k: 'box', at: 'phone ? S(6,24,142,70) : S(8,24,142,70)', n: 1 }, { k: 'box', at: 'phone ? S(6,116,142,54) : S(8,116,142,54)', n: 2 }, { k: 'box', at: 'phone ? S(6,170,142,18) : S(8,170,142,18)', n: 3 }] },
  {
    name: 'hub_2', setup: 'S_hub', crop: 'phone ? S(154,60,378,134) : S(156,20,166,200)',
    marks: [
      { k: 'box', at: 'S(266,25,42,12)', n: 1, dev: 'pc' },
      { k: 'box', at: "union(btn(/^TRAIN/), btn('BLEETER / CALLOUTS'))", n: 2, dev: 'pc' },
      { k: 'box', at: 'union(btn(/^PAPERWORK/), btn(/RANKINGS$/))', n: 3, dev: 'pc' },
      { k: 'box', at: 'S(486,63,42,12)', n: 1, dev: 'phone' },
      { k: 'box', at: 'union(btns(/^(TRAIN|SPAR|CUT|WORK A SHIFT|REST|GO OUT)/))', n: 2, dev: 'phone' },
      { k: 'box', at: 'btn(/^BLEETER/)', n: 2, dev: 'phone' },
      { k: 'box', at: 'union(btns(/^(PAPERWORK|CLINIC|CONDITION)/))', n: 3, dev: 'phone' },
      { k: 'box', at: 'union(btns(/^(STAFF|RANKINGS|THE FEED)/))', n: 3, dev: 'phone' },
    ],
  },
  { name: 'hub_5', setup: 'S_hub', crop: 'phone ? S(2,196,152,58) : S(4,196,152,58)', marks: [{ k: 'box', at: 'phone ? S(32,207,116,15) : S(34,207,116,15)' }] },
  { name: 'hub_6', setup: 'S_hub', crop: 'phone ? S(0,236,532,34) : S(6,228,468,40)', marks: [{ k: 'tap', at: 'btn(/^END WEEK/)' }, { k: 'box', at: "btn('MENU')", n: 2 }] },
  { name: 'hub_3', setup: 'S_hub', dev: 'pc', crop: 'S(322,20,154,110)', marks: [{ k: 'box', at: 'S(328,36,104,28)', n: 1 }, { k: 'tap', at: "btn('SIGN')", n: 2 }] },
  { name: 'hub_3', setup: 'S_offers', dev: 'phone', crop: 'top(win(), 152)', marks: [{ k: 'box', at: 'firstOffer()', n: 1 }, { k: 'tap', at: "btn('SIGN')", n: 2 }] },
  { name: 'hub_4', setup: 'S_bleeter', crop: 'phone ? top(win(), 250) : top(win(), 204)', marks: [{ k: 'box', at: 'union(btns(/^(@|CALL OUT)/))', n: 1 }, { k: 'box', at: "btn('POST SOMETHING WHOLESOME')", n: 2 }] },

  // ---------------------------------------------------------------- training
  { name: 'train_1', setup: 'S_train', crop: 'phone ? top(win(), 152) : top(win(), 204)', marks: [{ k: 'box', at: 'trainRow(0)', n: 1 }, { k: 'tap', at: "btn('TRAIN', 0)", n: 2 }] },
  { name: 'train_2', setup: 'S_train', crop: 'bottom(win(), phone ? 64 : 58)', marks: [{ k: 'box', at: 'text(/^Condition:/)' }] },
  { name: 'train_3', setup: 'S_train', png: 'train_2', marks: [{ k: 'tap', at: 'btn(/^JUMP ROPE/)', n: 1 }, { k: 'tap', at: 'btn(/^TYRE CHOP/)', n: 2 }] },
  { name: 'train_4', setup: 'S_spar', crop: 'phone ? top(win(), 152) : win()', marks: [{ k: 'box', at: "btn('PAID PROS ($150)')", n: 1 }, { k: 'box', at: "btn('WHOEVER SHOWS UP')", n: 2 }] },

  // ---------------------------------------------------------------- the mini games
  { name: 'rope_1', setup: 'S_rope', crop: 'phone ? win() : S(80,40,320,190)', marks: [{ k: 'box', at: 'shell(68,140,6,26)', n: 1 }, { k: 'arrow', at: 'shell(96,153)', dir: 'l', n: 2 }] },
  { name: 'rope_2', setup: 'S_rope', png: 'rope_1', marks: [{ k: 'box', at: 'shell(268,34,26,10)' }] },
  { name: 'rope_3', setup: 'S_rope', png: 'rope_1', marks: [{ k: 'box', at: "phone ? btn('SKIP') : shell(270,4,48,12)" }] },
  { name: 'tyre_1', setup: 'S_tyre_hold', crop: 'phone ? win() : S(80,40,320,190)', marks: [{ k: 'hold', at: 'shell(160,110)', n: 1 }, { k: 'box', at: 'shell(16,50,20,110)', n: 2 }] },
  { name: 'tyre_2', setup: 'S_tyre_hold', png: 'tyre_1', marks: [{ k: 'box', at: 'shell(20, 50 + Math.round((1 - window.__minigame.zone() - 0.06) * 110), 12, 13)', n: 1 }, { k: 'arrow', at: 'shell(34, 56 + Math.round((1 - window.__minigame.zone() - 0.06) * 110))', dir: 'l', n: 1 }] },
  { name: 'tyre_3', setup: 'S_tyre_hold', png: 'tyre_1', marks: [{ k: 'box', at: "phone ? btn('SKIP') : shell(270,4,48,12)" }] },

  // ---------------------------------------------------------------- the kitchen table
  { name: 'kt_5', setup: 'S_hub_signed', crop: 'phone ? S(154,60,378,134) : S(156,20,166,200)', marks: [{ k: 'tap', at: 'btn(/^PAPERWORK/)' }] },
  { name: 'kt_1', setup: 'S_fmdesk', crop: C(4, 36, 468, 150), marks: [{ k: 'box', at: C(4, 40, 112, 150), n: 1 }, { k: 'box', at: C(122, 40, 240, 150), n: 2 }, { k: 'box', at: C(368, 40, 108, 150), n: 3 }] },
  { name: 'kt_2', setup: 'S_fmdesk_inspect', crop: C(4, 100, 468, 150), marks: [{ k: 'tap', at: 'btn(/^INSPECT/)', n: 1 }, { k: 'tap', at: "spot(fmKey('Win bonus')[0])", n: 2 }, { k: 'tap', at: "spot(fmKey('Win bonus')[1])", n: 3 }, { k: 'line', at: "spot(fmKey('Win bonus')[0])", to: "spot(fmKey('Win bonus')[1])", n: 3 }] },
  { name: 'kt_3', setup: 'S_fmdesk_found', crop: 'phone ? S(30,186,364,84) : S(4,186,364,84)', marks: [{ k: 'box', at: 'btn(/^SIGN IT/)', n: 1 }, { k: 'box', at: 'btn(/^DISPUTE/)', n: 2 }, { k: 'box', at: 'text(/^DISCREPANCY/)', n: 3 }] },
  { name: 'kt_4', setup: 'S_fmdesk_slip', crop: 'phone ? S(126,120,280,150) : S(100,120,280,150)', marks: [{ k: 'tap', at: 'fmSlip()' }] },

  // ---------------------------------------------------------------- making weight
  { name: 'wt_1', setup: 'S_cutweek', crop: 'phone ? S(2,150,152,80) : S(4,150,152,80)', marks: [{ k: 'box', at: 'phone ? S(6,170,142,18) : S(8,170,142,18)', n: 1 }, { k: 'box', at: 'phone ? S(32,207,116,15) : S(34,207,116,15)', n: 2 }] },
  { name: 'wt_2', setup: 'S_cut', crop: 'win()', marks: [{ k: 'box', at: "btn(/^ROADWORK/)", n: 1 }, { k: 'box', at: "btn(/^STRICT DIET/)", n: 2 }, { k: 'box', at: "btn(/^SAUNA/)", n: 3 }] },
  { name: 'wt_3', setup: 'S_weighin', crop: "phone ? top(win(), btn('SKIP IT, PAY FINE')[1] + btn('SKIP IT, PAY FINE')[3] + 3 - win()[1]) : win()", marks: [{ k: 'box', at: 'text(/^You (walk|\'re on)/)', n: 1 }, { k: 'box', at: "btn('SENSIBLE CUT')", n: 2 }, { k: 'box', at: "btn('BRUTAL SAUNA CUT')", n: 3 }, { k: 'box', at: "btn('SKIP IT, PAY FINE')", n: 4 }] },
  { name: 'wt_5', setup: 'S_gameplan', crop: 'phone ? top(win(), 152) : top(win(), 150)', marks: [{ k: 'box', at: 'text(/^Scouting:/)', n: 1 }, { k: 'tap', at: "btn('BALANCED')", n: 2 }] },
  { name: 'fmn_1', setup: 'S_fm_card', crop: C(8, 16, 468, 150), marks: [{ k: 'box', at: "rowOfBtn('FIGHT!')", n: 1 }, { k: 'tap', at: "btn('FIGHT!')", n: 2 }, { k: 'box', at: "btnNear('WATCH', 'FIGHT!')", n: 3 }, { k: 'box', at: "btnNear('SIM', 'FIGHT!')", n: 3 }] },

  // ---------------------------------------------------------------- the corner
  { name: 'corner_1', setup: 'S_corner', crop: C(6, 0, 468, 104), marks: [{ k: 'box', at: C(148, 18, 170, 16), n: 1 }, { k: 'box', at: C(336, 64, 138, 20), n: 2 }, { k: 'box', at: C(6, 20, 134, 32), n: 3 }] },
  { name: 'corner_2', setup: 'S_corner', crop: 'phone ? S(26,0,180,64) : S(0,0,180,64)', marks: [{ k: 'tap', at: C(40, 20, 30, 22), n: 1 }, { k: 'box', at: C(6, 42, 134, 4), n: 2 }] },
  { name: 'corner_4', setup: 'S_corner', crop: 'phone ? S(356,0,150,104) : S(330,0,150,104)', marks: [{ k: 'box', at: C(340, 84, 60, 10), n: 1 }, { k: 'box', at: C(336, 64, 138, 20), n: 2 }] },
  { name: 'corner_3', setup: 'S_corner_press', crop: C(6, 0, 468, 150), marks: [{ k: 'hold', at: 'cornerZone(0)', n: 1 }, { k: 'box', at: C(340, 18, 128, 10), n: 2 }] },
  { name: 'corner_5', setup: 'S_corner_plan', crop: 'top(win(), 150)', marks: [{ k: 'box', at: 'union(text(/^Corner work/), text(/^Coach:/))', n: 1 }, { k: 'tap', at: "btn('BALANCED')", n: 2 }] },

  // ---------------------------------------------------------------- hands-on fights (retake after the fight overhaul merges)
  {
    name: 'fb_1', setup: 'S_live_stand', crop: 'phone ? S(118,150,268,48) : S(4,150,468,120)',
    marks: [
      { k: 'box', at: 'S(4,152,104,44)', n: 1, dev: 'pc' }, { k: 'box', at: 'S(10,192,20,30)', n: 2, dev: 'pc' }, { k: 'box', at: 'S(372,152,104,44)', n: 3, dev: 'pc' },
      { k: 'box', at: 'S(122,153,112,40)', n: 1, dev: 'phone' }, { k: 'box', at: 'S(296,153,116,40)', n: 2, dev: 'phone' },
    ],
  },
  {
    name: 'fb_2', setup: 'S_live_stand', crop: 'phone ? S(24,150,508,120) : S(6,0,468,150)',
    marks: [
      { k: 'legend', at: 'pt(12,24)', items: [['[move]', 'MOVE'], ['[lead]', 'JAB'], ['[rear]', 'STRAIGHT']], dev: 'pc' },
      { k: 'swipe', at: 'stick()', to: 'pt(stick()[0] + 26, stick()[1])', label: 'MOVE', n: 1, dev: 'phone' },
      { k: 'tap', at: "pad('LEAD')", n: 2, dev: 'phone' }, { k: 'tap', at: "pad('REAR')", n: 3, dev: 'phone' },
    ],
  },
  {
    name: 'fb_5', setup: 'S_live_stand', png: 'fb_2',
    marks: [
      { k: 'legend', at: 'pt(12,24)', items: [['[body]', 'BODY SHOTS'], ['[feint]', 'FEINT'], ['[taunt]', 'TAUNT']], dev: 'pc' },
      { k: 'hold', at: "pad('BODY')", n: 1, dev: 'phone' }, { k: 'tap', at: "pad('FEINT')", n: 2, dev: 'phone' }, { k: 'tap', at: "pad('TAUNT')", n: 3, dev: 'phone' },
    ],
  },
  { name: 'fd_1', setup: 'S_live_block', crop: 'phone ? S(24,150,508,120) : S(6,0,468,150)', marks: [{ k: 'legend', at: 'pt(12,24)', items: [['[block]', 'BLOCK / PARRY']], dev: 'pc' }, { k: 'hold', at: "pad('BLOCK')", dev: 'phone' }] },
  { name: 'fd_4', setup: 'S_live_tired', crop: 'phone ? S(118,150,150,48) : S(4,150,190,60)', marks: [{ k: 'box', at: 'text(/BPM/)', n: 1 }, { k: 'box', at: 'phone ? S(144,171,74,8) : S(40,172,74,8)', n: 2 }] },
  { name: 'fc_1', setup: 'S_live_clinch', crop: 'phone ? S(24,150,508,120) : S(6,0,468,150)', marks: [{ k: 'legend', at: 'pt(12,24)', items: [['[grab]', 'HOLD: CLINCH']], dev: 'pc' }, { k: 'hold', at: "pad('GRAB')", label: 'TIE', n: 1, dev: 'phone' }, { k: 'box', at: 'text(/THAI PLUM/)', n: 2, dev: 'phone' }] },
  { name: 'fg_1', setup: 'S_live_ground', crop: 'phone ? S(24,150,508,120) : S(6,44,468,150)', marks: [{ k: 'box', at: 'grow2(text(/HALF GUARD/), 0, 8)', n: 1 }, { k: 'box', at: "pad('KICK')", n: 2, dev: 'phone' }, { k: 'box', at: "pad('GRAB')", n: 2, dev: 'phone' }] },
  {
    name: 'fg_4', setup: 'S_live_sub', crop: 'phone ? S(24,150,508,120) : S(6,0,468,150)',
    marks: [
      { k: 'legend', at: 'pt(12,24)', items: [['[grab]', 'MASH'], ['[stick]', 'ROLL']], dev: 'pc' },
      { k: 'tap', at: "pad('KICK')", label: 'MASH', n: 1, dev: 'phone' }, { k: 'tap', at: "pad('GRAB')", n: 2, dev: 'phone' },
      { k: 'swipe', at: 'pt(stick()[0] - 18, stick()[1])', to: 'pt(stick()[0] + 18, stick()[1])', label: 'ROLL', n: 3, dev: 'phone' },
    ],
  },
  { name: 'fd_5', setup: 'S_live_down', crop: 'phone ? S(12,150,508,120) : S(6,0,468,150)', marks: [{ k: 'legend', at: 'pt(12,24)', items: [['[getl]', 'LEFT'], ['[getr]', 'RIGHT']], dev: 'pc' }, { k: 'tap', at: "pad('UPL')", n: 1, dev: 'phone' }, { k: 'tap', at: "pad('UPR')", n: 2, dev: 'phone' }] },
  { name: 'fb_6', setup: 'S_live_pause', crop: 'phone ? top(win(), 204) : win()', marks: [{ k: 'box', at: 'btn(/^HELP/)', n: 1 }, { k: 'box', at: 'btn(/^AUTOPILOT/)', n: 2 }, { k: 'box', at: 'btn(/^SIM THE REST/)', n: 3 }] },

  // ---------------------------------------------------------------- Quick Fight
  { name: 'qf_1', setup: 'S_qf', crop: 'phone ? S(4,34,330,152) : S(4,34,336,152)', marks: [{ k: 'box', at: 'S(8,36,164,150)', n: 1 }, { k: 'tap', at: "btn('>', 0)", n: 2 }, { k: 'box', at: "btn('RANDOM', 0)", n: 3 }, { k: 'box', at: "btn('VS ANYONE', 0)", n: 3 }] },
  { name: 'qf_2', setup: 'S_qf', crop: C(170, 34, 144, 162), marks: [{ k: 'box', at: C(180, 38, 124, 72), n: 1 }, { k: 'box', at: C(180, 112, 124, 50), n: 2 }] },
  { name: 'qf_4', setup: 'S_qf', crop: 'phone ? S(8,188,508,56) : S(8,188,464,56)', marks: [{ k: 'tap', at: "lastBtn('>')", n: 1 }, { k: 'box', at: 'union(text(/^THE APE-X/), text(/^Empty TV studio/))', n: 2 }] },
  { name: 'qf_5', setup: 'S_qf', crop: 'around(btn(\'FIGHT!\'), 200, 38)', marks: [{ k: 'tap', at: "btn('FIGHT!')" }] },
  { name: 'qf_3', setup: 'S_qf_versus', crop: C(170, 34, 144, 162), marks: [{ k: 'box', at: C(180, 56, 124, 16), n: 1 }, { k: 'box', at: C(180, 94, 124, 70), n: 2 }] },
];
