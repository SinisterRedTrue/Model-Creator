'use strict';

// Software rasteriser for Java block/item models: orthographic, z-buffered,
// textured quads with vanilla-style directional shading and cutout alpha.

const { Image } = require('./image');
const { FACES, autoUv, resolveTexture, textureFile, parseId } = require('./model');
const { exists } = require('./util');

const DEG = Math.PI / 180;

const VIEWS = {
  front: { yaw: 0, pitch: 0 },
  back: { yaw: 180, pitch: 0 },
  side: { yaw: 90, pitch: 0 },
  left: { yaw: -90, pitch: 0 },
  top: { yaw: 0, pitch: 90 },
  iso: { yaw: 45, pitch: 30 },
};

// --- vector helpers ---
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function rotateAxis(p, axis, angle) {
  const c = Math.cos(angle * DEG);
  const s = Math.sin(angle * DEG);
  const [x, y, z] = p;
  if (axis === 'x') return [x, y * c - z * s, y * s + z * c];
  if (axis === 'y') return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}

// Euler XYZ (degrees) applied in order X, then Y, then Z.
function rotateEuler(p, r) {
  let q = p;
  if (r[0]) q = rotateAxis(q, 'x', r[0]);
  if (r[1]) q = rotateAxis(q, 'y', r[1]);
  if (r[2]) q = rotateAxis(q, 'z', r[2]);
  return q;
}

// Corners of each face in TL, TR, BR, BL order as seen from outside.
function faceCorners(face, f, t) {
  const [x1, y1, z1] = f;
  const [x2, y2, z2] = t;
  switch (face) {
    case 'north': return [[x2, y2, z1], [x1, y2, z1], [x1, y1, z1], [x2, y1, z1]];
    case 'south': return [[x1, y2, z2], [x2, y2, z2], [x2, y1, z2], [x1, y1, z2]];
    case 'east': return [[x2, y2, z2], [x2, y2, z1], [x2, y1, z1], [x2, y1, z2]];
    case 'west': return [[x1, y2, z1], [x1, y2, z2], [x1, y1, z2], [x1, y1, z1]];
    case 'up': return [[x1, y2, z1], [x2, y2, z1], [x2, y2, z2], [x1, y2, z2]];
    default: return [[x1, y1, z2], [x2, y1, z2], [x2, y1, z1], [x1, y1, z1]];
  }
}

const FACE_NORMAL = {
  north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0],
};

function shadeFor(n) {
  const yb = n[1] > 0 ? 1.0 : 0.5;
  return 0.6 * n[0] * n[0] + 0.8 * n[2] * n[2] + yb * n[1] * n[1];
}

// Apply an element's own "rotation" block.
function elementTransform(el) {
  const r = el.rotation;
  if (!r || !r.angle) return (p) => p;
  const origin = r.origin || [8, 8, 8];
  const axis = r.axis || 'y';
  let scale = [1, 1, 1];
  if (r.rescale) {
    const k = 1 / Math.cos(Math.abs(r.angle) * DEG);
    scale = axis === 'x' ? [1, k, k] : axis === 'y' ? [k, 1, k] : [k, k, 1];
  }
  return (p) => {
    const q = sub(p, origin);
    const s = [q[0] * scale[0], q[1] * scale[1], q[2] * scale[2]];
    return add(rotateAxis(s, axis, r.angle), origin);
  };
}

// Load textures lazily; returns Image or null. Animated strips use frame 0 unless frame given.
function textureLoader(root, override = {}) {
  const cache = new Map();
  return (id, frame = 0) => {
    if (!id) return null;
    const key = `${id}@${frame}`;
    if (cache.has(key)) return cache.get(key);
    let img = override[id] || null;
    if (!img && root) {
      const f = textureFile(root, id);
      if (exists(f)) img = Image.load(f);
    }
    if (img && img.height > img.width && img.height % img.width === 0) {
      const frames = img.height / img.width;
      img = img.crop(0, (frame % frames) * img.width, img.width, img.width);
    }
    cache.set(key, img);
    return img;
  };
}

// Build world-space quads from elements.
// opts.colorFor(el, faceName, index) -> rgba for flat shading; opts.texture(id) -> Image.
// opts.partTransform(el, index) -> fn(point) applied after the element rotation.
function buildQuads(elements, textures, opts = {}) {
  const quads = [];
  elements.forEach((el, index) => {
    if (!el || !Array.isArray(el.from) || !Array.isArray(el.to)) return;
    const et = elementTransform(el);
    const pt = opts.partTransform ? opts.partTransform(el, index) : null;
    const xf = (p) => (pt ? pt(et(p)) : et(p));
    const faces = el.faces || {};
    for (const face of FACES) {
      const fd = faces[face];
      if (!fd) continue;
      const corners = faceCorners(face, el.from, el.to).map(xf);
      let uv = Array.isArray(fd.uv) ? fd.uv : autoUv(face, el.from, el.to);
      let uvc = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
      const steps = ((fd.rotation || 0) / 90) & 3;
      for (let s = 0; s < steps; s++) uvc = [uvc[3], uvc[0], uvc[1], uvc[2]];
      const n = norm(cross(sub(corners[3], corners[0]), sub(corners[1], corners[0])));
      const nn = dot(n, n) > 0.5 ? n : FACE_NORMAL[face];
      let tex = null;
      let color = null;
      if (opts.colorFor) {
        color = opts.colorFor(el, face, index);
      } else if (opts.texture) {
        const id = resolveTexture(fd.texture, textures);
        tex = opts.texture(id);
        // Vanilla textures are not shipped: grey. Missing custom textures: magenta.
        if (!tex) color = id && parseId(id).ns === 'minecraft' ? [150, 150, 150, 255] : [200, 0, 200, 255];
      }
      quads.push({
        corners,
        uv: uvc,
        normal: nn,
        tex,
        color: color || (tex ? null : [200, 0, 200, 255]),
        shade: el.shade === false ? 1 : shadeFor(nn),
        element: index,
        face,
      });
    }
  });
  return quads;
}

