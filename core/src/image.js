'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('../vendor/pngjs/png');
const jpeg = require('../vendor/jpeg-js');
const { GifWriter } = require('../vendor/omggif/omggif');
const { CliError, EXIT, ensureDir } = require('./util');

class Image {
  constructor(width, height, data) {
    this.width = width;
    this.height = height;
    this.data = data || Buffer.alloc(width * height * 4);
  }

  static load(file) {
    if (!fs.existsSync(file)) throw new CliError(`${file}: file not found`, EXIT.USAGE);
    const buf = fs.readFileSync(file);
    try {
      if (buf[0] === 0x89 && buf[1] === 0x50) {
        const png = PNG.sync.read(buf);
        return new Image(png.width, png.height, Buffer.from(png.data));
      }
      if (buf[0] === 0xff && buf[1] === 0xd8) {
        const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
        return new Image(img.width, img.height, Buffer.from(img.data));
      }
    } catch (err) {
      throw new CliError(`${file}: cannot decode image: ${err.message}`, EXIT.FAIL);
    }
    throw new CliError(`${file}: unsupported image format (PNG or JPEG only)`, EXIT.USAGE);
  }

  save(file) {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, PNG.sync.write({ width: this.width, height: this.height, data: this.data }));
    return file;
  }

  clone() {
    return new Image(this.width, this.height, Buffer.from(this.data));
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return [0, 0, 0, 0];
    const i = (y * this.width + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  set(x, y, c) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3] === undefined ? 255 : c[3];
  }

  blend(x, y, c) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const a = (c[3] === undefined ? 255 : c[3]) / 255;
    if (a >= 1) return this.set(x, y, c);
    if (a <= 0) return;
    const i = (y * this.width + x) * 4;
    const da = this.data[i + 3] / 255;
    const oa = a + da * (1 - a);
    for (let k = 0; k < 3; k++) {
      this.data[i + k] = Math.round((c[k] * a + this.data[i + k] * da * (1 - a)) / (oa || 1));
    }
    this.data[i + 3] = Math.round(oa * 255);
  }

  fill(c) {
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) this.set(x, y, c);
    return this;
  }

  fillRect(x, y, w, h, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.blend(i, j, c);
  }

  rect(x, y, w, h, c) {
    this.line(x, y, x + w - 1, y, c);
    this.line(x, y + h - 1, x + w - 1, y + h - 1, c);
    this.line(x, y, x, y + h - 1, c);
    this.line(x + w - 1, y, x + w - 1, y + h - 1, c);
  }

  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.blend(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // Draw src scaled by integer factor at (x, y), alpha-blended.
  blit(src, x, y, scale = 1) {
    for (let j = 0; j < src.height * scale; j++) {
      for (let i = 0; i < src.width * scale; i++) {
        this.blend(x + i, y + j, src.get((i / scale) | 0, (j / scale) | 0));
      }
    }
  }

  // Nearest-neighbour resize to an exact size.
  resize(w, h) {
    const out = new Image(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        out.set(x, y, this.get(Math.floor((x * this.width) / w), Math.floor((y * this.height) / h)));
      }
    }
    return out;
  }

  // Fit inside box keeping aspect ratio.
  fit(maxW, maxH) {
    const s = Math.min(maxW / this.width, maxH / this.height);
    return this.resize(Math.max(1, Math.round(this.width * s)), Math.max(1, Math.round(this.height * s)));
  }

  crop(x, y, w, h) {
    const out = new Image(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.set(i, j, this.get(x + i, y + j));
    return out;
  }

  text(x, y, str, c, scale = 1) {
    let cx = x;
    for (const ch of String(str).toUpperCase()) {
      const g = FONT[ch] || FONT['?'];
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (g[row][col] === '#') this.fillRect(cx + col * scale, y + row * scale, scale, scale, c);
        }
      }
      cx += 6 * scale;
    }
  }

  static textWidth(str, scale = 1) {
    return String(str).length * 6 * scale - scale;
  }
}

