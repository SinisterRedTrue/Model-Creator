---
name: edit-model
description: Edit an existing Minecraft Java block/item model from a plain-language instruction (resize, move, add or remove parts, change textures). Use when the user runs /model-creator:edit-model, or asks to change, fix, thin, thicken, add to or remove from a model JSON or resource pack. Works on a copy, keeps untouched elements byte-identical, and shows before/after previews.
---

# edit-model

## Setup

Resolve the CLI once and call it `MCMODEL`:
1. `${CLAUDE_PLUGIN_ROOT}/core/bin/mcmodel.js`, if that variable was expanded to a real path.
2. Else the absolute path written in `mcmodel.path` in this skill's folder (Codex install).
3. Else `../../core/bin/mcmodel.js` relative to this skill's folder.

Check it with `node "<MCMODEL>" version`. Run every command as `node "<MCMODEL>" <command> ...` with each path in double quotes. Read references with `node "<MCMODEL>" ref <name>`. Write output only inside the working directory.

## Steps

1. **Locate.** Input is a model `.json` or a pack folder (pick the model the instruction is about; ask if several fit). A `.bbmodel` goes through `import` first, then `convert` back after editing.
2. **Copy.** Unless the user said "in place", copy the pack folder to `<pack>.edited/` and work only there. Never touch the original.
3. **Read.** `describe "<model>"` and `preview "<model>" --out "<pack>.edited.preview/before"`. View the montage.
4. **Change list.** Restate the instruction as concrete changes: element `#index name` with new `from`/`to`/rotation, elements to add (with names, faces, textures), elements to remove, texture changes. Show it to the user before applying when the instruction is ambiguous.
5. **Apply geometry.** Edit only the listed elements in the JSON. Keep every other element, key order and value exactly as it was. New elements follow `ref java-model-format` and `ref decomposition-guide`.
6. **Apply textures.** Use `texture --patch <patch.json>` (format in `ref texture-guide`) for recolours and redrawn regions. Never write PNG bytes yourself. New textures: add them as pixel grids in a small brief and run `texture`.
7. **Check.** `validate` the pack, then `score`. Fix errors.
8. **Compare.** `preview "<model>" --out "<pack>.edited.preview/after"`. View before and after. Repeat 5 to 8, max 4 rounds.
9. **Report.** Change log (element by element), before/after montage paths, validate/score result, and any part of the instruction you could not do or did differently.

## Rules

- One axis per element rotation, 22.5 degree steps, -45..45. Bigger turns need a different build (see decomposition guide).
- If the instruction needs regrouping into parts (for animation), name elements `<part>` or `<part>_<n>`.
- Do not change display transforms unless asked.
