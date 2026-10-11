---
name: build-model
description: Build a Minecraft Java resource pack (model JSON, textures, item definitions) from a Model Creator build prompt. Use when the user runs /model-creator:create-model, pastes text starting with "<!-- mcmodel-build v1 -->", gives a plans/*.prompt.md file, or says "build the model from this prompt". Validates the brief, scaffolds the pack, renders textures, writes the model, runs a preview/score verify loop, and reports deviations honestly.
---

# build-model

Session 2 of 2. Everything needed is in the prompt; do not rely on memory of session 1.

## Setup

Resolve the CLI once and call it `MCMODEL`:
1. `${CLAUDE_PLUGIN_ROOT}/core/bin/mcmodel.js`, if that variable was expanded to a real path.
2. Else the absolute path written in `mcmodel.path` in this skill's folder (Codex install).
3. Else `../../core/bin/mcmodel.js` relative to this skill's folder.

Check it with `node "<MCMODEL>" version`. Run every command as `node "<MCMODEL>" <command> ...` with each path in double quotes. Read references with `node "<MCMODEL>" ref <name>`. Write output only inside the working directory.

## Steps

1. **Get the prompt.** If it was pasted, save it verbatim to `plans/<name>.prompt.md` (name from the brief). The first line must be `<!-- mcmodel-build v1 -->`; refuse other versions.
2. **Check.** `brief check "plans/<name>.prompt.md"`. If invalid, stop and report the errors; do not improvise a fix to the brief beyond obvious typos the user confirms.
3. **Reference image.** Resolve `spec.reference_images` (relative to the prompt file). If a file is missing, ask the user for the path once.
4. **Scaffold.** `scaffold "mcmodel-out/<name>" --brief "plans/<name>.prompt.md"`. This writes `pack.mcmeta`, the textures (from the pixel grids; never hand-write PNGs), the model JSON from the brief, item definitions or overrides for the version, delivery files from `ref delivery-targets`, and `pack.png`. Note the give commands and manual steps it prints.
5. **Validate.** `validate "mcmodel-out/<name>"`. Fix every error in the model JSON.
6. **Verify loop (max 4 rounds).**
   - `preview "mcmodel-out/<name>" --reference "<image>"` and view the `*.montage.png`.
   - `score "mcmodel-out/<name>" --brief "plans/<name>.prompt.md"`.
   - Compare the montage with the reference using the prompt's Acceptance checklist. Fix the single worst defect (proportions, missing part, wrong colour, texture bleed, holes) by editing the model JSON or re-running `texture` after a palette/grid change. Re-run validate.
   - Stop when the checklist passes or after round 4. If over budget, apply the prompt's Fallbacks.
7. **Zip** if `spec.output_form` is `zip` or `both`: `pack "mcmodel-out/<name>" --out "mcmodel-out/<name>_release" --zip`.
8. **Deliver.** Report: pack folder (and zip), montage path, give commands, manual steps, a short change log of fixes made in the loop, and every remaining deviation from the reference or checklist. Be honest; do not claim a match the montage does not show.

## Rules

- The brief is the source of truth; the Intent section is for people.
- Keep element names from the brief so later edits and animations can find parts.
- If you cannot view images, skip the visual comparison, rely on `score`, and say so in the report.
