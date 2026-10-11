'use strict';

const path = require('path');
const schema = require('./schema');
const versions = require('./versions');
const render = require('./render');
const preview = require('./preview');
const texture = require('./texture');
const { Image, montage, saveGif } = require('./image');
const { javaToBbmodel, uuid } = require('./bbmodel');
const { loadModel, findPackRoot, resolveTexture, textureFile, modelFile, elementName, parseId } = require('./model');
const { readJson, writeJson, writeText, exists, copyDir, walk, rel, usage, CliError, EXIT, isDir } = require('./util');

const INTENSITY = { subtle: 0.5, normal: 1, exaggerated: 1.5 };
const LIMITS = {
  1: ['Geometry does not move; only the texture changes.', 'Plays all the time; it cannot be triggered by use or hits.'],
  2: ['Discrete frames, no smooth interpolation.', 'Each element can turn on one axis only, in 22.5 degree steps up to 45; bigger turns are snapped.', 'Needs 1.21.4+ item definitions and an item state (use, cooldown or custom_model_data).'],
  3: ['Needs the generated datapack and item_display entities; not a held-item animation.', 'All copies spawned by summon share one schedule and animate in sync.', 'Needs 1.21.2+ for the item_model component.'],
  4: ['Exported as .bbmodel only; needs ModelEngine (or Blockbench) to play.', 'Not a vanilla resource pack.'],
};

function loadPlan(file) {
  const plan = readJson(file);
  const errs = schema.validate(plan, schema.load('anim-plan'));
  if (errs.length) {
    throw new CliError(`${file}: invalid animation plan:\n${errs.map((e) => `${e.path}: ${e.message}`).join('\n')}`, EXIT.FAIL);
  }
  return plan;
}

// part name -> element indices
function partMap(model, plan) {
  const map = {};
  const used = new Set();
  for (const [name, p] of Object.entries(plan.parts || {})) {
    let idx;
    if (p.elements) {
      idx = p.elements.map((ref) => (typeof ref === 'number' ? ref : model.elements.findIndex((e, i) => elementName(e, i) === ref)));
    } else {
      idx = model.elements.map((e, i) => [elementName(e, i), i]).filter(([n]) => n === name || n.startsWith(`${name}_`)).map(([, i]) => i);
    }
    map[name] = idx;
    idx.forEach((i) => used.add(i));
  }
  return { map, static: model.elements.map((_, i) => i).filter((i) => !used.has(i)) };
}

function ease(kind, u) {
  switch (kind) {
    case 'linear': return u;
    case 'snappy': return 1 - Math.pow(1 - u, 3);
    case 'step': return 0;
    default: return u * u * (3 - 2 * u);
  }
}

function localTime(plan, tick) {
  const L = plan.length_ticks;
  if (plan.loop === 'once') return Math.min(tick, L);
  if (plan.loop === 'pingpong') {
    const t = tick % (2 * L);
    return t <= L ? t : 2 * L - t;
  }
  return ((tick % L) + L) % L;
}

function sample(plan, part, tick) {
  const kf = (part.keyframes || []).slice().sort((a, b) => a.t - b.t);
  const k = INTENSITY[plan.intensity || 'normal'];
  const val = (f, key, def) => (f[key] ? f[key].slice() : def.slice());
  const pick = (f) => ({ rot: val(f, 'rot', [0, 0, 0]), pos: val(f, 'pos', [0, 0, 0]), scale: val(f, 'scale', [1, 1, 1]) });
  if (!kf.length) return { rot: [0, 0, 0], pos: [0, 0, 0], scale: [1, 1, 1] };
  const t = localTime(plan, tick);
  let s;
  if (t <= kf[0].t) s = pick(kf[0]);
  else if (t >= kf[kf.length - 1].t) s = pick(kf[kf.length - 1]);
  else {
    let i = 0;
    while (kf[i + 1].t < t) i++;
    const a = pick(kf[i]);
    const b = pick(kf[i + 1]);
    const u = ease(kf[i + 1].easing || plan.easing || 'ease-in-out', (t - kf[i].t) / (kf[i + 1].t - kf[i].t));
    s = {};
    for (const key of ['rot', 'pos', 'scale']) s[key] = a[key].map((v, j) => v + (b[key][j] - v) * u);
  }
  s.rot = s.rot.map((v) => v * k);
  s.pos = s.pos.map((v) => v * k);
  return s;
}

