'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { readZip } = require('../src/zip');
const { Image } = require('../src/image');
const { loadModel } = require('../src/model');
const score = require('../src/score');
const { FIX, scaffoldFixture, modelPath, cli, tmp } = require('./helpers');

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

test('pack: two models with colliding namespaces merge without collision', () => {
  const dir = tmp('pack');
  const a = scaffoldFixture('stool', dir).pack;
  const b = path.join(dir, 'b');
  cli(['scaffold', b, '--brief', path.join(FIX, 'stool', 'brief.json')]);
  const tex = path.join(b, 'assets', 'custom', 'textures', 'item', 'oak_stool_wood.png');
  new Image(16, 16).fill([255, 0, 0, 255]).save(tex);
  const out = path.join(dir, 'merged');
  const r = cli(['pack', a, b, '--out', out, '--zip', '--json']);
  assert.strictEqual(r.code, 0, r.err);
  const j = r.json();
  assert.deepStrictEqual(j.namespace_renames.map((x) => `${x.from}->${x.to}`), ['custom->custom_2']);
  assert.ok(fs.existsSync(modelPath(out, 'custom', 'oak_stool')));
  assert.ok(fs.existsSync(modelPath(out, 'custom_2', 'oak_stool')));
  const m2 = readJson(modelPath(out, 'custom_2', 'oak_stool'));
  assert.strictEqual(m2.textures.wood, 'custom_2:item/oak_stool_wood');
  const def = readJson(path.join(out, 'assets', 'minecraft', 'items', 'paper.json'));
  const thresholds = def.model.entries.map((e) => e.threshold);
  assert.deepStrictEqual(thresholds, [1001, 1002]);
  assert.strictEqual(new Set(thresholds).size, 2);
  assert.strictEqual(cli(['validate', out]).code, 0);
  const zip = readZip(path.join(dir, 'merged.zip'));
  assert.ok(zip['pack.mcmeta']);
  assert.ok(zip['assets/custom_2/models/item/oak_stool.json']);
});

test('pack: a single model file brings its textures and item definitions', () => {
  const dir = tmp('one');
  const { pack } = scaffoldFixture('lamp', dir);
  const out = path.join(dir, 'm');
  const r = cli(['pack', modelPath(pack, 'custom', 'desk_lamp'), '--out', out]);
  assert.strictEqual(r.code, 0, r.err);
  assert.ok(fs.existsSync(path.join(out, 'assets', 'custom', 'textures', 'item', 'desk_lamp_glow.png')));
  assert.ok(fs.existsSync(path.join(out, 'assets', 'custom', 'items', 'desk_lamp.json')));
  assert.strictEqual(cli(['validate', out]).code, 0);
});

test('convert: 1.20.1 overrides to 1.21.8 items and back', () => {
  const dir = tmp('conv');
  const { pack } = scaffoldFixture('sword', dir);
  const up = path.join(dir, 'up');
  const r = cli(['convert', pack, '--to', '1.21.8', '--out', up, '--json']);
  assert.strictEqual(r.code, 0, r.err);
  assert.strictEqual(r.json().validate.errors, 0);
  assert.strictEqual(readJson(path.join(up, 'pack.mcmeta')).pack.pack_format, 64);
  const def = readJson(path.join(up, 'assets', 'minecraft', 'items', 'diamond_sword.json'));
  assert.deepStrictEqual(def.model.entries[0], { threshold: 1003, model: { type: 'minecraft:model', model: 'custom:item/ruby_sword' } });
  assert.ok(fs.existsSync(path.join(up, 'assets', 'custom', 'items', 'ruby_sword.json')));
  assert.ok(!fs.existsSync(path.join(up, 'assets', 'minecraft', 'models', 'item', 'diamond_sword.json')));
  const down = path.join(dir, 'down');
  assert.strictEqual(cli(['convert', up, '--to', '1.20.1', '--out', down]).code, 0);
  const back = readJson(path.join(down, 'assets', 'minecraft', 'models', 'item', 'diamond_sword.json'));
  assert.deepStrictEqual(back.overrides, [{ predicate: { custom_model_data: 1003 }, model: 'custom:item/ruby_sword' }]);
  assert.ok(!fs.existsSync(path.join(down, 'assets', 'custom', 'items')));
});

