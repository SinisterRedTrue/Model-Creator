'use strict';

const path = require('path');
const { Image, montage, saveGif } = require('./image');
const render = require('./render');
const briefLib = require('./brief');
const { loadModel, findPackRoot } = require('./model');
const { exists, isDir, walk, hexToRgba, rel, usage } = require('./util');

const DEFAULT_VIEWS = ['front', 'side', 'top', 'iso'];
const BG = [58, 58, 62, 255];

function hashColor(name) {
  let h = 2166136261;
  for (const c of String(name)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const hue = (h % 360) / 360;
  const f = (n) => {
    const k = (n + hue * 12) % 12;
    return Math.round(255 * (0.55 - 0.35 * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4), 255];
}

// Flat-colour blockout quads from a brief (one colour per part).
function briefQuads(brief) {
  const items = briefLib.elementsOf(brief);
  const colors = {};
  for (const p of brief.parts || []) colors[p.name] = (p.color && hexToRgba(p.color)) || hashColor(p.name);
  return render.buildQuads(items.map((i) => i.element), {}, {
    colorFor: (el, face, index) => colors[items[index].part],
  });
}

function renderViews(quads, { views = DEFAULT_VIEWS, size = 256, background = BG } = {}) {
  const frame = render.frameFor(quads);
  const out = {};
  for (const v of views) {
    const cam = render.VIEWS[v];
    if (!cam) throw usage(`unknown view "${v}" (use ${Object.keys(render.VIEWS).join(', ')})`);
    out[v] = render.renderQuads(quads, Object.assign({ size, frame, background }, cam));
  }
  return out;
}

function turntable(quads, { frames = 8, size = 192, pitch = 25, background = BG } = {}) {
  const frame = render.frameFor(quads);
  const imgs = [];
  for (let i = 0; i < frames; i++) imgs.push(render.renderQuads(quads, { size, frame, yaw: (360 * i) / frames, pitch, background }));
  return imgs;
}

function referenceTile(file, size) {
  return Image.load(file).fit(size, size);
}

// Write front/side/top/iso PNGs + montage for one quad set.
function writeSet(quads, outDir, base, opts = {}) {
  const size = opts.size || 256;
  const files = [];
  const views = renderViews(quads, { size, views: opts.views });
  for (const [name, img] of Object.entries(views)) files.push(rel(img.save(path.join(outDir, `${base}.${name}.png`))));
  const tiles = Object.entries(views).map(([label, image]) => ({ label, image }));
  if (opts.reference) tiles.unshift({ label: 'reference', image: referenceTile(opts.reference, size) });
  if (opts.extraTiles) tiles.push(...opts.extraTiles);
  const m = montage(tiles, { columns: opts.columns });
  files.push(rel(m.save(path.join(outDir, `${base}.montage.png`))));
  if (opts.turntable) {
    const frames = turntable(quads, { frames: opts.frames || 8 });
    const strip = montage(frames.map((image, i) => ({ label: `${Math.round((360 * i) / frames.length)}`, image })));
    files.push(rel(strip.save(path.join(outDir, `${base}.turntable.png`))));
    files.push(rel(saveGif(path.join(outDir, `${base}.turntable.gif`), frames, 12)));
  }
  return files;
}

// Models worth previewing in a pack: every model with elements or a generated layer.
function packModels(root) {
  return walk(path.join(root, 'assets'), (f) => {
    const p = path.relative(path.join(root, 'assets'), f).split(path.sep);
    return f.endsWith('.json') && p[1] === 'models' && !(p[0] === 'minecraft' && p[2] === 'item');
  });
}

function run(target, opts = {}) {
  const abs = path.resolve(target);
  if (!exists(abs)) throw usage(`${target}: not found`);
  const files = [];
  if (opts.brief || /\.prompt\.md$/i.test(abs) || (abs.endsWith('.json') && isBrief(abs))) {
    const brief = briefLib.load(abs);
    const outDir = path.resolve(opts.out || path.join(path.dirname(abs), 'preview'));
    const ref = opts.reference || firstReference(brief, path.dirname(abs));
    files.push(...writeSet(briefQuads(brief), outDir, `${brief.name}.blockout`, Object.assign({}, opts, { reference: ref })));
    return { files, kind: 'brief' };
  }
  if (isDir(abs)) {
    const root = findPackRoot(path.join(abs, 'x')) || abs;
    const outDir = path.resolve(opts.out || path.join(root, '..', `${path.basename(root)}.preview`));
    for (const f of packModels(root)) {
      const m = loadModel(f, { root });
      if (!m.elements.length && !m.generated) continue;
      const base = (m.id || path.basename(f, '.json')).replace(/[:/]/g, '_');
      files.push(...writeSet(render.quadsForModel(m), outDir, base, opts));
    }
    if (!files.length) throw usage(`${target}: no renderable models found`);
    return { files, kind: 'pack' };
  }
  if (abs.endsWith('.bbmodel')) {
    const { bbmodelToJava } = require('./bbmodel');
    const conv = bbmodelToJava(abs);
    const outDir = path.resolve(opts.out || path.join(path.dirname(abs), 'preview'));
    const quads = render.buildQuads(conv.model.elements, conv.model.textures, { texture: (id) => conv.images[id] || null });
    files.push(...writeSet(quads, outDir, path.basename(abs, '.bbmodel'), opts));
    return { files, kind: 'bbmodel' };
  }
  if (abs.endsWith('.anim.json')) {
    throw usage('animation plans are previewed with: mcmodel animate preview <model> <plan>');
  }
  const m = loadModel(abs);
  const outDir = path.resolve(opts.out || path.join(path.dirname(abs), 'preview'));
  files.push(...writeSet(render.quadsForModel(m), outDir, path.basename(abs, '.json'), opts));
  return { files, kind: 'model' };
}

function isBrief(file) {
  try {
    const j = require('./util').readJson(file);
    return j && j.schema_version !== undefined && Array.isArray(j.parts);
  } catch {
    return false;
  }
}

function firstReference(brief, baseDir) {
  const imgs = (brief.spec && brief.spec.reference_images) || [];
  for (const i of imgs) {
    const f = path.resolve(baseDir, i);
    if (exists(f)) return f;
    if (exists(path.resolve(i))) return path.resolve(i);
  }
  return null;
}

// Pixel difference between two images of the same size (0..1 share of differing pixels).
function diff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.abs(a.data[i] - b.data[i]) > 8 || Math.abs(a.data[i + 1] - b.data[i + 1]) > 8 || Math.abs(a.data[i + 2] - b.data[i + 2]) > 8) n++;
  }
  return n / (a.width * a.height);
}

module.exports = { run, renderViews, turntable, writeSet, briefQuads, hashColor, diff, packModels, DEFAULT_VIEWS, BG };