function pivotOf(model, plan, name, idx) {
  const p = plan.parts[name];
  if (p.pivot) return p.pivot;
  if (!idx.length) return [8, 8, 8];
  const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const i of idx) for (let k = 0; k < 3; k++) {
    b.min[k] = Math.min(b.min[k], model.elements[i].from[k]);
    b.max[k] = Math.max(b.max[k], model.elements[i].to[k]);
  }
  return [(b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2];
}

// Point transform for one part at one tick, including parent chain.
function partFn(model, plan, parts, name, tick, depth = 0) {
  const p = plan.parts[name];
  const s = sample(plan, p, tick);
  const pv = pivotOf(model, plan, name, parts.map[name]);
  const own = (q) => {
    const d = [(q[0] - pv[0]) * s.scale[0], (q[1] - pv[1]) * s.scale[1], (q[2] - pv[2]) * s.scale[2]];
    const r = render.rotateEuler(d, s.rot);
    return [r[0] + pv[0] + s.pos[0], r[1] + pv[1] + s.pos[1], r[2] + pv[2] + s.pos[2]];
  };
  if (p.parent && plan.parts[p.parent] && depth < 8) {
    const parentFn = partFn(model, plan, parts, p.parent, tick, depth + 1);
    return (q) => parentFn(own(q));
  }
  return own;
}

function transformsAt(model, plan, parts, tick) {
  const byElement = {};
  for (const name of Object.keys(plan.parts || {})) {
    const fn = partFn(model, plan, parts, name, tick);
    for (const i of parts.map[name]) byElement[i] = fn;
  }
  return (el, i) => byElement[i] || null;
}

function frameTicks(plan) {
  const n = plan.frames || 8;
  const span = plan.loop === 'pingpong' ? 2 * plan.length_ticks : plan.length_ticks;
  return Array.from({ length: n }, (_, i) => Math.round((span * i) / n));
}

// --- texture effects (route 1) ---
function effectFrames(img, ta) {
  const n = ta.frames || 8;
  const s = ta.strength === undefined ? 0.5 : ta.strength;
  const frames = [];
  for (let i = 0; i < n; i++) {
    const ph = i / n;
    let f = img.clone();
    const w = f.width;
    switch (ta.effect) {
      case 'pulse':
        f = texture.applyOps(f, [{ op: 'brightness', factor: 1 + s * 0.6 * Math.sin(2 * Math.PI * ph) }]);
        break;
      case 'flicker': {
        const r = Math.abs(Math.sin((i + 1) * 12.9898) * 43758.5453) % 1;
        f = texture.applyOps(f, [{ op: 'brightness', factor: 1 - s * 0.5 + r * s }]);
        break;
      }
      case 'hue_cycle':
        f = texture.applyOps(f, [{ op: 'hue_shift', degrees: 360 * ph * Math.max(s, 0.01) * 2 }]);
        break;
      case 'shimmer': {
        const pos = ph * w * 3 - w;
        for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
          const c = f.get(x, y);
          if (!c[3]) continue;
          const d = Math.abs(x + y - pos);
          if (d < 2) f.set(x, y, c.map((v, k) => (k === 3 ? v : Math.min(255, Math.round(v + (255 - v) * s * (1 - d / 2))))));
        }
        break;
      }
      default: {
        const m = /^scroll_(up|down|left|right)$/.exec(ta.effect);
        if (m) {
          const sh = Math.round(ph * w);
          const out = new Image(w, w);
          for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
            let sx = x;
            let sy = y;
            if (m[1] === 'up') sy = (y + sh) % w;
            if (m[1] === 'down') sy = (y - sh + w) % w;
            if (m[1] === 'left') sx = (x + sh) % w;
            if (m[1] === 'right') sx = (x - sh + w) % w;
            out.set(x, y, img.get(sx, sy));
          }
          f = out;
        }
      }
    }
    frames.push(f);
  }
  return frames;
}

function textureTarget(model, ta) {
  const t = ta.texture;
  if (t.startsWith('#')) return resolveTexture(t, model.textures);
  if (/\.png$/i.test(t)) return { file: path.resolve(t) };
  return t;
}

