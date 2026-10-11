'use strict';

const path = require('path');
const schema = require('./schema');
const versions = require('./versions');
const { checkElement } = require('./validate');
const { BLOCK_DISPLAY, HANDHELD_DISPLAY, ITEM_DISPLAY } = require('./model');
const { readJson, readText, exists, hexToRgba, CliError, EXIT } = require('./util');
const { Image } = require('./image');

const BUDGETS = { low: 30, normal: 100, unlimited: Infinity };
const TRANSPARENT = new Set(['.', ' ']);

// Brief from a .json file or from the fenced JSON inside a build prompt (.md).
function load(file) {
  if (!exists(file)) throw new CliError(`${file}: not found`, EXIT.USAGE);
  if (/\.json$/i.test(file)) return readJson(file);
  return fromPrompt(readText(file), file);
}

function fromPrompt(raw, label = 'prompt') {
  const text = raw.replace(/\r\n/g, '\n');
  const m = /^#{1,3}\s*\d*\.?\s*Brief[^\n]*\n[\s\S]*?```(?:json)?\n([\s\S]*?)\n```/im.exec(text) || /```json\n([\s\S]*?)\n```/.exec(text);
  if (!m) throw new CliError(`${label}: no fenced JSON brief found`, EXIT.FAIL);
  try {
    return JSON.parse(m[1]);
  } catch (err) {
    throw new CliError(`${label}: brief JSON is invalid: ${err.message}`, EXIT.FAIL);
  }
}

const MARKER = /^<!--\s*mcmodel-build v(\d+)\s*-->/;
const SECTIONS = ['Intent', 'Brief', 'Build steps', 'Acceptance checklist', 'Known risks', 'Fallbacks'];

// Marker and section order of a build prompt (see references/prompt-contract.md).
function checkPrompt(raw) {
  const text = raw.replace(/\r\n/g, '\n');
  const problems = [];
  const m = MARKER.exec(text.trimStart());
  if (!m) problems.push({ level: 'error', path: 'marker', message: 'first line must be <!-- mcmodel-build v1 -->' });
  else if (m[1] !== '1') problems.push({ level: 'error', path: 'marker', message: `prompt version v${m[1]} is not supported (this build knows v1)` });
  let last = -1;
  for (const s of SECTIONS) {
    const i = text.search(new RegExp(`^##\\s+${s}\\s*$`, 'im'));
    if (i < 0) problems.push({ level: 'error', path: `## ${s}`, message: 'section missing' });
    else if (i < last) problems.push({ level: 'error', path: `## ${s}`, message: 'section out of order' });
    else last = i;
  }
  return problems;
}

function budgetOf(spec) {
  const b = spec && spec.budget !== undefined ? spec.budget : 'normal';
  return typeof b === 'number' ? b : BUDGETS[b];
}

function folderOf(brief) {
  return brief.spec && brief.spec.model_type === 'block' ? 'block' : 'item';
}

function elementsOf(brief) {
  const out = [];
  for (const part of brief.parts || []) {
    (part.elements || []).forEach((el, i) => {
      const e = Object.assign({}, el);
      e.name = el.name || (part.elements.length > 1 ? `${part.name}_${i}` : part.name);
      out.push({ part: part.name, element: e });
    });
  }
  return out;
}

function textureSize(t) {
  return { width: t.rows[0].length, height: t.rows.length };
}

