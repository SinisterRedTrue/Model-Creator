'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const score = require('../src/score');
const optimize = require('../src/optimize');
const { loadModel } = require('../src/model');
const { scaffoldFixture, modelPath, cli, tmp } = require('./helpers');

test('hidden faces: covered face found, exposed face not', () => {
  const all = (t) => ({ north: { texture: t }, south: { texture: t }, east: { texture: t }, west: { texture: t }, up: { texture: t }, down: { texture: t } });
  const els = [
    { from: [0, 0, 0], to: [16, 8, 16], faces: all('#a') },
    { from: [4, 8, 4], to: [12, 16, 12], faces: all('#a') },
  ];
  const hidden = score.hiddenFaces(els).map((h) => `${h.element}.${h.face}`);
  assert.deepStrictEqual(hidden, ['1.down']);
});

test('score passes the fixture and fails over budget', () => {
  const { pack } = scaffoldFixture('lamp');
  const ok = score.run(pack, { budget: 'normal' });
  assert.ok(ok.pass, ok.failures.join('\n'));
  const lamp = ok.models[0].checks.find((c) => c.name === 'hidden_faces');
  assert.match(lamp.detail, /4 faces/);
  const bad = cli(['score', pack, '--budget', '3']);
  assert.strictEqual(bad.code, 1);
  assert.match(bad.out, /\[fail\] element_budget: 5 elements, budget 3/);
});

test('optimize: fewer elements and faces, identical render, original untouched', () => {
  const { pack } = scaffoldFixture('lamp');
  const before = fs.readFileSync(modelPath(pack, 'custom', 'desk_lamp'), 'utf8');
  const out = path.join(tmp('opt'), 'out');
  const r = optimize.run(pack, { out });
  assert.ok(r.visual_match);
  const m = r.models[0];
  assert.deepStrictEqual(m.elements, [5, 4]);
  assert.deepStrictEqual(m.faces, [29, 21]);
  assert.strictEqual(m.pixel_diff, 0);
  assert.strictEqual(fs.readFileSync(modelPath(pack, 'custom', 'desk_lamp'), 'utf8'), before);
  // Render of optimized model equals render of original.
  const d = score.compareRenders(loadModel(modelPath(pack, 'custom', 'desk_lamp')), loadModel(modelPath(out, 'custom', 'desk_lamp')));
  assert.strictEqual(d, 0);
  const s = cli(['score', modelPath(out, 'custom', 'desk_lamp'), '--baseline', modelPath(pack, 'custom', 'desk_lamp')]);
  assert.strictEqual(s.code, 0, s.out);
  assert.match(s.out, /visual_match: 0\.00% of pixels differ/);
});

test('optimize refuses to write over the source', () => {
  const { pack } = scaffoldFixture('stool');
  assert.throws(() => optimize.run(pack, { out: pack }), /--out must differ/);
});

test('review is read-only and reports issues', () => {
  const { pack } = scaffoldFixture('lamp');
  const snapshot = JSON.stringify(require('../src/util').walk(pack).map((f) => [f, fs.statSync(f).mtimeMs]));
  const r = cli(['review', pack, '--json']);
  assert.strictEqual(r.code, 0);
  const j = r.json();
  assert.strictEqual(j.version, '1.21.8');
  assert.ok(j.findings.some((f) => f.area === 'hidden_faces'));
  assert.ok(j.suggestions.some((s) => /optimize/.test(s)));
  assert.strictEqual(JSON.stringify(require('../src/util').walk(pack).map((f) => [f, fs.statSync(f).mtimeMs])), snapshot);
});
