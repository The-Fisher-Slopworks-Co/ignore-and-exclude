// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Generates icon.png — a tiny, dependency-free illustration of what the
 * extension does: a document (a file) with a bold diagonal strike across it,
 * i.e. "this file is ignored". No image libraries; we hand-encode a PNG.
 *
 * Run with: npm run make:icon  (or: node scripts/make-icon.mjs)
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SIZE = 128;

const COLORS = {
  bg: [34, 39, 46], // #22272e — dark slate background
  page: [232, 234, 237], // #e8eaed — the document
  fold: [170, 180, 191], // #aab4bf — folded dog-ear corner
  text: [154, 164, 173], // #9aa4ad — faux text lines
  strike: [229, 72, 77], // #e5484d — the "ignored" strike
  strikeEdge: [34, 39, 46], // outline of the strike, == bg for a crisp cut
};

// Document body, in pixel coordinates.
const PAGE = { x0: 36, y0: 22, x1: 92, y1: 106 };
const FOLD = 15; // size of the dog-ear at the top-right corner.

// Faux text lines (y range + x extent) inside the page.
const TEXT_LINES = [
  { y0: 40, y1: 44, x0: 46, x1: 80 },
  { y0: 54, y1: 58, x0: 46, x1: 82 },
  { y0: 68, y1: 72, x0: 46, x1: 82 },
  { y0: 82, y1: 86, x0: 46, x1: 72 },
];

// The diagonal strike, as a segment with a core (red) and an outline (bg).
const STRIKE = { ax: 30, ay: 100, bx: 100, by: 30, core: 7, edge: 10.5 };

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function inRect(x, y, r) {
  return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
}

function colorAt(x, y) {
  // Topmost-first: the strike sits on everything.
  const d = distToSegment(x, y, STRIKE.ax, STRIKE.ay, STRIKE.bx, STRIKE.by);
  if (d <= STRIKE.core) return COLORS.strike;
  if (d <= STRIKE.edge) return COLORS.strikeEdge;

  if (inRect(x, y, PAGE)) {
    // Dog-ear: the triangle tucked into the top-right corner, drawn darker.
    const inCornerBox = x >= PAGE.x1 - FOLD && y < PAGE.y0 + FOLD;
    if (inCornerBox && x - (PAGE.x1 - FOLD) > y - PAGE.y0) {
      return COLORS.fold;
    }
    for (const line of TEXT_LINES) {
      if (inRect(x, y, line)) return COLORS.text;
    }
    return COLORS.page;
  }

  return COLORS.bg;
}

function makePixels() {
  const px = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const c = colorAt(x, y);
      const i = (y * SIZE + x) * 3;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
    }
  }
  return px;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(2, 9); // color type 2 = truecolor RGB
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const stride = SIZE * 3;
  const raw = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (stride + 1)] = 0; // filter byte 0 (none)
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'icon.png');
writeFileSync(out, encodePng(makePixels()));
console.log(`Wrote ${out} (${SIZE}x${SIZE})`);