function loadTargetImage(model, target) {
  const f = typeof target === 'object' ? target.file : textureFile(model.root, target);
  if (!f || !exists(f)) throw usage(`animation texture not found: ${typeof target === 'object' ? target.file : target}`);
  const img = Image.load(f);
  return { file: f, img: img.height > img.width ? img.crop(0, 0, img.width, img.width) : img };
}

// --- preview ---
function previewRun(modelPath, planPath, opts = {}) {
  if (!modelPath || !planPath) throw usage('usage: mcmodel animate preview <model> <plan>');
  const model = loadModel(path.resolve(modelPath));
  const plan = loadPlan(path.resolve(planPath));
  const outDir = path.resolve(opts.out || path.join('mcmodel-out', 'anim', plan.name));
  const frames = [];
  const labels = [];
  const size = 160;
  if (plan.route === 1) {
    const ta = plan.texture_animation;
    if (!ta) throw usage('route 1 needs "texture_animation" in the plan');
    const target = textureTarget(model, ta);
    const { img } = loadTargetImage(model, target);
    const texFrames = effectFrames(img, ta);
    const id = typeof target === 'object' ? null : target;
    const base = render.quadsForModel(model);
    const frame = render.frameFor(base);
    texFrames.forEach((tf, i) => {
      const override = {};
      if (id) override[id] = tf;
      const q = render.quadsForModel(model, { textureOverride: override });
      frames.push(render.renderQuads(q, Object.assign({ size, frame, background: preview.BG }, render.VIEWS.iso)));
      labels.push(`F${i}`);
    });
  } else {
    const parts = partMap(model, plan);
    const ticks = frameTicks(plan);
    const rest = render.quadsForModel(model);
    const fr = render.frameFor(rest);
    const frame = { center: fr.center, radius: fr.radius * 1.25 };
    for (const t of ticks) {
      const xf = transformsAt(model, plan, parts, t);
      const q = render.quadsForModel(model, { partTransform: xf });
      frames.push(render.renderQuads(q, Object.assign({ size, frame, background: preview.BG }, render.VIEWS.iso)));
      labels.push(`T${t}`);
    }
  }
  const strip = montage(frames.map((image, i) => ({ label: labels[i], image })));
  const files = [rel(strip.save(path.join(outDir, `${plan.name}.strip.png`)))];
  const delay = Math.max(2, Math.round(((plan.length_ticks / frames.length) * 100) / 20));
  files.push(rel(saveGif(path.join(outDir, `${plan.name}.gif`), frames, delay)));
  return { route: plan.route, frames: frames.length, files };
}

// --- check ---
function boxOf(el, fn) {
  const pts = [];
  for (const x of [el.from[0], el.to[0]]) for (const y of [el.from[1], el.to[1]]) for (const z of [el.from[2], el.to[2]]) pts.push(fn ? fn([x, y, z]) : [x, y, z]);
  const min = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k])));
  const max = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
  return { min, max };
}

function gap(a, b) {
  let d = 0;
  for (let k = 0; k < 3; k++) d = Math.max(d, a.min[k] - b.max[k], b.min[k] - a.max[k]);
  return d;
}

