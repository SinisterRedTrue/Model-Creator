'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const REFERENCES = path.join(ROOT, 'references');

// Exit codes from SPEC section 2.
const EXIT = { OK: 0, FAIL: 1, USAGE: 2, UNSUPPORTED: 3 };

class CliError extends Error {
  constructor(message, code = EXIT.USAGE) {
    super(message);
    this.code = code;
  }
}

function usage(message) {
  return new CliError(message, EXIT.USAGE);
}

function unsupported(message) {
  return new CliError(message, EXIT.UNSUPPORTED);
}

function readText(file) {
  let text = fs.readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.replace(/\r\n/g, '\n');
}

function readJson(file) {
  const text = readText(file);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new CliError(`${file}: invalid JSON: ${err.message}`, EXIT.FAIL);
  }
}

function tryReadJson(file) {
  try {
    return { value: JSON.parse(readText(file)) };
  } catch (err) {
    return { error: err.message };
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text.replace(/\r\n/g, '\n'));
}

function writeJson(file, value) {
  writeText(file, JSON.stringify(value, null, 2) + '\n');
}

function exists(p) {
  return fs.existsSync(p);
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function walk(dir, filter) {
  const out = [];
  if (!isDir(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (!filter || filter(full)) out.push(full);
    }
  }
  return out.sort();
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function rel(p, base = process.cwd()) {
  const r = path.relative(base, p);
  return (r && !r.startsWith('..') && !path.isAbsolute(r) ? r : p).split(path.sep).join('/');
}

function isInside(child, parent) {
  const r = path.relative(path.resolve(parent), path.resolve(child));
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
}

function slug(text) {
  return String(text || 'model')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'model';
}

// Minimal argv parser: positionals plus --key value / --flag.
function parseArgs(argv, booleans = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = (eq > 0 ? a.slice(2, eq) : a.slice(2));
      if (eq > 0) out[key] = a.slice(eq + 1);
      else if (booleans.includes(key) || i + 1 >= argv.length || argv[i + 1].startsWith('--')) out[key] = true;
      else out[key] = argv[++i];
    } else {
      out._.push(a);
    }
  }
  return out;
}

function num(v, name) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw usage(`--${name} must be a number`);
  return n;
}

function hexToRgba(hex) {
  const m = /^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(String(hex).trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, m[2] ? parseInt(m[2], 16) : 255];
}

function rgbaToHex(c) {
  const h = (n) => n.toString(16).padStart(2, '0');
  return '#' + h(c[0]) + h(c[1]) + h(c[2]) + (c[3] !== undefined && c[3] !== 255 ? h(c[3]) : '');
}

module.exports = {
  ROOT,
  REFERENCES,
  EXIT,
  CliError,
  usage,
  unsupported,
  readText,
  readJson,
  tryReadJson,
  ensureDir,
  writeText,
  writeJson,
  exists,
  isDir,
  walk,
  copyDir,
  rel,
  isInside,
  slug,
  parseArgs,
  num,
  hexToRgba,
  rgbaToHex,
};
