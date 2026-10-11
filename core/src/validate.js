'use strict';

const path = require('path');
const versions = require('./versions');
const { FACES, loadModel, resolveTexture, textureFile, modelFile, parseId, builtinKey, findPackRoot } = require('./model');
const { tryReadJson, isDir, walk, exists, rel, usage } = require('./util');
const { Image } = require('./image');

const MODEL_KEYS = ['parent', 'ambientocclusion', 'display', 'textures', 'elements', 'gui_light', 'overrides', 'credit', 'groups', 'texture_size', 'name'];
const ELEMENT_KEYS = ['from', 'to', 'rotation', 'shade', 'faces', 'light_emission', 'name', 'color', '__comment'];
const FACE_KEYS = ['uv', 'texture', 'cullface', 'rotation', 'tintindex'];
const ID_RE = /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;

function isVec(v, n = 3) {
  return Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

// Geometry rules shared by validate and brief check.
function checkElement(el, at, rules, push) {
  if (!el || typeof el !== 'object') return push('error', at, 'element must be an object');
  for (const k of Object.keys(el)) if (!ELEMENT_KEYS.includes(k)) push('warning', `${at}.${k}`, 'unknown element key, ignored by the game');
  const [lo, hi] = rules.coordinate_range;
  for (const key of ['from', 'to']) {
    if (!isVec(el[key])) push('error', `${at}.${key}`, 'must be [x, y, z] numbers');
    else el[key].forEach((v, i) => {
      if (v < lo || v > hi) push('error', `${at}.${key}[${i}]`, `${v} outside ${lo}..${hi}`);
    });
  }
  if (isVec(el.from) && isVec(el.to)) {
    for (let i = 0; i < 3; i++) {
      if (el.from[i] > el.to[i]) push('error', `${at}`, `from[${i}] (${el.from[i]}) is greater than to[${i}] (${el.to[i]})`);
    }
  }
  if (el.rotation !== undefined) {
    const r = el.rotation;
    const rr = rules.rotation;
    if (!r || typeof r !== 'object') push('error', `${at}.rotation`, 'must be an object');
    else {
      if (r.x !== undefined || r.y !== undefined || r.z !== undefined) push('error', `${at}.rotation`, 'multi-axis rotation is not supported by the target version');
      if (!rr.axes.includes(r.axis)) push('error', `${at}.rotation.axis`, `must be one of ${rr.axes.join(', ')}`);
      if (typeof r.angle !== 'number') push('error', `${at}.rotation.angle`, 'must be a number');
      else {
        if (r.angle < rr.min || r.angle > rr.max) push('error', `${at}.rotation.angle`, `${r.angle} outside ${rr.min}..${rr.max}`);
        if (rr.step && Math.abs(r.angle / rr.step - Math.round(r.angle / rr.step)) > 1e-6) push('error', `${at}.rotation.angle`, `${r.angle} is not a multiple of ${rr.step}`);
      }
      if (!isVec(r.origin)) push('error', `${at}.rotation.origin`, 'must be [x, y, z] numbers');
      if (r.rescale !== undefined && typeof r.rescale !== 'boolean') push('error', `${at}.rotation.rescale`, 'must be true or false');
    }
  }
  if (el.light_emission !== undefined && !(Number.isInteger(el.light_emission) && el.light_emission >= 0 && el.light_emission <= 15)) {
    push('error', `${at}.light_emission`, 'must be an integer 0..15');
  }
  if (!el.faces || typeof el.faces !== 'object' || !Object.keys(el.faces).length) {
    push('warning', `${at}.faces`, 'element has no faces and is invisible');
    return;
  }
  const [ulo, uhi] = rules.uv_range;
  for (const [face, fd] of Object.entries(el.faces)) {
    const fat = `${at}.faces.${face}`;
    if (!FACES.includes(face)) {
      push('error', fat, `unknown face name (use ${FACES.join(', ')})`);
      continue;
    }
    if (!fd || typeof fd !== 'object') {
      push('error', fat, 'face must be an object');
      continue;
    }
    for (const k of Object.keys(fd)) if (!FACE_KEYS.includes(k)) push('warning', `${fat}.${k}`, 'unknown face key, ignored by the game');
    if (typeof fd.texture !== 'string') push('error', `${fat}.texture`, 'missing texture reference');
    if (fd.uv !== undefined) {
      if (!isVec(fd.uv, 4)) push('error', `${fat}.uv`, 'must be [u1, v1, u2, v2]');
      else fd.uv.forEach((v, i) => {
        if (v < ulo || v > uhi) push('error', `${fat}.uv[${i}]`, `${v} outside ${ulo}..${uhi}`);
      });
    }
    if (fd.rotation !== undefined && !rules.face_rotations.includes(fd.rotation)) push('error', `${fat}.rotation`, 'must be 0, 90, 180 or 270');
    if (fd.cullface !== undefined && !FACES.includes(fd.cullface)) push('error', `${fat}.cullface`, 'unknown face name');
    if (fd.tintindex !== undefined && !Number.isInteger(fd.tintindex)) push('error', `${fat}.tintindex`, 'must be an integer');
  }
}

function checkDisplay(display, at, rules, push) {
  if (typeof display !== 'object' || !display) return push('error', at, 'must be an object');
  for (const [k, t] of Object.entries(display)) {
    const dat = `${at}.${k}`;
    if (!rules.display_keys.includes(k)) {
      push('error', dat, `illegal display key (use ${rules.display_keys.join(', ')})`);
      continue;
    }
    for (const key of Object.keys(t || {})) {
      if (!['rotation', 'translation', 'scale'].includes(key)) push('warning', `${dat}.${key}`, 'unknown transform key');
      else if (!isVec(t[key])) push('error', `${dat}.${key}`, 'must be [x, y, z] numbers');
    }
    if (isVec(t.translation) && t.translation.some((v) => Math.abs(v) > 80)) push('error', `${dat}.translation`, 'values are clamped to -80..80');
    if (isVec(t.scale) && t.scale.some((v) => v > 4)) push('error', `${dat}.scale`, 'values are clamped to at most 4');
  }
}

function validateModel(file, info, push, root) {
  const parsed = tryReadJson(file);
  if (parsed.error) return push('error', '$', `invalid JSON: ${parsed.error}`);
  const json = parsed.value;
  if (!json || typeof json !== 'object' || Array.isArray(json)) return push('error', '$', 'model must be a JSON object');
  const rules = info ? info.rules : versions.rules();
  for (const k of Object.keys(json)) if (!MODEL_KEYS.includes(k)) push('warning', k, 'unknown top-level key, ignored by the game');
  if (json.texture_size) push('warning', 'texture_size', 'texture_size is a Blockbench/OptiFine key; vanilla ignores it');
  if (json.parent !== undefined && typeof json.parent !== 'string') push('error', 'parent', 'must be a string');
  if (json.gui_light !== undefined && !['front', 'side'].includes(json.gui_light)) push('error', 'gui_light', 'must be "front" or "side"');
  if (json.ambientocclusion !== undefined && typeof json.ambientocclusion !== 'boolean') push('error', 'ambientocclusion', 'must be true or false');
  if (json.elements !== undefined) {
    if (!Array.isArray(json.elements)) push('error', 'elements', 'must be an array');
    else json.elements.forEach((el, i) => checkElement(el, `elements[${i}]`, rules, push));
  }
  if (json.display !== undefined) checkDisplay(json.display, 'display', rules, push);
  if (json.textures !== undefined) {
    if (typeof json.textures !== 'object') push('error', 'textures', 'must be an object');
    else for (const [k, v] of Object.entries(json.textures)) {
      if (typeof v !== 'string') push('error', `textures.${k}`, 'must be a string');
      else if (!v.startsWith('#') && !ID_RE.test(v)) push('error', `textures.${k}`, `"${v}" is not a valid resource location (lowercase a-z 0-9 _ . - /)`);
    }
  }
  let m;
  try {
    m = loadModel(file, { raw: json, root });
  } catch (err) {
    return push('error', 'parent', err.message);
  }
  for (const p of m.problems) push('error', p.path, p.message);
  if (m.parentUnknown) push('warning', 'parent', `vanilla parent ${m.chain[m.chain.length - 1]} not checked (game assets not shipped)`);
  // Texture references resolve through the parent chain; custom textures must exist.
  for (const [k, v] of Object.entries(m.textures)) {
    const id = resolveTexture(typeof v === 'string' && v.startsWith('#') ? v : `#${k}`, m.textures);
    if (!id) continue;
    if (parseId(id).ns !== 'minecraft' && root && !exists(textureFile(root, id))) {
      push('error', `textures.${k}`, `texture file not found: ${rel(textureFile(root, id))}`);
    }
  }
  if (Array.isArray(json.elements)) {
    json.elements.forEach((el, i) => {
      for (const [face, fd] of Object.entries((el && el.faces) || {})) {
        if (!fd || typeof fd.texture !== 'string') continue;
        if (!resolveTexture(fd.texture, m.textures) && !m.parentUnknown) {
          push('error', `elements[${i}].faces.${face}.texture`, `${fd.texture} does not resolve to a texture`);
        }
      }
    });
  }
  if (json.overrides !== undefined) {
    if (info && info.item_definitions) push('warning', 'overrides', `overrides are ignored from 1.21.4; use assets/<ns>/items/ definitions (target ${info.version})`);
    if (!Array.isArray(json.overrides)) push('error', 'overrides', 'must be an array');
    else json.overrides.forEach((o, i) => {
      if (!o || typeof o.model !== 'string') push('error', `overrides[${i}].model`, 'missing model');
      else checkModelRef(o.model, `overrides[${i}].model`, root, push);
      if (!o || typeof o.predicate !== 'object') push('error', `overrides[${i}].predicate`, 'missing predicate');
    });
  }
}

function checkModelRef(id, at, root, push) {
  if (builtinKey(id)) return;
  if (!root) return;
  if (exists(modelFile(root, id))) return;
  if (parseId(id).ns === 'minecraft') return push('warning', at, `vanilla model ${id} not checked`);
  push('error', at, `model ${id} not found`);
}

// Item definitions (1.21.4+): walk the nested model tree for "model" references.
function validateItemDef(file, info, push, root) {
  const parsed = tryReadJson(file);
  if (parsed.error) return push('error', '$', `invalid JSON: ${parsed.error}`);
  const json = parsed.value;
  if (info && !info.item_definitions) push('warning', '$', `items/ definitions are ignored before 1.21.4 (target ${info.version})`);
  if (!json || typeof json.model !== 'object') return push('error', 'model', 'item definition needs a "model" object');
  const visit = (node, at) => {
    if (Array.isArray(node)) return node.forEach((n, i) => visit(n, `${at}[${i}]`));
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'string' && /(^|:)model$/.test(node.type)) {
      if (typeof node.model !== 'string') push('error', `${at}.model`, 'model type needs a "model" id');
      else checkModelRef(node.model, `${at}.model`, root, push);
    }
    for (const [k, v] of Object.entries(node)) if (typeof v === 'object') visit(v, `${at}.${k}`);
  };
  visit(json.model, 'model');
}