function check(planPath, opts = {}) {
  if (!planPath) throw usage('usage: mcmodel animate check <plan> [--model <model>]');
  const issues = [];
  const add = (level, message) => issues.push({ level, message });
  let plan;
  try {
    plan = loadPlan(path.resolve(planPath));
  } catch (err) {
    return { pass: false, issues: [{ level: 'fail', message: err.message }] };
  }
  const budget = opts.budget ? Number(opts.budget) : 8;
  if (plan.route === 1 && !plan.texture_animation) add('fail', 'route 1 needs "texture_animation"');
  if (plan.route !== 1 && !Object.keys(plan.parts || {}).length) add('fail', `route ${plan.route} needs at least one entry in "parts"`);
  if (plan.route === 1 && plan.trigger && plan.trigger !== 'always') add('warn', 'texture flipbooks always play; the trigger is ignored');
  if (plan.route === 2) {
    if (!plan.trigger || plan.trigger === 'always' || plan.trigger === 'movement') add('fail', `frame swap needs an item state (use, hit or command); "${plan.trigger || 'always'}" is not possible. Use route 1 or 3 for always-on motion`);
    const n = plan.frames || 8;
    if (n > budget) add('fail', `${n} frames exceeds the frame-swap variant budget of ${budget}`);
  }
  for (const [name, p] of Object.entries(plan.parts || {})) {
    for (const k of p.keyframes || []) {
      if (k.t > plan.length_ticks) add('warn', `${name}: keyframe at t=${k.t} is after length_ticks ${plan.length_ticks}`);
      const r = k.rot || [0, 0, 0];
      const spinning = r.some((v) => Math.abs(v) >= 180) && plan.loop !== 'once';
      if (r.some((v) => Math.abs(v) > 120) && !spinning) add('warn', `${name}: extreme angle ${JSON.stringify(r)} at t=${k.t}`);
      if (plan.route === 2) {
        const nz = r.filter((v) => Math.abs(v) > 1e-6);
        if (nz.length > 1) add('warn', `${name}: frame swap can turn one axis per element; ${JSON.stringify(r)} will keep only the largest`);
        if (nz.some((v) => Math.abs(v) > 45 || Math.abs(v / 22.5 - Math.round(v / 22.5)) > 1e-6)) add('warn', `${name}: ${JSON.stringify(r)} will be snapped to 22.5 degree steps within -45..45`);
      }
    }
    if (p.parent && !(plan.parts || {})[p.parent]) add('fail', `${name}: parent "${p.parent}" is not a part`);
  }
  const modelPath = opts.model;
  if (modelPath && plan.route !== 1) {
    const model = loadModel(path.resolve(modelPath));
    const parts = partMap(model, plan);
    for (const [name, idx] of Object.entries(parts.map)) {
      if (!idx.length) add('fail', `${name}: matches no elements in the model`);
      if (idx.some((i) => i < 0 || i >= model.elements.length)) add('fail', `${name}: references a missing element`);
    }
    const restBoxes = model.elements.map((e) => boxOf(e));
    for (const [name, idx] of Object.entries(parts.map)) {
      const others = model.elements.map((_, i) => i).filter((i) => !idx.includes(i));
      if (!others.length || !idx.length) continue;
      const touching = idx.some((i) => others.some((o) => gap(restBoxes[i], restBoxes[o]) <= 0.01));
      if (!touching) continue;
      for (const t of frameTicks(plan)) {
        const xf = transformsAt(model, plan, parts, t);
        const boxes = model.elements.map((e, i) => boxOf(e, xf(e, i)));
        const attached = idx.some((i) => others.some((o) => gap(boxes[i], boxes[o]) <= 0.5));
        if (!attached) {
          add('fail', `${name}: detaches from the rest of the model at tick ${t}`);
          break;
        }
      }
    }
  }
  return { pass: !issues.some((i) => i.level === 'fail'), route: plan.route, limits: LIMITS[plan.route], issues };
}

function checkText(r) {
  const lines = [`animate check: ${r.pass ? 'PASS' : 'FAIL'}${r.route ? ` (route ${r.route})` : ''}`];
  for (const i of r.issues) lines.push(`  [${i.level}] ${i.message}`);
  if (r.limits) for (const l of r.limits) lines.push(`  limit: ${l}`);
  return lines.join('\n');
}

// --- build ---
function versionFor(plan, root) {
  if (plan.minecraft_version) return versions.get(plan.minecraft_version);
  const meta = root && exists(path.join(root, 'pack.mcmeta')) ? readJson(path.join(root, 'pack.mcmeta')) : null;
  const v = meta && meta.pack && versions.byPackFormat(meta.pack.pack_format);
  if (!v) throw usage('cannot tell the Minecraft version; add "minecraft_version" to the plan');
  return v;
}

function copyPack(root, out) {
  if (exists(out) && !isDir(out)) throw usage(`${out} exists and is not a folder`);
  copyDir(root, out);
  return out;
}

