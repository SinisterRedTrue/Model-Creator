---
name: retexture-model
description: Redraw the textures of a Minecraft Java model while keeping its geometry. Use when the user runs /model-creator:retexture, or asks to recolour, reskin, restyle, change texture resolution, or make a seasonal/themed version (snowy, golden, spooky) of an existing model. Writes a copy with new PNGs and a before/after montage; never touches elements.
---

# retexture-model

## Setup

Resolve the CLI once and call it `MCMODEL`:
1. `${CLAUDE_PLUGIN_ROOT}/core/bin/mcmodel.js`, if that variable was expanded to a real path.
2. Else the absolute path written in `mcmodel.path` in this skill's folder (Codex install).
3. Else `../../core/bin/mcmodel.js` relative to this skill's folder.

Check it with `node "<MCMODEL>" version`. Run every command as `node "<MCMODEL>" <command> ...` with each path in double quotes. Read references with `node "<MCMODEL>" ref <name>`. Write output only inside the working directory.

## Steps

1. Copy the pack to `<pack>.retextured/` (or the folder the user names). Work only in the copy.
2. `describe "<model>"` to list the texture variables and files. `preview` the original for the "before" montage.
3. Read `ref texture-guide`. Decide per texture: recolour (`recolor`, `hue_shift`, `saturation`, `brightness`), redraw regions (`fill`, `pixels`), or new resolution (`resize` first, then add detail with `pixels`). For a full redraw, write a pixel-grid brief texture and run `texture`.
4. Write one patch file per texture and apply it with `texture --patch "<patch.json>"`. Never write PNG bytes yourself.
5. Keep texture file names, so the model JSON does not change. If the user wants the new look as an extra variant instead, use `variants-model`.
6. `validate`, then `preview` the copy ("after"). View both montages; adjust patches, max 4 rounds.
7. Report: textures changed, patch files, before/after montage paths.

## Rules

- Geometry and UVs stay byte-identical.
- At most 16 colours per texture for vanilla-faithful style.
- Animated textures (`.png.mcmeta`): patch every frame; keep the strip height a multiple of the width.
