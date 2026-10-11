'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { zipDir } = require('./zip');
const { copyDir, exists, isDir, isInside, rel, usage, CliError, EXIT } = require('./util');

function defaultResourcepacks() {
  const home = os.homedir();
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), '.minecraft', 'resourcepacks');
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'minecraft', 'resourcepacks');
  return path.join(home, '.minecraft', 'resourcepacks');
}

function resolveTarget(t) {
  const abs = t === 'default' ? defaultResourcepacks() : path.resolve(t);
  if (path.basename(abs) !== 'resourcepacks' && isDir(path.join(abs, 'resourcepacks'))) return path.join(abs, 'resourcepacks');
  return abs;
}

function ensureZip(pack) {
  if (pack.endsWith('.zip')) return pack;
  const z = `${pack}.zip`;
  zipDir(pack, z);
  return z;
}

const PLUGIN_STEPS = {
  itemsadder: ['Copy the pack assets into plugins/ItemsAdder/contents/<namespace>/resourcepack/assets/<namespace>', 'Copy the generated configs into plugins/ItemsAdder/contents/<namespace>/configs', 'Run /iazip, then /iareload'],
  oraxen: ['Copy the pack assets into plugins/Oraxen/pack/assets', 'Copy the generated item .yml into plugins/Oraxen/items', 'Run /oraxen reload all'],
  nexo: ['Copy the pack assets into plugins/Nexo/pack/assets', 'Copy the generated item .yml into plugins/Nexo/items', 'Run /nexo reload all'],
  modelengine: ['Copy the .bbmodel into plugins/ModelEngine/blueprints', 'Run /meg reload'],
};

function printConfig(pack, kind, url) {
  if (kind === 'server' || kind === true) {
    const zip = ensureZip(pack);
    const sha1 = crypto.createHash('sha1').update(fs.readFileSync(zip)).digest('hex');
    return {
      zip: rel(zip),
      sha1,
      lines: [
        `resource-pack=${url || `https://YOUR-HOST/${path.basename(zip)}`}`,
        `resource-pack-sha1=${sha1}`,
        'require-resource-pack=true',
      ],
      notes: [`Upload ${rel(zip)} to a direct-download URL, then put these lines in server.properties.`, 'Re-run after every change: the sha1 changes with the zip.'],
    };
  }
  if (PLUGIN_STEPS[kind]) return { lines: PLUGIN_STEPS[kind] };
  throw usage(`--print-config must be server, itemsadder, oraxen, nexo or modelengine`);
}

function run(pack, opts = {}) {
  if (!pack) throw usage('usage: mcmodel install <pack> --target <dir|default> [--yes] | install <pack> --print-config <server|itemsadder|oraxen|nexo|modelengine>');
  const src = path.resolve(pack);
  if (!exists(src)) throw usage(`${pack}: not found`);
  if (!src.endsWith('.zip') && !exists(path.join(src, 'pack.mcmeta'))) throw usage(`${pack}: no pack.mcmeta; not a resource pack`);
  if (opts.printConfig) return printConfig(src, opts.printConfig, opts.url);
  if (!opts.target) throw usage(`--target is required (a resourcepacks folder, a .minecraft folder, or "default" = ${defaultResourcepacks()})`);
  const target = resolveTarget(opts.target);
  if (!isInside(target, process.cwd()) && !opts.yes) {
    throw new CliError(`${target} is outside the working directory. Ask the user, then re-run with --yes to write there.`, EXIT.USAGE);
  }
  if (!isDir(target)) {
    if (!opts.yes) throw usage(`${target} does not exist; re-run with --yes to create it`);
    fs.mkdirSync(target, { recursive: true });
  }
  const dest = path.join(target, path.basename(src));
  if (exists(dest) && !opts.force) throw usage(`${dest} already exists; re-run with --force to replace it`);
  if (exists(dest)) fs.rmSync(dest, { recursive: true, force: true });
  if (isDir(src)) copyDir(src, dest);
  else fs.copyFileSync(src, dest);
  return { installed: dest, notes: ['Enable it in Options > Resource Packs (press F3+T to reload if the game is running).'] };
}

module.exports = { run, defaultResourcepacks };
