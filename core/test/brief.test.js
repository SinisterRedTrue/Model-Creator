'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const brief = require('../src/brief');
const { FIX, cli } = require('./helpers');

const load = (name) => JSON.parse(fs.readFileSync(path.join(FIX, name, 'brief.json'), 'utf8'));
const errors = (b) => brief.check(b, { baseDir: FIX }).filter((p) => p.level === 'error').map((p) => `${p.path}: ${p.message}`);

test('fixture briefs pass', () => {
  for (const n of ['stool', 'lamp', 'sword']) assert.deepStrictEqual(errors(load(n)), []);
});

test('schema errors are reported with paths', () => {
  const b = load('stool');
  b.spec.model_type = 'spaceship';
  delete b.parts[0].elements[0].from;
  const e = errors(b).join('\n');
  assert.match(e, /\$\.spec\.model_type: must be one of/);
  assert.match(e, /\$\.parts\[0\]\.elements\[0\]: missing required "from"/);
});

test('palette, rows, texture refs, budget and version are checked', () => {
  const b = load('stool');
  b.textures.wood.rows[2] = 'zzzzzzzzzzzzzzzz';
  b.textures.leg.rows[0] = 'abc';
  b.parts[0].elements[0].faces.up.texture = '#nothing';
  b.spec.budget = 2;
  const e = errors(b).join('\n');
  assert.match(e, /character "z" is not in the palette/);
  assert.match(e, /row is 3 wide, expected 16/);
  assert.match(e, /#nothing is not defined/);
  assert.match(e, /5 elements exceeds the 2 budget/);
  const v = load('stool');
  v.spec.minecraft_version = '1.8.9';
  assert.match(errors(v).join('\n'), /"1\.8\.9" not supported/);
});

test('more than 16 colours is refused', () => {
  const b = load('stool');
  for (const c of 'efghijklmnopqrstu') b.palette[c] = '#000000';
  assert.match(errors(b).join('\n'), /21 colours; maximum is 16/);
});

test('contract: the example prompt parses to the same brief build-model uses', () => {
  const text = fs.readFileSync(path.join(FIX, 'lamp', 'desk_lamp.prompt.md'), 'utf8');
  assert.deepStrictEqual(brief.checkPrompt(text), []);
  assert.deepStrictEqual(brief.fromPrompt(text), load('lamp'));
  assert.strictEqual(cli(['brief', 'check', path.join(FIX, 'lamp', 'desk_lamp.prompt.md')]).code, 0);
});

test('prompt contract: marker, missing and out-of-order sections', () => {
  const ok = fs.readFileSync(path.join(FIX, 'lamp', 'desk_lamp.prompt.md'), 'utf8');
  assert.match(brief.checkPrompt(ok.replace('v1', 'v9'))[0].message, /v9 is not supported/);
  assert.ok(brief.checkPrompt(ok.replace('## Known risks', '## Risks')).some((p) => p.path === '## Known risks'));
  const swapped = ok.replace('## Fallbacks', '## TMP').replace('## Known risks', '## Fallbacks').replace('## TMP', '## Known risks');
  assert.ok(brief.checkPrompt(swapped).some((p) => /out of order/.test(p.message)));
});

test('toModel keeps element names and filters display slots', () => {
  const m = brief.toModel(load('sword'));
  assert.deepStrictEqual(m.elements.map((e) => e.name), ['blade', 'guard', 'grip', 'gem']);
  assert.ok(!('head' in m.display) && !('fixed' in m.display));
  assert.ok('gui' in m.display && 'firstperson_righthand' in m.display);
  assert.strictEqual(m.textures.particle, '#blade');
});

test('prompts with Windows line endings (CRLF) parse the same', () => {
  const text = fs.readFileSync(path.join(FIX, 'lamp', 'desk_lamp.prompt.md'), 'utf8').replace(/\r?\n/g, '\r\n');
  assert.deepStrictEqual(brief.checkPrompt(text), []);
  assert.deepStrictEqual(brief.fromPrompt(text), load('lamp'));
});
