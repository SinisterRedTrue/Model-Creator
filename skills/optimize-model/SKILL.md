---
name: optimize-model
description: Reduce element and face counts of a Minecraft Java model or resource pack while keeping its look identical. Use when the user runs /model-creator:optimize, or asks to optimize, simplify, lower the element count, remove hidden faces, or make a model lighter for servers. Writes an optimized copy and before/after previews; any model whose render would change is left as it was.
---

# optimize-model

## Setup

Resolve the CLI once and call it `MCMODEL`:
1. `${CLAUDE_PLUGIN_ROOT}/core/bin/mcmodel.js`, if that variable was expanded to a real path.
2. Else the absolute path written in `mcmodel.path` in this skill's folder (Codex install).
3. Else `../../core/bin/mcmodel.js` relative to this skill's folder.

Check it with `node "<MCMODEL>" version`. Run every command as `node "<MCMODEL>" <command> ...` with each path in double quotes. Read references with `node "<MCMODEL>" ref <name>`. Write output only inside the working directory.

## Steps

1. `optimize "<path>"` (default output `<pack>.optimized/`; `--out <dir>` to choose). It removes faces fully covered by other elements, merges touching cuboids with the same textures and auto UVs, drops duplicates, and checks each model by rendering 4 views before and after.
2. View the `*.before-after.png` previews.
3. `score "<optimized model>" --baseline "<original model>"` for each changed model to confirm `visual_match`.
4. `validate "<optimized pack>"`.
5. Report counts before/after per model, the preview paths, and any model marked REVERTED (its look would have changed). Suggest manual steps if the count is still over budget: merge small details into textures, or simplify parts via `edit-model`.

## Rules

- Never optimize in place.
- Hidden-face removal assumes opaque textures; the render check catches transparent ones.
