'use strict';

const path = require('path');
const validate = require('./validate');
const briefLib = require('./brief');
const render = require('./render');
const preview = require('./preview');
const { loadModel, resolveTexture, textureFile, parseId, findPackRoot, FACES, autoUv } = require('./model');
const { exists, isDir, rel, usage } = require('./util');
const { Image } = require('./image');

const AXIS = { north: [2, -1], south: [2, 1], west: [0, -1], east: [0, 1], down: [1, -1], up: [1, 1] };
const EPS = 1e-6;

function unrotated(el) {
  return !el.rotation || !el.rotation.angle;
}

// Is face f of element a fully covered by a single other unrotated element?
// Assumes opaque textures.
function faceHidden(elements, ai, face) {
  const a = elements[ai];
  if (!unrotated(a)) return false;
  const [k, s] = AXIS[face];
  const v = s > 0 ? a.to[k] : a.from[k];
  const others = [0, 1, 2].filter((x) => x !== k);
  return elements.some((b, bi) => {
    if (bi === ai || !unrotated(b)) return false;
    if (!Object.keys(b.faces || {}).length) return false;
    if ([0, 1, 2].some((x) => b.to[x] - b.from[x] <= EPS)) return false;
    const occupies = s > 0 ? b.from[k] <= v + EPS && b.to[k] > v + EPS : b.from[k] < v - EPS && b.to[k] >= v - EPS;
    if (!occupies) return false;
    return others.every((x) => b.from[x] <= a.from[x] + EPS && b.to[x] >= a.to[x] - EPS);
  });
}

function faceArea(el, face) {
  const [k] = AXIS[face];
  const o = [0, 1, 2].filter((x) => x !== k);
  return (el.to[o[0]] - el.from[o[0]]) * (el.to[o[1]] - el.from[o[1]]);
}

function hiddenFaces(elements) {
  const out = [];
  elements.forEach((el, i) => {
    for (const face of Object.keys(el.faces || {})) {
      if (FACES.includes(face) && faceHidden(elements, i, face)) out.push({ element: i, face });
    }
  });
  return out;
}

function openFaces(elements) {
  const out = [];
  elements.forEach((el, i) => {
    if (!Object.keys(el.faces || {}).length) return;
    for (const face of FACES) {
      if (el.faces[face] || faceArea(el, face) <= EPS) continue;
      if (!faceHidden(elements, i, face)) out.push({ element: i, face });
    }
  });
  return out;
}

function bleed(m) {
  const out = [];
  const sizes = {};
  const sizeOf = (id) => {
    if (id in sizes) return sizes[id];
    let s = null;
    if (m.root && id && parseId(id).ns !== 'minecraft') {
      const f = textureFile(m.root, id);
      if (exists(f)) {
        const img = Image.load(f);
        s = [img.width, img.width];
      }
    }
    sizes[id] = s;
    return s;
  };
  m.elements.forEach((el, i) => {
    for (const [face, fd] of Object.entries(el.faces || {})) {
      const id = resolveTexture(fd.texture, m.textures);
      const s = sizeOf(id);
      const uv = Array.isArray(fd.uv) ? fd.uv : autoUv(face, el.from, el.to);
      if (Math.abs(uv[2] - uv[0]) < EPS && Math.abs(uv[3] - uv[1]) < EPS && faceArea(el, face) > EPS) {
        out.push({ element: i, face, message: 'UV area is zero (face shows a single pixel)' });
        continue;
      }
      if (!s) continue;
      const px = uv.map((v, j) => (v * s[j % 2]) / 16);
      if (px.some((p) => Math.abs(p - Math.round(p)) > 0.01)) {
        out.push({ element: i, face, message: `UV ${JSON.stringify(uv)} is not on the ${s[0]}px texture grid (bleeds between pixels)` });
      }
    }
  });
  return out;
}

function compareRenders(a, b, size = 128) {
  const qa = render.quadsForModel(a);
  const qb = render.quadsForModel(b);
  const frame = render.frameFor(qa);
  let worst = 0;
  for (const v of preview.DEFAULT_VIEWS) {
    const cam = render.VIEWS[v];
    const ia = render.renderQuads(qa, Object.assign({ size, frame }, cam));
    const ib = render.renderQuads(qb, Object.assign({ size, frame }, cam));
    worst = Math.max(worst, preview.diff(ia, ib));
  }
  return worst;
}

