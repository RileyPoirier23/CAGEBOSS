#!/usr/bin/env node
/**
 * Takes the tutorial's pictures: plays the game into each state (setups.cjs), crops the screen
 * (shots.cjs), writes public/tutorial/<pc|phone>/<name>.png at 1:1 game pixels and
 * src/ui/guidepics.ts (the manifest + the marks, in picture pixels). See README.md.
 *
 *   node tools/tutorial/capture.cjs [url] [--only=desk_,paper_1] [--dev=pc|phone] [--list] [--full=dir] [--phone-res=2]
 *
 * url defaults to http://localhost:5299/ (a `npx vite --port 5299` dev server of this checkout).
 * --only / --dev retake a subset and merge it into the existing guidepics.ts.
 */
const fs = require('fs');
const path = require('path');

function loadPlaywright() {
  for (const p of [process.env.PLAYWRIGHT, 'playwright', '/opt/node22/lib/node_modules/playwright']) {
    if (!p) continue;
    try {
      return require(p);
    } catch {
      /* next */
    }
  }
  throw new Error('Playwright not found: npm i -g playwright (or set PLAYWRIGHT=/path/to/playwright)');
}

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'public/tutorial');
const PICS_TS = path.join(ROOT, 'src/ui/guidepics.ts');
const SHOTS = require('./shots.cjs');
const SETUPS = require('./setups.cjs');
const { shrink } = require('./pngpal.cjs');

