# Texture guide

Agents never write PNG bytes by hand. Textures are pixel grids in the brief, rendered by `mcmodel texture`, or patches applied with `mcmodel texture --patch`.

## Palette

- At most 16 colours per brief, `#rrggbb` (or `#rrggbbaa`).
- Keys are single characters. `.` and space mean transparent and cannot be palette keys.
- Pick 3 to 4 shades per material: highlight, base, shadow, deep shadow.
- Vanilla-faithful: muted, slightly desaturated colours, no pure black or white.

## Pixel grids

```json
"textures": {
  "wood": {
    "rows": [
      "caaaaaacaaaaaaab",
      "aaaaaaaaaaaaabaa",
      "..."
    ]
  }
}
```

- One string per row, top row first. All rows the same length.
- Size = `spec.resolution` (16, 32, 64 or 128). Square, unless animated.
- Animated: stack square frames vertically and add `"animation": { "frametime": 2, "interpolate": false }`. The tool writes the `.png.mcmeta`.
- Existing PNG: `{ "file": "relative/path.png" }` (used by `import`).
- `emissive: true` marks a glowing texture; give the elements that use it `light_emission: 15` and `shade: false`.

## Shading

- Light comes from the top-left. Top and left edges one shade lighter, bottom and right edges one shade darker.
- Add a 1px darker outline only where two materials meet; never around every face.
- Break up flat areas with 2 to 4 % random pixels of a neighbour shade (grain, wear).
- A face that is 2 units wide shows 2 texture columns at 16px. Keep details at least 2px.

## UV mapping

- Auto UV (no `uv` key) maps the face to the texture area at the same position as the element. Good for one texture per part.
- To use a full texture on a small face, set `"uv": [0, 0, 16, 16]`. It will stretch.
- Keep UV edges on the pixel grid: at 16px every whole unit is one pixel. `score` flags `texture_bleed` otherwise.

## Patch format (`mcmodel texture --patch patch.json`)

```json
{
  "target": "mcmodel-out/oak_stool/assets/custom/textures/item/oak_stool_wood.png",
  "out": "optional/other.png",
  "ops": [
    { "op": "recolor", "from": "#9c6b3c", "to": "#c9a26b", "tolerance": 8 },
    { "op": "fill", "rect": [0, 0, 4, 4], "color": "#ff0000" },
    { "op": "clear", "rect": [12, 12, 4, 4] },
    { "op": "pixels", "at": [5, 5], "palette": { "x": "#ffffff" }, "rows": ["x.x", ".x.", "x_x"] },
    { "op": "hue_shift", "degrees": 30, "rect": [0, 0, 16, 8] },
    { "op": "saturation", "factor": 0.8 },
    { "op": "brightness", "factor": 1.2 },
    { "op": "resize", "size": 32 }
  ]
}
```

- `target` is relative to the working directory or to the patch file. Without `out` (or `--out`), the target is overwritten, so patch a copy.
- `rect` is `[x, y, width, height]` in pixels. Most ops accept an optional `rect`.
- In `pixels`, `.` keeps the pixel and `_` clears it.
- `resize` is nearest-neighbour; animated strips keep their frame count.

## Retexture checklist

1. Keep the same texture variable names and sizes unless the user asked for a new resolution.
2. For a new resolution, `resize` first, then add detail with `pixels` ops.
3. Re-run `preview` and compare before/after montages.
