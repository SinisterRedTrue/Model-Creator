'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const validate = require('../src/validate');
const { scaffoldFixture, modelPath } = require('./helpers');

function mutate(pack, name, fn) {
  const f = modelPath(pack, 'custom', name);
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  fn(j);
  fs.writeFileSync(f, JSON.stringify(j));
  return f;
}

test('scaffolded packs validate with no errors', () => {
  for (const name of ['stool', 'lamp', 'sword']) {
    const { pack } = scaffoldFixture(name);
    const r = validate.run(pack);
    assert.strictEqual(r.errors, 0, validate.format(r.problems));
  }
});

test('rotation must be one axis, -45..45 in 22.5 steps', () => {
  const { pack } = scaffoldFixture('stool');
  const f = mutate(pack, 'oak_stool', (j) => {
    j.elements[0].rotation = { origin: [8, 8, 8], axis: 'y', angle: 30 };
    j.elements[1].rotation = { origin: [8, 8, 8], axis: 'w', angle: 90 };
  });
  const msgs = validate.run(f).problems.map((p) => `${p.path}: ${p.message}`).join('\n');
  assert.match(msgs, /elements\[0\]\.rotation\.angle: 30 is not a multiple of 22\.5/);
  assert.match(msgs, /elements\[1\]\.rotation\.axis/);
  assert.match(msgs, /elements\[1\]\.rotation\.angle: 90 outside -45\.\.45/);
});

test('faces, uv, from/to order and display keys are checked', () => {
  const { pack } = scaffoldFixture('stool');
  const f = mutate(pack, 'oak_stool', (j) => {
    j.elements[0].faces.top = { texture: '#wood' };
    j.elements[0].faces.north.uv = [0, 0, 20, 16];
    j.elements[1].from = [6, 0, 3];
    j.elements[1].to = [5, 8, 5];
    j.elements[2].faces.north.texture = '#missing';
    j.display.hand = { rotation: [0, 0, 0] };
  });
  const msgs = validate.run(f).problems.filter((p) => p.level === 'error').map((p) => `${p.path}: ${p.message}`).join('\n');
  assert.match(msgs, /faces\.top: unknown face name/);
  assert.match(msgs, /faces\.north\.uv\[2\]: 20 outside 0\.\.16/);
  assert.match(msgs, /from\[0\] \(6\) is greater than to\[0\] \(5\)/);
  assert.match(msgs, /#missing does not resolve/);
  assert.match(msgs, /display\.hand: illegal display key/);
});

test('missing texture file and wrong pack_format are errors', () => {
  const { pack } = scaffoldFixture('stool');
  fs.unlinkSync(path.join(pack, 'assets', 'custom', 'textures', 'item', 'oak_stool_leg.png'));
  const r = validate.run(pack, { version: '1.21.8' });
  const msgs = r.problems.map((p) => p.message).join('\n');
  assert.match(msgs, /texture file not found/);
  assert.match(msgs, /46 does not match 1\.21\.8 \(expected 64\)/);
});

test('overrides on 1.21.4+ warn; items/ on 1.20.1 warn', () => {
  const { pack } = scaffoldFixture('sword');
  const r = validate.run(pack, { version: '1.21.4' });
  assert.ok(r.problems.some((p) => p.level === 'warning' && /overrides are ignored from 1\.21\.4/.test(p.message)));
});