function validatePackMeta(file, info, push) {
  const parsed = tryReadJson(file);
  if (parsed.error) return push('error', '$', `invalid JSON: ${parsed.error}`);
  const p = parsed.value && parsed.value.pack;
  if (!p) return push('error', 'pack', 'missing "pack" object');
  if (typeof p.pack_format !== 'number') push('error', 'pack.pack_format', 'must be a number');
  else if (info && p.pack_format !== info.resource_pack_format) {
    push('error', 'pack.pack_format', `${p.pack_format} does not match ${info.version} (expected ${info.resource_pack_format})`);
  } else if (!versions.byPackFormat(p.pack_format)) {
    push('warning', 'pack.pack_format', `${p.pack_format} is not a format in version-matrix.json`);
  }
  if (p.description === undefined) push('warning', 'pack.description', 'missing description');
}

function validateMcmeta(file, push) {
  const parsed = tryReadJson(file);
  if (parsed.error) return push('error', '$', `invalid JSON: ${parsed.error}`);
  const a = parsed.value && parsed.value.animation;
  if (!a) return;
  if (a.frametime !== undefined && !(Number.isInteger(a.frametime) && a.frametime >= 1)) push('error', 'animation.frametime', 'must be an integer >= 1');
  const png = file.replace(/\.mcmeta$/, '');
  if (!exists(png)) return push('error', '$', 'no matching PNG for this .mcmeta');
  const img = Image.load(png);
  const fw = a.width || img.width;
  const fh = a.height || img.width;
  if (img.height % fh !== 0 || img.width % fw !== 0) push('error', '$', `PNG ${img.width}x${img.height} is not a whole number of ${fw}x${fh} frames`);
}

