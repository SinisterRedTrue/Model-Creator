'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const texture = require('../src/texture');
const briefLib = require('../src/brief');
const { Image } = require('../src/image');
const { FIX, cli, tmp } = require('./helpers');

test('pixel grids render to the palette colours, dots are transparent', () => {
  const img = briefLib.renderTexture({ rows: ['ab', '.a'] }, { a: '#ff0000', b: '#00ff0080' });
  assert.deepStrictEqual(img.get(0, 0), [255, 0, 0, 255]);
  assert.deepStrictEqual(img.get(1, 0), [0, 255, 0, 128]);
  assert.strictEqual(img.get(0, 1)[3], 0);
});

test('texture CLI writes PNGs from a brief', () => {
  const out = path.join(tmp('tex'), 'pack');
  const r = cli(['texture', path.join(FIX, 'lamp', 'brief.json'), '--out', out, '--json']);
  assert.strictEqual(r.code, 0, r.err);
  assert.strictEqual(r.json().files.length, 3);
  const img = Image.load(path.join(out, 'assets', 'custom', 'textures', 'item', 'desk_lamp_glow.png'));
  assert.strictEqual(img.width, 16);
});

test('patch ops: recolor, fill, clear, pixels, brightness, resize', () => {
  const dir = tmp('patch');
  const target = path.join(dir, 't.png');
  new Image(4, 4).fill([10, 20, 30, 255]).save(target);
  const patch = path.join(dir, 'p.json');
  fs.writeFileSync(patch, JSON.stringify({
    target: 't.png',
    out: 'o.png',
    ops: [
      { op: 'recolor', from: '#0a141e', to: '#ffffff' },
      { op: 'fill', rect: [0, 0, 1, 1], color: '#ff0000' },
      { op: 'clear', rect: [3, 3, 1, 1] },
      { op: 'pixels', at: [1, 1], palette: { x: '#0000ff' }, rows: ['x.', '_x'] },
      { op: 'resize', size: 8 },
    ],
  }));
  const r = texture.patch(patch);
  assert.match(r.out, /o\.png$/);
  const img = Image.load(path.join(dir, 'o.png'));
  assert.strictEqual(img.width, 8);
  assert.deepStrictEqual(img.get(0, 0), [255, 0, 0, 255]);
  assert.deepStrictEqual(img.get(2, 2), [0, 0, 255, 255]);
  assert.strictEqual(img.get(2, 4)[3], 0);
  assert.strictEqual(img.get(7, 7)[3], 0);
  assert.deepStrictEqual(img.get(5, 0), [255, 255, 255, 255]);
  // Original untouched.
  assert.deepStrictEqual(Image.load(target).get(0, 0), [10, 20, 30, 255]);
});

test('unknown patch op is an error', () => {
  assert.throws(() => texture.applyOps(new Image(2, 2), [{ op: 'blur' }]), /unknown op "blur"/);
});

test('grid overlays PNG and JPEG references', () => {
  for (const f of ['reference.png', 'reference.jpg']) {
    const out = path.join(tmp('grid'), 'g.png');
    const r = cli(['grid', path.join(FIX, 'sword', f), '--cells', '16', '--out', out, '--json']);
    assert.strictEqual(r.code, 0, r.err);
    const j = r.json();
    assert.strictEqual(j.columns, 16);
    const img = Image.load(out);
    assert.ok(img.width >= 16 * 32);
  }
});

test('grid rejects bad cell counts', () => {
  assert.strictEqual(cli(['grid', path.join(FIX, 'sword', 'reference.png'), '--cells', '1']).code, 2);
});
