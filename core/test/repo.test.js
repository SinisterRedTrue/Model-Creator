'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');

const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const commands = fs.readdirSync(path.join(ROOT, 'commands')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
const skills = fs.readdirSync(path.join(ROOT, 'skills')).filter((d) => fs.statSync(path.join(ROOT, 'skills', d)).isDirectory());

// Tiny frontmatter reader: key: value lines, values optionally double-quoted.
function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text.replace(/\r\n/g, '\n'));
  assert.ok(m, 'missing frontmatter');
  const out = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    const key = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v.startsWith('"')) v = JSON.parse(v);
    else assert.ok(!/: | #/.test(v) && !/^[[{&*!|>'%@`]/.test(v), `${key}: unquoted value needs quotes`);
    out[key] = v;
  }
  return out;
}

test('help: every command file and skill folder appears in help.md', () => {
  const help = read('references', 'help.md');
  for (const c of commands) assert.match(help, new RegExp(`^## ${c} \\(`, 'm'), `command ${c} missing from help.md`);
  for (const s of skills) assert.ok(help.includes(`(${s})`), `skill ${s} missing from help.md`);
});

test('skills: valid frontmatter, name matches folder, setup block, size limits', () => {
  assert.strictEqual(skills.length, 14);
  for (const s of skills) {
    const text = read('skills', s, 'SKILL.md');
    const fm = frontmatter(text);
    assert.deepStrictEqual(Object.keys(fm).sort(), ['description', 'name'], s);
    assert.strictEqual(fm.name, s);
    assert.match(fm.name, /^[a-z0-9-]{1,64}$/);
    assert.ok(fm.description.length > 40 && fm.description.length <= 1024, `${s}: description length ${fm.description.length}`);
    assert.ok(text.includes('${CLAUDE_PLUGIN_ROOT}/core/bin/mcmodel.js') && text.includes('mcmodel.path') && text.includes('../../core/bin/mcmodel.js'), `${s}: CLI resolution block`);
    assert.ok(text.split('\n').length < 500, `${s}: over 500 lines`);
  }
});

test('commands: frontmatter and a matching skill', () => {
  assert.strictEqual(commands.length, 14);
  for (const c of commands) {
    const text = read('commands', `${c}.md`);
    const fm = frontmatter(text);
    assert.ok(fm.description, c);
    assert.ok(fm['allowed-tools'].includes('Bash(node:*)'), c);
    assert.match(c, /^[a-z-]+$/);
    assert.ok(text.includes('$ARGUMENTS'), `${c}: passes $ARGUMENTS`);
    const m = /`([a-z-]+)` skill/.exec(text);
    assert.ok(m && skills.includes(m[1]), `${c}: names an existing skill`);
  }
});

test('manifests parse and versions match package.json', () => {
  const pkg = JSON.parse(read('package.json'));
  const plugin = JSON.parse(read('.claude-plugin', 'plugin.json'));
  const market = JSON.parse(read('.claude-plugin', 'marketplace.json'));
  assert.strictEqual(plugin.name, 'model-creator');
  assert.strictEqual(plugin.version, pkg.version);
  assert.strictEqual(market.plugins[0].name, plugin.name);
  assert.strictEqual(market.plugins[0].version, pkg.version);
  assert.strictEqual(market.plugins[0].source, './');
  assert.ok(!pkg.dependencies, 'no runtime dependencies');
});

test('every folder under skills/ has a SKILL.md and references resolve', () => {
  for (const s of skills) assert.ok(fs.existsSync(path.join(ROOT, 'skills', s, 'SKILL.md')), s);
  for (const r of ['java-model-format', 'decomposition-guide', 'texture-guide', 'prompt-contract', 'questionnaire', 'delivery-targets', 'animation-routes', 'animation-presets', 'help']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'references', `${r}.md`)), r);
  }
  for (const s of ['brief', 'anim-plan', 'variants']) JSON.parse(read('references', 'schemas', `${s}.schema.json`));
});

test('source is CommonJS and there are no shell scripts', () => {
  const files = require('../src/util').walk(ROOT, (f) => !f.includes(`${path.sep}.git${path.sep}`) && !f.includes('node_modules'));
  assert.ok(!files.some((f) => /\.(sh|bash|ps1|bat|cmd)$/.test(f)), 'no shell scripts');
  for (const f of files.filter((x) => x.includes(`${path.sep}core${path.sep}src${path.sep}`))) {
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!/^\s*(import|export)\s/m.test(t), `${f}: ESM syntax`);
  }
});