// Validate a file or a whole pack. Returns {problems, files}.
function run(target, opts = {}) {
  const abs = path.resolve(target);
  if (!exists(abs)) throw usage(`${target}: not found`);
  const info = opts.version ? versions.get(opts.version) : null;
  const problems = [];
  const files = [];
  const pushFor = (file) => (level, at, message) => problems.push({ file: rel(file), path: at, level, message });
  const handle = (file, root) => {
    files.push(rel(file));
    const parts = path.relative(root || path.dirname(file), file).split(path.sep);
    const push = pushFor(file);
    if (path.basename(file) === 'pack.mcmeta') return validatePackMeta(file, info, push);
    if (file.endsWith('.png.mcmeta')) return validateMcmeta(file, push);
    if (parts[0] === 'assets' && parts[2] === 'items') return validateItemDef(file, info, push, root);
    return validateModel(file, info, push, root);
  };
  if (isDir(abs)) {
    const root = findPackRoot(path.join(abs, 'x')) || abs;
    if (exists(path.join(root, 'pack.mcmeta'))) handle(path.join(root, 'pack.mcmeta'), root);
    else problems.push({ file: rel(root), path: '$', level: 'error', message: 'pack.mcmeta not found' });
    const list = walk(path.join(root, 'assets'), (f) => {
      const p = path.relative(path.join(root, 'assets'), f).split(path.sep);
      return (f.endsWith('.json') && (p[1] === 'models' || p[1] === 'items')) || f.endsWith('.png.mcmeta');
    });
    for (const f of list) handle(f, root);
  } else {
    handle(abs, findPackRoot(abs));
  }
  return { problems, files, errors: problems.filter((p) => p.level === 'error').length };
}

function format(problems) {
  return problems.map((p) => `${p.file}:${p.path}: ${p.level === 'warning' ? 'warning: ' : ''}${p.message}`).join('\n');
}

module.exports = { run, format, checkElement, checkDisplay, isVec };