// cols[i] = image of axis i (rotation matrix columns) -> quaternion [x, y, z, w].
function matToQuat(cols) {
  const m = (r, c) => cols[c][r];
  const tr = m(0, 0) + m(1, 1) + m(2, 2);
  let q;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m(2, 1) - m(1, 2)) / s, (m(0, 2) - m(2, 0)) / s, (m(1, 0) - m(0, 1)) / s, 0.25 * s];
  } else if (m(0, 0) > m(1, 1) && m(0, 0) > m(2, 2)) {
    const s = Math.sqrt(1 + m(0, 0) - m(1, 1) - m(2, 2)) * 2;
    q = [0.25 * s, (m(0, 1) + m(1, 0)) / s, (m(0, 2) + m(2, 0)) / s, (m(2, 1) - m(1, 2)) / s];
  } else if (m(1, 1) > m(2, 2)) {
    const s = Math.sqrt(1 + m(1, 1) - m(0, 0) - m(2, 2)) * 2;
    q = [(m(0, 1) + m(1, 0)) / s, 0.25 * s, (m(1, 2) + m(2, 1)) / s, (m(0, 2) - m(2, 0)) / s];
  } else {
    const s = Math.sqrt(1 + m(2, 2) - m(0, 0) - m(1, 1)) * 2;
    q = [(m(0, 2) + m(2, 0)) / s, (m(1, 2) + m(2, 1)) / s, 0.25 * s, (m(1, 0) - m(0, 1)) / s];
  }
  return q;
}

const f4 = (v) => `${Math.round(v * 10000) / 10000}f`;

function snapRotation(rot) {
  const nz = rot.map((v, i) => [Math.abs(v), i]).filter(([v]) => v > 1e-6).sort((a, b) => b[0] - a[0]);
  if (!nz.length) return null;
  const i = nz[0][1];
  const angle = Math.max(-45, Math.min(45, Math.round(rot[i] / 22.5) * 22.5));
  return angle ? { axis: 'xyz'[i], angle } : null;
}

function buildFrameSwap(model, plan, info, out) {
  if (!info.item_definitions) throw new CliError(`route 2 needs 1.21.4+ item definitions; target is ${info.version}`, EXIT.UNSUPPORTED);
  const r = check(plan.__file);
  if (!r.pass) throw new CliError(`animation plan fails checks:\n${checkText(r)}`, EXIT.FAIL);
  const parts = partMap(model, plan);
  const ns = parseId(model.id).ns;
  const modelPath = parseId(model.id).path;
  const raw = readJson(model.file);
  const ticks = frameTicks(plan);
  const files = [];
  const warnings = [];
  const frameIds = ticks.map((t, k) => {
    const els = JSON.parse(JSON.stringify(raw.elements || model.elements));
    for (const [name, idx] of Object.entries(parts.map)) {
      const s = sample(plan, plan.parts[name], t);
      const pv = pivotOf(model, plan, name, idx);
      const snapped = snapRotation(s.rot);
      for (const i of idx) {
        const e = els[i];
        for (const key of ['from', 'to']) e[key] = e[key].map((v, j) => Math.round((pv[j] + (v - pv[j]) * s.scale[j] + s.pos[j]) * 1000) / 1000);
        if (snapped) {
          if (e.rotation && e.rotation.angle) warnings.push(`frame ${k}: element ${elementName(e, i)} already rotated; part rotation replaces it`);
          e.rotation = { origin: pv.map((v, j) => v + s.pos[j]), axis: snapped.axis, angle: snapped.angle };
        }
      }
    }
    const id = `${ns}:${modelPath}_${plan.name}_f${k}`;
    const json = Object.assign({}, raw, { elements: els });
    delete json.overrides;
    if (!raw.elements && model.elements.length) json.elements = els;
    writeJson(modelFile(out, id), json);
    files.push(modelFile(out, id));
    return id;
  });
  const L = plan.length_ticks;
  const n = frameIds.length;
  const entry = (id) => ({ type: 'minecraft:model', model: id });
  let tree;
  if (plan.trigger === 'use') {
    tree = {
      type: 'minecraft:condition',
      property: 'minecraft:using_item',
      on_false: entry(model.id),
      on_true: {
        type: 'minecraft:range_dispatch',
        property: 'minecraft:use_duration',
        entries: frameIds.map((id, k) => ({ threshold: Math.round((L * k) / n), model: entry(id) })),
        fallback: entry(frameIds[0]),
      },
    };
  } else if (plan.trigger === 'hit') {
    tree = {
      type: 'minecraft:range_dispatch',
      property: 'minecraft:cooldown',
      entries: frameIds.map((id, k) => ({ threshold: Math.round(((n - k) / n) * 1000) / 1000, model: entry(id) })).reverse(),
      fallback: entry(model.id),
    };
  } else {
    tree = {
      type: 'minecraft:range_dispatch',
      property: 'minecraft:custom_model_data',
      index: 1,
      entries: frameIds.map((id, k) => ({ threshold: k + 1, model: entry(id) })),
      fallback: entry(model.id),
    };
  }
  // Swap every reference to the original model inside item definitions.
  let replaced = 0;
  for (const f of walk(path.join(out, 'assets'), (x) => x.split(path.sep).includes('items') && x.endsWith('.json'))) {
    const j = readJson(f);
    const swap = (node) => {
      if (Array.isArray(node)) return node.map(swap);
      if (!node || typeof node !== 'object') return node;
      if (/(^|:)model$/.test(node.type || '') && node.model === model.id) {
        replaced++;
        return JSON.parse(JSON.stringify(tree));
      }
      const o = {};
      for (const [k, v] of Object.entries(node)) o[k] = typeof v === 'object' ? swap(v) : v;
      return o;
    };
    const next = swap(j);
    if (JSON.stringify(next) !== JSON.stringify(j)) {
      writeJson(f, next);
      files.push(f);
    }
  }
  if (!replaced) {
    const f = path.join(out, 'assets', ns, 'items', `${modelPath.split('/').pop()}.json`);
    writeJson(f, { model: tree });
    files.push(f);
  }
  const notes = [];
  if (plan.trigger === 'command') notes.push(`set frame k with custom_model_data={floats:[<base value>, k]} (k = 1..${n}); 0 shows the rest pose`);
  if (plan.trigger === 'hit') notes.push('frames follow the item cooldown; give the item a use_cooldown component so hits start it');
  return { files, warnings, notes };
}