function scoreModel(m, budget, baseline) {
  const checks = [];
  const add = (name, pass, detail, level = 'fail') => checks.push({ name, pass, level: pass ? 'ok' : level, detail });
  const els = m.elements;
  const bad = els.filter((e) => [0, 1, 2].some((k) => e.from[k] < -16 || e.to[k] > 32));
  add('bounds', bad.length === 0, bad.length ? `${bad.length} elements outside -16..32` : 'all elements within -16..32');
  const empty = els.map((e, i) => (!Object.keys(e.faces || {}).length ? i : -1)).filter((i) => i >= 0);
  add('faces', empty.length === 0, empty.length ? `elements without faces: ${empty.join(', ')}` : 'every element has faces');
  const open = openFaces(els);
  add('face_coverage', open.length === 0, open.length ? `${open.length} visible faces have no texture (holes): ${open.slice(0, 8).map((o) => `#${o.element}.${o.face}`).join(' ')}` : 'no holes', 'warn');
  const hidden = hiddenFaces(els);
  add('hidden_faces', hidden.length === 0, hidden.length ? `${hidden.length} faces are fully covered and wasted: ${hidden.slice(0, 8).map((o) => `#${o.element}.${o.face}`).join(' ')}` : 'no wasted faces', 'warn');
  const bl = bleed(m);
  add('texture_bleed', bl.length === 0, bl.length ? bl.slice(0, 6).map((b) => `#${b.element}.${b.face}: ${b.message}`).join('; ') : 'UVs on the pixel grid', 'warn');
  add('element_budget', els.length <= budget, `${els.length} elements, budget ${budget === Infinity ? 'unlimited' : budget}`);
  if (baseline) {
    const d = compareRenders(baseline, m);
    add('visual_match', d <= 0.005, `${(d * 100).toFixed(2)}% of pixels differ from baseline (limit 0.5%)`);
  }
  return checks;
}

function run(target, opts = {}) {
  if (!target) throw usage('score needs a pack or model path');
  const abs = path.resolve(target);
  if (!exists(abs)) throw usage(`${target}: not found`);
  let budget = Infinity;
  if (opts.brief) budget = briefLib.budgetOf(briefLib.load(opts.brief).spec);
  if (opts.budget !== undefined) budget = briefLib.BUDGETS[opts.budget] !== undefined ? briefLib.BUDGETS[opts.budget] : Number(opts.budget);
  const val = validate.run(abs, { version: opts.version });
  const models = [];
  const files = isDir(abs) ? preview.packModels(findPackRoot(path.join(abs, 'x')) || abs) : [abs];
  const baseline = opts.baseline ? loadModel(path.resolve(opts.baseline)) : null;
  for (const f of files) {
    let m;
    try {
      m = loadModel(f);
    } catch {
      continue;
    }
    if (!m.elements.length) continue;
    models.push({ file: rel(f), id: m.id, elements: m.elements.length, faces: m.elements.reduce((n, e) => n + Object.keys(e.faces || {}).length, 0), checks: scoreModel(m, budget, baseline) });
  }
  const failures = [];
  if (val.errors) failures.push(`validate: ${val.errors} errors`);
  for (const m of models) for (const c of m.checks) if (c.level === 'fail') failures.push(`${m.file}: ${c.name}: ${c.detail}`);
  return { pass: failures.length === 0, validate: { errors: val.errors, problems: val.problems }, models, failures };
}

function text(r) {
  const lines = [`score: ${r.pass ? 'PASS' : 'FAIL'}`];
  if (r.validate.problems.length) lines.push(validate.format(r.validate.problems));
  for (const m of r.models) {
    lines.push(`${m.file}: ${m.elements} elements, ${m.faces} faces`);
    for (const c of m.checks) lines.push(`  [${c.level}] ${c.name}: ${c.detail}`);
  }
  return lines.join('\n');
}

module.exports = { run, text, hiddenFaces, openFaces, faceHidden, compareRenders, bleed };
