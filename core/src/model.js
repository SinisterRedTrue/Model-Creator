'use strict';

const fs = require('fs');
const path = require('path');
const { readJson, exists } = require('./util');

const FACES = ['north', 'south', 'east', 'west', 'up', 'down'];

const BLOCK_DISPLAY = {
  gui: { rotation: [30, 225, 0], translation: [0, 0, 0], scale: [0.625, 0.625, 0.625] },
  ground: { rotation: [0, 0, 0], translation: [0, 3, 0], scale: [0.25, 0.25, 0.25] },
  fixed: { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [0.5, 0.5, 0.5] },
  thirdperson_righthand: { rotation: [75, 45, 0], translation: [0, 2.5, 0], scale: [0.375, 0.375, 0.375] },
  firstperson_righthand: { rotation: [0, 45, 0], translation: [0, 0, 0], scale: [0.4, 0.4, 0.4] },
  firstperson_lefthand: { rotation: [0, 225, 0], translation: [0, 0, 0], scale: [0.4, 0.4, 0.4] },
};

const ITEM_DISPLAY = {
  ground: { rotation: [0, 0, 0], translation: [0, 2, 0], scale: [0.5, 0.5, 0.5] },
  head: { rotation: [0, 180, 0], translation: [0, 13, 7], scale: [1, 1, 1] },
  thirdperson_righthand: { rotation: [0, 0, 0], translation: [0, 3, 1], scale: [0.55, 0.55, 0.55] },
  firstperson_righthand: { rotation: [0, -90, 25], translation: [1.13, 3.2, 1.13], scale: [0.68, 0.68, 0.68] },
  fixed: { rotation: [0, 180, 0], translation: [0, 0, 0], scale: [1, 1, 1] },
};

const HANDHELD_DISPLAY = {
  thirdperson_righthand: { rotation: [0, -90, 55], translation: [0, 4, 0.5], scale: [0.85, 0.85, 0.85] },
  thirdperson_lefthand: { rotation: [0, 90, -55], translation: [0, 4, 0.5], scale: [0.85, 0.85, 0.85] },
  firstperson_righthand: { rotation: [0, -90, 25], translation: [1.13, 3.2, 1.13], scale: [0.68, 0.68, 0.68] },
  firstperson_lefthand: { rotation: [0, 90, -25], translation: [1.13, 3.2, 1.13], scale: [0.68, 0.68, 0.68] },
};

function fullCube(tex) {
  const faces = {};
  for (const f of FACES) faces[f] = { texture: tex[f], cullface: f };
  return [{ from: [0, 0, 0], to: [16, 16, 16], faces }];
}

// Vanilla parents the tools know without the game assets.
const BUILTIN = {
  'builtin/generated': { generated: true },
  'builtin/entity': { builtinEntity: true },
  'item/generated': { parent: 'builtin/generated', display: ITEM_DISPLAY, gui_light: 'front' },
  'item/handheld': { parent: 'item/generated', display: HANDHELD_DISPLAY },
  'item/handheld_rod': { parent: 'item/handheld' },
  'block/block': { display: BLOCK_DISPLAY },
  'block/thin_block': { parent: 'block/block' },
  'block/cube': {
    parent: 'block/block',
    elements: fullCube({ north: '#north', south: '#south', east: '#east', west: '#west', up: '#up', down: '#down' }),
  },
  'block/cube_all': {
    parent: 'block/cube',
    textures: { particle: '#all', down: '#all', up: '#all', north: '#all', east: '#all', south: '#all', west: '#all' },
  },
  'block/cube_column': {
    parent: 'block/cube',
    textures: { particle: '#side', down: '#end', up: '#end', north: '#side', east: '#side', south: '#side', west: '#side' },
  },
  'block/cube_bottom_top': {
    parent: 'block/cube',
    textures: { particle: '#side', down: '#bottom', up: '#top', north: '#side', east: '#side', south: '#side', west: '#side' },
  },
};

function parseId(id, defaultNs = 'minecraft') {
  const s = String(id);
  const i = s.indexOf(':');
  return i >= 0 ? { ns: s.slice(0, i), path: s.slice(i + 1) } : { ns: defaultNs, path: s };
}

function fullId(id) {
  const p = parseId(id);
  return `${p.ns}:${p.path}`;
}

function builtinKey(id) {
  const p = parseId(id);
  return p.ns === 'minecraft' && BUILTIN[p.path] ? p.path : null;
}

