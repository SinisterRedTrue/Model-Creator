'use strict';

const path = require('path');
const schema = require('./schema');
const texture = require('./texture');
const { Image } = require('./image');
const { loadModel, findPackRoot, resolveTexture, textureFile, modelFile, parseId, elementName } = require('./model');
const { readJson, writeJson, copyDir, exists, walk, rel, usage, CliError, EXIT } = require('./util');
const review = require('./review');

function run(modelPath, specPath, opts = {}) {
  if (!modelPath || !specPath) throw usage('usage: mcmodel variants <model> <variants.json> [--out <dir>]');
  const spec = readJson(path.resolve(specPath));
  const errs = schema.validate(spec, schema.load('variants'));
  if (errs.length) throw new CliError(`${specPath}: invalid variant spec:\n${errs.map((e) => `${e.path}: ${e.message}`).join('\n')}`, EXIT.FAIL);
  const absModel = path.resolve(modelPath);
  const root = findPackRoot(absModel);
  if (!root) throw usage(`${modelPath} is not inside a resource pack (no pack.mcmeta found)`);
  const out = path.resolve(opts.out || `${root}.variants`);
  if (out === root) throw usage('--out must differ from the source pack');
  copyDir(root, out);
  const src = loadModel(path.join(out, path.relative(root, absModel)), { root: out });
  if (!src.id) throw usage(`${modelPath} is not under assets/<ns>/models/`);
  const raw = readJson(src.file);
  const { ns, path: mpath } = parseId(src.id);
  const info = review.detectVersion(out);
  const created = [];
  const files = [];
  let cmd = spec.custom_model_data_start || null;
  for (const v of spec.variants) {
    const json = JSON.parse(JSON.stringify(raw));
    json.textures = Object.assign({}, src.textures, raw.textures || {});
    // Textures: every custom texture gets a recoloured copy named <texture>_<variant>.
    for (const k of Object.keys(json.textures)) {
      if (String(json.textures[k]).startsWith('#')) continue;
      const id = resolveTexture(`#${k}`, json.textures);
      if (!id || parseId(id).ns === 'minecraft') continue;
      const ops = (v.textures && v.textures[k]) || v.texture_ops;
      if (!ops) continue;
      const f = textureFile(out, id);
      if (!exists(f)) continue;
      const newId = `${id}_${v.name}`;
      const img = texture.applyOps(Image.load(f), ops);
      img.save(textureFile(out, newId));
      files.push(textureFile(out, newId));
      if (exists(f + '.mcmeta')) {
        writeJson(textureFile(out, newId) + '.mcmeta', readJson(f + '.mcmeta'));
        files.push(textureFile(out, newId) + '.mcmeta');
      }
      json.textures[k] = newId;
    }
    // Geometry changes keep element order, names and UVs of untouched elements.
    let els = (json.elements || src.elements).map((e) => Object.assign({}, e));
    const names = els.map((e, i) => elementName(e, i));
    if (v.remove_elements) {
      const missing = v.remove_elements.filter((n) => !names.includes(n));
      if (missing.length) throw usage(`variant ${v.name}: no elements named ${missing.join(', ')}`);
      els = els.filter((e, i) => !v.remove_elements.includes(names[i]));
    }
    for (const [n, o] of Object.entries(v.element_overrides || {})) {
      const i = els.findIndex((e, j) => elementName(e, j) === n || e.name === n);
      if (i < 0) throw usage(`variant ${v.name}: no element named ${n}`);
      els[i] = Object.assign({}, els[i], o);
    }
    if (v.add_elements) els.push(...v.add_elements);
    json.elements = els;
    const newModelId = `${ns}:${mpath}_${v.name}`;
    writeJson(modelFile(out, newModelId), json);
    files.push(modelFile(out, newModelId));
    const item = { variant: v.name, model: newModelId };
    if (info && info.item_definitions) {
      const f = path.join(out, 'assets', ns, 'items', `${mpath.split('/').pop()}_${v.name}.json`);
      writeJson(f, { model: { type: 'minecraft:model', model: newModelId } });
      files.push(f);
      item.item_model = `${ns}:${mpath.split('/').pop()}_${v.name}`;
    }
    if (cmd !== null) item.custom_model_data = cmd++;
    created.push(item);
  }
  // Extend base-item wiring so every variant has its own custom_model_data value.
  if (spec.custom_model_data_start) {
    for (const f of walk(path.join(out, 'assets', 'minecraft'), (x) => x.endsWith('.json'))) {
      const j = readJson(f);
      let touched = false;
      const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node.type && /range_dispatch$/.test(node.type) && /custom_model_data$/.test(node.property || '') && Array.isArray(node.entries)) {
          if (node.entries.some((e) => e.model && e.model.model === src.id)) {
            for (const c of created) node.entries.push({ threshold: c.custom_model_data, model: { type: 'minecraft:model', model: c.model } });
            touched = true;
          }
        }
        for (const v of Object.values(node)) if (typeof v === 'object') visit(v);
      };
      visit(j);
      if (Array.isArray(j.overrides) && j.overrides.some((o) => o.model === src.id)) {
        for (const c of created) j.overrides.push({ predicate: { custom_model_data: c.custom_model_data }, model: c.model });
        touched = true;
      }
      if (touched) {
        writeJson(f, j);
        files.push(f);
      }
    }
  }
  return { out: rel(out), base: src.id, variants: created, files: [...new Set(files)].map((f) => rel(f)) };
}

module.exports = { run };
