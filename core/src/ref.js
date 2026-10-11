'use strict';

const fs = require('fs');
const path = require('path');
const { REFERENCES, readText, usage } = require('./util');
const versions = require('./versions');

function list() {
  const out = [];
  for (const f of fs.readdirSync(REFERENCES)) {
    if (f.endsWith('.md') || f.endsWith('.json')) out.push(f.replace(/\.(md|json)$/, ''));
  }
  for (const f of fs.readdirSync(path.join(REFERENCES, 'schemas'))) out.push(`schemas/${f.replace(/\.json$/, '')}`);
  return out.sort();
}

function versionTable() {
  const m = versions.matrix();
  const lines = ['| Versions | Resource pack format | Data pack format | items/ definitions | item_model component | Function folder |', '|---|---|---|---|---|---|'];
  for (const g of m.groups) {
    lines.push(`| ${g.versions.join(', ')} | ${g.resource_pack_format} | ${g.data_pack_format} | ${g.item_definitions ? 'yes' : 'no'} | ${g.item_model_component ? 'yes' : 'no'} | ${g.function_folder} |`);
  }
  const r = m.rules;
  lines.push('', `Element rotation: one axis, ${r.rotation.min}..${r.rotation.max} in ${r.rotation.step} degree steps. Coordinates ${r.coordinate_range.join('..')}. UV ${r.uv_range.join('..')}.`);
  lines.push(`Display keys: ${r.display_keys.join(', ')}.`, '', m.notes);
  return lines.join('\n') + '\n';
}

function read(name) {
  const n = String(name).replace(/\.(md|json)$/, '');
  if (n === 'version-matrix') return versionTable();
  for (const ext of ['.md', '.json']) {
    const f = path.join(REFERENCES, ...n.split('/')) + ext;
    if (fs.existsSync(f) && path.resolve(f).startsWith(path.resolve(REFERENCES))) return readText(f);
  }
  const f = path.join(REFERENCES, 'schemas', `${n}.schema.json`);
  if (fs.existsSync(f)) return readText(f);
  throw usage(`no reference named "${name}". Available: ${list().join(', ')}`);
}

// help.md: "## <command>" sections. No argument prints everything above the first "## " plus the list.
function help(command) {
  const text = readText(path.join(REFERENCES, 'help.md'));
  if (!command) return text;
  const key = String(command).replace(/^\/?(model-creator:)?/, '').replace(/^\$/, '').toLowerCase();
  const sections = text.split(/\n(?=## )/);
  const hit = sections.find((s) => {
    const head = s.split('\n')[0].replace(/^## /, '').toLowerCase();
    return head.split(/[\s/,`()$:]+/).includes(key);
  });
  if (!hit) throw usage(`no help for "${command}". Run "mcmodel help" for the list.`);
  return hit.trim() + '\n';
}

module.exports = { list, read, help, versionTable };
