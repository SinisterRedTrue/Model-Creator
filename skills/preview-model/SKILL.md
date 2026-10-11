---
name: preview-model
description: Render a Minecraft Java model, resource pack, brief, .bbmodel or animation plan to PNG images (front, side, top, isometric, montage, turntable strip and GIF) without changing anything. Use when the user runs /model-creator:preview, or asks to see, render, screenshot, or show a model from several angles or spinning.
---

# preview-model

Read-only: writes new image files only.

## Setup

Resolve the CLI once and call it `MCMODEL`:
1. `${CLAUDE_PLUGIN_ROOT}/core/bin/mcmodel.js`, if that variable was expanded to a real path.
2. Else the absolute path written in `mcmodel.path` in this skill's folder (Codex install).
3. Else `../../core/bin/mcmodel.js` relative to this skill's folder.

Check it with `node "<MCMODEL>" version`. Run every command as `node "<MCMODEL>" <command> ...` with each path in double quotes.

## Steps

1. Pick the command by input:
   - model `.json`, pack folder, or `.bbmodel`: `preview "<path>" [--turntable] [--frames 8] [--reference "<image>"] [--size 256] [--out <dir>]`
   - brief or prompt: `preview "<file>" --brief`
   - animation plan: `animate preview "<model>" "<plan.anim.json>"`
2. View the montage (and the turntable strip if asked).
3. Report the image paths. Mention anything that looks wrong (magenta = missing texture, grey = vanilla texture not shipped with the tools).

## Notes

- Software renderer: orthographic, vanilla-style face shading, cutout transparency. Close to in-game, not identical (no lighting, no enchant glint, no tint colours).