const GLYPHS = {
  '0': '.###. #...# #..## #.#.# ##..# #...# .###.',
  '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  '2': '.###. #...# ....# ...#. ..#.. .#... #####',
  '3': '####. ....# ....# .###. ....# ....# ####.',
  '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  '5': '##### #.... ####. ....# ....# #...# .###.',
  '6': '.###. #.... #.... ####. #...# #...# .###.',
  '7': '##### ....# ...#. ..#.. .#... .#... .#...',
  '8': '.###. #...# #...# .###. #...# #...# .###.',
  '9': '.###. #...# #...# .#### ....# ....# .###.',
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .####',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# #...# ##..# #.#.# #..## #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  ' ': '..... ..... ..... ..... ..... ..... .....',
  '-': '..... ..... ..... ##### ..... ..... .....',
  _: '..... ..... ..... ..... ..... ..... #####',
  '.': '..... ..... ..... ..... ..... .##.. .##..',
  ':': '..... .##.. .##.. ..... .##.. .##.. .....',
  '/': '....# ....# ...#. ..#.. .#... #.... #....',
  '(': '...#. ..#.. .#... .#... .#... ..#.. ...#.',
  ')': '.#... ..#.. ...#. ...#. ...#. ..#.. .#...',
  '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  '=': '..... ..... ##### ..... ##### ..... .....',
  ',': '..... ..... ..... ..... .##.. ..#.. .#...',
  '%': '##..# ##..# ...#. ..#.. .#... #..## #..##',
  '>': '.#... ..#.. ...#. ....# ...#. ..#.. .#...',
  '<': '...#. ..#.. .#... #.... .#... ..#.. ...#.',
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
};
const FONT = {};
for (const [k, v] of Object.entries(GLYPHS)) FONT[k] = v.split(' ');

// Encode RGBA frames (same size) as a looping GIF. delay is in 1/100 s.
function encodeGif(frames, delay = 10) {
  const w = frames[0].width;
  const h = frames[0].height;
  const colors = new Map();
  let exact = true;
  for (const f of frames) {
    for (let i = 0; i < f.data.length; i += 4) {
      const key = (f.data[i] << 16) | (f.data[i + 1] << 8) | f.data[i + 2];
      if (!colors.has(key)) {
        if (colors.size >= 256) { exact = false; break; }
        colors.set(key, colors.size);
      }
    }
    if (!exact) break;
  }
  let palette;
  let index;
  if (exact) {
    palette = [...colors.keys()];
    index = (r, g, b) => colors.get((r << 16) | (g << 8) | b);
  } else {
    palette = [];
    for (let i = 0; i < 256; i++) {
      const r = Math.round((((i >> 5) & 7) * 255) / 7);
      const g = Math.round((((i >> 2) & 7) * 255) / 7);
      const b = Math.round(((i & 3) * 255) / 3);
      palette.push((r << 16) | (g << 8) | b);
    }
    index = (r, g, b) => ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
  }
  let size = 2;
  while (size < palette.length) size *= 2;
  while (palette.length < size) palette.push(0);
  const buf = Buffer.alloc(w * h * frames.length + 4096 + palette.length * 3);
  const gw = new GifWriter(buf, w, h, { loop: 0, palette });
  for (const f of frames) {
    const px = new Uint8Array(w * h);
    for (let i = 0, p = 0; p < px.length; i += 4, p++) px[p] = index(f.data[i], f.data[i + 1], f.data[i + 2]);
    gw.addFrame(0, 0, w, h, px, { delay });
  }
  return buf.subarray(0, gw.end());
}

function saveGif(file, frames, delay) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, encodeGif(frames, delay));
  return file;
}

// Lay out labelled tiles in a row (or wrapped grid) on a dark background.
function montage(tiles, { columns, background = [43, 43, 46, 255], label = [230, 230, 230, 255], pad = 8 } = {}) {
  const cols = columns || tiles.length;
  const rows = Math.ceil(tiles.length / cols);
  const tw = Math.max(...tiles.map((t) => t.image.width));
  const th = Math.max(...tiles.map((t) => t.image.height));
  const labelH = 7 * 2 + 6;
  const out = new Image(cols * (tw + pad) + pad, rows * (th + labelH + pad) + pad);
  out.fill(background);
  tiles.forEach((t, i) => {
    const cx = pad + (i % cols) * (tw + pad);
    const cy = pad + Math.floor(i / cols) * (th + labelH + pad);
    out.text(cx, cy, t.label || '', label, 2);
    out.blit(t.image, cx + Math.floor((tw - t.image.width) / 2), cy + labelH + Math.floor((th - t.image.height) / 2));
  });
  return out;
}

module.exports = { Image, encodeGif, saveGif, montage };
