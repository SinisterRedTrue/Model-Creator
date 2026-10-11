'use strict';

// Both phases on a fixture image, the way the skills run them.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { FIX, cli, tmp } = require('./helpers');

test('phase A (plan) then phase B (build) on the lamp fixture', () => {
  const work = tmp('smoke');
  const image = path.join(work, 'reference.png');
  fs.copyFileSync(path.join(FIX, 'lamp', 'reference.png'), image);
  fs.mkdirSync(path.join(work, 'plans'));

  // Phase A: measure, brief, blockout, prompt.
  assert.strictEqual(cli(['grid', image, '--cells', '16'], { cwd: work }).code, 0);
  assert.ok(fs.existsSync(path.join(work, 'mcmodel-out', 'grid', 'reference.grid16.png')));
  fs.copyFileSync(path.join(FIX, 'lamp', 'brief.json'), path.join(work, 'plans', 'desk_lamp.brief.json'));
  assert.strictEqual(cli(['brief', 'check', 'plans/desk_lamp.brief.json'], { cwd: work }).code, 0);
  const blockout = cli(['preview', 'plans/desk_lamp.brief.json', '--brief', '--reference', image, '--out', 'plans/preview'], { cwd: work });
  assert.strictEqual(blockout.code, 0, blockout.err);
  assert.ok(fs.existsSync(path.join(work, 'plans', 'preview', 'desk_lamp.blockout.montage.png')));
  fs.copyFileSync(path.join(FIX, 'lamp', 'desk_lamp.prompt.md'), path.join(work, 'plans', 'desk_lamp.prompt.md'));
  fs.copyFileSync(image, path.join(work, 'plans', 'reference.png'));
  assert.strictEqual(cli(['brief', 'check', 'plans/desk_lamp.prompt.md'], { cwd: work }).code, 0);

  // Phase B: new "session" with only the prompt and the image.
  const sc = cli(['scaffold', 'mcmodel-out/desk_lamp', '--brief', 'plans/desk_lamp.prompt.md', '--json'], { cwd: work });
  assert.strictEqual(sc.code, 0, sc.err);
  assert.match(sc.json().give, /custom_model_data=\{floats:\[1002\]\}/);
  assert.strictEqual(cli(['validate', 'mcmodel-out/desk_lamp'], { cwd: work }).code, 0);
  const pv = cli(['preview', 'mcmodel-out/desk_lamp', '--reference', image, '--json'], { cwd: work });
  assert.strictEqual(pv.code, 0, pv.err);
  assert.ok(pv.json().files.some((f) => f.endsWith('montage.png')));
  assert.strictEqual(cli(['score', 'mcmodel-out/desk_lamp', '--brief', 'plans/desk_lamp.prompt.md'], { cwd: work }).code, 0);
  const z = cli(['pack', 'mcmodel-out/desk_lamp', '--out', 'mcmodel-out/desk_lamp_release', '--zip'], { cwd: work });
  assert.strictEqual(z.code, 0, z.err);
  assert.ok(fs.existsSync(path.join(work, 'mcmodel-out', 'desk_lamp_release.zip')));
});