test('convert: unsupported version is refused', () => {
  const { pack } = scaffoldFixture('stool');
  assert.strictEqual(cli(['convert', pack, '--to', '1.7.10']).code, 3);
});

test('convert: Java to .bbmodel and back keeps geometry and look', () => {
  const dir = tmp('bb');
  const { pack } = scaffoldFixture('stool', dir);
  const bbFile = path.join(dir, 'stool.bbmodel');
  assert.strictEqual(cli(['convert', modelPath(pack, 'custom', 'oak_stool'), '--to', 'bbmodel', '--out', bbFile]).code, 0);
  const bb = readJson(bbFile);
  assert.strictEqual(bb.elements.length, 5);
  assert.deepStrictEqual(bb.outliner.map((o) => o.name), ['seat', 'leg']);
  const back = path.join(dir, 'back');
  assert.strictEqual(cli(['convert', bbFile, '--to', '1.21.4', '--out', back]).code, 0);
  const a = loadModel(modelPath(pack, 'custom', 'oak_stool'));
  const b = loadModel(modelPath(back, 'custom', 'stool'));
  assert.strictEqual(score.compareRenders(a, b), 0);
});

test('import: Java model and .bbmodel become valid briefs', () => {
  const dir = tmp('imp');
  const { pack } = scaffoldFixture('lamp', dir);
  const out = path.join(dir, 'lamp.brief.json');
  const r = cli(['import', modelPath(pack, 'custom', 'desk_lamp'), '--out', out, '--json']);
  assert.strictEqual(r.code, 0, r.err);
  assert.deepStrictEqual(r.json().parts, ['base(1)', 'pole(2)', 'shade(1)', 'bulb(1)']);
  assert.strictEqual(cli(['brief', 'check', out]).code, 0);
  const bbFile = path.join(dir, 'lamp.bbmodel');
  cli(['convert', modelPath(pack, 'custom', 'desk_lamp'), '--to', 'bbmodel', '--out', bbFile]);
  const out2 = path.join(dir, 'bb.brief.json');
  assert.strictEqual(cli(['import', bbFile, '--out', out2, '--version', '1.21.8']).code, 0);
  assert.strictEqual(cli(['brief', 'check', out2]).code, 0);
  const brief = readJson(out2);
  assert.ok(Object.values(brief.textures).every((t) => fs.existsSync(path.resolve(dir, t.file))));
});

test('variants: consistent names, textures and custom_model_data', () => {
  const dir = tmp('var');
  const { pack } = scaffoldFixture('stool', dir);
  const out = path.join(dir, 'v');
  const r = cli(['variants', modelPath(pack, 'custom', 'oak_stool'), path.join(FIX, 'variants', 'stool.variants.json'), '--out', out, '--json']);
  assert.strictEqual(r.code, 0, r.err);
  assert.deepStrictEqual(r.json().variants.map((v) => v.custom_model_data), [2001, 2002, 2003]);
  const broken = readJson(modelPath(out, 'custom', 'oak_stool_broken'));
  assert.strictEqual(broken.elements.length, 4);
  assert.ok(!broken.elements.some((e) => e.name === 'leg_3'));
  const birch = readJson(modelPath(out, 'custom', 'oak_stool_birch'));
  assert.strictEqual(birch.textures.wood, 'custom:item/oak_stool_wood_birch');
  const def = readJson(path.join(out, 'assets', 'minecraft', 'items', 'paper.json'));
  assert.deepStrictEqual(def.model.entries.map((e) => e.threshold), [1001, 2001, 2002, 2003]);
  assert.strictEqual(cli(['validate', out]).code, 0);
});
