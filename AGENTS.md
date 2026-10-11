# Model Creator (agent routing)

Skills for turning a reference image into a Minecraft Java block/item model resource pack. Every skill lives in `skills/<name>/SKILL.md` and runs the local CLI `core/bin/mcmodel.js` (Node 18+, no install step).

## Route requests to skills

| User wants | Skill |
|---|---|
| Plan a model from an image | `$plan-model` |
| Build from a prompt starting with `<!-- mcmodel-build v1 -->` (even pasted without a command) | `$build-model` |
| Change an existing model | `$edit-model` |
| Animate a model | `$animate-model` |
| Check a model or pack, change nothing | `$review-model` |
| Fewer elements, same look | `$optimize-model` |
| New textures, same geometry | `$retexture-model` |
| Variant set (colours, tiers, states) | `$variants-model` |
| Other Minecraft version, or to/from `.bbmodel` | `$convert-model` |
| Merge models/packs, zip | `$pack-model` |
| Render images of a model | `$preview-model` |
| Bring in a `.bbmodel` or vanilla model | `$import-model` |
| Put the pack in Minecraft or on a server | `$install-model` |
| List commands | `$help` |

Claude Code users get the same skills as `/model-creator:<command>` (see `commands/`).

## Rules for every skill

- Find the CLI as each `SKILL.md` "Setup" block says, then run `node "<MCMODEL>" <command>` with quoted paths.
- Reference docs: `node "<MCMODEL>" ref <name>` (`ref --list` for names).
- Pasted images are not files. Ask for the image path before running commands that need it.
- Write only inside the working directory (`plans/`, `mcmodel-out/`). Ask before writing anywhere else.
- Never overwrite originals; edits go to a copy unless the user says "in place".
- Never hand-write PNG bytes; use `texture` or `texture --patch`.
- Minecraft versions outside `ref version-matrix` are refused, never guessed.

## Developing this repo

- `npm test` runs `node:test` suites in `core/test/`.
- No runtime dependencies; `core/vendor/` holds pngjs, jpeg-js and omggif.
- CommonJS, no build step, no TypeScript, no shell scripts. Paths through `path`; write `\n`.
- After changing commands or skills, update `references/help.md` (a test enforces it).
