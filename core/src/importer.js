'use strict';

const path = require('path');
const versions = require('./versions');
const review = require('./review');
const describe = require('./describe');
const { bbmodelToJava } = require('./bbmodel');
const { loadModel, resolveTexture, textureFile, parseId } = require('./model');
const { writeJson, exists, rel, usage, slug } = require('./util');

const ELEMENT_KEYS = ['name', 'from', 'to', 'rotation', 'shade', 'light_emission'];
const FACE_KEYS = ['uv', 'rotation', 'tintindex', 'cullface'];

function safe(name) {
  return slug(name).replace(/[^a-z0-9_]/g, '_') || 'part';
}

function cleanElement(el, texVar) {
  const out = {};
  for (const k of ELEMENT_KEYS) if (el[k] !== undefined) out[k] = el[k];
  if (out.rotation) out.rotation = { origin: out.rotation.origin || [8, 8, 8], axis: out.rotation.axis, angle: out.rotation.angle, ...(out.rotation.rescale ? { rescale: true } : {}) };
  out.faces = {};
  for (const [face, fd] of Object.entries(el.faces || {})) {
    const v = texVar(fd.texture);
    if (!v) continue;
    const f = { texture: `#${v}` };
    for (const k of FACE_KEYS) if (fd[k] !== undefined) f[k] = fd[k];
    out.faces[face] = f;
  }
  return out;
}

function run(file, opts = {}) {
  if (!file) throw usage('usage: mcmodel import <file.bbmodel|model.json> [--out <brief.json>] [--version <v>]');
  const abs = path.resolve(file);
  if (!exists(abs)) throw usage(`${file}: not found`);
  const name = safe(path.basename(abs).replace(/\.(bbmodel|json)$/i, ''));
  const outFile = path.resolve(opts.out || path.join('mcmodel-out', 'import', `${name}.brief.json`));
  const outDir = path.dirname(outFile);
  const warnings = [];
  let elements;
  let textures = {};
  let groups;
  let folder = 'item';
  let info = opts.version ? versions.get(opts.version) : null;

  if (abs.endsWith('.bbmodel')) {
    const c = bbmodelToJava(abs);
    warnings.push(...c.warnings);
    for (const [k, id] of Object.entries(c.model.textures)) {
      if (id.startsWith('#')) continue;
      const v = safe(k);
      const png = path.join(outDir, `${name}_textures`, `${v}.png`);
      if (c.images[id]) {
        c.images[id].save(png);
        textures[v] = { file: path.relative(outDir, png).split(path.sep).join('/') };
      }
    }
    const varOf = (ref) => {
      const v = ref && safe(ref.replace(/^#/, ''));
      return v && textures[v] ? v : null;
    };
    elements = c.model.elements.map((e) => cleanElement(e, varOf));
    groups = c.groups.filter((g) => g.elements.length).map((g) => ({ name: safe(g.name), pivot: g.origin, elements: g.elements }));
    if (c.animations.length) warnings.push(`${c.animations.length} animations found (${c.animations.map((a) => a.name).join(', ')}); recreate them with animate-model`);
  } else {
    const m = loadModel(abs);
    if (m.generated) warnings.push('flat generated item (layer textures, no elements); the brief has no geometry to edit');
    if (m.parentUnknown) warnings.push(`vanilla parent ${m.chain[m.chain.length - 1]} not available; inherited elements may be missing`);
    if (m.id && parseId(m.id).path.startsWith('block/')) folder = 'block';
    if (!info) info = review.detectVersion(m.root);
    const idToVar = {};
    const keys = Object.keys(m.textures).sort((a, b) => (a === 'particle') - (b === 'particle'));
    for (const k of keys) {
      const id = resolveTexture(`#${k}`, m.textures);
      if (!id) continue;
      const f = m.root ? textureFile(m.root, id) : null;
      if (!f || !exists(f)) {
        if (parseId(id).ns !== 'minecraft') warnings.push(`texture ${id} not found`);
        continue;
      }
      if (idToVar[id]) continue;
      const v = safe(k === 'particle' ? id.split('/').pop() : k);
      idToVar[id] = v;
      textures[v] = { file: path.relative(outDir, f).split(path.sep).join('/') };
    }
    const varOf = (ref) => {
      const id = resolveTexture(ref, m.textures);
      return id ? idToVar[id] || null : null;
    };
    elements = m.elements.map((e) => cleanElement(e, varOf));
    groups = Object.entries(describe.partsOf(m.elements)).map(([n, idx]) => ({ name: safe(n), elements: idx }));
  }
  const dropped = elements.filter((e) => !Object.keys(e.faces).length).length;
  if (dropped) warnings.push(`${dropped} elements lost every face (vanilla or missing textures); they stay as empty elements`);
  const used = new Set();
  const parts = [];
  for (const g of groups) {
    const els = g.elements.filter((i) => !used.has(i)).map((i) => {
      used.add(i);
      return elements[i];
    });
    if (!els.length) continue;
    let pname = g.name;
    let n = 2;
    while (parts.some((p) => p.name === pname)) pname = `${g.name}_${n++}`;
    parts.push(Object.assign({ name: pname }, g.pivot ? { pivot: g.pivot } : {}, { elements: els }));
  }
  const rest = elements.filter((_, i) => !used.has(i));
  if (rest.length) parts.push({ name: 'ungrouped', elements: rest });
  const brief = {
    schema_version: 1,
    name,
    namespace: opts.namespace || 'custom',
    subject: `Imported from ${path.basename(abs)}`,
    spec: {
      minecraft_version: (info || versions.get(versions.latest())).version,
      model_type: folder === 'block' ? 'block' : 'item',
      delivery: 'vanilla',
      base_item: folder === 'block' ? 'stone' : 'paper',
      budget: 'unlimited',
      defaults_applied: ['minecraft_version', 'model_type', 'delivery', 'base_item', 'budget'],
    },
    textures,
    parts: parts.length ? parts : [{ name: 'empty', elements: [] }],
  };
  writeJson(outFile, brief);
  return { brief: rel(outFile), parts: parts.map((p) => `${p.name}(${p.elements.length})`), textures: Object.keys(textures), warnings };
}

module.exports = { run };
