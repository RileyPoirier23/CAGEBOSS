/**
 * The game states the tutorial's pictures are taken in (used by capture.cjs). Each setup starts
 * from scratch (a fresh career, a fresh fight), so every picture can be retaken on its own.
 *
 * A setup gets `c`: { page, ev(fn, arg), wait(ms), closeAll(), click(label | /regex/, i), dev, phone }.
 */

const career = (c, seed = 77) => c.ev(async (seed) => {
  const ng = await import('/src/sim/newgame.ts');
  const wk = await import('/src/sim/week.ts');
  const g = window.__game;
  g.closeAllModals();
  const s = ng.createNewGame({ seed, mode: 'career', difficulty: 'normal', promotionName: 'Test FC', presidentName: 'Boss' });
  wk.startWeek(s);
  s.flags.tutorial = 'off';
  g.state = s;
}, seed);

const scene = async (c, mod, cls, wait = 1200) => {
  await c.ev(async ([mod, cls]) => {
    const m = await import(mod);
    const g = window.__game;
    g.closeAllModals();
    g.goto(new m[cls](g));
  }, [mod, cls]);
  await c.wait(wait);
  await c.closeAll();
};

const desk = async (c) => {
  await scene(c, '/src/ui/scenes/desk.ts', 'DeskScene');
  await c.ev(() => { window.__game.scene.clockPaused = true; });
};

/** The desk with the tutorial's practice agreements on it, the one with the tenfold purse selected. */
const deskBout = async (c) => {
  await career(c);
  await c.ev(async () => {
    const docs = await import('/src/sim/docs.ts');
    const { Rng } = await import('/src/core/rng.ts');
    const s = window.__game.state;
    const [clean, dodgy] = docs.tutorialDocs(s, new Rng(1));
    s.desk.queue = s.desk.queue.filter((d) => !d.meta.bulletin);
    s.desk.queue.unshift(dodgy, clean);
  });
  await desk(c);
  await c.ev(() => {
    const d = window.__game.scene;
    const it = d.items().find((x) => x.kind === 'doc' && x.doc.meta.tutorial === 'dodgy');
    d.selectItem(it);
  });
  await c.wait(400);
};

/** A promoter career's first fight night (finish week one, then week two at the desk). */
const fightNight = async (c) => {
  await career(c);
  await desk(c);
  await c.ev(() => window.__game.scene.finishDay());
  await c.wait(2500);
  await c.closeAll();
  await c.ev(async () => { const f = await import('/src/ui/flow.ts'); f.routePhase(window.__game); });
  await c.wait(2500);
  await c.closeAll();
  await desk(c);
  await c.ev(() => window.__game.scene.finishDay());
  await c.wait(3000);
  await c.closeAll();
  const name = await c.ev(() => window.__game.scene.constructor.name);
  if (name !== 'FightNightScene') throw new Error('expected fight night, got ' + name);
};

/** A fresh Road To Champion career, at the hub with nothing open. */
const hub = async (c) => {
  await c.ev(async () => {
    const m = await import('/src/ui/scenes/fmcreate.ts');
    const g = window.__game;
    g.closeAllModals();
    const s = new m.FMCreateScene(g);
    g.goto(s);
    s.start();
  });
  await c.wait(3000);
  await c.ev(() => { if (window.__game.state) window.__game.state.flags.tutorial = 'off'; });
  for (let i = 0; i < 8; i++) {
    await c.closeAll();
    await c.wait(400);
  }
  await scene(c, '/src/ui/scenes/fmhub.ts', 'FMHubScene', 900);
  await c.ev(() => { const st = window.__game.state.fm; st.pending = []; st.moments = []; st.weekReport = null; });
  await c.closeAll();
};

const hubSigned = async (c) => {
  await hub(c);
  await c.ev(async () => {
    const m = await import('/src/sim/fighter.ts');
    m.acceptOffer(window.__game.state, 0);
    window.__game.scene.refresh();
  });
  await c.wait(400);
};

