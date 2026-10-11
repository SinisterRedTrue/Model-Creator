'use strict';

const path = require('path');
const { REFERENCES, readJson, unsupported } = require('./util');

let cache;

function matrix() {
  if (!cache) cache = readJson(path.join(REFERENCES, 'version-matrix.json'));
  return cache;
}

function supported() {
  return matrix().groups.flatMap((g) => g.versions);
}

function lookup(version) {
  const v = String(version || '').trim();
  const group = matrix().groups.find((g) => g.versions.includes(v));
  if (!group) return null;
  return Object.assign({ version: v }, group, { rules: matrix().rules });
}

// Throws exit code 3 for versions not in the matrix.
function get(version) {
  const info = lookup(version);
  if (!info) {
    throw unsupported(`Minecraft version "${version}" is not supported. Supported: ${supported().join(', ')}`);
  }
  return info;
}

function byPackFormat(format) {
  const g = matrix().groups.find((x) => x.resource_pack_format === Number(format));
  return g ? get(g.versions[g.versions.length - 1]) : null;
}

function rules() {
  return matrix().rules;
}

function latest() {
  const all = supported();
  return all[all.length - 1];
}

module.exports = { matrix, supported, lookup, get, byPackFormat, rules, latest };