const args = process.argv.slice(2);
const opt = (k) => (args.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || null;
const URL = args.find((a) => !a.startsWith('--')) || 'http://localhost:5299/';
const ONLY = opt('only') ? opt('only').split(',') : null;
const DEVS = opt('dev') ? [opt('dev')] : ['pc', 'phone'];
/** --full=<dir>: also save the whole screen once per setup (to plan crops) */
const FULL = opt('full');
/**
 * Phone pictures are taken at 2 device pixels per game pixel (the PNG is twice the picture's
 * size, `r: 2` in the manifest). Phones scale their dialogs by odd amounts (x1.13...), and a
 * 1:1 capture of that drops or doubles pixel columns, so the text comes out mangled; a real
 * phone renders at 2-4 device pixels per game pixel and never looks like that.
 */
const PHONE_RES = Number(opt('phone-res') || 2);
const wanted = (name) => !ONLY || ONLY.some((p) => name === p || (p.endsWith('_') || p.endsWith('*') ? name.startsWith(p.replace(/\*$/, '')) : false));

if (args.includes('--list')) {
  for (const s of SHOTS) console.log(s.name.padEnd(10), (s.setup || '').padEnd(18), s.dev || '', s.png ? '(= ' + s.png + ')' : '');
  process.exit(0);
}

/** Page-side helpers for the expressions in shots.cjs (installed as window.__T). */
async function installHelpers(page, dev) {
  await page.evaluate(async (dev) => {
    const kit = await import('/src/ui/kit.ts');
    const g = window.__game;
    const T = {};
    T.dev = dev;
    T.phone = dev === 'phone';
    T.SW = kit.SW;
    T.OX = kit.OX;
    const R = (b) => [b.x, b.y, b.width, b.height];
    T.topModal = () => (g.modals.length ? g.modals[g.modals.length - 1] : null);
    const roots = () => {
      const t = T.topModal();
      return t ? [t, g.scene.root] : [g.scene.root];
    };
    const walk = (c, pred, out) => {
      if (!c || c.visible === false) return;
      for (const ch of c.children || []) {
        if (ch.visible === false) continue;
        if (pred(ch)) out.push(ch);
        if (ch.children && ch.children.length) walk(ch, pred, out);
      }
    };
    const m = (s, q) => (q === undefined ? true : q instanceof RegExp ? q.test(s) : s === q);
    const strOf = (t) => String(t.str !== undefined ? t.str : (t.lines || []).join(' '));
    T.buttons = (q) => {
      for (const r of roots()) {
        const o = [];
        walk(r, (ch) => typeof ch.labelText === 'string' && m(ch.labelText, q), o);
        if (o.length) return o;
      }
      return [];
    };
    T.btn = (q, i = 0) => {
      const o = T.buttons(q);
      if (!o[i]) throw new Error('no button ' + q + ' #' + i);
      return R(o[i].getBounds());
    };
    T.btns = (q) => T.buttons(q).map((b) => R(b.getBounds()));
    T.lastBtn = (q) => {
      const o = T.btns(q);
      if (!o.length) throw new Error('no button ' + q);
      return o[o.length - 1];
    };
    /** every button on the same line as this one */
    T.btnsInRowOf = (q) => {
      const r = T.btn(q);
      return T.btns().filter((b) => Math.abs(b[1] - r[1]) < 2 && Math.abs(b[3] - r[3]) < 2);
    };
    /** the button labelled q nearest to the button labelled near (same row on a card) */
    T.btnNear = (q, near) => {
      const n = T.btn(near);
      let best = null;
      for (const b of T.btns(q)) if (!best || Math.abs(b[1] - n[1]) + Math.abs(b[0] - n[0]) / 10 < Math.abs(best[1] - n[1]) + Math.abs(best[0] - n[0]) / 10) best = b;
      if (!best) throw new Error('no button ' + q);
      return best;
    };
    T.union = (...rs) => {
      const list = rs.length === 1 && Array.isArray(rs[0]) && Array.isArray(rs[0][0]) ? rs[0] : rs;
      if (!list.length) throw new Error('union of nothing');
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const r of list) {
        x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[0] + r[2]); y1 = Math.max(y1, r[1] + r[3]);
      }
      return [x0, y0, x1 - x0, y1 - y0];
    };
    T.scrollBox = () => {
      for (const r of roots()) {
        const o = [];
        walk(r, (ch) => ch.content && typeof ch.scrollTo === 'function', o);
        if (o.length) return o[0];
      }
      throw new Error('no scroll box');
    };
    T.row = (i) => {
      const ch = T.scrollBox().content.children[i];
      if (!ch) throw new Error('no row ' + i);
      return R(ch.getBounds());
    };
    T.rowText = (q) => {
      for (const ch of T.scrollBox().content.children) {
        const o = [];
        walk(ch, (x) => Array.isArray(x.lines) && (q instanceof RegExp ? q.test(strOf(x)) : strOf(x).includes(q)), o);
        if (o.length) return R(ch.getBounds());
      }
      throw new Error('no row with ' + q);
    };
    T.text = (q) => {
      for (const r of roots()) {
        const o = [];
        walk(r, (ch) => Array.isArray(ch.lines) && m(strOf(ch), q), o);
        if (o.length) return R(o[0].getBounds());
      }
      throw new Error('no text ' + q);
    };
    T.inboxRow = (i) => {
      const d = g.scene;
      const items = d.items();
      const it = i === 'dodgy' ? items.find((x) => x.kind === 'doc' && x.doc.meta.tutorial === 'dodgy') : items[i];
      const node = it && d.rowNodes.get(it.id);
      if (!node) throw new Error('no inbox row ' + i);
      return R(node.getBounds());
    };
    T.spot = (key) => {
      const fm = window.__fmdesk && window.__fmdesk.ins;
      const desk = g.scene && g.scene.ins;
      for (const ins of [T.topModal() && fm ? fm : null, desk, fm]) {
        const sp = ins && ins.spots.get(key);
        if (sp && !sp.node.destroyed) return R(sp.node.getBounds());
      }
      throw new Error('no spot ' + key);
    };
    T.fmKey = (label) => window.__fmdesk.keyFor(label);
    T.fmSlip = () => {
      const r = window.__fmdesk.slip();
      if (!r) throw new Error('no slip');
      return R(r);
    };
    T.win = () => {
      const t = T.topModal();
      if (!t) throw new Error('no window');
      return T.clip(R(t.children[1].getBounds()));
    };
    T.clip = (r) => {
      const x0 = Math.max(0, r[0]);
      const y0 = Math.max(0, r[1]);
      return [x0, y0, Math.min(kit.SW, r[0] + r[2]) - x0, Math.min(270, r[1] + r[3]) - y0];
    };
    T.top = (r, h) => [r[0], r[1], r[2], Math.min(r[3], h)];
    T.bottom = (r, h) => [r[0], r[1] + Math.max(0, r[3] - h), r[2], Math.min(r[3], h)];
    T.grow = (r, d) => [r[0] - d, r[1] - d, r[2] + 2 * d, r[3] + 2 * d];
    /** r with its right edge cut at x (the part of a line another window doesn't cover) */
    T.cutR = (r, x) => [r[0], r[1], Math.max(2, Math.min(r[2], x - r[0])), r[3]];
    T.grow2 = (r, dx, dy) => [r[0] - dx, r[1], r[2] + 2 * dx, r[3] + dy];
    T.around = (r, w, h) => {
      const x = Math.round(Math.max(0, Math.min(kit.SW - w, r[0] + r[2] / 2 - w / 2)));
      const y = Math.round(Math.max(0, Math.min(270 - h, r[1] + r[3] / 2 - h / 2)));
      return [x, y, w, h];
    };
    T.C = (x, y, w, h) => [x + kit.OX, y, w, h];
    /** design coords inside the top window's content (follows a phone's scaled-up dialog) */
    T.D = (x, y, w, h) => {
      const c = T.topModal().children[1];
      const a = c.toGlobal({ x, y });
      const b = c.toGlobal({ x: x + w, y: y + h });
      return [Math.round(a.x), Math.round(a.y), Math.round(b.x - a.x), Math.round(b.y - a.y)];
    };
    T.S = (x, y, w, h) => [x, y, w, h];
    T.pt = (x, y) => [x, y];
    T.shell = (x, y, w, h) => {
      const p = window.__minigame.panel;
      const a = p.toGlobal({ x, y });
      if (w === undefined) return [a.x, a.y];
      const b = p.toGlobal({ x: x + w, y: y + h });
      return [a.x, a.y, b.x - a.x, b.y - a.y];
    };
    const touchPad = () => {
      const o = [];
      walk(T.topModal() || g.scene.root, (ch) => ch.layout && Array.isArray(ch.layout.buttons) && typeof ch.setMode === 'function', o);
      if (!o.length) throw new Error('no touch pad');
      return o[0];
    };
    T.pad = (id) => {
      const p = touchPad();
      const b = p.layout.buttons.find((x) => x.id === id);
      const a = p.toGlobal({ x: b.x - b.r, y: b.y - b.r });
      return [a.x, a.y, b.r * 2, b.r * 2];
    };
    T.stick = () => {
      const p = touchPad();
      const a = p.toGlobal({ x: p.layout.stick.x, y: p.layout.stick.y });
      return [a.x, a.y];
    };
    /** a bout row on the fight night card: the row container holding this button */
    T.rowOfBtn = (q) => {
      const b = T.buttons(q)[0];
      if (!b) throw new Error('no button ' + q);
      return R(b.parent.getBounds());
    };
    T.firstBonus = () => {
      const rows = T.buttons().filter((b) => b.parent && b.parent !== g.scene.root);
      if (rows.length) return R(rows[0].getBounds());
      return T.btns()[0];
    };
    T.firstOffer = () => {
      const s = T.btn('SIGN');
      const w = T.win();
      return [w[0] + 8, s[1] - 2, Math.max(20, s[0] - w[0] - 16), s[3] + 4];
    };
    T.trainRow = (i) => {
      const b = T.btn('TRAIN', i);
      const w = T.win();
      return [w[0] + 4, b[1], b[0] - w[0] - 8, b[3]];
    };
    T.cornerZone = (i) => {
      const z = window.__corner.zone(i);
      const frame = T.topModal().children[1];
      const a = frame.toGlobal({ x: z.x, y: z.y });
      return [a.x, a.y];
    };
    window.__T = T;
  }, dev);
}

