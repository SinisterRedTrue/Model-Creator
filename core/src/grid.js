'use strict';

const path = require('path');
const { Image } = require('./image');
const { rel, usage } = require('./util');

// Numbered measuring grid over a reference image. cells = divisions along the longer side.
function run(imageFile, opts = {}) {
  if (!imageFile) throw usage('grid needs an image path');
  const cells = opts.cells ? Number(opts.cells) : 16;
  if (!Number.isInteger(cells) || cells < 2 || cells > 128) throw usage('--cells must be an integer 2..128');
  const src = Image.load(path.resolve(imageFile));
  const long = Math.max(src.width, src.height);
  const target = Math.min(1600, Math.max(cells * 32, long));
  const s = target / long;
  const w = Math.round(src.width * s);
  const h = Math.round(src.height * s);
  const img = src.resize(w, h);
  const cell = target / cells;
  const cols = Math.ceil(w / cell - 1e-9);
  const rows = Math.ceil(h / cell - 1e-9);
  const margin = 28;
  const out = new Image(w + margin * 2, h + margin * 2).fill([24, 24, 28, 255]);
  out.blit(img, margin, margin);
  const minor = [255, 255, 255, 90];
  const major = [255, 220, 0, 200];
  const label = [255, 255, 255, 255];
  const scale = cell >= 24 ? 2 : 1;
  for (let i = 0; i <= cols; i++) {
    const x = margin + Math.min(w - 1, Math.round(i * cell));
    out.line(x, margin, x, margin + h - 1, i % 4 === 0 ? major : minor);
    const t = String(i);
    out.text(x - Image.textWidth(t, scale) / 2, margin - 7 * scale - 4, t, label, scale);
    out.text(x - Image.textWidth(t, scale) / 2, margin + h + 4, t, label, scale);
  }
  for (let j = 0; j <= rows; j++) {
    const y = margin + Math.min(h - 1, Math.round(j * cell));
    out.line(margin, y, margin + w - 1, y, j % 4 === 0 ? major : minor);
    // Rows are labelled bottom-up so they read as Minecraft Y (up is positive).
    const t = String(rows - j);
    out.text(margin - Image.textWidth(t, scale) - 4, y - (7 * scale) / 2, t, label, scale);
    out.text(margin + w + 4, y - (7 * scale) / 2, t, label, scale);
  }
  const base = path.basename(imageFile).replace(/\.[^.]+$/, '');
  const file = path.resolve(opts.out || path.join('mcmodel-out', 'grid', `${base}.grid${cells}.png`));
  out.save(file);
  return {
    out: rel(file),
    cells,
    columns: cols,
    rows,
    source_px: [src.width, src.height],
    cell_source_px: Math.round((long / cells) * 100) / 100,
    note: 'Column numbers run left to right, row numbers bottom to top (Minecraft Y). Yellow lines every 4 cells.',
  };
}

module.exports = { run };
