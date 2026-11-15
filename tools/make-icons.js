// Uygulama ikonlarını (PNG) üretir: node tools/make-icons.js
const fs = require('fs'), zlib = require('zlib'), path = require('path');
function crc32(buf) { let c, crc = ~0; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(size, shade) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const SS = 3;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const [pr, pg, pb] = shade((x + (sx + .5) / SS) / size, (y + (sy + .5) / SS) / size);
        r += pr; g += pg; b += pb;
      }
      const o = y * (size * 4 + 1) + 1 + x * 4, n = SS * SS;
      raw[o] = r / n; raw[o + 1] = g / n; raw[o + 2] = b / n; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function inPoly(px, py, pts) { let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) ins = !ins; } return ins; }
const cx = .5, cy = .47, R = .3;
const pent = (rad, rot) => Array.from({ length: 5 }, (_, i) => { const a = rot + i * 2 * Math.PI / 5; return [cx + rad * Math.sin(a), cy - rad * Math.cos(a)]; });
const center = pent(.11, 0);
const outer = [0, 1, 2, 3, 4].map((i) => { const a = i * 2 * Math.PI / 5; const mx = cx + .27 * Math.sin(a), my = cy - .27 * Math.cos(a); return Array.from({ length: 5 }, (_, k) => { const b = a + Math.PI + k * 2 * Math.PI / 5; return [mx + .07 * Math.sin(b), my - .07 * Math.cos(b)]; }); });
function shade(u, v) {
  // arka plan: koyu yeşil degrade + çim çizgileri
  let col = [10 + 20 * v, 70 + 50 * v, 35 + 20 * v];
  if (Math.floor(v * 8) % 2 === 0 && v > .55) col = col.map((c) => c * .9);
  // gölge
  const sd = ((u - cx) / .26) ** 2 + ((v - .83) / .05) ** 2; if (sd < 1) col = col.map((c) => c * .55);
  const d = Math.hypot(u - cx, v - cy);
  if (d < R) {
    const light = 1 - .25 * Math.hypot(u - (cx - .1), v - (cy - .1)) / R;
    col = [245 * light, 247 * light, 250 * light];
    if (d > R - .018) col = [20, 20, 20];
    if (inPoly(u, v, center) || outer.some((p) => inPoly(u, v, p))) col = [25, 25, 30];
  }
  return col;
}
const out = path.join(__dirname, '..', 'public');
for (const s of [180, 192, 512]) fs.writeFileSync(path.join(out, `icon-${s}.png`), png(s, shade));
console.log('ikonlar oluşturuldu');
