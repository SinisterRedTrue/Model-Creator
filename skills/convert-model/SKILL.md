---
name: convert-model
description: Convert a Minecraft Java model or resource pack between game versions (for example 1.20 overrides to 1.21.4+ items/ definitions, or back), or between Java JSON and Blockbench .bbmodel. Use when the user runs /model-creator:convert, or asks to update/downgrade a pack, fix pack_format, or turn a model into or out of a .bbmodel. Writes a converted copy and a conversion report; refuses versions outside the version matrix.
---

# convert-model

## Setup

Resolve the CLI once and call it `MCMODEL`:
1. `${CLAUDE_PLUGIN_ROOT}/core/bin/mcmodel.js`, if that variable was expanded to a real path.
2. Else the absolute path written in `mcmodel.path` in this skill's folder (Codex install).
3. Else `../../core/bin/mcmodel.js` relative to this skill's folder.

Check it with `node "<MCMODEL>" version`. Run every command as `node "<MCMODEL>" <command> ...` with each path in double quotes. Read references with `node "<MCMODEL>" ref <name>`. Write output only inside the working directory.

## Steps

1. Identify the input (pack folder, model `.json`, or `.bbmodel`) and the target (a version from `ref version-matrix`, or `bbmodel`). If the target version is not in the matrix, refuse and list supported versions.
2. Run one of:
   - `convert "<pack>" --to <version>` (default output `<pack>.<version>/`)
   - `convert "<model.json>" --to bbmodel`
   - `convert "<file.bbmodel>" --to <version> --namespace <ns>`
3. Read the report: `warnings` lists anything that needs manual work (non-custom_model_data predicates, snapped rotations, mesh elements, animations).
4. `validate "<output>" --version <version>` (pack targets) and `preview` it; view the montage.
5. Report: what changed (pack_format, overrides to items/ or back, files written), warnings, validate result, preview path.

## Rules

- Never convert in place.
- `.bbmodel` to Java: multi-axis or off-step rotations are snapped to one axis and 22.5 degree steps; mesh elements are dropped. Say so.