// Flat item ("item/generated"): front and back layer quads, 1 unit thick.
function generatedQuads(textures, loadTex) {
  const quads = [];
  for (let layer = 0; layer < 5; layer++) {
    const id = resolveTexture(`#layer${layer}`, textures);
    if (!id) continue;
    const tex = loadTex(id);
    const z1 = 7.5 - layer * 0.01;
    const z2 = 8.5 + layer * 0.01;
    for (const face of ['north', 'south']) {
      const corners = faceCorners(face, [0, 0, z1], [16, 16, z2]);
      const uv = face === 'north' ? [16, 0, 0, 16] : [0, 0, 16, 16];
      quads.push({
        corners,
        uv: [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]],
        normal: FACE_NORMAL[face],
        tex,
        color: tex ? null : [200, 0, 200, 255],
        shade: 1,
        element: -1,
        face,
      });
    }
  }
  return quads;
}

function camera(yaw, pitch) {
  const c = [Math.cos(pitch * DEG) * Math.sin(yaw * DEG), Math.sin(pitch * DEG), -Math.cos(pitch * DEG) * Math.cos(yaw * DEG)];
  const d = norm([-c[0], -c[1], -c[2]]);
  const hint = Math.abs(d[1]) > 0.99 ? [0, 0, d[1] < 0 ? -1 : 1] : [0, 1, 0];
  const r = norm(cross(d, hint));
  const u = norm(cross(r, d));
  return { d, r, u };
}

function frameFor(quads) {
  const pts = quads.flatMap((q) => q.corners);
  if (!pts.length) return { center: [8, 8, 8], radius: 8 };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  let radius = 0;
  for (const p of pts) radius = Math.max(radius, Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]));
  return { center, radius: radius || 8 };
}

function sampleTex(tex, u, v) {
  const x = Math.min(tex.width - 1, Math.max(0, Math.floor((u / 16) * tex.width)));
  const y = Math.min(tex.height - 1, Math.max(0, Math.floor((v / 16) * tex.height)));
  return tex.get(x, y);
}

// Render quads to an Image. frame = {center, radius} keeps scale constant across views.
function renderQuads(quads, { size = 256, yaw = 0, pitch = 0, frame, background = null } = {}) {
  const img = new Image(size, size);
  if (background) img.fill(background);
  const zbuf = new Float64Array(size * size).fill(Infinity);
  const cam = camera(yaw, pitch);
  const fr = frame || frameFor(quads);
  const scale = (size * 0.46) / fr.radius;
  const project = (p) => {
    const q = sub(p, fr.center);
    return [size / 2 + dot(q, cam.r) * scale, size / 2 - dot(q, cam.u) * scale, dot(q, cam.d)];
  };
  for (const q of quads) {
    if (dot(q.normal, cam.d) >= -1e-6) continue; // back-face cull
    const P = q.corners.map(project);
    tri(img, zbuf, P[0], P[1], P[2], q.uv[0], q.uv[1], q.uv[2], q);
    tri(img, zbuf, P[0], P[2], P[3], q.uv[0], q.uv[2], q.uv[3], q);
  }
  return img;
}

function tri(img, zbuf, a, b, c, ta, tb, tc, q) {
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(area) < 1e-9) return;
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const maxX = Math.min(img.width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const maxY = Math.min(img.height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
      const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
      const zi = y * img.width + x;
      if (z >= zbuf[zi] - 1e-6) continue;
      let col;
      if (q.tex) {
        const u = w0 * ta[0] + w1 * tb[0] + w2 * tc[0];
        const v = w0 * ta[1] + w1 * tb[1] + w2 * tc[1];
        col = sampleTex(q.tex, u, v);
        if (col[3] < 128) continue;
      } else {
        col = q.color;
      }
      zbuf[zi] = z;
      img.set(x, y, [Math.round(col[0] * q.shade), Math.round(col[1] * q.shade), Math.round(col[2] * q.shade), 255]);
    }
  }
}

// Convenience: render a loaded model (see model.loadModel) from named views.
function quadsForModel(model, opts = {}) {
  const loadTex = opts.loadTex || textureLoader(model.root, opts.textureOverride);
  if (model.generated) return generatedQuads(model.textures, loadTex);
  return buildQuads(model.elements, model.textures, {
    texture: (id) => loadTex(id, opts.textureFrame || 0),
    partTransform: opts.partTransform,
    colorFor: opts.colorFor,
  });
}

module.exports = {
  VIEWS,
  DEG,
  rotateAxis,
  rotateEuler,
  faceCorners,
  buildQuads,
  generatedQuads,
  renderQuads,
  frameFor,
  textureLoader,
  quadsForModel,
  shadeFor,
};
