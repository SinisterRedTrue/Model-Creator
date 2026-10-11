'use strict';

const fs = require('fs');
const path = require('path');
const versions = require('./versions');
const validate = require('./validate');
const review = require('./review');
const describe = require('./describe');
const { javaToBbmodel, bbmodelToJava } = require('./bbmodel');
const { HANDHELD } = require('./scaffold');
const { loadModel, findPackRoot, modelFile, textureFile } = require('./model');
const { readJson, writeJson, copyDir, exists, isDir, walk, rel, usage, slug } = require('./util');

function groupsFromNames(m) {
  return Object.entries(describe.partsOf(m.elements)).map(([name, elements]) => {
    const els = elements.map((i) => m.elements[i]);
    const minY = Math.min(...els.map((e) => e.from[1]));
    const cx = (Math.min(...els.map((e) => e.from[0])) + Math.max(...els.map((e) => e.to[0]))) / 2;
    const cz = (Math.min(...els.map((e) => e.from[2])) + Math.max(...els.map((e) => e.to[2]))) / 2;
    return { name, origin: [cx, minY, cz], elements };
  });
}

function toBbmodel(abs, out) {
  const m = loadModel(abs);
  if (!m.elements.length) throw usage(`${abs}: model has no elements to convert`);
  const name = path.basename(abs, '.json');
  const file = path.resolve(out || path.join(path.dirname(abs), `${name}.bbmodel`));
  writeJson(file, javaToBbmodel(m, { name, groups: groupsFromNames(m) }));
  return { from: rel(abs), to: 'bbmodel', files: [rel(file)], warnings: [] };
}

function bbmodelToPack(abs, info, opts) {
  const c = bbmodelToJava(abs);
  const ns = opts.namespace || 'custom';
  const name = slug(path.basename(abs, '.bbmodel')).replace(/[^a-z0-9_]/g, '_');
  const out = path.resolve(opts.out || path.join('mcmodel-out', name));
  const files = [];
  writeJson(path.join(out, 'pack.mcmeta'), { pack: { pack_format: info.resource_pack_format, description: `${name} - converted by Model Creator` } });
  files.push(path.join(out, 'pack.mcmeta'));
  const textures = {};
  for (const [k, v] of Object.entries(c.model.textures)) {
    if (v.startsWith('#')) {
      textures[k] = v;
      continue;
    }
    const id = `${ns}:item/${name}_${k}`;
    textures[k] = id;
    if (c.images[v]) {
      c.images[v].save(textureFile(out, id));
      files.push(textureFile(out, id));
    }
  }
  const modelId = `${ns}:item/${name}`;
  writeJson(modelFile(out, modelId), { credit: 'Converted by Model Creator', textures, elements: c.model.elements });
  files.push(modelFile(out, modelId));
  if (info.item_definitions) {
    const f = path.join(out, 'assets', ns, 'items', `${name}.json`);
    writeJson(f, { model: { type: 'minecraft:model', model: modelId } });
    files.push(f);
  }
  const warnings = c.warnings.slice();
  if (c.animations.length) warnings.push(`${c.animations.length} animations not converted (Java models are static); use animate-model to rebuild them`);
  return { from: rel(abs), to: info.version, out: rel(out), files: files.map((f) => rel(f)), warnings };
}

function overridesToItems(out, warnings, files) {
  const dir = path.join(out, 'assets', 'minecraft', 'models', 'item');
  for (const f of walk(dir, (x) => x.endsWith('.json'))) {
    const j = readJson(f);
    if (!Array.isArray(j.overrides)) continue;
    const base = path.relative(dir, f).replace(/\\/g, '/').replace(/\.json$/, '');
    const entries = [];
    for (const o of j.overrides) {
      const keys = Object.keys(o.predicate || {});
      if (keys.length === 1 && keys[0] === 'custom_model_data') entries.push({ threshold: o.predicate.custom_model_data, model: { type: 'minecraft:model', model: o.model } });
      else warnings.push(`${base}: override with predicate ${JSON.stringify(o.predicate)} needs manual conversion to an items/ condition or select`);
    }
    if (entries.length) {
      const itemFile = path.join(out, 'assets', 'minecraft', 'items', `${base}.json`);
      writeJson(itemFile, {
        model: {
          type: 'minecraft:range_dispatch',
          property: 'minecraft:custom_model_data',
          index: 0,
          entries: entries.sort((a, b) => a.threshold - b.threshold),
          fallback: { type: 'minecraft:model', model: `minecraft:item/${base}` },
        },
      });
      files.push(itemFile);
    }
    const extra = Object.keys(j).filter((k) => !['parent', 'textures', 'overrides'].includes(k));
    if (!extra.length) {
      fs.unlinkSync(f);
    } else {
      delete j.overrides;
      writeJson(f, j);
      files.push(f);
    }
  }
  // Custom models need item definitions to be usable with item_model.
  for (const f of walk(path.join(out, 'assets'), (x) => x.endsWith('.json'))) {
    const p = path.relative(path.join(out, 'assets'), f).split(path.sep);
    if (p[0] === 'minecraft' || p[1] !== 'models' || p[2] !== 'item') continue;
    const name = p.slice(3).join('/').replace(/\.json$/, '');
    const itemFile = path.join(out, 'assets', p[0], 'items', `${name}.json`);
    if (!exists(itemFile)) {
      writeJson(itemFile, { model: { type: 'minecraft:model', model: `${p[0]}:item/${name}` } });
      files.push(itemFile);
    }
  }
}

