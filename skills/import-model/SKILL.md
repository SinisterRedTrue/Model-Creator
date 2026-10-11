---
name: import-model
description: Import a Blockbench .bbmodel or an existing vanilla/Java model JSON into the Model Creator brief format so it can be edited or animated. Use when the user runs /model-creator:import, or brings a model made elsewhere (Blockbench, another pack, a download) and wants to edit, animate or rebuild it.
---

# import-model

## Setup

Resolve the CLI once and call it `MCMODEL`:
1. `${CLAUDE_PLUGIN_ROOT}/core/bin/mcmodel.js`, if that variable was expanded to a real path.
2. Else the absolute path written in `mcmodel.path` in this skill's folder (Codex install).
3. Else `../../core/bin/mcmodel.js` relative to this skill's folder.

Check it with `node "<MCMODEL>" version`. Run every command as `node "<MCMODEL>" <command> ...` with each path in double quotes. Read references with `node "<MCMODEL>" ref <name>`. Write output only inside the working directory.

## Steps

1. `describe "<file>"` to see elements, groups and animations.
2. `import "<file>" [--version <v>] [--namespace <ns>] [--out mcmodel-out/import/<name>.brief.json]`. Textures from a `.bbmodel` are extracted next to the brief; textures in a pack are referenced by path.
3. `brief check "<brief>"`. Fix any errors (usually a version or base item to confirm with the user).
4. `preview "<brief>" --brief` and view the blockout.
5. Report: brief path, parts found, textures, warnings (snapped rotations, mesh elements dropped, box UV converted, animations not carried over).
6. Next steps: to get a pack, `scaffold "mcmodel-out/<name>" --brief "<brief>"`; then use `edit-model` or `animate-model` on that pack. For a `.bbmodel` that needs to stay a `.bbmodel` (ModelEngine), use `convert` after editing.
