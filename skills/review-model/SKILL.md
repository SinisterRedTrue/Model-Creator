---
name: review-model
description: Audit a Minecraft Java model or resource pack without changing it. Use when the user runs /model-creator:review, or asks to check, audit, lint or find problems in a model JSON, resource pack, pack.mcmeta or custom_model_data setup. Reports invalid JSON, broken texture/model references, wrong pack_format, wasted elements, hidden faces, texture bleed, holes, unused textures and high element counts.
---

# review-model

Read-only. Never edit the reviewed files.

## Setup

Resolve the CLI once and call it `MCMODEL`:
1. `${CLAUDE_PLUGIN_ROOT}/core/bin/mcmodel.js`, if that variable was expanded to a real path.
2. Else the absolute path written in `mcmodel.path` in this skill's folder (Codex install).
3. Else `../../core/bin/mcmodel.js` relative to this skill's folder.

Check it with `node "<MCMODEL>" version`. Run every command as `node "<MCMODEL>" <command> ...` with each path in double quotes. Read references with `node "<MCMODEL>" ref <name>`.

## Steps

1. `review "<path>"` (add `--version <v>` if the user named a target version; otherwise it is read from `pack.mcmeta`).
2. For each model with issues, `describe "<model>"` to name the elements involved.
3. Optionally `preview "<path>" --out "<path>.review-preview"` so the user can see the problem areas (this writes only new preview files).
4. Report, grouped by severity: errors (will break in game), warnings (waste or visual problems), notes. For each, say what is wrong, where (`file:path`), and the fix in one line.
5. Offer next steps: `edit-model` for fixes, `optimize` for hidden faces and element count, `convert` for a wrong pack format.
