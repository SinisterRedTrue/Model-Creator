---
name: pack-model
description: Merge several Minecraft Java models or resource packs into one resource pack and optionally zip it. Use when the user runs /model-creator:pack, or asks to combine, bundle, merge or zip models/packs for release. Resolves namespace and custom_model_data collisions, writes pack.mcmeta and the icon, and lists every rename it made.
---

# pack-model

## Setup

Resolve the CLI once and call it `MCMODEL`:
1. `${CLAUDE_PLUGIN_ROOT}/core/bin/mcmodel.js`, if that variable was expanded to a real path.
2. Else the absolute path written in `mcmodel.path` in this skill's folder (Codex install).
3. Else `../../core/bin/mcmodel.js` relative to this skill's folder.

Check it with `node "<MCMODEL>" version`. Run every command as `node "<MCMODEL>" <command> ...` with each path in double quotes. Read references with `node "<MCMODEL>" ref <name>`. Write output only inside the working directory.

## Steps

1. Collect the inputs: pack folders, or single model `.json` files inside packs (the model's textures, parents and item definitions come along).
2. If the inputs target different versions, offer to `convert` the older ones first; otherwise the highest pack format is used.
3. `pack "<input 1>" "<input 2>" ... --out "mcmodel-out/<pack name>" [--zip] [--version <v>]`. The output folder must be new or empty.
4. `validate "mcmodel-out/<pack name>"`, then `preview` it.
5. Report: output folder and zip, `namespace_renames` (a namespace that clashed was renamed for one input, with every reference rewritten), `custom_model_data_moves` (new values and the give commands that change), and notes about files kept from the first input.
