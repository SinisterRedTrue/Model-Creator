'use strict';

const fs = require('fs');
const path = require('path');
const versions = require('./versions');
const review = require('./review');
const { zipDir } = require('./zip');
const { loadModel, findPackRoot, resolveTexture, textureFile, modelFile, parseId, builtinKey } = require('./model');
const { readJson, writeJson, exists, isDir, walk, rel, usage, ensureDir } = require('./util');

// Files (relative to pack root) that one model needs.
function modelClosure(root, file) {
  const files = new Set();
  const m = loadModel(file, { root });
  const add = (f) => {
    if (exists(f)) files.add(path.relative(root, f));
  };
  add(file);
  for (const id of m.chain) if (!builtinKey(id)) add(modelFile(root, id));
  for (const k of Object.keys(m.textures)) {
    const id = resolveTexture(`#${k}`, m.textures);
    if (id && parseId(id).ns !== 'minecraft') {
      add(textureFile(root, id));
      add(textureFile(root, id) + '.mcmeta');
    }
  }
  // Item definitions and vanilla wiring that point at this model.
  for (const f of walk(path.join(root, 'assets'), (x) => x.endsWith('.json'))) {
    const p = path.relative(path.join(root, 'assets'), f).split(path.sep);
    if (p[1] !== 'items' && !(p[0] === 'minecraft' && p[1] === 'models')) continue;
    if (fs.readFileSync(f, 'utf8').includes(`"${m.id}"`)) add(f);
  }
  return { files: [...files], id: m.id };
}

function sourceFiles(input) {
  const abs = path.resolve(input);
  if (!exists(abs)) throw usage(`${input}: not found`);
  if (isDir(abs)) {
    const root = findPackRoot(path.join(abs, 'x')) || abs;
    return { root, files: walk(root).map((f) => path.relative(root, f)), label: path.basename(root) };
  }
  const root = findPackRoot(abs);
  if (!root) throw usage(`${input} is not inside a resource pack`);
  const c = modelClosure(root, abs);
  if (exists(path.join(root, 'pack.mcmeta'))) c.files.push('pack.mcmeta');
  return { root, files: c.files, label: c.id };
}

function nsOf(relPath) {
  const p = relPath.split(path.sep);
  return p[0] === 'assets' ? p[1] : null;
}

function renameNs(text, from, to) {
  return text.split(`"${from}:`).join(`"${to}:`);
}

function sameFile(a, b) {
  return exists(a) && exists(b) && fs.readFileSync(a).equals(fs.readFileSync(b));
}

// Merge custom_model_data dispatch / overrides; moves colliding values.
function mergeVanillaJson(dest, incoming, cmdMoves, label) {
  const cur = readJson(dest);
  const rd = (j) => j && j.model && /range_dispatch$/.test(j.model.type || '') && /custom_model_data$/.test(j.model.property || '') ? j.model : null;
  const a = rd(cur);
  const b = rd(incoming);
  if (a && b) {
    const used = new Set(a.entries.map((e) => e.threshold));
    for (const e of b.entries) {
      const dup = a.entries.find((x) => x.threshold === e.threshold);
      if (dup && JSON.stringify(dup.model) === JSON.stringify(e.model)) continue;
      let t = e.threshold;
      if (used.has(t)) {
        t = Math.max(...used) + 1;
        cmdMoves.push({ source: label, file: rel(dest), from: e.threshold, to: t, model: e.model.model || null });
      }
      used.add(t);
      a.entries.push(Object.assign({}, e, { threshold: t }));
    }
    a.entries.sort((x, y) => x.threshold - y.threshold);
    writeJson(dest, cur);
    return true;
  }
  if (Array.isArray(cur.overrides) && Array.isArray(incoming.overrides)) {
    const used = new Set(cur.overrides.map((o) => o.predicate && o.predicate.custom_model_data));
    for (const o of incoming.overrides) {
      const v = o.predicate && o.predicate.custom_model_data;
      if (v === undefined) {
        cur.overrides.push(o);
        continue;
      }
      const dup = cur.overrides.find((x) => x.predicate && x.predicate.custom_model_data === v);
      if (dup && dup.model === o.model) continue;
      let t = v;
      if (used.has(t)) {
        t = Math.max(...[...used].filter((x) => x !== undefined)) + 1;
        cmdMoves.push({ source: label, file: rel(dest), from: v, to: t, model: o.model });
      }
      used.add(t);
      cur.overrides.push(Object.assign({}, o, { predicate: Object.assign({}, o.predicate, { custom_model_data: t }) }));
    }
    cur.overrides.sort((x, y) => (x.predicate.custom_model_data || 0) - (y.predicate.custom_model_data || 0));
    writeJson(dest, cur);
    return true;
  }
  return false;
}