/** End weeks until `until` (an expression on s and the fighter module) is true. */
const weeksUntil = async (c, until) => {
  for (let i = 0; i < 12; i++) {
    const ok = await c.ev(async (until) => {
      const m = await import('/src/sim/fighter.ts');
      const s = window.__game.state;
      return !!new Function('s', 'm', 'return (' + until + ');')(s, m);
    }, until);
    if (ok) break;
    await c.ev(() => window.__game.scene.endTheWeek());
    await c.wait(500);
    await c.closeAll();
    await c.ev(() => { const st = window.__game.state.fm; st.pending = []; st.moments = []; st.weekReport = null; });
  }
  await c.ev(() => window.__game.scene.refresh());
  await c.wait(300);
  await c.closeAll();
};

const gameplan = async (c) => {
  await hubSigned(c);
  await weeksUntil(c, 'm.fightThisWeek(s)');
  await c.ev(async () => {
    const m = await import('/src/sim/fighter.ts');
    const { Rng } = await import('/src/core/rng.ts');
    const s = window.__game.state;
    s.fm.inbox = [];
    m.doWeighIn(s, 'easy', new Rng(4));
    window.__game.scene.gameplan();
  });
  await c.wait(500);
};

const fmDesk = async (c) => {
  await hubSigned(c);
  await c.ev(async () => {
    const m = await import('/src/sim/fighter.ts');
    const s = window.__game.state;
    const d = m.fm(s).inbox[0];
    const f = d.fields.find((x) => x.label === 'Win bonus');
    if (f) f.value = '$0';
    d.fault = 'Win bonus';
    window.__game.scene.paperwork();
  });
  await c.wait(700);
};

const corner = async (c) => {
  await hub(c);
  await c.ev(async () => {
    const cm = await import('/src/ui/cutman.ts');
    const m = await import('/src/sim/fighter.ts');
    const g = window.__game;
    cm.openCorner(g, m.me(g.state), { round: 1, side: 0, hp: 35, cut: 4, coach: 'Stop standing in front of him.', scoreGuess: '10-9 him' }, 1, 1, () => {});
  });
  await c.wait(900);
};

/**
 * Quick Fight, into the cage, intros skipped; `hold` (page code) runs every 100 ms from the
 * first moment of the fight, so nobody moves and nothing happens that would show in the picture.
 */
const live = async (c, hold, after) => {
  await c.ev(() => { window.__capKD = false; });
  await scene(c, '/src/ui/scenes/quickfight.ts', 'QuickFightScene', 900);
  await c.ev(() => window.__game.scene.fight());
  await c.wait(1500);
  await c.ev((hold) => {
    clearInterval(window.__capHold);
    const f = new Function('L', hold);
    const run = () => { const L = window.__live; if (L) f(L); };
    run();
    window.__capHold = setInterval(run, 100);
  }, hold);
  await c.click(/SKIP INTRO/).catch(() => {});
  if (!c.phone) for (let i = 0; i < 4; i++) { await c.page.keyboard.press('Enter'); await c.wait(200); }
  // the ROUND 1 / FIGHT! banners come and go
  await c.wait(3600);
  // then (page code) something that has to happen for real, e.g. a knockdown
  if (after) {
    await c.ev((after) => new Function('L', after)(window.__live), after);
    await c.wait(1200);
  }
};
const STILL = 'L.pos = "stand"; L.sub = null; L.shooting = -1; L.clinch.dom = -1; for (const F of L.F) { F.act = null; F.down = 0; F.stun = 3; F.block = false; F.evade = null; F.hp = Math.max(F.hp, 90); F.gas = Math.max(F.gas, 85); } L.F[0].x = 220; L.F[1].x = 262;';

const docOnDesk = async (c, type, force) => {
  await career(c);
  await c.ev(async ([type, force]) => {
    const docs = await import('/src/sim/docs.ts');
    const rules = await import('/src/sim/rules.ts');
    const { Rng } = await import('/src/core/rng.ts');
    const s = window.__game.state;
    // week one has no medical rules yet: put them in the rulebook (quietly)
    if (type === 'medical') rules.activateRule(s, 'medical_basic', false);
    const f = Object.values(s.fighters).find((x) => x.promotion === 'us' && x.contract);
    const d = docs.makeDoc(s, type, f, !!force, new Rng(9), force || undefined);
    s.desk.queue = [d];
  }, [type, force]);
  await desk(c);
  // on the desk, the rulebook open at its page
  await c.ev(() => { const d = window.__game.scene; d.selectItem(d.items().find((x) => x.kind === 'doc')); });
  await c.wait(300);
};

