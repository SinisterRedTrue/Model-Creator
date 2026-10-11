'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { cli, FIX, tmp } = require('./helpers');

test('version lists supported Minecraft versions as JSON', () => {
  const r = cli(['version', '--json']);
  assert.strictEqual(r.code, 0);
  const j = r.json();
  assert.ok(j.minecraft.includes('1.21.4'));
  assert.ok(j.minecraft.includes('1.20.1'));
});

test('unknown command exits 2', () => {
  const r = cli(['nope']);
  assert.strictEqual(r.code, 2);
  assert.match(r.err, /unknown command/);
});

test('unsupported Minecraft version exits 3', () => {
  const r = cli(['scaffold', path.join(tmp('v'), 'p'), '--version', '1.12.2']);
  assert.strictEqual(r.code, 3);
  assert.match(r.err, /not supported/);
});

test('validation failure exits 1 and prints file:path: problem', () => {
  const dir = tmp('bad');
  const f = path.join(dir, 'bad.json');
  require('fs').writeFileSync(f, JSON.stringify({ elements: [{ from: [0, 0, 0], to: [40, 1, 1], faces: {} }] }));
  const r = cli(['validate', f]);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /bad\.json:elements\[0\]\.to\[0\]: 40 outside -16\.\.32/);
});

test('help with no command prints the full list; help <command> prints one section', () => {
  const all = cli(['help']);
  assert.strictEqual(all.code, 0);
  assert.match(all.out, /\| `create-animation` \| `animate-model` \|/);
  const one = cli(['help', 'animate-model']);
  assert.match(one.out, /^## create-animation \(animate-model\)/);
  assert.doesNotMatch(one.out, /## review/);
});

test('ref prints references and the version table', () => {
  assert.match(cli(['ref', 'version-matrix']).out, /\| 1\.21\.4 \| 46 \|/);
  assert.match(cli(['ref', 'prompt-contract']).out, /mcmodel-build v1/);
  assert.strictEqual(cli(['ref', 'missing-doc']).code, 2);
});

test('describe reads a brief', () => {
  const r = cli(['describe', path.join(FIX, 'stool', 'brief.json'), '--json']);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.json().element_count, 5);
});
