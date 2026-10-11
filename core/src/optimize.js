'use strict';

const path = require('path');
const score = require('./score');
const { loadModel, findPackRoot, autoUv, FACES } = require('./model');
const { readJson, writeJson, copyDir, exists, rel, usage, isDir } = require('./util');
const preview = require('./preview');
const render = require('./render');
const { montage } = require('./image');

const AXES = [['west', 'east'], ['down', 'up'], ['north', 'south']];
const EPS = 1e-6;

function sameNum(a, b) {
  return Math.abs(a - b) < EPS;
}

function plainFace(el, face) {
  const fd = el.faces[face];
  if (!fd) return true;
  if (fd.rotation) return false;
  return !Array.isArray(fd.uv) || fd.uv.every((v, i) => sameNum(v, autoUv(face, el.from, el.to)[i]));
}

function sameFace(a, b) {
  if (!a || !b) return !a && !b;
  return a.texture === b.texture && (a.tintindex ?? null) === (b.tintindex ?? null) && (a.cullface ?? null) === (b.cullface ?? null);
}

function stripUv(fd) {
  if (!fd) return fd;
  const o = Object.assign({}, fd);
  delete o.uv;
  delete o.rotation;
  return o;
}

// Can elements a and b merge along axis k (a below b)?
function mergeable(a, b, k) {
  if ((a.rotation && a.rotation.angle) || (b.rotation && b.rotation.angle)) return false;
  if ((a.shade ?? true) !== (b.shade ?? true) || (a.light_emission ?? 0) !== (b.light_emission ?? 0)) return false;
  if (!sameNum(a.to[k], b.from[k])) return false;
  for (let o = 0; o < 3; o++) {
    if (o === k) continue;
    if (!sameNum(a.from[o], b.from[o]) || !sameNum(a.to[o], b.to[o])) return false;
  }
  const [lo, hi] = AXES[k];
  if (a.faces[hi] || b.faces[lo]) return false; // touching faces must already be gone
  for (const f of FACES) {
    if (!plainFace(a, f) || !plainFace(b, f)) return false;
    if (f === lo || f === hi) continue;
    if (!sameFace(a.faces[f], b.faces[f])) return false;
  }
  return true;
}

function optimizeElements(input) {
  let els = JSON.parse(JSON.stringify(input)).filter((e) => e && e.faces && Object.keys(e.faces).length);
  // Drop exact duplicates.
  const seen = new Set();
  els = els.filter((e) => {
    const key = JSON.stringify([e.from, e.to, e.rotation || null, e.faces]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  let changed = true;
  let hiddenRemoved = 0;
  let merges = 0;
  while (changed) {
    changed = false;
    for (const h of score.hiddenFaces(els)) {
      if (els[h.element].faces[h.face]) {
        delete els[h.element].faces[h.face];
        hiddenRemoved++;
        changed = true;
      }
    }
    els = els.filter((e) => Object.keys(e.faces).length);
    outer: for (let i = 0; i < els.length; i++) {
      for (let j = 0; j < els.length; j++) {
        if (i === j) continue;
        for (let k = 0; k < 3; k++) {
          if (!mergeable(els[i], els[j], k)) continue;
          const a = els[i];
          const b = els[j];
          const [lo, hi] = AXES[k];
          const faces = {};
          for (const f of FACES) {
            const src = f === lo ? a.faces[f] : f === hi ? b.faces[f] : a.faces[f];
            if (src) faces[f] = stripUv(src);
          }
          const merged = Object.assign({}, a, { from: a.from.slice(), to: a.to.slice(), faces });
          merged.to[k] = b.to[k];
          els[i] = merged;
          els.splice(j, 1);
          merges++;
          changed = true;
          break outer;
        }
      }
    }
  }
  return { elements: els, hiddenRemoved, merges };
}

function countFaces(els) {
  return els.reduce((n, e) => n + Object.keys(e.faces || {}).length, 0);
}

function run(target, opts = {}) {
  if (!target) throw usage('optimize needs a model or pack path');
  const abs = path.resolve(target);
  if (!exists(abs)) throw usage(`${target}: not found`);
  const root = isDir(abs) ? findPackRoot(path.join(abs, 'x')) || abs : findPackRoot(abs);
  if (!root) throw usage(`${target} is not inside a resource pack (no pack.mcmeta found)`);
  const out = path.resolve(opts.out || `${root}.optimized`);
  if (path.resolve(out) === path.resolve(root)) throw usage('--out must differ from the source pack; originals are never overwritten');
  copyDir(root, out);
  const files = isDir(abs) ? preview.packModels(out) : [path.join(out, path.relative(root, abs))];
  const models = [];
  let allMatch = true;
  for (const f of files) {
    const raw = readJson(f);
    if (!Array.isArray(raw.elements) || !raw.elements.length) continue;
    const before = loadModel(path.join(root, path.relative(out, f)), { root });
    const r = optimizeElements(raw.elements);
    const next = Object.assign({}, raw, { elements: r.elements });
    writeJson(f, next);
    const after = loadModel(f, { root: out });
    const diff = score.compareRenders(before, after);
    let reverted = false;
    if (diff > 0.005) {
      writeJson(f, raw);
      reverted = true;
      allMatch = false;
    }
    models.push({
      file: rel(f),
      elements: [raw.elements.length, reverted ? raw.elements.length : r.elements.length],
      faces: [countFaces(raw.elements), reverted ? countFaces(raw.elements) : countFaces(r.elements)],
      merges: reverted ? 0 : r.merges,
      hidden_faces_removed: reverted ? 0 : r.hiddenRemoved,
      pixel_diff: Math.round(diff * 10000) / 100,
      reverted,
    });
  }
  const previews = [];
  if (opts.previews !== false && models.length) {
    for (const m of models) {
      const name = path.basename(m.file, '.json');
      const b = loadModel(path.join(root, path.relative(out, path.resolve(m.file))), { root });
      const a = loadModel(path.resolve(m.file), { root: out });
      const qb = render.quadsForModel(b);
      const qa = render.quadsForModel(a);
      const vb = preview.renderViews(qb, { views: ['iso'] });
      const va = preview.renderViews(qa, { views: ['iso'] });
      const img = montage([{ label: 'before', image: vb.iso }, { label: 'after', image: va.iso }]);
      previews.push(rel(img.save(path.join(`${out}.preview`, `${name}.before-after.png`))));
    }
  }
  return { out: rel(out), visual_match: allMatch, models, previews };
}

function text(r) {
  const lines = [`optimized copy: ${r.out}`];
  for (const m of r.models) {
    lines.push(`${m.file}: elements ${m.elements[0]} -> ${m.elements[1]}, faces ${m.faces[0]} -> ${m.faces[1]} (${m.merges} merges, ${m.hidden_faces_removed} hidden faces removed, ${m.pixel_diff}% pixels differ)${m.reverted ? ' REVERTED: visible result changed' : ''}`);
  }
  for (const p of r.previews) lines.push(`preview: ${p}`);
  lines.push(r.visual_match ? 'visible result unchanged' : 'some models could not be optimized without changing their look');
  return lines.join('\n');
}

module.exports = { run, text, optimizeElements, mergeable };
