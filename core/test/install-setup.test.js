'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { ROOT, scaffoldFixture, cli, tmp } = require('./helpers');

test('install into a folder inside the working directory', () => {
  const dir = tmp('inst');
  const { pack } = scaffoldFixture('stool', dir);
  const target = path.join(dir, 'resourcepacks');
  const r = cli(['install', pack, '--target', target, '--yes', '--json'], { cwd: dir });
  assert.strictEqual(r.code, 0, r.err);
  assert.ok(fs.existsSync(path.join(target, 'stool', 'pack.mcmeta')));
  const again = cli(['install', pack, '--target', target, '--yes'], { cwd: dir });
  assert.strictEqual(again.code, 2);
  assert.match(again.err, /already exists/);
});

test('install outside the working directory needs --yes', () => {
  const dir = tmp('inst2');
  const { pack } = scaffoldFixture('stool', dir);
  const outside = path.join(tmp('elsewhere'), 'resourcepacks');
  fs.mkdirSync(outside);
  const r = cli(['install', pack, '--target', outside], { cwd: dir });
  assert.strictEqual(r.code, 2);
  assert.match(r.err, /outside the working directory/);
  assert.ok(!fs.existsSync(path.join(outside, 'stool')));
});

test('server config prints the sha1 of the zip', () => {
  const dir = tmp('srv');
  const { pack } = scaffoldFixture('stool', dir);
  const r = cli(['install', pack, '--print-config', 'server', '--url', 'https://example.test/p.zip', '--json'], { cwd: dir });
  assert.strictEqual(r.code, 0, r.err);
  const j = r.json();
  const sha = crypto.createHash('sha1').update(fs.readFileSync(`${pack}.zip`)).digest('hex');
  assert.deepStrictEqual(j.lines, ['resource-pack=https://example.test/p.zip', `resource-pack-sha1=${sha}`, 'require-resource-pack=true']);
});

test('setup codex copies every skill and writes mcmodel.path', () => {
  const dest = path.join(tmp('codex'), 'skills');
  const r = cli(['setup', 'codex', '--dest', dest, '--json']);
  assert.strictEqual(r.code, 0, r.err);
  const skills = fs.readdirSync(path.join(ROOT, 'skills'));
  assert.deepStrictEqual(r.json().skills.sort(), skills.sort());
  for (const s of skills) {
    const p = fs.readFileSync(path.join(dest, s, 'mcmodel.path'), 'utf8').trim();
    assert.ok(fs.existsSync(p), `${s}: ${p}`);
  }
});

test('CLI resolves under all three resolution paths', () => {
  // 1. ${CLAUDE_PLUGIN_ROOT}/core/bin/mcmodel.js
  const viaPluginRoot = path.join(ROOT, 'core', 'bin', 'mcmodel.js');
  // 2. mcmodel.path next to SKILL.md (Codex install)
  const dest = path.join(tmp('res'), 'skills');
  cli(['setup', 'codex', '--dest', dest]);
  const viaPathFile = fs.readFileSync(path.join(dest, 'plan-model', 'mcmodel.path'), 'utf8').trim();
  // 3. ../../core/bin/mcmodel.js relative to the skill folder (repo used in place)
  const viaRelative = path.resolve(ROOT, 'skills', 'plan-model', '..', '..', 'core', 'bin', 'mcmodel.js');
  for (const p of [viaPluginRoot, viaPathFile, viaRelative]) {
    const r = require('child_process').spawnSync(process.execPath, [p, 'version'], { cwd: os.tmpdir(), encoding: 'utf8' });
    assert.strictEqual(r.status, 0, `${p}: ${r.stderr}`);
  }
});