function findPackRoot(start) {
  let dir = path.resolve(start);
  if (exists(dir) && !fs.statSync(dir).isDirectory()) dir = path.dirname(dir);
  for (;;) {
    if (exists(path.join(dir, 'pack.mcmeta'))) return dir;
    if (path.basename(dir) === 'assets') return path.dirname(dir);
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function modelFile(root, id) {
  const p = parseId(id);
  return path.join(root, 'assets', p.ns, 'models', ...p.path.split('/')) + '.json';
}

function textureFile(root, id) {
  const p = parseId(id);
  return path.join(root, 'assets', p.ns, 'textures', ...p.path.split('/')) + '.png';
}

function modelIdFromFile(root, file) {
  if (!root) return null;
  const r = path.relative(path.join(root, 'assets'), file).split(path.sep);
  if (r.length < 3 || r[1] !== 'models') return null;
  return `${r[0]}:${r.slice(2).join('/').replace(/\.json$/, '')}`;
}

function resolveTexture(ref, textures) {
  let cur = ref;
  for (let i = 0; i < 16 && typeof cur === 'string' && cur.startsWith('#'); i++) {
    cur = textures[cur.slice(1)];
  }
  if (typeof cur === 'string' && !cur.startsWith('#')) return cur;
  return null;
}

// Load a model and merge its parent chain. Never throws for unknown vanilla parents.
function loadModel(file, opts = {}) {
  const root = opts.root !== undefined ? opts.root : findPackRoot(file);
  const raw = opts.raw || readJson(file);
  const chain = [];
  const problems = [];
  const layers = [{ source: file, json: raw }];
  let parent = raw.parent;
  let parentUnknown = false;
  let generated = false;
  let builtinEntity = false;
  const seen = new Set();
  while (parent) {
    const id = fullId(parent);
    if (seen.has(id)) {
      problems.push({ path: 'parent', message: `parent cycle at ${id}` });
      break;
    }
    seen.add(id);
    chain.push(id);
    const pf = root ? modelFile(root, id) : null;
    if (pf && exists(pf)) {
      const json = readJson(pf);
      layers.push({ source: pf, json });
      parent = json.parent;
      continue;
    }
    const key = builtinKey(id);
    if (key) {
      const b = BUILTIN[key];
      if (b.generated) generated = true;
      if (b.builtinEntity) builtinEntity = true;
      layers.push({ source: `builtin:${key}`, json: b });
      parent = b.parent;
      continue;
    }
    if (parseId(id).ns === 'minecraft') {
      parentUnknown = true;
    } else {
      problems.push({ path: 'parent', message: `parent model ${id} not found${root ? '' : ' (no pack root found)'}` });
    }
    break;
  }
  const textures = {};
  const display = {};
  let elements = null;
  let guiLight;
  let ao;
  for (let i = layers.length - 1; i >= 0; i--) {
    const j = layers[i].json;
    if (j.textures) Object.assign(textures, j.textures);
    if (j.display) for (const [k, v] of Object.entries(j.display)) display[k] = Object.assign({}, display[k], v);
    if (Array.isArray(j.elements)) elements = j.elements;
    if (j.gui_light) guiLight = j.gui_light;
    if (j.ambientocclusion !== undefined) ao = j.ambientocclusion;
  }
  return {
    file,
    root,
    id: modelIdFromFile(root, file),
    raw,
    chain,
    elements: elements || [],
    ownElements: Array.isArray(raw.elements),
    textures,
    display,
    gui_light: guiLight,
    ambientocclusion: ao,
    generated: generated && !elements,
    builtinEntity,
    parentUnknown,
    problems,
  };
}

function elementName(el, i) {
  return el.name || el.__name || `element_${i}`;
}

function bounds(elements) {
  const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const e of elements) {
    for (let k = 0; k < 3; k++) {
      b.min[k] = Math.min(b.min[k], e.from[k], e.to[k]);
      b.max[k] = Math.max(b.max[k], e.from[k], e.to[k]);
    }
  }
  if (!elements.length) return { min: [0, 0, 0], max: [0, 0, 0] };
  return b;
}

// Default UV the game derives from element position when "uv" is omitted.
function autoUv(face, from, to) {
  const [x1, y1, z1] = from;
  const [x2, y2, z2] = to;
  switch (face) {
    case 'north': return [16 - x2, 16 - y2, 16 - x1, 16 - y1];
    case 'south': return [x1, 16 - y2, x2, 16 - y1];
    case 'east': return [16 - z2, 16 - y2, 16 - z1, 16 - y1];
    case 'west': return [z1, 16 - y2, z2, 16 - y1];
    case 'up': return [x1, z1, x2, z2];
    case 'down': return [x1, 16 - z2, x2, 16 - z1];
    default: return [0, 0, 16, 16];
  }
}

module.exports = {
  FACES,
  BUILTIN,
  BLOCK_DISPLAY,
  ITEM_DISPLAY,
  HANDHELD_DISPLAY,
  parseId,
  fullId,
  builtinKey,
  findPackRoot,
  modelFile,
  textureFile,
  modelIdFromFile,
  resolveTexture,
  loadModel,
  elementName,
  bounds,
  autoUv,
};
