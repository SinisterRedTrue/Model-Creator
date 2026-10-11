# Model Creator help

Turns a reference image into a Minecraft Java block/item model (resource pack JSON + textures), then edits, animates, checks and ships it.

Claude Code: `/model-creator:<command>`. Codex: `$<skill>` or ask in plain words. `mcmodel help <command>` shows one command.

| Command | Skill | Does |
|---|---|---|
| `plan` | `plan-model` | Image to a self-contained build prompt |
| `create-model` | `build-model` | Build prompt to a resource pack, previews, deviation report |
| `edit-model` | `edit-model` | Change an existing model from an instruction |
| `create-animation` | `animate-model` | Animate a model (flipbook, frame swap, display entities, ModelEngine) |
| `review` | `review-model` | Audit a model or pack; changes nothing |
| `optimize` | `optimize-model` | Fewer elements and faces, same look |
| `retexture` | `retexture-model` | New textures, same geometry |
| `variants` | `variants-model` | Consistent set of variants from one model |
| `convert` | `convert-model` | Between Minecraft versions, or Java JSON and `.bbmodel` |
| `pack` | `pack-model` | Merge several models into one pack, optional `.zip` |
| `preview` | `preview-model` | Multi-angle or turntable render; changes nothing |
| `import` | `import-model` | `.bbmodel` or vanilla model to a brief |
| `install` | `install-model` | Copy a pack into Minecraft, or print server config |
| `help` | `help` | This list |

Typical workflow: `plan` (session 1) then `create-model` (session 2, paste the prompt), then `edit-model`, `create-animation`, `review`, `pack`, `install`.

Originals are never overwritten unless you ask: every command writes a copy or a new folder.

## plan (plan-model)

Example: `/model-creator:plan ./refs/lamp.png a desk lamp, 1.21.8, furniture`

- Inputs: reference image path (PNG/JPEG), optional notes.
- Asks: the questionnaire (version, type, delivery, base item, namespace, resolution, style, scale, hidden sides, fidelity, budget, extras, display slots, output, notes). Defaults are stated.
- Does: grid measurement, part breakdown, texture plan, brief, blockout preview.
- Output: the build prompt in chat and in `plans/<name>.prompt.md`, plus blockout previews.
- Limits: image reading is approximate; organic shapes are approximated with cuboids.

## create-model (build-model)

Example: `/model-creator:create-model ./refs/lamp.png` + paste the prompt (or give `plans/desk_lamp.prompt.md`).

- Inputs: the build prompt (starts with `<!-- mcmodel-build v1 -->`), reference image path.
- Does: brief check, scaffold, textures, model, validate, up to 4 preview/score rounds.
- Output: `mcmodel-out/<name>/` pack (and `.zip` if asked), previews, change log, deviation report, give commands.
- Limits: stops if the brief is invalid; versions outside the matrix are refused.

## edit-model (edit-model)

Example: `/model-creator:edit-model mcmodel-out/desk_lamp make the pole thinner and add a pull chain`

- Inputs: model file or pack, instruction, optional image path.
- Does: describe, before montage, change list, JSON edits, texture patches, validate, score, after montage.
- Output: `<name>.edited/` copy, change log, before/after montage, deviations.
- Limits: untouched elements stay byte-identical; edits in place only when asked.

## create-animation (animate-model)

Example: `/model-creator:create-animation mcmodel-out/desk_lamp the shade bobs slowly`

- Inputs: model or pack, motion description.
- Asks: animation name, motion, loop mode, length, trigger, easing, moving parts, intensity.
- Routes: 1 texture flipbook, 2 model frame swap (1.21.4+), 3 display entities + datapack, 4 ModelEngine `.bbmodel`.
- Output: route files, frame strip PNG and GIF, limits report.
- Limits: vanilla items have no skeletal animation; the skill says what the chosen route cannot do.

## review (review-model)

Example: `/model-creator:review mcmodel-out/desk_lamp`

- Reports: invalid JSON, broken references, wrong `pack_format`, wasted elements, hidden faces, texture bleed, holes, unused textures, high element count.
- Output: audit report. Changes nothing. Offers to hand fixes to edit-model.

## optimize (optimize-model)

Example: `/model-creator:optimize mcmodel-out/desk_lamp`

- Does: removes faces that are always covered, merges touching cuboids with matching textures, removes duplicates.
- Output: `<pack>.optimized/`, counts before/after, before/after preview.
- Limits: a model whose render would change is left as it was and reported.

## retexture (retexture-model)

Example: `/model-creator:retexture mcmodel-out/desk_lamp snowy winter version, 32px`

- Does: recolour, new style, new resolution, seasonal variant. Geometry untouched.
- Output: copy with new PNGs, before/after montage.

## variants (variants-model)

Example: `/model-creator:variants mcmodel-out/oak_stool/assets/custom/models/item/oak_stool.json birch, dark oak, broken`

- Does: one model per variant with consistent names, UVs, item definitions and `custom_model_data` values.
- Output: `<pack>.variants/`, table of variants with give commands.

## convert (convert-model)

Example: `/model-creator:convert mcmodel-out/ruby_sword 1.21.8`

- Does: version moves (1.20 `overrides` to 1.21.4+ `items/` and back), Java JSON to `.bbmodel`, `.bbmodel` to a pack.
- Output: converted copy, conversion report. Unsupported versions are refused.

## pack (pack-model)

Example: `/model-creator:pack mcmodel-out/oak_stool mcmodel-out/desk_lamp --zip`

- Does: merges packs or single models, renames clashing namespaces, moves clashing `custom_model_data` values, writes `pack.mcmeta` and icon.
- Output: merged pack folder, optional `.zip`, list of renames and moves.

## preview (preview-model)

Example: `/model-creator:preview mcmodel-out/desk_lamp turntable`

- Inputs: model, pack, brief, `.bbmodel`, or model + animation plan.
- Output: front/side/top/iso PNGs and a montage; turntable strip and GIF on request. Changes nothing.

## import (import-model)

Example: `/model-creator:import ./downloads/dragon.bbmodel`

- Does: converts a `.bbmodel` or vanilla JSON model into a brief, so edit-model and create-animation can work on it.
- Output: `mcmodel-out/import/<name>.brief.json` and extracted textures, with warnings for anything lost.

## install (install-model)

Example: `/model-creator:install mcmodel-out/desk_lamp default`

- Does: copies the pack into a `resourcepacks` folder (`default` = the game's folder), or prints server/plugin config lines.
- Asks before writing outside the working folder.

## help (help)

`/model-creator:help` lists every command. `/model-creator:help <command>` shows that command's inputs, questions, outputs and limits.
