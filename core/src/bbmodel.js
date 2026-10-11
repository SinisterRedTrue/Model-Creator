'use strict';

// Blockbench .bbmodel <-> Java model conversion.

const crypto = require('crypto');
const { PNG } = require('../vendor/pngjs/png');
const { Image } = require('./image');
const { readJson, slug } = require('./util');
const { FACES, autoUv, resolveTexture, textureFile } = require('./model');
const fs = require('fs');

function uuid(seed) {
  const h = crypto.createHash('sha1').update(String(seed)).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function pngDataUri(img) {
  return 'data:image/png;base64,' + PNG.sync.write({ width: img.width, height: img.height, data: img.data }).toString('base64');
}

function rotationVec(r) {
  if (!r || !r.angle) return [0, 0, 0];
  const v = [0, 0, 0];
  v[{ x: 0, y: 1, z: 2 }[r.axis]] = r.angle;
  return v;
}

// m: loaded Java model (model.loadModel) or {elements, textures, root}.
// opts.groups: [{name, origin, elements: [index]}]; opts.animations: Blockbench animation objects.
function javaToBbmodel(m, opts = {}) {
  const name = opts.name || 'model';
  const texIds = [];
  const varToIndex = {};
  const textures = [];
  const images = opts.images || {};
  for (const el of m.elements) {
    for (const fd of Object.values(el.faces || {})) {
      const id = resolveTexture(fd.texture, m.textures);
      if (id && !texIds.includes(id)) texIds.push(id);
    }
  }
  texIds.forEach((id, i) => {
    let img = images[id];
    if (!img && m.root) {
      const f = textureFile(m.root, id);
      if (fs.existsSync(f)) img = Image.load(f);
    }
    if (!img) {
      img = new Image(16, 16).fill([200, 0, 200, 255]);
    }
    varToIndex[id] = i;
    textures.push({
      path: '',
      name: `${id.split('/').pop()}.png`,
      folder: '',
      namespace: '',
      id: String(i),
      width: img.width,
      height: img.height,
      uv_width: 16,
      uv_height: 16,
      particle: i === 0,
      render_mode: 'default',
      visible: true,
      mode: 'bitmap',
      saved: true,
      uuid: uuid(`${name}:tex:${id}`),
      source: pngDataUri(img),
    });
  });
  const elements = m.elements.map((el, i) => {
    const faces = {};
    for (const face of FACES) {
      const fd = el.faces && el.faces[face];
      if (!fd) continue;
      const id = resolveTexture(fd.texture, m.textures);
      faces[face] = {
        uv: Array.isArray(fd.uv) ? fd.uv.slice() : autoUv(face, el.from, el.to),
        texture: id !== null && id in varToIndex ? varToIndex[id] : null,
      };
      if (fd.rotation) faces[face].rotation = fd.rotation;
      if (fd.tintindex !== undefined) faces[face].tint = fd.tintindex;
    }
    return {
      name: el.name || `cube_${i}`,
      box_uv: false,
      rescale: !!(el.rotation && el.rotation.rescale),
      locked: false,
      render_order: 'default',
      allow_mirror_modeling: true,
      from: el.from.slice(),
      to: el.to.slice(),
      autouv: 0,
      color: i % 8,
      origin: (el.rotation && el.rotation.origin ? el.rotation.origin : [8, 8, 8]).slice(),
      rotation: rotationVec(el.rotation),
      faces,
      type: 'cube',
      uuid: uuid(`${name}:el:${i}`),
    };
  });
  const used = new Set();
  const outliner = [];
  for (const g of opts.groups || []) {
    const children = g.elements.map((i) => {
      used.add(i);
      return elements[i].uuid;
    });
    outliner.push({
      name: g.name,
      origin: (g.origin || [8, 0, 8]).slice(),
      color: 0,
      uuid: g.uuid || uuid(`${name}:group:${g.name}`),
      export: true,
      mirror_uv: false,
      isOpen: true,
      locked: false,
      visibility: true,
      autouv: 0,
      children,
    });
  }
  elements.forEach((e, i) => {
    if (!used.has(i)) outliner.push(e.uuid);
  });
  return {
    meta: { format_version: '4.10', model_format: opts.format || 'java_block', box_uv: false },
    name,
    model_identifier: slug(name),
    visible_box: [1, 1, 0],
    variable_placeholders: '',
    variable_placeholder_buttons: [],
    timeline_setups: [],
    unhandled_root_fields: {},
    resolution: { width: 16, height: 16 },
    elements,
    outliner,
    textures,
    animations: opts.animations || [],
  };
}

function decodeDataUri(src) {
  const m = /^data:image\/png;base64,(.*)$/.exec(src || '');
  if (!m) return null;
  const png = PNG.sync.read(Buffer.from(m[1], 'base64'));
  return new Image(png.width, png.height, Buffer.from(png.data));
}

// Returns {model, images, groups, warnings, animations, name}.
function bbmodelToJava(file, json) {
  const bb = json || readJson(file);
  const warnings = [];
  const res = bb.resolution || { width: 16, height: 16 };
  const images = {};
  const textures = {};
  const texScale = [];
  (bb.textures || []).forEach((t, i) => {
    const v = slug(String(t.name || `texture_${i}`).replace(/\.png$/i, '')).replace(/[^a-z0-9_]/g, '_');
    const id = `bbmodel:${v}`;
    textures[v] = id;
    const img = decodeDataUri(t.source);
    if (img) images[id] = img;
    else warnings.push(`texture ${t.name}: no embedded PNG data`);
    texScale[i] = [16 / (t.uv_width || res.width), 16 / (t.uv_height || res.height), v];
  });
  const vars = Object.keys(textures);
  if (vars.length) textures.particle = `#${vars[0]}`;
  const byUuid = {};
  const elements = [];
  for (const el of bb.elements || []) {
    if (el.type && el.type !== 'cube') {
      warnings.push(`element "${el.name}": ${el.type} elements cannot be Java model elements; skipped`);
      continue;
    }
    if (el.box_uv || (bb.meta && bb.meta.box_uv && el.box_uv !== false)) {
      warnings.push(`element "${el.name}": box UV converted to per-face auto UV; check textures`);
    }
    const out = { name: el.name, from: el.from.slice(), to: el.to.slice(), faces: {} };
    for (let k = 0; k < 3; k++) {
      if (out.from[k] > out.to[k]) [out.from[k], out.to[k]] = [out.to[k], out.from[k]];
    }
    const rot = el.rotation || [0, 0, 0];
    const nz = rot.map((v, i) => [Math.abs(v), i]).filter(([v]) => v > 1e-6);
    if (nz.length) {
      nz.sort((a, b) => b[0] - a[0]);
      const axisIdx = nz[0][1];
      const raw = rot[axisIdx];
      const snapped = Math.max(-45, Math.min(45, Math.round(raw / 22.5) * 22.5));
      if (nz.length > 1) warnings.push(`element "${el.name}": rotation on several axes; kept only ${'xyz'[axisIdx]}`);
      if (snapped !== raw) warnings.push(`element "${el.name}": rotation ${raw} snapped to ${snapped}`);
      if (snapped) out.rotation = { origin: (el.origin || [8, 8, 8]).slice(), axis: 'xyz'[axisIdx], angle: snapped };
    }
    for (const face of FACES) {
      const fd = el.faces && el.faces[face];
      if (!fd || fd.texture === null || fd.texture === undefined) continue;
      const sc = texScale[fd.texture] || [16 / res.width, 16 / res.height, vars[0]];
      const f = { texture: `#${sc[2]}` };
      if (Array.isArray(fd.uv) && !el.box_uv) {
        f.uv = [fd.uv[0] * sc[0], fd.uv[1] * sc[1], fd.uv[2] * sc[0], fd.uv[3] * sc[1]].map((v) => Math.round(v * 1000) / 1000);
        f.uv = f.uv.map((v) => Math.max(0, Math.min(16, v)));
      }
      if (fd.rotation) f.rotation = fd.rotation;
      if (fd.tint !== undefined && fd.tint >= 0) f.tintindex = fd.tint;
      out.faces[face] = f;
    }
    byUuid[el.uuid] = elements.length;
    elements.push(out);
  }
  const groups = [];
  const walkOutliner = (nodes, parentName) => {
    for (const n of nodes || []) {
      if (typeof n === 'string') continue;
      const g = { name: slug(n.name || 'group').replace(/[^a-z0-9_]/g, '_'), origin: n.origin || [8, 8, 8], uuid: n.uuid, parent: parentName || null, elements: [] };
      for (const c of n.children || []) if (typeof c === 'string' && c in byUuid) g.elements.push(byUuid[c]);
      groups.push(g);
      walkOutliner(n.children, g.name);
    }
  };
  walkOutliner(bb.outliner);
  // Blockbench 5 stores groups separately; children are still uuids in outliner.
  if (Array.isArray(bb.groups) && !groups.length) {
    for (const g of bb.groups) {
      groups.push({ name: slug(g.name).replace(/[^a-z0-9_]/g, '_'), origin: g.origin || [8, 8, 8], uuid: g.uuid, parent: null, elements: [] });
    }
  }
  return {
    name: bb.name || 'model',
    model: { textures, elements },
    images,
    groups,
    animations: bb.animations || [],
    warnings,
  };
}

module.exports = { javaToBbmodel, bbmodelToJava, uuid, pngDataUri, decodeDataUri };
