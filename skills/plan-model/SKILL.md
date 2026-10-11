---
name: plan-model
description: Plan a Minecraft Java block/item model from a reference image and write a self-contained build prompt. Use when the user runs /model-creator:plan, says "plan a model", "plan a Minecraft model from this image", or wants to start a resource-pack model from a picture. Asks the clarification questionnaire, measures the image on a grid, breaks it into cuboid parts, plans textures, checks a blockout preview, and emits the prompt for build-model.
---

# plan-model

Session 1 of 2. Output is one prompt that `build-model` runs in a new session with no other memory.

## Setup

Resolve the CLI once and call it `MCMODEL`:
1. `${CLAUDE_PLUGIN_ROOT}/core/bin/mcmodel.js`, if that variable was expanded to a real path.
2. Else the absolute path written in `mcmodel.path` in this skill's folder (Codex install).
3. Else `../../core/bin/mcmodel.js` relative to this skill's folder.

Check it with `node "<MCMODEL>" version`. Run every command as `node "<MCMODEL>" <command> ...` with each path in double quotes. Read references with `node "<MCMODEL>" ref <name>`. Write output only inside the working directory.

## Steps

1. **Image path.** Get the reference image as a file path (PNG or JPEG). If the user only pasted it, ask once for the path; you may look at the pasted image meanwhile, but every `mcmodel` command needs the path.
2. **Clarify.** Read `ref questionnaire`. Ask the form once, as one numbered list, skipping anything the user already answered and conditional questions that do not apply. Apply defaults for blanks and `default`. If answers conflict, explain the limit and ask one follow-up. If the version is not in `ref version-matrix`, list the supported ones and ask again.
3. **Measure.** `grid "<image>" --cells 16`, then view the PNG it wrote. Read sizes in cells (1 cell = 1 Minecraft unit when the subject spans 16 cells). Repeat with `--cells 32` for small details.
4. **Decompose.** Read `ref decomposition-guide`. List named parts, each one or more cuboids with `from`/`to`, rotation (one axis, 22.5 degree steps), mirrored twins, visible faces, and a `pivot` per part.
5. **Texture plan.** Read `ref texture-guide`. Palette of at most 16 colours; one pixel grid per texture at the chosen resolution; light from the top-left.
6. **Brief.** Write `plans/<name>.brief.json` following `ref brief.schema` (`schema_version: 1`, `spec` holding every answer, `spec.reference_images` with the image path, `spec.defaults_applied`). Run `brief check "plans/<name>.brief.json"` and fix every error.
7. **Blockout check.** `preview "plans/<name>.brief.json" --brief --reference "<image>" --out plans/preview`. View the montage. Fix proportions in the brief, re-check, and repeat until the silhouette matches. Two to three rounds is normal.
8. **Emit.** Read `ref prompt-contract`. Write `plans/<name>.prompt.md` with the marker line, Intent, Brief (the full brief JSON), Build steps, Acceptance checklist, Known risks, Fallbacks. Run `brief check "plans/<name>.prompt.md"`; it must pass.
9. **Hand off.** Print the whole prompt in one fenced block so the user can copy it, then the file path, then: "Start a new session and run `/model-creator:create-model <image path>` with this prompt (Codex: `$build-model`)."

## Rules

- Never guess a Minecraft version, pack format or plugin config key; use the references.
- State every default at the top of the prompt. Nothing silent.
- Acceptance items must be checkable from the montage or a command.
- List every guess (hidden depth, back side) under Known risks.
- Do not build the pack in this session.
