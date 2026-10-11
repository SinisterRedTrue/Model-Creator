#!/usr/bin/env node
'use strict';

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  process.stderr.write(`mcmodel needs Node 18 or newer (found ${process.version}). Install a current Node from https://nodejs.org\n`);
  process.exit(2);
}

const path = require('path');
const { parseArgs, CliError, EXIT, usage, readText, rel } = require('../src/util');

const BOOLEANS = ['json', 'zip', 'force', 'turntable', 'yes', 'global', 'project', 'textured', 'in-place', 'list'];

function out(result, opts, textFn) {
  if (opts.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else process.stdout.write((textFn ? textFn(result) : defaultText(result)) + '\n');
}

function defaultText(r) {
  if (typeof r === 'string') return r;
  const lines = [];
  for (const [k, v] of Object.entries(r)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const x of v) lines.push(`  ${typeof x === 'object' ? JSON.stringify(x) : x}`);
    } else if (v && typeof v === 'object') {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    } else if (v !== null && v !== undefined) {
      lines.push(`${k}: ${v}`);
    }
  }
  return lines.join('\n');
}

const COMMANDS = {
  scaffold(a) {
    const r = require('../src/scaffold').run(a._[0], { namespace: a.namespace, version: a.version, delivery: a.delivery, brief: typeof a.brief === 'string' ? a.brief : null, name: a.name, force: a.force });
    out(r, a);
  },
  validate(a) {
    const v = require('../src/validate');
    if (!a._[0]) throw usage('validate needs a file or directory');
    const r = v.run(a._[0], { version: a.version });
    out(r, a, (x) => (x.problems.length ? v.format(x.problems) + '\n' : '') + `${x.files.length} files checked, ${x.errors} errors, ${x.problems.length - x.errors} warnings`);
    return r.errors ? EXIT.FAIL : EXIT.OK;
  },
  describe(a) {
    const d = require('../src/describe');
    out(d.run(a._[0]), a, d.text);
  },
  grid(a) {
    out(require('../src/grid').run(a._[0], { cells: a.cells, out: a.out }), a);
  },
  brief(a) {
    const sub = a._.shift();
    if (sub !== 'check') throw usage('usage: mcmodel brief check <brief.json|prompt.md>');
    if (!a._[0]) throw usage('brief check needs a file');
    const b = require('../src/brief');
    const file = path.resolve(a._[0]);
    const problems = /\.md$/i.test(file) ? b.checkPrompt(readText(file)) : [];
    if (!problems.some((p) => p.level === 'error')) problems.push(...b.check(b.load(file), { baseDir: path.dirname(file) }));
    const errors = problems.filter((p) => p.level === 'error').length;
    out({ valid: errors === 0, errors, problems }, a, (r) =>
      [...r.problems.map((p) => `${a._[0]}:${p.path}: ${p.level === 'warning' ? 'warning: ' : ''}${p.message}`), r.valid ? 'brief OK' : `brief invalid: ${r.errors} errors`].join('\n'));
    return errors ? EXIT.FAIL : EXIT.OK;
  },
  texture(a) {
    const t = require('../src/texture');
    if (a.patch) return out(t.patch(a.patch, a.out), a);
    if (!a._[0]) throw usage('usage: mcmodel texture <brief> [--out <pack dir>] | mcmodel texture --patch <patch.json> [--out <png>]');
    const b = require('../src/brief');
    const file = path.resolve(a._[0]);
    const brief = b.load(file);
    const dir = path.resolve(a.out || path.join('mcmodel-out', brief.name));
    const files = t.fromBrief(brief, dir, path.dirname(file));
    out({ files: files.map((f) => rel(f)) }, a);
  },
  preview(a) {
    const target = a._[0] || (typeof a.brief === 'string' ? a.brief : undefined);
    const r = require('../src/preview').run(target, { brief: !!a.brief, reference: a.reference, out: a.out, turntable: a.turntable, size: a.size ? Number(a.size) : undefined, frames: a.frames ? Number(a.frames) : undefined });
    out(r, a);
  },
  score(a) {
    const s = require('../src/score');
    const r = s.run(a._[0], { budget: a.budget, brief: a.brief === true ? undefined : a.brief, version: a.version, baseline: a.baseline });
    out(r, a, s.text);
    return r.pass ? EXIT.OK : EXIT.FAIL;
  },
  animate(a) {
    const sub = a._.shift();
    const an = require('../src/animate');
    if (sub === 'build') return out(an.build(a._[0], a._[1], { route: a.route, out: a.out }), a);
    if (sub === 'preview') return out(an.preview(a._[0], a._[1], { out: a.out, frames: a.frames }), a);
    if (sub === 'check') {
      const r = an.check(a._[0], { model: a.model || a._[1], budget: a.budget });
      out(r, a, an.checkText);
      return r.pass ? EXIT.OK : EXIT.FAIL;
    }
    throw usage('usage: mcmodel animate build|preview <model> <plan> | animate check <plan> [--model <model>]');
  },
  review(a) {
    const rv = require('../src/review');
    const r = rv.run(a._[0], { version: a.version, budget: a.budget });
    out(r, a, rv.text);
    return r.ok ? EXIT.OK : EXIT.FAIL;
  },
  optimize(a) {
    const o = require('../src/optimize');
    const r = o.run(a._[0], { out: a.out });
    out(r, a, o.text);
    return r.visual_match ? EXIT.OK : EXIT.FAIL;
  },
  variants(a) {
    out(require('../src/variants').run(a._[0], a._[1], { out: a.out }), a);
  },
  convert(a) {
    out(require('../src/convert').run(a._[0], { to: a.to, out: a.out, namespace: a.namespace }), a);
  },
  pack(a) {
    out(require('../src/pack').run(a._, { out: a.out, zip: a.zip, version: a.version, name: a.name }), a);
  },
  import(a) {
    out(require('../src/importer').run(a._[0], { out: a.out, version: a.version, namespace: a.namespace }), a);
  },
  install(a) {
    out(require('../src/install').run(a._[0], { target: a.target, yes: a.yes, force: a.force, printConfig: a['print-config'], url: a.url }), a);
  },
  setup(a) {
    const host = a._[0];
    if (host !== 'codex') throw usage('usage: mcmodel setup codex [--global | --project]');
    out(require('../src/setup').codex({ project: a.project, dest: a.dest }), a);
  },
  ref(a) {
    const r = require('../src/ref');
    if (!a._[0] || a.list) return out(r.list().join('\n'), a);
    process.stdout.write(r.read(a._[0]));
  },
  help(a) {
    process.stdout.write(require('../src/ref').help(a._[0]));
  },
  version(a) {
    const pkg = require('../../package.json');
    const v = require('../src/versions');
    out({ mcmodel: pkg.version, node: process.version, minecraft: v.supported() }, a, (r) => `mcmodel ${r.mcmodel}\nnode ${r.node}\nminecraft ${r.minecraft.join(', ')}`);
  },
};

function main(argv) {
  const cmd = argv[0];
  if (!cmd || cmd === '--help' || cmd === '-h') {
    process.stdout.write(require('../src/ref').help());
    return EXIT.OK;
  }
  const fn = COMMANDS[cmd];
  if (!fn) throw usage(`unknown command "${cmd}". Run "mcmodel help".`);
  const a = parseArgs(argv.slice(1), BOOLEANS);
  return fn(a) || EXIT.OK;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  if (err instanceof CliError) {
    process.stderr.write(`mcmodel: ${err.message}\n`);
    process.exitCode = err.code;
  } else {
    process.stderr.write(`mcmodel: internal error: ${err.stack || err}\n`);
    process.exitCode = EXIT.FAIL;
  }
}
