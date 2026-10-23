/**
 * Lossless PNG shrinker for the tutorial pictures: a screenshot with 256 colours or fewer is
 * rewritten as an indexed (palette) PNG, which is usually 2-3x smaller. Anything with more
 * colours is left alone. Plain Node (zlib), no dependencies.
 *
 *   node tools/tutorial/pngpal.cjs file.png [...]      (capture.cjs runs it on every picture it takes)
 */
const fs = require('fs');
const zlib = require('zlib');

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Decode an 8-bit RGB / RGBA, non-interlaced PNG to RGBA pixels (null for anything else). */
function decode(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) return null;
  let off = 8;
  let w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace || (ctype !== 2 && ctype !== 6)) return null;
  const bpp = ctype === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      px[(y * w + x) * 4] = line[x * bpp];
      px[(y * w + x) * 4 + 1] = line[x * bpp + 1];
      px[(y * w + x) * 4 + 2] = line[x * bpp + 2];
      px[(y * w + x) * 4 + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { w, h, px };
}

/** The same picture as an indexed PNG, or null when it has more than 256 colours. */
function toPalette(img) {
  const { w, h, px } = img;
  const index = new Map();
  const idx = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) {
    const key = px.readUInt32BE(i * 4);
    let n = index.get(key);
    if (n === undefined) {
      if (index.size >= 256) return null;
      n = index.size;
      index.set(key, n);
    }
    idx[i] = n;
  }
  const plte = Buffer.alloc(index.size * 3);
  const trns = Buffer.alloc(index.size);
  let anyAlpha = false;
  for (const [key, n] of index) {
    plte[n * 3] = (key >>> 24) & 0xff;
    plte[n * 3 + 1] = (key >>> 16) & 0xff;
    plte[n * 3 + 2] = (key >>> 8) & 0xff;
    trns[n] = key & 0xff;
    if ((key & 0xff) !== 255) anyAlpha = true;
  }
  // rows filtered 'none' or 'up', whichever is smaller (pixel art repeats rows a lot)
  const rows = [];
  for (let y = 0; y < h; y++) {
    const cur = idx.subarray(y * w, (y + 1) * w);
    const up = Buffer.alloc(w);
    let sumNone = 0, sumUp = 0;
    for (let x = 0; x < w; x++) {
      up[x] = (cur[x] - (y ? idx[(y - 1) * w + x] : 0)) & 0xff;
      sumNone += cur[x] ? 1 : 0;
      sumUp += up[x] ? 1 : 0;
    }
    rows.push(sumUp < sumNone ? Buffer.concat([Buffer.from([2]), up]) : Buffer.concat([Buffer.from([0]), cur]));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // indexed
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    ...(anyAlpha ? [chunk('tRNS', trns)] : []),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Shrink a PNG buffer: the palette version when it's smaller, else the original. */
function shrink(buf) {
  const img = decode(buf);
  if (!img) return buf;
  const pal = toPalette(img);
  return pal && pal.length < buf.length ? pal : buf;
}

module.exports = { shrink, decode };

if (require.main === module) {
  let before = 0, after = 0;
  for (const f of process.argv.slice(2)) {
    const a = fs.readFileSync(f);
    const b = shrink(a);
    before += a.length;
    after += b.length;
    if (b !== a) fs.writeFileSync(f, b);
  }
  console.log(`${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`);
}