/** Resolve a shot's crop and marks in the page (screen game pixels). */
function resolve(page, crop, marks) {
  return page.evaluate(([crop, marks]) => {
    const T = window.__T;
    const run = (expr) => new Function('T', 'with (T) { return (' + expr + '); }')(T);
    const out = { crop: null, marks: [], errors: [] };
    try {
      out.crop = crop ? run(crop).map(Math.round) : null;
    } catch (e) {
      out.errors.push('crop: ' + e.message);
    }
    for (const m of marks) {
      try {
        const r = { ...m, at: run(m.at), to: m.to ? run(m.to) : undefined };
        out.marks.push(r);
      } catch (e) {
        out.errors.push(`${m.k} ${m.at}: ${e.message}`);
      }
    }
    return out;
  }, [crop, marks]);
}

const centre = (r) => (r.length === 4 ? [r[0] + r[2] / 2, r[1] + r[3] / 2] : r);

/** Screen marks -> picture marks (integers, clamped into the picture); null when it falls outside. */
function toPicture(m, crop) {
  const [cx, cy, cw, ch] = crop;
  const clampX = (v) => Math.max(0, Math.min(cw - 1, Math.round(v - cx)));
  const clampY = (v) => Math.max(0, Math.min(ch - 1, Math.round(v - cy)));
  const out = { k: m.k };
  if (m.k === 'box') {
    const r = m.at;
    const x0 = Math.max(cx, r[0]);
    const y0 = Math.max(cy, r[1]);
    const x1 = Math.min(cx + cw, r[0] + r[2]);
    const y1 = Math.min(cy + ch, r[1] + r[3]);
    if (x1 - x0 < 2 || y1 - y0 < 2) return null;
    out.x = Math.round(x0 - cx);
    out.y = Math.round(y0 - cy);
    out.w = Math.round(x1 - x0);
    out.h = Math.round(y1 - y0);
  } else if (m.k === 'legend') {
    out.x = clampX(m.at[0]);
    out.y = clampY(m.at[1]);
    out.items = m.items;
  } else {
    const p = centre(m.at);
    if (p[0] < cx - 2 || p[1] < cy - 2 || p[0] > cx + cw + 2 || p[1] > cy + ch + 2) return null;
    out.x = clampX(p[0]);
    out.y = clampY(p[1]);
    if (m.to) {
      const q = centre(m.to);
      out.x2 = clampX(q[0]);
      out.y2 = clampY(q[1]);
    }
    if (m.dir) out.dir = m.dir;
  }
  if (m.n && m.n !== 1) out.n = m.n;
  if (m.label) out.label = m.label;
  return out;
}