function itemsToOverrides(out, warnings, files) {
  const dir = path.join(out, 'assets', 'minecraft', 'items');
  for (const f of walk(dir, (x) => x.endsWith('.json'))) {
    const j = readJson(f);
    const base = path.relative(dir, f).replace(/\\/g, '/').replace(/\.json$/, '');
    const m = j.model || {};
    if (/range_dispatch$/.test(m.type || '') && /custom_model_data$/.test(m.property || '') && Array.isArray(m.entries)) {
      const overrides = [];
      for (const e of m.entries) {
        if (e.model && /(^|:)model$/.test(e.model.type || '')) overrides.push({ predicate: { custom_model_data: Math.round(e.threshold) }, model: e.model.model });
        else warnings.push(`${base}: entry at ${e.threshold} is not a plain model and was dropped`);
      }
      const mf = path.join(out, 'assets', 'minecraft', 'models', 'item', `${base}.json`);
      const existing = exists(mf) ? readJson(mf) : { parent: HANDHELD.test(base) ? 'minecraft:item/handheld' : 'minecraft:item/generated', textures: { layer0: `minecraft:item/${base}` } };
      existing.overrides = overrides.sort((a, b) => a.predicate.custom_model_data - b.predicate.custom_model_data);
      writeJson(mf, existing);
      files.push(mf);
    } else {
      warnings.push(`${base}: item definition type ${m.type} has no pre-1.21.4 equivalent; dropped`);
    }
  }
  for (const nsDir of fs.existsSync(path.join(out, 'assets')) ? fs.readdirSync(path.join(out, 'assets')) : []) {
    const items = path.join(out, 'assets', nsDir, 'items');
    if (isDir(items)) fs.rmSync(items, { recursive: true, force: true });
  }
  warnings.push('items/ definitions removed; the target version uses overrides');
}

function packToVersion(root, info, opts) {
  const meta = readJson(path.join(root, 'pack.mcmeta'));
  const from = review.detectVersion(root);
  const out = path.resolve(opts.out || `${root}.${info.version}`);
  if (out === root) throw usage('--out must differ from the source pack');
  copyDir(root, out);
  const files = [];
  const warnings = [];
  meta.pack.pack_format = info.resource_pack_format;
  writeJson(path.join(out, 'pack.mcmeta'), meta);
  files.push(path.join(out, 'pack.mcmeta'));
  const fromDefs = from ? from.item_definitions : exists(path.join(root, 'assets', 'minecraft', 'items'));
  if (!fromDefs && info.item_definitions) overridesToItems(out, warnings, files);
  if (fromDefs && !info.item_definitions) itemsToOverrides(out, warnings, files);
  const val = validate.run(out, { version: info.version });
  return {
    from: from ? from.version : `pack_format ${meta.pack.pack_format}`,
    to: info.version,
    out: rel(out),
    files: files.filter(exists).map((f) => rel(f)),
    warnings,
    validate: { errors: val.errors, problems: val.problems.map((p) => `${p.file}:${p.path}: ${p.message}`) },
  };
}

function run(target, opts = {}) {
  if (!target || !opts.to) throw usage('usage: mcmodel convert <path> --to <version|bbmodel> [--out <path>]');
  const abs = path.resolve(target);
  if (!exists(abs)) throw usage(`${target}: not found`);
  if (opts.to === 'bbmodel') {
    if (isDir(abs) || !abs.endsWith('.json')) throw usage('--to bbmodel needs a model .json file');
    return toBbmodel(abs, opts.out);
  }
  const info = versions.get(opts.to);
  if (abs.endsWith('.bbmodel')) return bbmodelToPack(abs, info, opts);
  const root = isDir(abs) ? findPackRoot(path.join(abs, 'x')) || abs : findPackRoot(abs);
  if (!root || !exists(path.join(root, 'pack.mcmeta'))) throw usage(`${target}: no pack.mcmeta found; version conversion works on packs`);
  return packToVersion(root, info, opts);
}

module.exports = { run, groupsFromNames };
