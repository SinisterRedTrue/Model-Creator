'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const render = require('../src/render');
const preview = require('../src/preview');
const briefLib = require('../src/brief');
const { Image } = require('../src/image');
const { loadModel } = require('../src/model');
const { FIX, scaffoldFixture, modelPath, cli, tmp } = require('./helpers');

const NAMES = { stool: 'oak_stool', lamp: 'desk_lamp', sword: 'ruby_sword' };

test('golden fixtures: renders match the expected previews', () => {
  for (const [fx, name] of Object.entries(NAMES)) {
    const { pack } = scaffoldFixture(fx);
    const views = preview.renderViews(render.quadsForModel(loadModel(modelPath(pack, 'custom', name))), { size: 128 });
    for (const [v, img] of Object.entries(views)) {
      const expected = Image.load(path.join(FIX, fx, 'expected', `${v}.png`));
      const d = preview.diff(img, expected);
      assert.ok(d < 0.002, `${fx} ${v}: ${(d * 100).toFixed(2)}% pixels differ`);
    }
  }
});

test('blockout preview of a brief uses part colours', () => {
  const b = briefLib.load(path.join(FIX, 'stool', 'brief.json'));
  const img = preview.renderViews(preview.briefQuads(b), { views: ['top'], size: 64 }).top;
  const c = img.get(32, 32);
  // Seat colour #c08a50 under full "up" shading.
  assert.deepStrictEqual(c.slice(0, 3), [0xc0, 0x8a, 0x50]);
});

test('back-face culling: a single-sided plane is invisible from behind', () => {
  const el = [{ from: [0, 0, 8], to: [16, 16, 8], faces: { north: { texture: '#a' } } }];
  const q = render.buildQuads(el, {}, { colorFor: () => [255, 0, 0, 255] });
  const front = render.renderQuads(q, { size: 32, yaw: 0, pitch: 0, background: [0, 0, 0, 255] });
  const back = render.renderQuads(q, { size: 32, yaw: 180, pitch: 0, background: [0, 0, 0, 255] });
  assert.strictEqual(front.get(16, 16)[0] > 100, true);
  assert.strictEqual(back.get(16, 16)[0], 0);
});

test('preview CLI writes views, montage with reference and turntable GIF', () => {
  const { pack } = scaffoldFixture('sword');
  const out = path.join(tmp('prev'), 'out');
  const r = cli(['preview', pack, '--reference', path.join(FIX, 'sword', 'reference.jpg'), '--turntable', '--frames', '4', '--out', out, '--json']);
  assert.strictEqual(r.code, 0, r.err);
  const files = fs.readdirSync(out);
  for (const s of ['front.png', 'side.png', 'top.png', 'iso.png', 'montage.png', 'turntable.png', 'turntable.gif']) {
    assert.ok(files.some((f) => f.endsWith(s)), `missing ${s}`);
  }
  const gif = fs.readFileSync(path.join(out, files.find((f) => f.endsWith('.gif'))));
  assert.strictEqual(gif.subarray(0, 6).toString(), 'GIF89a');
});

test('flat generated items render their layer texture', () => {
  const dir = tmp('gen');
  const root = path.join(dir, 'p');
  fs.mkdirSync(path.join(root, 'assets', 'custom', 'models', 'item'), { recursive: true });
  fs.writeFileSync(path.join(root, 'pack.mcmeta'), JSON.stringify({ pack: { pack_format: 46, description: '' } }));
  new Image(16, 16).fill([0, 200, 0, 255]).save(path.join(root, 'assets', 'custom', 'textures', 'item', 'gem.png'));
  const mf = path.join(root, 'assets', 'custom', 'models', 'item', 'gem.json');
  fs.writeFileSync(mf, JSON.stringify({ parent: 'minecraft:item/generated', textures: { layer0: 'custom:item/gem' } }));
  const m = loadModel(mf);
  assert.ok(m.generated);
  const img = render.renderQuads(render.quadsForModel(m), { size: 32, yaw: 0, pitch: 0 });
  assert.deepStrictEqual(img.get(16, 16).slice(0, 3), [0, 200, 0]);
});
