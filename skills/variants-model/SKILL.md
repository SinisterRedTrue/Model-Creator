---
name: variants-model
description: Generate a consistent set of variants from one Minecraft Java model (rarity tiers, colour swaps, wood types, open/closed, damaged). Use when the user runs /model-creator:variants, or asks for colour variants, tiers, or alternate states of a model. Keeps names, UVs, item definitions and custom_model_data values consistent and writes a copy of the pack.
---

# variants-model

## Setup

Resolve the CLI once and call it `MCMODEL`:
1. `${CLAUDE_PLUGIN_ROOT}/core/bin/mcmodel.js`, if that variable was expanded to a real path.
2. Else the absolute path written in `mcmodel.path` in this skill's folder (Codex install).
3. Else `../../core/bin/mcmodel.js` relative to this skill's folder.

Check it with `node "<MCMODEL>" version`. Run every command as `node "<MCMODEL>" <command> ...` with each path in double quotes. Read references with `node "<MCMODEL>" ref <name>`. Write output only inside the working directory.

## Steps

1. `describe "<model>"` to learn element names and texture variables.
2. Write `<model folder>/<name>.variants.json` following `ref variants.schema`:
   - `custom_model_data_start`: first free value after the base model's (ask if unknown).
   - One entry per variant with a `name` (`snake_case`), and any of: `texture_ops` (patch ops for every texture, see `ref texture-guide`), `textures` (ops per texture variable), `remove_elements`, `element_overrides` (by element name), `add_elements`.
   - States like open/closed: move or rotate the affected elements with `element_overrides`.
3. `variants "<model>" "<variants.json>"` (default output `<pack>.variants/`).
4. `validate` the output, then `preview` it and view the montages. Adjust and repeat, max 4 rounds.
5. Report a table: variant, model id, item model id, custom_model_data, give command (pattern from `ref version-matrix`).

## Rules

- Variant textures are new files named `<texture>_<variant>`; the base model is unchanged.
- Every variant gets its own custom_model_data value and, on 1.21.4+, its own item definition.
