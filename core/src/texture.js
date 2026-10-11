'use strict';

const fs = require('fs');
const path = require('path');
const briefLib = require('./brief');
const { Image } = require('./image');
const { readJson, writeJson, hexToRgba, usage, CliError, EXIT, rel } = require('./util');
const { textureFile } = require('./model');

// Render every texture in a brief into a pack folder. Returns written files.
function fromBrief(brief, packDir, baseDir) {
  const written = [];
  for (const [name, t] of Object.entries(brief.textures || {})) {
    const out = textureFile(packDir, briefLib.textureId(brief, name));
    let img;
    if (t.file) {
      img = Image.load(path.resolve(baseDir || process.cwd(), t.file));
    } else {
      img = briefLib.renderTexture(t, brief.palette || {});
    }
    img.save(out);
    written.push(out);
    if (t.animation) {
      writeJson(out + '.mcmeta', { animation: Object.assign({ frametime: 2 }, t.animation) });
      written.push(out + '.mcmeta');
    }
  }
  return written;
}

// --- colour helpers ---
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l, l, l].map((v) => Math.round(v * 255));
  const hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)].map((v) => Math.round(v * 255));
}

function color(v, at) {
  const c = hexToRgba(v);
  if (!c) throw new CliError(`${at}: "${v}" is not a #rrggbb colour`, EXIT.FAIL);
  return c;
}

function inRect(rect, x, y) {
  return !rect || (x >= rect[0] && y >= rect[1] && x < rect[0] + rect[2] && y < rect[1] + rect[3]);
}

function applyOps(img, ops) {
  let cur = img;
  ops.forEach((op, i) => {
    const at = `ops[${i}]`;
    switch (op.op) {
      case 'recolor': {
        const from = color(op.from, at);
        const to = color(op.to, at);
        const tol = op.tolerance || 0;
        for (let y = 0; y < cur.height; y++) for (let x = 0; x < cur.width; x++) {
          const c = cur.get(x, y);
          if (c[3] === 0 || !inRect(op.rect, x, y)) continue;
          if (Math.abs(c[0] - from[0]) <= tol && Math.abs(c[1] - from[1]) <= tol && Math.abs(c[2] - from[2]) <= tol) {
            cur.set(x, y, [to[0], to[1], to[2], c[3]]);
          }
        }
        break;
      }
      case 'fill': {
        const c = color(op.color, at);
        const [x0, y0, w, h] = op.rect;
        for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cur.set(x, y, c);
        break;
      }
      case 'clear': {
        const [x0, y0, w, h] = op.rect;
        for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cur.set(x, y, [0, 0, 0, 0]);
        break;
      }
      case 'pixels': {
        const [x0, y0] = op.at;
        op.rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
          if (ch === '.' || ch === ' ') return;
          if (ch === '_') return cur.set(x0 + dx, y0 + dy, [0, 0, 0, 0]);
          if (!op.palette || !op.palette[ch]) throw new CliError(`${at}: "${ch}" not in palette`, EXIT.FAIL);
          cur.set(x0 + dx, y0 + dy, color(op.palette[ch], at));
        }));
        break;
      }
      case 'hue_shift':
      case 'saturation':
      case 'brightness': {
        for (let y = 0; y < cur.height; y++) for (let x = 0; x < cur.width; x++) {
          const c = cur.get(x, y);
          if (c[3] === 0 || !inRect(op.rect, x, y)) continue;
          const hsl = rgbToHsl(c);
          if (op.op === 'hue_shift') hsl[0] = (((hsl[0] + (op.degrees || 0) / 360) % 1) + 1) % 1;
          if (op.op === 'saturation') hsl[1] = Math.min(1, Math.max(0, hsl[1] * (op.factor ?? 1)));
          if (op.op === 'brightness') hsl[2] = Math.min(1, Math.max(0, hsl[2] * (op.factor ?? 1)));
          const rgb = hslToRgb(hsl);
          cur.set(x, y, [rgb[0], rgb[1], rgb[2], c[3]]);
        }
        break;
      }
      case 'resize': {
        const size = op.size;
        if (!Number.isInteger(size) || size < 1) throw new CliError(`${at}: size must be a positive integer`, EXIT.FAIL);
        const frames = cur.height / cur.width;
        cur = cur.resize(size, Math.round(size * frames));
        break;
      }
      default:
        throw new CliError(`${at}: unknown op "${op.op}" (recolor, fill, clear, pixels, hue_shift, saturation, brightness, resize)`, EXIT.FAIL);
    }
  });
  return cur;
}

// Apply a patch file. Returns written path.
function patch(patchFile, outOverride) {
  const p = readJson(patchFile);
  if (!p.target || !Array.isArray(p.ops)) throw usage(`${patchFile}: patch needs "target" and "ops"`);
  const base = path.dirname(path.resolve(patchFile));
  const target = path.isAbsolute(p.target) ? p.target : fs.existsSync(path.resolve(p.target)) ? path.resolve(p.target) : path.resolve(base, p.target);
  const out = outOverride ? path.resolve(outOverride) : p.out ? path.resolve(base, p.out) : target;
  const img = applyOps(Image.load(target), p.ops);
  img.save(out);
  return { target: rel(target), out: rel(out), ops: p.ops.length };
}

module.exports = { fromBrief, applyOps, patch, rgbToHsl, hslToRgb };
