# Java model format (block/item models)

Rules `mcmodel validate` enforces. Version-specific values come from `mcmodel ref version-matrix`.

## Coordinates

- 1 unit = 1/16 block. A full block spans `0..16` on every axis.
- `x` = east, `y` = up, `z` = south. North is `-z`.
- Element `from` and `to` must each be inside `-16..32`. `from` must not be greater than `to` on any axis. Equal values make a flat plane, which is fine.

## File layout

| What | Path |
|---|---|
| Model | `assets/<ns>/models/item/<name>.json` (blocks: `models/block/`) |
| Texture | `assets/<ns>/textures/item/<name>.png` |
| Texture animation | `assets/<ns>/textures/item/<name>.png.mcmeta` |
| Item definition (1.21.4+) | `assets/<ns>/items/<name>.json` |
| Base item hook (1.21.4+) | `assets/minecraft/items/<base>.json` (`range_dispatch` on `custom_model_data`) |
| Base item hook (before 1.21.4) | `assets/minecraft/models/item/<base>.json` (`overrides`) |
| Block replacement | `assets/minecraft/blockstates/<block>.json` |

Resource locations are lowercase: `a-z 0-9 _ . - /`. A namespace is `a-z 0-9 _ . -`.

## Model JSON

```json
{
  "parent": "minecraft:item/handheld",
  "textures": { "particle": "#wood", "wood": "custom:item/stool_wood" },
  "elements": [
    {
      "name": "seat",
      "from": [2, 8, 2],
      "to": [14, 10, 14],
      "rotation": { "origin": [8, 8, 8], "axis": "y", "angle": 22.5, "rescale": false },
      "shade": true,
      "faces": {
        "north": { "texture": "#wood", "uv": [0, 0, 12, 2], "cullface": "north", "rotation": 0, "tintindex": 0 }
      }
    }
  ],
  "display": { "gui": { "rotation": [30, 225, 0], "translation": [0, 0, 0], "scale": [0.625, 0.625, 0.625] } },
  "gui_light": "side"
}
```

Top-level keys: `parent`, `textures`, `elements`, `display`, `gui_light` (`front` | `side`), `ambientocclusion`, `overrides` (before 1.21.4 only). `credit` and `groups` are Blockbench extras the game ignores.

### Elements

- `rotation`: one axis (`x`, `y` or `z`), angle `-45..45` in `22.5` steps. `origin` is the pivot. `rescale: true` stretches the element so it keeps its width after turning.
- `shade: false` turns off directional shading (use for glowing parts).
- `light_emission` `0..15` makes the element render as if lit.
- `name` is ignored by the game; the tools use it to find parts (`leg_0`, `leg_1` form part `leg`).

### Faces

- Names: `north`, `south`, `east`, `west`, `up`, `down`. A missing face is not drawn.
- `texture`: `#variable` resolved through `textures` and the parent chain.
- `uv`: `[u1, v1, u2, v2]` in `0..16`, whatever the texture size. Omitted UV = taken from the element position (auto UV).
- `rotation`: `0`, `90`, `180`, `270` turns the texture on the face.
- `cullface`: skip the face when that side touches a full block. Use only on faces flush with the block edge.
- `tintindex`: colour by game tint (grass, leather). Leave out for custom models.

### Display

Keys: `thirdperson_righthand`, `thirdperson_lefthand`, `firstperson_righthand`, `firstperson_lefthand`, `gui`, `head`, `ground`, `fixed` (item frame). Each has `rotation`, `translation` (clamped to `-80..80`), `scale` (max `4`). A missing left-hand transform mirrors the right hand.

## Item definitions (1.21.4+)

```json
{ "model": { "type": "minecraft:model", "model": "custom:item/oak_stool" } }
```

Hooking a base item by `custom_model_data`:

```json
{
  "model": {
    "type": "minecraft:range_dispatch",
    "property": "minecraft:custom_model_data",
    "index": 0,
    "entries": [{ "threshold": 1001, "model": { "type": "minecraft:model", "model": "custom:item/oak_stool" } }],
    "fallback": { "type": "minecraft:model", "model": "minecraft:item/paper" }
  }
}
```

Give command: `/give @s minecraft:paper[minecraft:custom_model_data={floats:[1001]}]`, or with the item model component (1.21.2+): `/give @s minecraft:paper[minecraft:item_model="custom:oak_stool"]`.

Other useful properties: `minecraft:using_item` (condition), `minecraft:use_duration`, `minecraft:cooldown` (range_dispatch).

## Before 1.21.4

```json
{
  "parent": "minecraft:item/handheld",
  "textures": { "layer0": "minecraft:item/diamond_sword" },
  "overrides": [{ "predicate": { "custom_model_data": 1003 }, "model": "custom:item/ruby_sword" }]
}
```

Overrides must be sorted by `custom_model_data` ascending. Give: `/give @s minecraft:diamond_sword{CustomModelData:1003}` (1.20.4 and older) or `[minecraft:custom_model_data=1003]` (1.20.5 to 1.21.3).

## Common mistakes

- Uppercase letters or spaces in file names or IDs: the model silently fails to load.
- A face UV that does not match the face size stretches the texture.
- Half-unit element edges with 16px textures put UV edges between pixels (texture bleed). Prefer whole units, or use a 32px texture.
- Faces hidden inside other elements cost performance; `optimize` removes them.
- Model too big in hand: fix `display` scale, never the element sizes.