function buildDisplayEntities(model, plan, info, out) {
  if (!info.item_model_component) throw new CliError(`route 3 needs the 1.21.2+ item_model component; target is ${info.version}`, EXIT.UNSUPPORTED);
  const parts = partMap(model, plan);
  const ns = parseId(model.id).ns;
  const base = `${parseId(model.id).path.split('/').pop()}`;
  const raw = readJson(model.file);
  const files = [];
  const groups = Object.assign({}, parts.map);
  if (parts.static.length) groups.static = parts.static;
  const modelIds = {};
  for (const [name, idx] of Object.entries(groups)) {
    const id = `${ns}:item/${base}_${name}`;
    const json = { textures: raw.textures || model.textures, elements: idx.map((i) => model.elements[i]) };
    writeJson(modelFile(out, id), json);
    files.push(modelFile(out, id));
    if (info.item_definitions) {
      const f = path.join(out, 'assets', ns, 'items', `${base}_${name}.json`);
      writeJson(f, { model: { type: 'minecraft:model', model: id } });
      files.push(f);
    }
    modelIds[name] = `${ns}:${base}_${name}`;
  }
  const dp = `${out}.datapack`;
  const fnDir = path.join(dp, 'data', ns, info.function_folder, base, plan.name);
  const fnId = (f) => `${ns}:${base}/${plan.name}/${f}`;
  writeJson(path.join(dp, 'pack.mcmeta'), { pack: { pack_format: info.data_pack_format, description: `${base} ${plan.name} animation - Model Creator` } });
  files.push(path.join(dp, 'pack.mcmeta'));
  const tag = `mcm_${base}`;
  // Affine part transform (parents included) -> display entity translation/rotation/scale.
  // Model pixel p renders at p/16 - 0.5 blocks, so translation = M*0.5 + f(0)/16 - 0.5.
  const xform = (name, tick) => {
    if (name === 'static') return { t: [0, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1] };
    const f = partFn(model, plan, parts, name, tick);
    const o = f([0, 0, 0]);
    const cols = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((e) => f(e).map((v, k) => v - o[k]));
    const s = cols.map((c) => Math.hypot(c[0], c[1], c[2]) || 1);
    const R = cols.map((c, i) => c.map((v) => v / s[i]));
    const t = [0, 1, 2].map((k) => (cols[0][k] + cols[1][k] + cols[2][k]) * 0.5 + o[k] / 16 - 0.5);
    return { t, q: matToQuat(R), s };
  };
  const nbt = (x) => `{left_rotation:[${x.q.map(f4).join(',')}],right_rotation:[0f,0f,0f,1f],translation:[${x.t.map(f4).join(',')}],scale:[${x.s.map(f4).join(',')}]}`;
  const summon = Object.keys(groups).map((name) =>
    `summon minecraft:item_display ~ ~ ~ {Tags:["${tag}","${tag}_${name}"],item_display:"none",item:{id:"minecraft:paper",count:1,components:{"minecraft:item_model":"${modelIds[name]}"}},transformation:${nbt(xform(name, 0))}}`);
  writeText(path.join(fnDir, 'summon.mcfunction'), `# Summon the animated model at the executing position\n${summon.join('\n')}\n`);
  const ticks = frameTicks(plan);
  const step = Math.max(1, Math.round((plan.loop === 'pingpong' ? 2 : 1) * plan.length_ticks / ticks.length));
  ticks.forEach((t, k) => {
    const lines = [`# Frame ${k} (tick ${t})`];
    for (const name of Object.keys(parts.map)) {
      const next = ticks[(k + 1) % ticks.length];
      lines.push(`execute as @e[type=minecraft:item_display,tag=${tag}_${name}] run data merge entity @s {start_interpolation:0,interpolation_duration:${step},transformation:${nbt(xform(name, plan.loop === 'once' && k === ticks.length - 1 ? plan.length_ticks : next))}}`);
    }
    if (k === 0 && plan.extras && plan.extras.sound) lines.push(`execute at @e[type=minecraft:item_display,tag=${tag},limit=1] run playsound ${plan.extras.sound} master @a ~ ~ ~`);
    if (k === 0 && plan.extras && plan.extras.particle) lines.push(`execute at @e[type=minecraft:item_display,tag=${tag}] run particle ${plan.extras.particle} ~ ~0.5 ~ 0.2 0.2 0.2 0 4`);
    const last = k === ticks.length - 1;
    if (!last) lines.push(`schedule function ${fnId(`frame_${k + 1}`)} ${step}t`);
    else if (plan.loop !== 'once') lines.push(`schedule function ${fnId('frame_0')} ${step}t`);
    writeText(path.join(fnDir, `frame_${k}.mcfunction`), lines.join('\n') + '\n');
  });
  writeText(path.join(fnDir, 'play.mcfunction'), `function ${fnId('frame_0')}\n`);
  writeText(path.join(fnDir, 'stop.mcfunction'), ticks.map((_, k) => `schedule clear ${fnId(`frame_${k}`)}`).join('\n') + '\n');
  writeText(path.join(fnDir, 'kill.mcfunction'), `function ${fnId('stop')}\nkill @e[type=minecraft:item_display,tag=${tag}]\n`);
  files.push(...walk(fnDir));
  const notes = [
    `Install ${rel(dp)} as a datapack and ${rel(out)} as the resource pack.`,
    `Run /function ${fnId('summon')} where the model should appear, then /function ${fnId('play')}.`,
    `/function ${fnId('stop')} pauses, /function ${fnId('kill')} removes it.`,
  ];
  if (plan.trigger && plan.trigger !== 'always' && plan.trigger !== 'command') notes.push(`trigger "${plan.trigger}" is not wired automatically; call play from your own advancement or command block`);
  return { files, warnings: [], notes };
}