module.exports = {
  S_title: async (c) => scene(c, '/src/ui/scenes/title.ts', 'TitleScene', 1200),
  S_gamemenu: async (c) => {
    await deskBout(c);
    await c.ev(() => window.__open.gamemenu(window.__game, () => {}));
    await c.wait(500);
  },
  S_paper: async (c) => {
    await career(c);
    await scene(c, '/src/ui/scenes/paper.ts', 'PaperScene', 1500);
  },
  S_paper_career: async (c) => {
    await career(c);
    await scene(c, '/src/ui/scenes/paper.ts', 'PaperScene', 1500);
    await c.ev(async () => { const m = await import('/src/ui/career.ts'); m.openCareerPanel(window.__game); });
    await c.wait(600);
  },
  S_desk_bout: deskBout,
  S_desk_inspect: async (c) => {
    await deskBout(c);
    await c.ev(() => window.__game.scene.toggleInspect());
    await c.wait(300);
  },
  S_desk_found: async (c) => {
    await deskBout(c);
    await c.ev(() => { const d = window.__game.scene; d.toggleInspect(); d.compare('doc.purse', 'file.purse'); });
    await c.wait(600);
  },
  S_desk_rulebook: async (c) => {
    await deskBout(c);
    await c.ev(() => window.__game.scene.toggleRulebook());
    await c.wait(400);
  },
  S_desk_call: async (c) => {
    await career(c);
    await c.ev(async () => {
      const e = await import('/src/storylets/engine.ts');
      const { Rng } = await import('/src/core/rng.ts');
      const s = window.__game.state;
      s.storylets.pending = [];
      e.instantiate(s, e.def('union_strike_vote'), {}, new Rng(3), 'random');
    });
    await desk(c);
    // shoot mid-ring: wait for a burst of the ringer
    for (let i = 0; i < 80; i++) {
      if (await c.ev(() => { const p = window.__game.scene.wallPhone; return !!p && p.tag.visible; })) break;
      await c.wait(50);
    }
  },
  S_desk_callopen: async (c) => {
    await module.exports.S_desk_call(c);
    await c.ev(() => window.__game.scene.answerPhone());
    await c.wait(1200);
  },
  S_desk_door: async (c) => {
    await career(c);
    await desk(c);
    await c.ev(() => {
      const d = window.__game.scene;
      const it = d.items().find((x) => x.kind === 'story');
      if (it) { d.selected = it.id; d.refresh(); }
    });
    await c.wait(600);
  },
  S_desk_medical: async (c) => {
    await docOnDesk(c, 'medical');
    await c.ev(() => window.__game.scene.toggleRulebook());
    await c.wait(400);
  },
  S_desk_weighin: async (c) => {
    await career(c);
    await c.ev(async () => {
      const docs = await import('/src/sim/docs.ts');
      const evs = await import('/src/sim/events.ts');
      const { Rng } = await import('/src/core/rng.ts');
      const s = window.__game.state;
      const e = evs.upcomingEvents(s)[0];
      const b = e.card.find((x) => x.status === 'scheduled');
      s.desk.queue = [docs.weighInDoc(s, e, b, new Rng(5))];
    });
    await desk(c);
    await c.ev(() => { const d = window.__game.scene; d.selectItem(d.items().find((x) => x.kind === 'doc')); });
    await c.wait(300);
  },
  S_desk_expense: async (c) => {
    await docOnDesk(c, 'expense', 'sum');
    await c.ev(() => window.__game.scene.toggleCalc());
    await c.wait(400);
  },
  S_cork: async (c) => {
    await career(c);
    await desk(c);
    await c.ev(() => window.__open.corkboard(window.__game, () => {}));
    await c.wait(500);
  },
  S_cork_venue: async (c) => {
    await module.exports.S_cork(c);
    // the room it's in now (its row gets the box)
    await c.ev(async () => {
      const ev = await import('/src/sim/events.ts');
      const { content } = await import('/src/core/content.ts');
      const e = ev.upcomingEvents(window.__game.state)[0];
      window.__cap.venue = content().venues.find((v) => v.id === e.venue).name;
    });
    await c.click('VENUE');
    await c.wait(500);
  },
  S_cork_pick: async (c) => {
    await module.exports.S_cork(c);
    await c.click('+ ADD BOUT');
    await c.wait(500);
  },
  S_cork_problem: async (c) => {
    await career(c);
    await desk(c);
    await c.ev(async () => {
      const ev = await import('/src/sim/events.ts');
      const s = window.__game.state;
      const e = ev.upcomingEvents(s)[0];
      const live = e.card.filter((b) => b.status === 'scheduled');
      const b = live[1] ?? live[0];
      if (b) s.fighters[b.a].legal = 'arrested';
      window.__open.corkboard(window.__game, () => {});
    });
    await c.wait(500);
  },
  S_roster_free: async (c) => {
    await career(c);
    await desk(c);
    await c.ev(() => window.__open.roster(window.__game, () => {}));
    await c.wait(400);
    await c.click('FREE');
    await c.wait(500);
  },
  S_neg: async (c) => {
    await module.exports.S_roster_free(c);
    await c.click('OFFER CONTRACT');
    await c.wait(500);
  },
  S_neg_counter: async (c) => {
    await module.exports.S_neg(c);
    // a lowball (the show money a few steps down): they counter
    for (let i = 0; i < 3; i++) await c.click('-', 0).catch(() => {});
    await c.click('MAKE OFFER');
    await c.wait(600);
  },
  S_ledger: async (c) => {
    await career(c);
    await desk(c);
    await c.ev(() => window.__game.scene.finishDay());
    await c.wait(2500);
    await c.closeAll();
  },
  S_fn_intro: fightNight,
  S_fn_card: async (c) => {
    await fightNight(c);
    await c.ev(() => { const sc = window.__game.scene; sc.step = 'card'; sc.refresh(); });
    await c.wait(600);
    await c.closeAll();
  },
  S_fn_watch: async (c) => {
    await fightNight(c);
    await c.ev(() => { const sc = window.__game.scene; sc.step = 'card'; sc.refresh(); });
    await c.wait(400);
    await c.closeAll();
    await c.ev(() => { const sc = window.__game.scene; const l = sc.live(); sc.watch(l[l.length - 1]); });
    await c.wait(1500);
    await c.ev(() => { const sc = window.__game.scene; if (sc.step === 'watch' && sc.endIntro) sc.endIntro(); });
    await c.wait(6000);
  },
  S_fn_bonus: async (c) => {
    await fightNight(c);
    await c.ev(() => { const sc = window.__game.scene; for (const b of sc.live()) sc.simBout(b, true); sc.step = 'bonus'; sc.refresh(); });
    await c.wait(800);
    await c.closeAll();
  },
  S_hub: hub,
  S_hub_signed: hubSigned,
  S_offers: async (c) => {
    await hub(c);
    await c.ev(() => window.__game.scene.offersWindow());
    await c.wait(500);
  },
  S_bleeter: async (c) => {
    await hub(c);
    await c.ev(() => window.__game.scene.mediaMenu());
    await c.wait(500);
  },
  S_train: async (c) => {
    await hub(c);
    await c.ev(() => window.__game.scene.trainMenu());
    await c.wait(500);
  },
  S_spar: async (c) => {
    await hub(c);
    await c.ev(() => { const sc = window.__game.scene; sc.sparMenu(sc.runAction); });
    await c.wait(500);
  },
  S_fmdesk: fmDesk,
  S_fmdesk_inspect: async (c) => {
    await fmDesk(c);
    await c.ev(() => window.__fmdesk.toggleInspect());
    await c.wait(300);
  },
  S_fmdesk_found: async (c) => {
    await fmDesk(c);
    await c.ev(() => { const h = window.__fmdesk; const [a, b] = h.keyFor('Win bonus'); h.toggleInspect(); h.compare(a, b); });
    await c.wait(500);
  },
  S_fmdesk_slip: async (c) => {
    await fmDesk(c);
    await c.ev(() => { const h = window.__fmdesk; const [a, b] = h.keyFor('Win bonus'); h.toggleInspect(); h.compare(a, b); h.stamp('dispute'); });
    await c.wait(1300);
  },
  S_cutweek: async (c) => {
    await hubSigned(c);
    await weeksUntil(c, 'm.cutWindow(s).open');
  },
  S_cut: async (c) => {
    await module.exports.S_cutweek(c);
    await c.ev(() => window.__game.scene.cutMenu());
    await c.wait(500);
  },
  S_weighin: async (c) => {
    await hubSigned(c);
    await weeksUntil(c, 'm.fightThisWeek(s)');
    await c.ev(() => { window.__game.state.fm.inbox = []; window.__game.scene.weighIn(); });
    await c.wait(500);
  },
  S_gameplan: gameplan,
  S_fm_card: async (c) => {
    await gameplan(c);
    await c.closeAll();
    await c.ev(() => window.__game.scene.startFight());
    await c.wait(2500);
    await c.closeAll();
    await c.ev(() => { const sc = window.__game.scene; sc.step = 'card'; sc.refresh(); });
    await c.wait(600);
    await c.closeAll();
  },
  S_corner: corner,
  S_corner_press: async (c) => {
    await corner(c);
    await c.ev(() => { const k = window.__corner; const z = k.zone(0); k.aim(z.x, z.y); k.setHold(true); });
    await c.wait(600);
  },
  S_corner_plan: async (c) => {
    await corner(c);
    await c.ev(() => window.__corner.skip());
    await c.wait(500);
  },
  S_rope: async (c) => {
    await hub(c);
    await c.ev(async () => { const m = await import('/src/ui/minigames.ts'); m.openJumpRope(window.__game, () => {}); });
    // the first marker nearly at the line, nobody tripped yet
    await c.wait(1900);
  },
  S_tyre_hold: async (c) => {
    await hub(c);
    await c.ev(async () => { const m = await import('/src/ui/minigames.ts'); m.openTyreChop(window.__game, () => {}); });
    await c.wait(600);
    if (c.phone) {
      // a finger down on the panel (Playwright touch has no 'hold': press the panel's pointer handler)
      await c.ev(() => {
        const g = window.__game;
        const top = g.modals[g.modals.length - 1];
        const hit = top.children[1].children.find((ch) => ch.eventMode === 'static' && ch.listenerCount && ch.listenerCount('pointerdown'));
        if (hit) hit.emit('pointerdown', {});
      });
    } else await c.page.keyboard.down('Space');
    await c.wait(450);
  },
  S_qf: async (c) => scene(c, '/src/ui/scenes/quickfight.ts', 'QuickFightScene', 900),
  S_qf_versus: async (c) => {
    await scene(c, '/src/ui/scenes/quickfight.ts', 'QuickFightScene', 900);
    await c.ev(() => { const sc = window.__game.scene; sc.mode = 'versus'; sc.refresh(); });
    await c.wait(400);
  },
  S_live_stand: async (c) => live(c, STILL),
  S_live_block: async (c) => live(c, STILL + ' L.F[0].block = true;'),
  S_live_tired: async (c) => live(c, STILL + ' L.F[0].gas = 22; L.F[0].bpm = 168;'),
  S_live_clinch: async (c) => live(c, STILL + " L.pos = 'clinch'; L.clinch.dom = 0; L.clinch.tie = 'plum'; L.F[1].x = L.F[0].x + 24;"),
  S_live_ground: async (c) => live(c, STILL + " L.pos = 'ground'; L.top = 0; L.gpos = 'half'; L.gprog = 0.4;"),
  S_live_sub: async (c) => live(c, STILL + " L.pos = 'ground'; L.top = 0; L.gpos = 'mount'; L.gprog = 0.4; L.sub = { atk: 0, prog: 0.35, name: 'armbar' };"),
  // a real knockdown (the arena drops him), then the count held short so the referee never waves it off
  S_live_down: async (c) => live(c,
    'if (window.__capKD) { L.F[1].stun = 3; L.F[1].act = null; L.F[0].down = Math.max(0.5, Math.min(L.F[0].down, 2)); L.F[0].hp = Math.max(L.F[0].hp, 60); } else { ' + STILL + ' }',
    'window.__capKD = true; L.rules.noGrappling = true; L.knockdown(1);'),
  S_live_pause: async (c) => {
    await live(c, STILL);
    if (c.phone) await c.click('PAUSE');
    else await c.page.keyboard.press('Escape');
    await c.wait(500);
  },
};