function check(brief, { baseDir } = {}) {
  const problems = [];
  const push = (level, at, message) => problems.push({ level, path: at, message });
  for (const e of schema.validate(brief, schema.load('brief'))) push('error', e.path, e.message);
  if (problems.length) return problems;

  const info = versions.lookup(brief.spec.minecraft_version);
  if (!info) push('error', '$.spec.minecraft_version', `"${brief.spec.minecraft_version}" not supported. Supported: ${versions.supported().join(', ')}`);
  const rules = info ? info.rules : versions.rules();

  const palette = brief.palette || {};
  if (Object.keys(palette).length > 16) push('error', '$.palette', `${Object.keys(palette).length} colours; maximum is 16`);
  const textures = brief.textures || {};
  for (const [name, t] of Object.entries(textures)) {
    const at = `$.textures.${name}`;
    if (t.file) {
      const f = baseDir ? path.resolve(baseDir, t.file) : t.file;
      if (!exists(f)) push('error', `${at}.file`, `file not found: ${t.file}`);
      continue;
    }
    // Expected width = the most common row length, so one bad row is the one reported.
    const counts = {};
    for (const r of t.rows) counts[r.length] = (counts[r.length] || 0) + 1;
    const width = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
    const height = t.rows.length;
    t.rows.forEach((row, y) => {
      if (row.length !== width) push('error', `${at}.rows[${y}]`, `row is ${row.length} wide, expected ${width}`);
      for (const ch of new Set(row)) if (!TRANSPARENT.has(ch) && !(ch in palette)) push('error', `${at}.rows[${y}]`, `character "${ch}" is not in the palette`);
    });
    if (width & (width - 1)) push('warning', at, `width ${width} is not a power of two`);
    if (height !== width && (!t.animation || height % width !== 0)) push('error', at, `${width}x${height}: textures must be square, or a vertical strip of square frames with "animation"`);
    const res = brief.spec.resolution || 16;
    if (width !== res) push('warning', at, `width ${width} differs from spec.resolution ${res}`);
  }

  const names = new Set();
  for (const [i, part] of (brief.parts || []).entries()) {
    if (names.has(part.name)) push('error', `$.parts[${i}].name`, `duplicate part name "${part.name}"`);
    names.add(part.name);
    if (part.mirror_of && !brief.parts.some((p) => p.name === part.mirror_of)) push('error', `$.parts[${i}].mirror_of`, `no part named "${part.mirror_of}"`);
    part.elements.forEach((el, j) => {
      const at = `$.parts[${i}].elements[${j}]`;
      checkElement(el, at, rules, push);
      for (const [face, fd] of Object.entries(el.faces || {})) {
        const ref = fd.texture.slice(1);
        if (!(ref in textures)) push('error', `${at}.faces.${face}.texture`, `#${ref} is not defined in "textures"`);
      }
    });
  }

  const count = elementsOf(brief).length;
  const budget = budgetOf(brief.spec);
  if (count > budget) push('error', '$.parts', `${count} elements exceeds the ${brief.spec.budget || 'normal'} budget of ${budget}`);

  const s = brief.spec;
  if (['weapon', 'item', 'block'].includes(s.model_type) && s.delivery === 'vanilla' && !s.base_item) {
    push('error', '$.spec.base_item', 'vanilla delivery of a weapon/item/block needs base_item');
  }
  if (['pet', 'mount', 'armor'].includes(s.model_type) && s.delivery === 'vanilla') {
    push('warning', '$.spec.delivery', `${s.model_type} cannot be a plain vanilla item model; it will be built as an item/display model only`);
  }
  for (const img of s.reference_images || []) {
    const f = baseDir ? path.resolve(baseDir, img) : img;
    if (!exists(f)) push('warning', '$.spec.reference_images', `reference image not found: ${img}`);
  }
  return problems;
}

// Pixel-grid texture to Image.
function renderTexture(t, palette) {
  const { width, height } = textureSize(t);
  const img = new Image(width, height);
  t.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (TRANSPARENT.has(ch)) return;
      const c = hexToRgba(palette[ch]);
      if (c) img.set(x, y, c);
    });
  });
  return img;
}

function textureId(brief, tex) {
  return `${brief.namespace}:${folderOf(brief)}/${brief.name}_${tex}`;
}

const SLOT_KEYS = {
  first_person: ['firstperson_righthand', 'firstperson_lefthand'],
  third_person: ['thirdperson_righthand', 'thirdperson_lefthand'],
  gui: ['gui'],
  ground: ['ground'],
  head: ['head'],
  item_frame: ['fixed'],
};

function defaultDisplay(type) {
  switch (type) {
    case 'weapon':
      return Object.assign({}, HANDHELD_DISPLAY, {
        gui: { rotation: [30, 225, 0], translation: [0, 0, 0], scale: [0.625, 0.625, 0.625] },
        ground: ITEM_DISPLAY.ground,
        fixed: ITEM_DISPLAY.fixed,
        head: ITEM_DISPLAY.head,
      });
    case 'item':
    case 'skill_effect':
    case 'gui':
      return Object.assign({}, ITEM_DISPLAY, { gui: { rotation: [30, 225, 0], translation: [0, 0, 0], scale: [0.625, 0.625, 0.625] } });
    default:
      return Object.assign({ head: { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [1, 1, 1] } }, BLOCK_DISPLAY);
  }
}

// Brief to Java model JSON.
function toModel(brief) {
  const textures = {};
  const names = Object.keys(brief.textures || {});
  if (names.length) textures.particle = `#${names[0]}`;
  for (const t of names) textures[t] = textureId(brief, t);
  let display = Object.assign({}, defaultDisplay(brief.spec.model_type), brief.display || {});
  const slots = brief.spec.display_slots;
  if (slots && slots.length) {
    const keep = new Set(slots.flatMap((s) => SLOT_KEYS[s] || []));
    display = Object.fromEntries(Object.entries(display).filter(([k]) => keep.has(k)));
  }
  const model = { credit: 'Made with Model Creator' };
  if (brief.parent) model.parent = brief.parent;
  model.textures = textures;
  model.elements = elementsOf(brief).map(({ element }) => element);
  if (Object.keys(display).length) model.display = display;
  return model;
}

module.exports = {
  BUDGETS,
  load,
  fromPrompt,
  checkPrompt,
  check,
  budgetOf,
  folderOf,
  elementsOf,
  renderTexture,
  textureId,
  toModel,
  defaultDisplay,
};