function buildSkeletal(model, plan, out) {
  const parts = partMap(model, plan);
  const name = parseId(model.id || 'custom:model').path.split('/').pop();
  const groups = Object.entries(parts.map).map(([g, idx]) => ({ name: g, origin: pivotOf(model, plan, g, idx), elements: idx, uuid: uuid(`${name}:group:${g}`) }));
  const animators = {};
  const interp = (k) => (k.easing || plan.easing) === 'linear' ? 'linear' : (k.easing || plan.easing) === 'step' ? 'step' : 'catmullrom';
  for (const g of groups) {
    const kf = [];
    const frames = (plan.parts[g.name].keyframes || []).slice().sort((a, b) => a.t - b.t);
    const all = plan.loop === 'pingpong' ? frames.concat(frames.slice(0, -1).reverse().map((k) => Object.assign({}, k, { t: 2 * plan.length_ticks - k.t }))) : frames;
    const m = INTENSITY[plan.intensity || 'normal'];
    for (const k of all) {
      const time = Math.round((k.t / 20) * 1000) / 1000;
      const dp = (v) => [{ x: v[0], y: v[1], z: v[2] }];
      if (k.rot) kf.push({ channel: 'rotation', data_points: dp(k.rot.map((v) => v * m)), uuid: uuid(`${g.name}:r:${time}`), time, color: -1, interpolation: interp(k) });
      if (k.pos) kf.push({ channel: 'position', data_points: dp(k.pos.map((v) => v * m)), uuid: uuid(`${g.name}:p:${time}`), time, color: -1, interpolation: interp(k) });
      if (k.scale) kf.push({ channel: 'scale', data_points: dp(k.scale), uuid: uuid(`${g.name}:s:${time}`), time, color: -1, interpolation: interp(k) });
    }
    animators[g.uuid] = { name: g.name, type: 'bone', keyframes: kf };
  }
  const length = ((plan.loop === 'pingpong' ? 2 : 1) * plan.length_ticks) / 20;
  const anim = {
    uuid: uuid(`${name}:anim:${plan.name}`),
    name: plan.name,
    loop: plan.loop === 'once' ? 'once' : 'loop',
    override: false,
    length,
    snapping: 20,
    selected: false,
    anim_time_update: '',
    blend_weight: '',
    start_delay: '',
    loop_delay: '',
    animators,
  };
  const file = path.join(out, `${name}.bbmodel`);
  let bb;
  if (exists(file)) {
    bb = readJson(file);
    bb.animations = (bb.animations || []).filter((a) => a.name !== plan.name).concat([anim]);
  } else {
    bb = javaToBbmodel(model, { name, groups, format: 'free', animations: [anim] });
  }
  writeJson(file, bb);
  const notes = ['Copy the .bbmodel to plugins/ModelEngine/blueprints and run /meg reload.'];
  if (plan.extras && plan.extras.chain) notes.push(`Animation set: run "animate build" once per plan (${plan.extras.chain.join(', ')}); each adds to the same .bbmodel.`);
  return { files: [file], warnings: [], notes };
}

