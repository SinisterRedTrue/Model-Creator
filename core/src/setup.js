'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT, copyDir, writeText, rel } = require('./util');

// Install the skills for Codex and record where the CLI lives.
function codex(opts = {}) {
  const dest = opts.dest
    ? path.resolve(opts.dest)
    : opts.project
      ? path.resolve('.agents', 'skills')
      : path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills');
  const cli = path.join(ROOT, 'core', 'bin', 'mcmodel.js');
  const skillsDir = path.join(ROOT, 'skills');
  const installed = [];
  for (const name of fs.readdirSync(skillsDir)) {
    const src = path.join(skillsDir, name);
    if (!fs.existsSync(path.join(src, 'SKILL.md'))) continue;
    const to = path.join(dest, name);
    fs.rmSync(to, { recursive: true, force: true });
    copyDir(src, to);
    writeText(path.join(to, 'mcmodel.path'), cli + '\n');
    installed.push(name);
  }
  return {
    destination: rel(dest),
    cli,
    skills: installed,
    notes: ['Restart Codex so it picks up the skills.', 'Re-run this command after "git pull" to update.'],
  };
}

module.exports = { codex };