/** Slots in use renumbered 1..k without gaps (a device that skips slot 2 still counts 1, 2, 3). */
function packSlots(marks) {
  const used = [...new Set(marks.map((m) => m.n || 1))].sort((a, b) => a - b);
  for (const m of marks) {
    const n = used.indexOf(m.n || 1) + 1;
    if (n === 1) delete m.n;
    else m.n = n;
  }
  return marks;
}

function readPics() {
  const pics = {};
  if (!fs.existsSync(PICS_TS)) return pics;
  for (const line of fs.readFileSync(PICS_TS, 'utf8').split('\n')) {
    const mm = /^ {2}"([^"]+)": (\{.*\}),$/.exec(line);
    if (mm) pics[mm[1]] = JSON.parse(mm[2]);
  }
  return pics;
}

function writePics(pics) {
  const head = fs.readFileSync(PICS_TS, 'utf8').split('export const PICS')[0];
  const keys = Object.keys(pics).sort();
  const body = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(pics[k])},`).join('\n');
  fs.writeFileSync(PICS_TS, `${head}export const PICS: Record<string, { pc?: PicInfo; phone?: PicInfo }> = {\n${body}\n};\n`);
}

/**
 * One device's pictures. PC pictures are 1:1, except `hires: true` shots (a screen that has to
 * be shrunk to fit the card): those come from a second pass at 2 device pixels per game pixel,
 * so they shrink without going soft.
 */
async function captureDevice(pw, dev, pics, report, hires = false) {
  const phone = dev === 'phone';
  const res = phone ? PHONE_RES : hires ? 2 : 1;
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext(phone
    ? { viewport: { width: 532, height: 270 }, isMobile: true, hasTouch: true, deviceScaleFactor: PHONE_RES }
    : { viewport: { width: 480, height: 270 }, deviceScaleFactor: res });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(2500);
  // a quiet, predictable game: the pixel font, the side camera, no music, no lessons popping up
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('cageboss.settings') || '{}');
    Object.assign(s, { font: 'pixel', fightCam: 'side', reduceShake: true, tutorial: false, music: false, uiScale: 0, handsOn: true, intros: false, bleets: true, textSpeed: 4 });
    localStorage.setItem('cageboss.settings', JSON.stringify(s));
    localStorage.setItem('cageboss.a2hs', 'no');
    localStorage.setItem('cageboss-comingsoon-driveboss', __APP_VERSION__);
    localStorage.setItem('cageboss.guide', JSON.stringify({ seen: { basics: 1 } }));
  });
  await page.reload();
  await page.waitForTimeout(2500);
  if (phone) await page.touchscreen.tap(300, 200);
  else await page.mouse.click(300, 200);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(500);
  const canvas = await page.evaluate(() => {
    const r = window.__game.app.canvas.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, sw: window.__game.app.screen.width };
  });
  console.log(`${dev}${res !== 1 ? ` x${res}` : ""}: canvas ${canvas.w}x${canvas.h} at ${canvas.x},${canvas.y} (screen ${canvas.sw} game px)`);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const c = {
    page, dev, phone, ev,
    wait: (ms) => page.waitForTimeout(ms),
    closeAll: async () => {
      for (let i = 0; i < 12 && (await ev(() => window.__game.modals.length)) > 0; i++) {
        await ev(() => window.__game.closeAllModals());
        await page.waitForTimeout(150);
      }
    },
    click: async (q, i = 0) => {
      const ok = await ev(([src, isRe, i]) => {
        const re = isRe ? new RegExp(src) : null;
        const g = window.__game;
        const roots = g.modals.length ? [g.modals[g.modals.length - 1], g.scene.root] : [g.scene.root];
        for (const r of roots) {
          const o = [];
          const walk = (c) => { for (const ch of c.children || []) { if (ch.visible === false) continue; if (typeof ch.labelText === 'string' && (re ? re.test(ch.labelText) : ch.labelText === src)) o.push(ch); if (ch.children) walk(ch); } };
          walk(r);
          if (o[i]) { o[i].onClick(); return true; }
        }
        return false;
      }, [q instanceof RegExp ? q.source : q, q instanceof RegExp, i]);
      if (!ok) throw new Error('nothing to click: ' + q);
    },
  };
  let current = null;
  const files = {};
  for (const shot of SHOTS) {
    if (shot.dev && shot.dev !== dev) continue;
    if (!phone && !!shot.hires !== hires) continue;
    // a picture other pictures reuse is retaken with them
    if (!wanted(shot.name) && !SHOTS.some((o) => o.png === shot.name && wanted(o.name))) continue;
    try {
      if (shot.setup !== current) {
        await ev(() => { clearInterval(window.__capHold); window.__cap = {}; });
        await page.keyboard.up('Space').catch(() => {});
        const setup = SETUPS[shot.setup];
        if (!setup) throw new Error('no setup ' + shot.setup);
        await setup(c);
        current = shot.setup;
        if (FULL) {
          fs.mkdirSync(FULL, { recursive: true });
          await page.screenshot({ path: path.join(FULL, `${dev}-${shot.setup}.png`), clip: { x: canvas.x, y: canvas.y, width: canvas.w, height: canvas.h } });
        }
      }
      await installHelpers(page, dev);
      const marks = shot.marks.filter((m) => !m.dev || m.dev === dev);
      const base = shot.png ? files[shot.png] : null;
      if (shot.png && !base) throw new Error(`${shot.png} has to be taken before ${shot.name}`);
      const res = await resolve(page, base ? null : shot.crop, marks);
      for (const e of res.errors) report.warn.push(`${dev} ${shot.name}: ${e}`);
      let crop = base ? base.crop : res.crop;
      if (!crop) throw new Error('no crop');
      crop = [Math.max(0, crop[0]), Math.max(0, crop[1]), crop[2], crop[3]];
      crop[2] = Math.min(crop[2], canvas.sw - crop[0]);
      crop[3] = Math.min(crop[3], 270 - crop[1]);
      let file;
      if (base) file = base.file;
      else {
        file = `${dev}/${shot.name}.png`;
        // (a palette PNG when it has 256 colours or fewer: same pixels, smaller file)
        const buf = shrink(await page.screenshot({ clip: { x: canvas.x + crop[0], y: canvas.y + crop[1], width: crop[2], height: crop[3] } }));
        fs.mkdirSync(path.join(OUT, dev), { recursive: true });
        fs.writeFileSync(path.join(OUT, file), buf);
        report.bytes += buf.length;
        report.files++;
      }
      files[shot.name] = { crop, file };
      const pm = packSlots(res.marks.map((m) => toPicture(m, crop)).filter(Boolean));
      if (pm.length < res.marks.length) report.warn.push(`${dev} ${shot.name}: ${res.marks.length - pm.length} mark(s) outside the picture`);
      pics[shot.name] = pics[shot.name] || {};
      pics[shot.name][dev] = { file, w: crop[2], h: crop[3], ...(res !== 1 ? { r: res } : {}), marks: pm };
      console.log(`  ${dev} ${shot.name.padEnd(9)} ${crop.join(',').padEnd(18)} ${pm.length} marks${base ? ' (= ' + shot.png + ')' : ''}`);
    } catch (e) {
      report.fail.push(`${dev} ${shot.name}: ${e.message.split('\n')[0]}`);
      console.log(`  ${dev} ${shot.name.padEnd(9)} FAILED: ${e.message.split('\n')[0]}`);
      current = null;
    }
  }
  if (errs.length) report.warn.push(...errs.slice(0, 10).map((e) => `${dev} page error: ${e}`));
  await browser.close();
}

(async () => {
  const pw = loadPlaywright();
  const pics = readPics();
  const report = { files: 0, bytes: 0, warn: [], fail: [] };
  for (const dev of DEVS) {
    await captureDevice(pw, dev, pics, report);
    const more = (s) => s.hires && (!s.dev || s.dev === dev) && (!ONLY || wanted(s.name) || SHOTS.some((o) => o.png === s.name && wanted(o.name)));
    if (dev === 'pc' && SHOTS.some(more)) await captureDevice(pw, dev, pics, report, true);
  }
  // a phone picture identical to the PC one: keep one file
  for (const [name, e] of Object.entries(pics)) {
    if (!e.pc || !e.phone || e.phone.file === e.pc.file || !e.phone.file.startsWith('phone/') || (e.phone.r || 1) !== (e.pc.r || 1)) continue;
    const a = path.join(OUT, e.pc.file);
    const b = path.join(OUT, e.phone.file);
    if (fs.existsSync(a) && fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b))) {
      const shared = e.phone.file;
      e.phone.file = e.pc.file;
      // other pictures pointing at the same phone file follow it
      for (const o of Object.values(pics)) if (o.phone && o.phone.file === shared) o.phone.file = e.pc.file;
      fs.unlinkSync(b);
      report.bytes -= fs.statSync(a).size;
      console.log(`  phone ${name}: same as the PC picture`);
    }
  }
  writePics(pics);
  let total = 0;
  for (const dev of ['pc', 'phone']) {
    const dir = path.join(OUT, dev);
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) total += fs.statSync(path.join(dir, f)).size;
  }
  console.log(`\n${report.files} pictures taken; public/tutorial holds ${Math.round(total / 1024)} KB; ${Object.keys(pics).length} entries in src/ui/guidepics.ts`);
  if (report.warn.length) console.log('warnings:\n  ' + report.warn.join('\n  '));
  if (report.fail.length) {
    console.log('FAILED:\n  ' + report.fail.join('\n  '));
    process.exitCode = 1;
  }
})();
