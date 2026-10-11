'use strict';

const path = require('path');
const validate = require('./validate');
const score = require('./score');
const versions = require('./versions');
const preview = require('./preview');
const { loadModel, findPackRoot, resolveTexture, textureFile, parseId } = require('./model');
const { readJson, exists, isDir, walk, rel, usage } = require('./util');

function detectVersion(root, explicit) {
  if (explicit) return versions.get(explicit);
  const meta = root && path.join(root, 'pack.mcmeta');
  if (!meta || !exists(meta)) return null;
  try {
    const p = readJson(meta).pack;
    return p ? versions.byPackFormat(p.pack_format) : null;
  } catch {
    return null;
  }
}

function run(target, opts = {}) {
  if (!target) throw usage('review needs a model or pack path');
  const abs = path.resolve(target);
  if (!exists(abs)) throw usage(`${target}: not found`);
  const root = isDir(abs) ? findPackRoot(path.join(abs, 'x')) || abs : findPackRoot(abs);
  const info = detectVersion(root, opts.version);
  const findings = [];
  const add = (level, area, message) => findings.push({ level, area, message });

  if (root && !exists(path.join(root, 'pack.mcmeta'))) add('error', 'pack', 'pack.mcmeta is missing');
  if (root && exists(path.join(root, 'pack.mcmeta')) && !info) add('warning', 'pack', 'pack_format matches no version in version-matrix.json; pass --version to check against a target');
  if (root && isDir(abs) && !exists(path.join(root, 'pack.png'))) add('info', 'pack', 'no pack.png icon');

  const val = validate.run(abs, { version: info ? info.version : undefined });
  for (const p of val.problems) add(p.level, 'validate', `${p.file}:${p.path}: ${p.message}`);

  const sc = score.run(abs, { budget: opts.budget || 'normal', version: info ? info.version : undefined });
  for (const m of sc.models) {
    for (const c of m.checks) {
      if (c.level === 'ok') continue;
      const level = c.name === 'element_budget' ? 'warning' : c.level === 'fail' ? 'error' : 'warning';
      add(level, c.name, `${m.file}: ${c.detail}`);
    }
  }

  if (root && isDir(abs)) {
    const used = new Set();
    for (const f of preview.packModels(root)) {
      try {
        const m = loadModel(f, { root });
        for (const k of Object.keys(m.textures)) {
          const id = resolveTexture(`#${k}`, m.textures);
          if (id && parseId(id).ns !== 'minecraft') used.add(path.resolve(textureFile(root, id)));
        }
      } catch {
        // invalid models are already reported by validate
      }
    }
    for (const png of walk(path.join(root, 'assets'), (f) => f.endsWith('.png') && f.split(path.sep).includes('textures'))) {
      if (!used.has(path.resolve(png)) && path.relative(path.join(root, 'assets'), png).split(path.sep)[0] !== 'minecraft') {
        add('warning', 'textures', `${rel(png)} is not used by any model`);
      }
    }
  }

  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.level]++;
  const suggestions = [];
  if (findings.some((f) => ['hidden_faces', 'element_budget'].includes(f.area))) suggestions.push('Run optimize to merge cuboids and drop hidden faces.');
  if (counts.error) suggestions.push('Hand the errors to edit-model to fix them on a copy.');
  return {
    target: rel(abs),
    version: info ? info.version : null,
    ok: counts.error === 0,
    counts,
    models: sc.models.map((m) => ({ file: m.file, elements: m.elements, faces: m.faces })),
    findings,
    suggestions,
  };
}

function text(r) {
  const lines = [`review: ${r.target}${r.version ? ` (Minecraft ${r.version})` : ''}`, `${r.counts.error} errors, ${r.counts.warning} warnings, ${r.counts.info} notes`];
  for (const m of r.models) lines.push(`model ${m.file}: ${m.elements} elements, ${m.faces} faces`);
  for (const level of ['error', 'warning', 'info']) {
    for (const f of r.findings.filter((x) => x.level === level)) lines.push(`[${level}] ${f.area}: ${f.message}`);
  }
  for (const s of r.suggestions) lines.push(`suggestion: ${s}`);
  return lines.join('\n');
}

module.exports = { run, text, detectVersion };