function buildTexture(model, plan, out) {
  const ta = plan.texture_animation;
  if (!ta) throw usage('route 1 needs "texture_animation" in the plan');
  const target = textureTarget(model, ta);
  const { file, img } = loadTargetImage(model, target);
  const frames = effectFrames(img, ta);
  const strip = new Image(img.width, img.width * frames.length);
  frames.forEach((f, i) => strip.blit(f, 0, i * img.width));
  let dest = file;
  if (model.root && typeof target !== 'object') dest = textureFile(out, target);
  else dest = path.join(out, path.basename(file));
  strip.save(dest);
  const frametime = ta.frametime || Math.max(1, Math.round(plan.length_ticks / frames.length));
  writeJson(dest + '.mcmeta', { animation: { frametime, interpolate: !!ta.interpolate } });
  return { files: [dest, dest + '.mcmeta'], warnings: [], notes: [`${frames.length} frames x ${frametime} ticks`] };
}

function build(modelPath, planPath, opts = {}) {
  if (!modelPath || !planPath) throw usage('usage: mcmodel animate build <model> <plan> [--route 1-4] [--out <dir>]');
  const model = loadModel(path.resolve(modelPath));
  const plan = loadPlan(path.resolve(planPath));
  plan.__file = path.resolve(planPath);
  if (opts.route) plan.route = Number(opts.route);
  if (![1, 2, 3, 4].includes(plan.route)) throw usage('--route must be 1, 2, 3 or 4');
  const root = model.root || findPackRoot(model.file);
  let out;
  let result;
  if (plan.route === 4) {
    out = path.resolve(opts.out || path.join('mcmodel-out', 'anim', plan.name));
    result = buildSkeletal(model, plan, out);
  } else {
    if (!root) throw usage(`${modelPath} is not inside a resource pack (no pack.mcmeta found)`);
    out = path.resolve(opts.out || `${root}.${plan.name}`);
    copyPack(root, out);
    const m2 = loadModel(path.join(out, path.relative(root, model.file)), { root: out });
    if (plan.route === 1) result = buildTexture(m2, plan, out);
    else {
      const info = versionFor(plan, root);
      result = plan.route === 2 ? buildFrameSwap(m2, plan, info, out) : buildDisplayEntities(m2, plan, info, out);
    }
  }
  return {
    route: plan.route,
    out: rel(out),
    files: [...new Set(result.files)].map((f) => rel(f)),
    warnings: result.warnings,
    notes: result.notes,
    limits: LIMITS[plan.route],
  };
}

module.exports = { build, preview: previewRun, check, checkText, loadPlan, sample, partMap, matToQuat, effectFrames, LIMITS };
