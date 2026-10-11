'use strict';

const path = require('path');
const { loadModel, bounds, elementName, resolveTexture } = require('./model');
const { readJson, rel, usage, exists } = require('./util');
const briefLib = require('./brief');

function fmt(v) {
  return `[${v.map((n) => Math.round(n * 1000) / 1000).join(',')}]`;
}

// Group elements into parts by name: "wing_l_0" and "wing_l_1" form part "wing_l".
function partsOf(elements) {
  const parts = {};
  elements.forEach((el, i) => {
    const n = elementName(el, i).replace(/_\d+$/, '');
    (parts[n] = parts[n] || []).push(i);
  });
  return parts;
}

function summary(elements, textures) {
  const b = bounds(elements);
  let faces = 0;
  const list = elements.map((el, i) => {
    const fs = Object.keys(el.faces || {});
    faces += fs.length;
    const r = el.rotation && el.rotation.angle ? ` rot ${el.rotation.axis}${el.rotation.angle} @${fmt(el.rotation.origin || [8, 8, 8])}` : '';
    const tex = [...new Set(Object.values(el.faces || {}).map((f) => f.texture))].join(' ');
    return { index: i, name: elementName(el, i), from: el.from, to: el.to, rotation: el.rotation || null, faces: fs, line: `#${i} ${elementName(el, i)} ${fmt(el.from)}->${fmt(el.to)}${r} faces:${fs.join(',') || 'none'} tex:${tex}` };
  });
  return {
    element_count: elements.length,
    face_count: faces,
    bounds: { from: b.min, to: b.max, size: b.max.map((v, k) => v - b.min[k]) },
    textures,
    parts: partsOf(elements),
    elements: list,
  };
}

function run(file) {
  if (!file) throw usage('describe needs a file');
  const abs = path.resolve(file);
  if (!exists(abs)) throw usage(`${file}: not found`);
  if (abs.endsWith('.bbmodel')) {
    const { bbmodelToJava } = require('./bbmodel');
    const c = bbmodelToJava(abs);
    const s = summary(c.model.elements, c.model.textures);
    return Object.assign({ file: rel(abs), kind: 'bbmodel', groups: c.groups.map((g) => ({ name: g.name, origin: g.origin, elements: g.elements })), animations: c.animations.map((a) => a.name), warnings: c.warnings }, s);
  }
  const json = readJson(abs);
  if (json && Array.isArray(json.parts) && json.spec) {
    const items = briefLib.elementsOf(json);
    return Object.assign({ file: rel(abs), kind: 'brief', spec: json.spec }, summary(items.map((i) => i.element), json.textures ? Object.keys(json.textures) : []));
  }
  const m = loadModel(abs, { raw: json });
  const resolved = {};
  for (const k of Object.keys(m.textures)) resolved[k] = resolveTexture(`#${k}`, m.textures) || m.textures[k];
  return Object.assign(
    {
      file: rel(abs),
      kind: m.generated ? 'generated-item' : 'model',
      id: m.id,
      parent_chain: m.chain,
      own_elements: m.ownElements,
      display: Object.keys(m.display),
      gui_light: m.gui_light || null,
      problems: m.problems,
    },
    summary(m.elements, resolved),
  );
}

function text(d) {
  const lines = [];
  lines.push(`${d.file} (${d.kind}${d.id ? ` ${d.id}` : ''})`);
  if (d.parent_chain && d.parent_chain.length) lines.push(`parent: ${d.parent_chain.join(' -> ')}`);
  lines.push(`elements: ${d.element_count}  faces: ${d.face_count}  bounds: ${fmt(d.bounds.from)}->${fmt(d.bounds.to)} size ${fmt(d.bounds.size)}`);
  if (d.textures) {
    const t = Array.isArray(d.textures) ? d.textures.join(', ') : Object.entries(d.textures).map(([k, v]) => `${k}=${v}`).join(', ');
    lines.push(`textures: ${t || 'none'}`);
  }
  if (d.display) lines.push(`display: ${d.display.join(', ') || 'none'}`);
  lines.push(`parts: ${Object.entries(d.parts).map(([k, v]) => `${k}(${v.length})`).join(', ') || 'none'}`);
  if (d.groups) lines.push(`groups: ${d.groups.map((g) => `${g.name}(${g.elements.length})`).join(', ')}`);
  if (d.animations && d.animations.length) lines.push(`animations: ${d.animations.join(', ')}`);
  for (const e of d.elements) lines.push(`  ${e.line}`);
  for (const w of d.warnings || []) lines.push(`warning: ${w}`);
  for (const p of d.problems || []) lines.push(`problem: ${p.path}: ${p.message}`);
  return lines.join('\n');
}

module.exports = { run, text, partsOf };
