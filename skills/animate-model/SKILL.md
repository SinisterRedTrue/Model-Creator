---
name: animate-model
description: Animate an existing Minecraft Java model. Use when the user runs /model-creator:create-animation, or asks to make a model spin, bob, flap, sway, swing, glow, pulse, open/close, or to make idle/walk/attack animations. Chooses a route (texture flipbook, model frame swap, display-entity datapack, or ModelEngine .bbmodel), writes a keyframe plan, generates the files, previews a frame strip and GIF, and reports limits.
---

# animate-model

## Setup

Resolve the CLI once and call it `MCMODEL`:
1. `${CLAUDE_PLUGIN_ROOT}/core/bin/mcmodel.js`, if that variable was expanded to a real path.
2. Else the absolute path written in `mcmodel.path` in this skill's folder (Codex install).
3. Else `../../core/bin/mcmodel.js` relative to this skill's folder.

Check it with `node "<MCMODEL>" version`. Run every command as `node "<MCMODEL>" <command> ...` with each path in double quotes. Read references with `node "<MCMODEL>" ref <name>`. Write output only inside the working directory.

## Questionnaire (one form; skip what is already answered; state defaults)

| # | Question | Default |
|---|---|---|
| 1 | Model path and animation name (`idle`, `walk`, `attack`, `spin`, `open`, `death`, other) | required |
| 2 | Motion in plain language | required |
| 3 | Loop mode: loop, play once, ping-pong | loop |
| 4 | Length (ticks or seconds; 20 ticks = 1 s) | 20 ticks |
| 5 | Trigger: always on, on use, on hit, on movement, on command | always on |
| 6 | Easing: linear, ease-in-out, snappy | ease-in-out |
| 7 | Which parts move and which stay fixed | inferred, stated |
| 8 | Intensity: subtle, normal, exaggerated | normal |

## Steps

1. **Route.** Read `ref animation-routes`. Pick the route from model type, delivery, version and trigger. Tell the user the route and its limits in one or two lines. If the request needs a route the delivery does not allow, explain and offer the closest.
2. **Parts.** `describe "<model>"`. Parts come from element names (`leg_0`, `leg_1` = part `leg`). If the model is one solid piece or the moving parts are not separate, ask to regroup: do it as an `edit-model`-style change on a copy (rename or split elements), then continue on the copy.
3. **Plan.** Read `ref animation-presets`. Write `<model folder>/<anim>.anim.json` following `ref anim-plan` (`schema_version: 1`, `route`, `length_ticks`, `loop`, `easing`, `trigger`, `intensity`, `frames`, `parts` with `pivot` and `keyframes`, or `texture_animation` for route 1). Start from a preset, then adjust to the description.
4. **Check.** `animate check "<plan>" --model "<model>"`. Fix every `fail` (detached parts, frames over budget, impossible trigger). Mention `warn` items to the user.
5. **Preview.** `animate preview "<model>" "<plan>"` and view the strip PNG. Compare with the description; adjust keyframes and repeat 4 to 5 (max 4 rounds).
6. **Build.** `animate build "<model>" "<plan>"`. Routes 1 to 3 write a copy of the pack (`<pack>.<anim>/`); route 3 also writes `<pack>.<anim>.datapack/`; route 4 writes a `.bbmodel` under `mcmodel-out/anim/<anim>/`.
7. **Deliver.** Files written, strip and GIF paths, how to trigger it (give command, function names, or ModelEngine steps), and the limits list from the build output.

## Rules

- Never claim skeletal animation in a vanilla resource pack.
- For animation sets (idle, walk, attack), one plan per animation; route 4 adds each to the same `.bbmodel`.
- Sound and particle hooks go in `extras` (route 3 only).
