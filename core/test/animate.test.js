'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const animate = require('../src/animate');
const { FIX, scaffoldFixture, modelPath, cli, tmp } = require('./helpers');

const plan = (n) => path.join(FIX, 'anim', `${n}.anim.json`);

function lamp() {
  const { pack } = scaffoldFixture('lamp');
  return { pack, model: modelPath(pack, 'custom', 'desk_lamp') };
}

test('route 1: texture flipbook strip + mcmeta', () => {
  const { model } = lamp();
  const out = path.join(tmp('r1'), 'pack');
  const r = animate.build(model, plan('glow'), { out });
  const png = path.join(out, 'assets', 'custom', 'textures', 'item', 'desk_lamp_glow.png');
  const img = require('../src/image').Image.load(png);
  assert.deepStrictEqual([img.width, img.height], [16, 128]);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(png + '.mcmeta', 'utf8')), { animation: { frametime: 2, interpolate: true } });
  assert.deepStrictEqual(r.limits, animate.LIMITS[1]);
});

test('route 2: frame models and a use_duration item definition', () => {
  const { model } = lamp();
  const out = path.join(tmp('r2'), 'pack');
  animate.build(model, plan('tilt'), { out });
  for (let k = 0; k < 4; k++) assert.ok(fs.existsSync(modelPath(out, 'custom', `desk_lamp_tilt_f${k}`)));
  const f3 = JSON.parse(fs.readFileSync(modelPath(out, 'custom', 'desk_lamp_tilt_f3'), 'utf8'));
  const shade = f3.elements.find((e) => e.name === 'shade');
  assert.deepStrictEqual(shade.rotation.axis, 'z');
  assert.strictEqual(Math.abs(shade.rotation.angle) <= 45, true);
  const def = fs.readFileSync(path.join(out, 'assets', 'minecraft', 'items', 'paper.json'), 'utf8');
  assert.match(def, /minecraft:use_duration/);
  assert.match(def, /desk_lamp_tilt_f3/);
  assert.strictEqual(cli(['validate', out]).code, 0);
});

test('route 2 refuses versions before 1.21.4', () => {
  const { pack } = scaffoldFixture('sword');
  const p = path.join(tmp('r2old'), 'swing.anim.json');
  fs.writeFileSync(p, JSON.stringify({ schema_version: 1, name: 'swing', route: 2, length_ticks: 10, trigger: 'use', frames: 3, parts: { blade: { keyframes: [{ t: 0, rot: [0, 0, 0] }, { t: 10, rot: [45, 0, 0] }] } } }));
  const r = cli(['animate', 'build', modelPath(pack, 'custom', 'ruby_sword'), p, '--out', path.join(tmp('x'), 'o')]);
  assert.strictEqual(r.code, 3);
  assert.match(r.err, /needs 1\.21\.4\+/);
});

test('route 3: per-part models and a datapack with interpolating frames', () => {
  const { model } = lamp();
  const out = path.join(tmp('r3'), 'pack');
  animate.build(model, plan('bob'), { out });
  const fn = path.join(`${out}.datapack`, 'data', 'custom', 'function', 'desk_lamp', 'bob');
  for (const f of ['summon', 'play', 'stop', 'kill', 'frame_0', 'frame_7']) assert.ok(fs.existsSync(path.join(fn, `${f}.mcfunction`)), f);
  const meta = JSON.parse(fs.readFileSync(path.join(`${out}.datapack`, 'pack.mcmeta'), 'utf8'));
  assert.strictEqual(meta.pack.pack_format, 81);
  const f2 = fs.readFileSync(path.join(fn, 'frame_1.mcfunction'), 'utf8');
  // Bulb follows its parent shade: same translation.
  const tr = [...f2.matchAll(/translation:\[([^\]]+)\]/g)].map((m) => m[1]);
  assert.strictEqual(tr[0], tr[1]);
  assert.match(fs.readFileSync(path.join(fn, 'frame_7.mcfunction'), 'utf8'), /schedule function custom:desk_lamp\/bob\/frame_0 5t/);
  assert.match(fs.readFileSync(path.join(fn, 'frame_0.mcfunction'), 'utf8'), /playsound minecraft:block\.note_block\.chime/);
});

test('route 4: .bbmodel with bones and keyframes', () => {
  const { model } = lamp();
  const out = path.join(tmp('r4'), 'anim');
  animate.build(model, plan('spin'), { out });
  const bb = JSON.parse(fs.readFileSync(path.join(out, 'desk_lamp.bbmodel'), 'utf8'));
  assert.strictEqual(bb.meta.model_format, 'free');
  assert.deepStrictEqual(bb.outliner.filter((o) => typeof o === 'object').map((o) => o.name), ['shade', 'bulb']);
  const a = bb.animations[0];
  assert.strictEqual(a.name, 'spin');
  assert.strictEqual(a.length, 2);
  const keys = Object.values(a.animators)[0].keyframes;
  assert.deepStrictEqual(keys.map((k) => k.time), [0, 2]);
  assert.strictEqual(keys[1].data_points[0].y, 360);
});

test('check: impossible trigger, frame budget, detached parts', () => {
  const { model } = lamp();
  const dir = tmp('chk');
  const p = path.join(dir, 'p.anim.json');
  fs.writeFileSync(p, JSON.stringify({ schema_version: 1, name: 'fly', route: 2, length_ticks: 20, trigger: 'always', frames: 12, parts: { shade: { keyframes: [{ t: 0, pos: [0, 0, 0] }, { t: 20, pos: [0, 30, 0] }] } } }));
  const r = animate.check(p, { model });
  assert.strictEqual(r.pass, false);
  const msgs = r.issues.map((i) => i.message).join('\n');
  assert.match(msgs, /frame swap needs an item state/);
  assert.match(msgs, /12 frames exceeds/);
  assert.match(msgs, /shade: detaches from the rest of the model/);
  assert.strictEqual(animate.check(plan('bob'), { model }).pass, true);
});

test('preview writes a frame strip and GIF', () => {
  const { model } = lamp();
  const out = path.join(tmp('ap'), 'o');
  const r = animate.preview(model, plan('tilt'), { out });
  assert.strictEqual(r.frames, 4);
  assert.ok(fs.existsSync(path.join(out, 'tilt.strip.png')));
  assert.strictEqual(fs.readFileSync(path.join(out, 'tilt.gif')).subarray(0, 3).toString(), 'GIF');
});

test('matToQuat: identity and 90 degrees about Y', () => {
  assert.deepStrictEqual(animate.matToQuat([[1, 0, 0], [0, 1, 0], [0, 0, 1]]), [0, 0, 0, 1]);
  const q = animate.matToQuat([[0, 0, -1], [0, 1, 0], [1, 0, 0]]);
  assert.ok(Math.abs(q[1] - Math.SQRT1_2) < 1e-9 && Math.abs(q[3] - Math.SQRT1_2) < 1e-9);
});