function run(inputs, opts = {}) {
  if (!inputs || inputs.length < 1) throw usage('usage: mcmodel pack <paths...> --out <dir> [--zip]');
  const out = path.resolve(opts.out || path.join('mcmodel-out', opts.name || 'merged_pack'));
  if (exists(out) && walk(out).length) throw usage(`${rel(out)} is not empty; choose a new --out folder`);
  ensureDir(out);
  const sources = inputs.map(sourceFiles);
  const renames = [];
  const cmdMoves = [];
  const skipped = [];
  const formats = new Set();
  let icon = null;
  sources.forEach((src) => {
    const meta = path.join(src.root, 'pack.mcmeta');
    if (exists(meta)) {
      try {
        formats.add(readJson(meta).pack.pack_format);
      } catch {
        skipped.push(`${src.label}: unreadable pack.mcmeta`);
      }
    }
    if (!icon && exists(path.join(src.root, 'pack.png'))) icon = path.join(src.root, 'pack.png');
    // Namespace collisions: rename this source's namespace if any file differs.
    const map = {};
    const nss = [...new Set(src.files.map(nsOf).filter((n) => n && n !== 'minecraft'))];
    for (const ns of nss) {
      const clash = src.files.some((f) => nsOf(f) === ns && exists(path.join(out, f)) && !sameFile(path.join(out, f), path.join(src.root, f)));
      if (!clash) continue;
      let n = 2;
      while (exists(path.join(out, 'assets', `${ns}_${n}`))) n++;
      map[ns] = `${ns}_${n}`;
      renames.push({ source: src.label, from: ns, to: map[ns] });
    }
    for (const f of src.files) {
      if (f === 'pack.mcmeta' || f === 'pack.png') continue;
      const parts = f.split(path.sep);
      if (parts[0] === 'assets' && map[parts[1]]) parts[1] = map[parts[1]];
      const dest = path.join(out, ...parts);
      const srcFile = path.join(src.root, f);
      let content = fs.readFileSync(srcFile);
      if (f.endsWith('.json') || f.endsWith('.mcmeta')) {
        let text = content.toString('utf8');
        for (const [a, b] of Object.entries(map)) text = renameNs(text, a, b);
        content = Buffer.from(text, 'utf8');
      }
      if (exists(dest)) {
        if (fs.readFileSync(dest).equals(content)) continue;
        if (parts[1] === 'minecraft' && f.endsWith('.json') && mergeVanillaJson(dest, JSON.parse(content.toString('utf8')), cmdMoves, src.label)) continue;
        skipped.push(`${rel(dest)}: already provided by an earlier input; kept the first`);
        continue;
      }
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, content);
    }
  });
  const info = opts.version ? versions.get(opts.version) : null;
  const format = info ? info.resource_pack_format : Math.max(...(formats.size ? formats : [versions.get(versions.latest()).resource_pack_format]));
  if (formats.size > 1 && !info) skipped.push(`inputs use different pack formats (${[...formats].join(', ')}); used ${format}. Run convert on older packs first`);
  writeJson(path.join(out, 'pack.mcmeta'), { pack: { pack_format: format, description: `Merged by Model Creator: ${sources.map((s) => s.label).join(', ')}` } });
  if (icon) fs.copyFileSync(icon, path.join(out, 'pack.png'));
  let zip = null;
  if (opts.zip) zip = rel(zipDir(out, `${out}.zip`).file);
  const v = review.detectVersion(out);
  return { out: rel(out), zip, pack_format: format, version: v ? v.version : null, sources: sources.map((s) => s.label), namespace_renames: renames, custom_model_data_moves: cmdMoves, notes: skipped };
}

module.exports = { run, modelClosure };
