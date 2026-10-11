'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const BIN = path.join(ROOT, 'core', 'bin', 'mcmodel.js');
const FIX = path.join(ROOT, 'core', 'fixtures');

const made = [];
process.on('exit', () => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

// Temp folders deliberately contain spaces and brackets (path test). Removed on exit.
function tmp(label = 'case') {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `mcm [${label}] `));
  made.push(d);
  return d;
}

function cli(args, opts = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: opts.cwd || ROOT, encoding: 'utf8', env: Object.assign({}, process.env, opts.env || {}) });
  return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
}

function scaffoldFixture(name, dir) {
  const out = path.join(dir || tmp(name), name);
  const r = cli(['scaffold', out, '--brief', path.join(FIX, name, 'brief.json'), '--json']);
  if (r.code !== 0) throw new Error(`scaffold ${name} failed: ${r.err}`);
  return { pack: out, result: r.json() };
}

function modelPath(pack, ns, name) {
  return path.join(pack, 'assets', ns, 'models', 'item', `${name}.json`);
}

module.exports = { ROOT, BIN, FIX, tmp, cli, scaffoldFixture, modelPath };
