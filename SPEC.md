# Model Creator: Design Spec

Status: implemented (v0.1.0). This spec matches the code; change both together.

## 1. Goal

A plugin/skill pack for Claude Code and OpenAI Codex (CLI, IDE extension and the ChatGPT desktop Codex app) that turns a reference image into a finished Minecraft **Java block/item model** (resource-pack JSON + textures) in two sessions.

The ChatGPT web chat is out of scope: every skill runs a local Node CLI and needs a shell and file access.

| | Session 1 | Session 2 |
|---|---|---|
| You send | image path + `/model-creator:plan` | image path + `/model-creator:create-model` + pasted prompt |
| Skill | `plan-model` | `build-model` |
| Output | one self-contained build prompt (also saved to `plans/<name>.prompt.md`) | resource pack, previews, deviation report |

Session 1 takes two turns: the questionnaire (section 4.1), then the prompt. The two sessions share no memory, so the prompt carries everything. It begins with the marker `<!-- mcmodel-build v1 -->`; `build-model` also triggers on it when pasted without the command.

### Commands

| Command (Claude Code) | Skill (both hosts) | Input | Result |
|---|---|---|---|
| `/model-creator:plan` | `plan-model` | image path (+ optional notes) | build prompt |
| `/model-creator:create-model` | `build-model` | image path + build prompt | new resource pack |
| `/model-creator:edit-model` | `edit-model` | existing model path + edit instruction (+ optional image path) | edited model, previews, change log |
| `/model-creator:create-animation` | `animate-model` | existing model path + motion description | animation files, preview strip, limits report |
| `/model-creator:review` | `review-model` | model or pack path | audit report (no changes) |
| `/model-creator:optimize` | `optimize-model` | model or pack path | reduced copy, before/after previews |
| `/model-creator:retexture` | `retexture-model` | model path + new look | new textures, same geometry |
| `/model-creator:variants` | `variants-model` | base model + variant list | consistent set of variant models |
| `/model-creator:convert` | `convert-model` | model or pack + target version/format | converted copy, conversion report |
| `/model-creator:pack` | `pack-model` | several model paths | merged resource pack, optional `.zip` |
| `/model-creator:preview` | `preview-model` | model, pack, or animation path | multi-angle or turntable render (no changes) |
| `/model-creator:import` | `import-model` | `.bbmodel` or vanilla model path | brief for use by Edit and Animation |
| `/model-creator:install` | `install-model` | pack path + target | pack copied to target, or exact config lines |
| `/model-creator:help` | `help` | optional command name | list of every command and what it does |

Naming rules:
- Plugin name `model-creator`; all plugin, command and skill names are lowercase kebab-case. Mixed case breaks on case-insensitive filesystems (Windows, macOS) and fails plugin-name validation.
- Command files: `commands/plan.md`, `create-model.md`, `edit-model.md`, `create-animation.md`, `review.md`, `optimize.md`, `retexture.md`, `variants.md`, `convert.md`, `pack.md`, `preview.md`, `import.md`, `install.md`, `help.md`.
- Each command file is a thin wrapper: frontmatter (`description`, `argument-hint`, `allowed-tools: Bash(node:*), Read, Write, Edit`) and a body that tells the agent to run the matching skill with `$ARGUMENTS`. No logic lives in command files.
- Skill names carry the `-model` suffix so they do not collide with other skills when invoked by bare name in Codex.

Codex: plugin-shipped slash commands are not relied on. The same skills are invoked by name (`$plan-model`, `$build-model`, `$edit-model`, `$animate-model`, and so on for every skill in the layout), by plain request ("plan a model from this image"), or by the marker.

### Image input

Pasted images exist only in the conversation, not on disk, and the CLI needs files. Rules for every skill that takes an image:
- The user passes a file path (absolute or relative to the working directory). Accepted formats: PNG, JPEG.
- If the user only pasted an image, the skill asks once for its file path before running any `mcmodel` command. It may still read the pasted image visually, but `grid`, `preview --reference` and montages require the path.
- The resolved image path is recorded in the brief (`spec.reference_images`) so session 2 can find it; if it is missing in session 2, the skill asks for it again.

### edit-model

`/model-creator:edit-model <model path or pack> <instruction>`, for example `make the legs thinner and add a drawer`.

1. `mcmodel describe` reads the existing model (elements, bounds, textures, parent) and `mcmodel preview` renders a "before" montage.
2. The agent restates the instruction as a concrete change list (elements to add/move/resize/remove, texture changes) and applies it to the JSON. Untouched elements and files stay byte-identical.
3. Texture edits go through `mcmodel texture --patch <patch.json>` (recolour, redraw a region; format in `references/texture-guide.md`) rather than hand-written PNGs.
4. `mcmodel validate` + `mcmodel score`, then an "after" montage next to "before"; the verify loop from section 6 runs up to 4 rounds.
5. The original is never overwritten: edits are written to a copy (`<name>.edited/`) unless the user says to edit in place.
6. Output: change log, before/after montage, deviations from the instruction.

### create-animation (`animate-model`)

`/model-creator:create-animation <model path or pack> <motion description>`, for example `wings flap slowly, tail sways`.

Vanilla Java item models cannot do skeletal animation, so the skill first picks the route that fits the model type and delivery method, and states what that route can and cannot do.

| Route | Mechanism | Suits | Limits |
|---|---|---|---|
| 1. Texture flipbook (vanilla) | frames stacked in the texture PNG, driven by `.mcmeta` | glow, flicker, flow, pulse, magic effects | geometry does not move |
| 2. Model frame swap (vanilla, 1.21.4+) | pre-posed model variants switched by item state (use duration, cooldown, custom model data) | weapon swings, charging, open/close | discrete frames; variant count limited by budget |
| 3. Display-entity animation (vanilla datapack) | model split into `item_display` parts; generated `.mcfunction` files interpolate transforms | props, furniture, spinning and bobbing parts | needs a datapack and entities; no plugin |
| 4. Skeletal (ModelEngine) | Blockbench `.bbmodel` with bones and keyframes | pets, mounts: idle, walk, attack, death | needs the plugin; exported as `.bbmodel` only |

Route 4 is a `.bbmodel` export only. If the description needs a route the delivery method does not allow, the skill explains this and offers the closest fit. Route details live in `references/animation-routes.md`.

Animation questionnaire (one form, defaults applied and stated, answers already given are not re-asked):

| # | Question | Default |
|---|---|---|
| 1 | Model (path) and animation name (`idle`, `walk`, `attack`, `spin`, `open`, `death`, other) | required |
| 2 | Motion in plain language | required |
| 3 | Loop mode: loop, play once, ping-pong | loop |
| 4 | Length and speed (ticks or seconds) | 20 ticks |
| 5 | Trigger: always on, on use, on hit, on movement, on command | always on |
| 6 | Easing: linear, ease-in-out, snappy | ease-in-out |
| 7 | Which parts move and which stay fixed | inferred, stated |
| 8 | Intensity: subtle, normal, exaggerated | normal |

Workflow:
1. `mcmodel describe` the model and split it into movable parts. If it is one solid piece, ask to regroup it into bones first (this is an `edit-model`-style change, written to a copy).
2. Write a keyframe plan (`<name>.anim.json`, schema in `references/schemas/anim-plan.schema.json`): each part's rotation, position, scale over time. Start from a preset where one fits (see below), then adjust to the description.
3. `mcmodel animate build <model> <plan> --route <1-4>` generates the files for the chosen route.
4. `mcmodel animate preview` renders a frame-strip PNG (and a GIF) for the agent to compare against the description.
5. `mcmodel animate check` flags detached parts, extreme angles, and variant counts over budget.
6. Deliver the files, the preview, and a list of limits.

Preset library (`references/animation-presets.md`): spin, bob, breathe, wing flap, tail sway, door swing, sword swing. Optional extras: chaining animations into a set (idle, walk, attack) for the skeletal route; sound and particle hooks as optional datapack lines for route 3.

### Additional commands

All of these read inputs, write results to a copy or a new folder (never overwrite originals unless asked), and end with a short report.

- **review**: audits a model or pack and changes nothing. Reports invalid JSON, wasted elements, hidden faces, texture bleed, wrong `pack_format`, high element count. Offers to hand fixes to `edit-model`.
- **optimize**: reduces element and face counts by merging cuboids and removing unseen faces; shows before/after previews and the counts saved. Must keep the visible result unchanged; `score` checks this.
- **retexture**: keeps geometry, redraws the PNGs: recolour, new art style, new resolution, seasonal variant. Touches textures only.
- **variants**: generates a set from one base model (rarity tiers, colour swaps, open/closed, damaged) so UVs, names and `custom_model_data` stay consistent.
- **convert**: moves a model or pack between versions (e.g. 1.20 `overrides` to the 1.21.4+ `items/` format) or between Java JSON and `.bbmodel`. Uses `references/version-matrix.json`; unsupported versions are refused.
- **pack**: merges several models into one resource pack. Resolves namespace and `custom_model_data` collisions, writes `pack.mcmeta` and icon, builds the `.zip`.
- **preview**: renders a model, pack or animation from several angles or as a turntable. No changes made.
- **import**: converts a `.bbmodel` or vanilla model into the brief format, so `edit-model` and `animate-model` can work on models not created here.
- **install**: copies a pack into a chosen Minecraft `resourcepacks` folder, or prints the exact server config lines for the delivery method. Asks before writing outside the working directory.

### help

`/model-creator:help` (Codex: `$help` or "model creator help") lists every command with a one-line purpose, an example call, and the typical workflow (`plan`, then `create-model`, then `edit-model`, `create-animation`, `review`, `pack`, `install`). `/model-creator:help <command>` shows that command's inputs, questions, outputs and limits.

- Source of truth is `references/help.md`. Both `commands/help.md` and `skills/help/SKILL.md` run `mcmodel help [command]` and output the result verbatim, so the text is identical on both hosts.
- A test fails if any file in `commands/` or folder in `skills/` is missing from `help.md`, so the list cannot go stale.

## 2. Compatibility rules

### Skills
- Open Agent Skills layout: `skills/<name>/SKILL.md` with YAML frontmatter `name` + `description` only (other keys are ignored by one host or the other). Same files serve Claude Code and Codex.
- `name` matches the folder name: lowercase letters, digits, hyphens, max 64 chars. `description` max 1024 chars, states when to use the skill and names its trigger phrases, so descriptions do not overlap between skills.
- `SKILL.md` body under 500 lines; longer material goes to `references/` and is loaded on demand.
- Every folder under `skills/` contains a `SKILL.md`. Shared material lives outside `skills/`.

### Locating the CLI and references
Plugins are installed to a host cache folder, not the user's project, so skills never assume a working-directory-relative path. Every `SKILL.md` starts with the same "Setup" block that resolves the CLI in this order:
1. `${CLAUDE_PLUGIN_ROOT}/core/bin/mcmodel.js` (Claude Code plugin install).
2. The absolute path in `mcmodel.path` next to `SKILL.md` (written by `mcmodel setup codex`).
3. `../../core/bin/mcmodel.js` relative to the `SKILL.md` folder (repo cloned and used in place).

The resolved path is called `MCMODEL` in all skills; every call is `node "<MCMODEL>" <command> ...`, always quoted (paths may contain spaces or brackets).

Skills read reference docs through `mcmodel ref <name>` (prints the file from `references/`), never by relative path, so references work however the skills were installed.

### Hosts
- **Claude Code**: `.claude-plugin/plugin.json` (`name: "model-creator"`, `version`, `description`, `author: {"name": "SinisterRed"}`, `license: "MIT"`, `repository: "https://github.com/SinisterRedTrue/Model-Creator"`, `keywords`). `.claude-plugin/marketplace.json` (marketplace name `sinisterred`, one entry with `source: "./"`) lists the plugin. Install:
  ```
  /plugin marketplace add SinisterRedTrue/Model-Creator
  /plugin install model-creator@sinisterred
  ```
  `commands/` and `skills/` are picked up from their default locations. Updates ship by bumping `version` in `plugin.json` and pushing to `main`.
- **Codex**: `AGENTS.md` at repo root routes requests to skills and documents the marker. Install:
  ```
  git clone https://github.com/SinisterRedTrue/Model-Creator.git
  node Model-Creator/core/bin/mcmodel.js setup codex --global
  ```
  `setup codex [--global | --project]` copies `skills/*` to `~/.codex/skills/` (global) or `.agents/skills/` (project) and writes `mcmodel.path` into each copy. Updating is `git pull` then re-running `setup codex`.
- **Releases**: each version gets a git tag `vX.Y.Z` and a GitHub release with `CHANGELOG.md` notes. `plugin.json`, `marketplace.json` and `package.json` versions must match (manifest test).
- No host-specific logic beyond routing and the CLI-resolution block.

### Runtime
- Plain Node 18+ CommonJS, no build step, no bundler, no TypeScript. Runs unchanged on Windows, macOS, Linux.
- **Zero install-time dependencies.** Plugin installs do not run `npm install`, so the three pure-JS libraries `pngjs`, `jpeg-js` and `omggif` are vendored under `core/vendor/` with their licenses. `package.json` has no runtime `dependencies`; it exists for `npm test` only. ZIP output uses Node `zlib`.
- `mcmodel` checks `process.version` at start and exits with a clear message below Node 18.
- No shell scripts. All paths go through `path`. Output uses `\n`; reads accept `\r\n`. Paths with spaces, brackets and non-ASCII characters are supported and covered by tests.
- Tests use `node:test`.
- All docs are plain Markdown; all data is JSON; all images are PNG.

### File writes
- The plugin folder is read-only at runtime. All output goes to the user's working directory: `plans/` for prompts, `mcmodel-out/<name>/` for packs and previews, unless the user names another folder.
- Anything outside the working directory (e.g. `.minecraft/resourcepacks`) is written only after the user confirms.
- `mcmodel` never deletes user files; overwrites only its own previous output in `mcmodel-out/` and says so.

### CLI output contract
- Human-readable by default; `--json` on every command prints one JSON object to stdout for the agent to parse.
- Exit codes: `0` ok, `1` validation/check failures, `2` usage error, `3` unsupported version or format.
- Errors on stderr as `file:path: problem`.

## 3. Repository layout (this folder is the repo root)

Repo: https://github.com/SinisterRedTrue/Model-Creator (MIT, default branch `main`). The repo name's casing does not affect the plugin name, which stays `model-creator`.

```
Model-Creator/
  SPEC.md
  README.md                       install for both hosts, quickstart
  AGENTS.md                       Codex routing
  CHANGELOG.md
  LICENSE                         MIT (already in repo)
  .gitignore                      plans/, mcmodel-out/, node_modules/
  package.json                    no runtime deps; "test": "node --test"
  .claude-plugin/
    plugin.json
    marketplace.json
  .github/workflows/test.yml      node:test on windows, macos, ubuntu x Node 18, 20, 22
  commands/
    plan.md
    create-model.md
    edit-model.md
    create-animation.md
    review.md
    optimize.md
    retexture.md
    variants.md
    convert.md
    pack.md
    preview.md
    import.md
    install.md
    help.md
  skills/
    plan-model/SKILL.md
    build-model/SKILL.md
    edit-model/SKILL.md
    animate-model/SKILL.md
    review-model/SKILL.md
    optimize-model/SKILL.md
    retexture-model/SKILL.md
    variants-model/SKILL.md
    convert-model/SKILL.md
    pack-model/SKILL.md
    preview-model/SKILL.md
    import-model/SKILL.md
    install-model/SKILL.md
    help/SKILL.md
  references/
    java-model-format.md
    decomposition-guide.md
    texture-guide.md              includes texture patch format
    prompt-contract.md
    questionnaire.md
    version-matrix.json           pack_format, item-model layout, rotation rules per version
    delivery-targets.md
    animation-routes.md
    animation-presets.md
    help.md                       single source for help
    schemas/
      brief.schema.json
      anim-plan.schema.json
      variants.schema.json
  core/
    bin/mcmodel.js
    src/{brief,validate,describe,preview,texture,grid,scaffold,score,animate,review,optimize,variants,convert,pack,importer,install,setup,ref}.js
    src/{util,image,model,render,schema,versions,bbmodel,zip}.js     shared: IO, PNG/GIF, model loading, rasteriser, JSON Schema, version matrix, .bbmodel, ZIP
    vendor/{pngjs,jpeg-js,omggif}/  + vendor/README.md (versions, licenses)
    test/*.test.js                  node:test suites; helpers.js
    fixtures/{stool,lamp,sword}/    brief.json, reference.png, expected/*.png; lamp/desk_lamp.prompt.md
    fixtures/anim/                  one plan per route; fixtures/variants/
```

`version-matrix` is JSON (not Markdown) because the CLI reads it; `mcmodel ref version-matrix` prints it as a table for agents.

## 4. Phase A: `plan-model`

1. **Clarify.** Before analysing the image, ask the questionnaire in section 4.1 as one form. Every question has a default; the user may answer `default` to any of them. Answers are written into the brief's `spec` block and into the prompt's Intent section.
2. **Measure.** `mcmodel grid <image> --cells 16` writes a numbered grid overlay PNG; the agent views it and reads proportions in Minecraft units (1 unit = 1/16 block).
3. **Decompose** (after measuring) into named parts, each one or more cuboids: `from/to`, rotation, symmetric twins, visible faces (see `decomposition-guide.md`).
4. **Texture plan.** Palette (max 16 colours, hex) plus per-surface pixel grids (character map + legend); lighting from top-left (see `texture-guide.md`).
5. **Brief.** Write `brief.json` against `references/schemas/brief.schema.json`; `mcmodel brief check` validates schema and geometry.
6. **Blockout check.** `mcmodel preview --brief` renders flat-colour cuboids from front, side, top, isometric. Agent compares against the image and fixes proportions before handoff.
7. **Emit the prompt** per `prompt-contract.md`, print it in chat and save it to `plans/<name>.prompt.md`.

### 4.1 Clarification questionnaire

Asked once, as a single numbered form. Required questions block output until answered; conditional questions are asked only when the model type calls for them; the rest take their default unless the user overrides.

| # | Question | Kind | Default | Why it matters |
|---|---|---|---|---|
| 1 | Minecraft version (e.g. 1.21.8) | Required | none | Sets `pack_format` and the item-model layout. From 1.21.4 items use `assets/<ns>/items/*.json` definitions, not only `custom_model_data` overrides |
| 2 | Model type: Weapon, Armor, Pet, Mount, Skill/effect, Item, Block, GUI, Furniture/prop, Other | Required | none | Sets display transforms and rules. Pets, mounts and armor cannot be plain vanilla item models, so the skill warns and offers the right route |
| 3 | Delivery method: vanilla resource pack on a base item; Paper/Spigot with ItemsAdder, Oraxen or Nexo; ModelEngine; Fabric/Forge mod | Required | vanilla resource pack | Changes the output files. ModelEngine needs Blockbench `.bbmodel` |
| 4 | Base item (e.g. `diamond_sword`) or block to replace | Conditional: Weapon, Item, Block | type-based guess, stated | Target of `custom_model_data` / item definition |
| 5 | Namespace and model name | Conditional: always asked, defaulted | `custom` / slug of subject | File paths and IDs. Must match `[a-z0-9_.-]+` |
| 6 | Texture resolution: 16, 32, 64, 128 | Optional | 16 | Texture grid and UV scale |
| 7 | Art style: vanilla-faithful, detailed pixel art, low-poly | Optional | vanilla-faithful | Palette and shading rules |
| 8 | Scale: real-size description (e.g. "sword, held normally", "furniture, 1 block tall") | Optional | type-based | Display scale |
| 9 | Hidden sides: mirror visible side, plain back, or follow a second image (path) | Optional | mirror | Image shows only some faces |
| 10 | Fidelity vs. freedom: copy exactly, or simplify to stay clean and cuboid-friendly | Optional | simplify | Element count and detail |
| 11 | Element budget: low (<=30), normal (<=100), unlimited | Optional | normal | Server and client performance; `score` enforces it |
| 12 | Extras: emissive parts, translucency, animated textures (`.mcmeta` frames), variants (open/closed, damaged) | Optional | none | Extra files and render modes |
| 13 | Display slots that matter: first-person, third-person, GUI, ground, head, item frame | Optional | type-based | Slots not chosen are skipped |
| 14 | Output form: folder, `.zip`, both | Optional | folder | Delivery |
| 15 | Free-text notes: anything the image does not show | Optional | none | Passed to the prompt verbatim |

Rules:
- Conditional questions that do not apply are not shown.
- If the user's first message already answers a question, it is not asked again.
- The skill states every default it applied at the top of the prompt, so nothing is silent.
- If the answers conflict (e.g. type Pet with delivery vanilla resource pack), the skill explains the limit and asks one follow-up before continuing.
- A version not in `version-matrix.json` is refused with the list of supported versions.

## 5. Build prompt contract

Fixed sections, in order:

1. Marker line + version: `<!-- mcmodel-build v1 -->`. The prompt version changes only when sections change; the brief carries its own `"schema_version"`. `build-model` refuses unknown major versions with a clear message.
2. Intent: subject, plus the questionnaire answers (version, type, delivery, base item, namespace, resolution, style, scale, hidden sides, fidelity, budget, extras, display slots, output form, notes) with applied defaults marked `(default)`.
3. Brief: fenced JSON (`schema_version`, `spec` block holding the answers and `reference_images`, plus parts, elements, texture maps, palette, display transforms, namespace, file paths).
4. Build steps: exact `mcmodel` commands, written host-neutral as `mcmodel <command>`; the build skill substitutes its resolved `MCMODEL`.
5. Acceptance checklist: pass/fail criteria for phase B.
6. Known risks: parts the planner was unsure about.
7. Fallbacks: what to simplify if element or UV budget is exceeded.

The prompt must be plain Markdown with no host-specific syntax, so a prompt from Claude Code builds in Codex and the reverse.

## 6. Phase B: `build-model`

1. Parse the brief; `mcmodel brief check`. Stop and report if invalid. Read `spec` for version, delivery method and budget. Resolve `spec.reference_images`; ask for the path if a file is missing.
2. `mcmodel scaffold --brief` creates the pack in `mcmodel-out/<name>/` for that version and delivery method (correct `pack_format`, `items/` definition or `custom_model_data` override, and extra files per `delivery-targets.md`).
3. In the same call, textures are rendered from palette + pixel grids (the `texture` code path; agent never hand-writes PNGs).
4. In the same call, the model JSON is written from the brief; the agent then runs `mcmodel validate` and edits the JSON directly for fixes.
5. Verify loop, max 4 rounds: `mcmodel preview` (4 angles + montage with reference) and `mcmodel score` (bounds, face coverage, texture bleed, hidden faces, element budget); agent views the montage PNG, compares it to the reference using the checklist, fixes the worst defect, repeats.
6. Deliver: pack folder, previews, change log, remaining deviations stated honestly.

## 7. Core CLI (`mcmodel`)

All commands accept `--json`. Version-dependent rules come from `references/version-matrix.json`.

| Command | Purpose |
|---|---|
| `scaffold <dir> --namespace <ns> --version <v> --delivery <d> [--brief <file>] [--force]` | pack skeleton: `pack.mcmeta`, `assets/<ns>/models/{block,item}`, `items/` when the version uses it, `textures/`. With `--brief` also textures, model JSON, base-item wiring, delivery files and `pack.png` |
| `validate <file\|dir> [--version <v>]` | `from/to` in -16..32; rotation range and step per version; one axis; face names; `uv` 0..16; `#texture` refs resolve through `parent`; parent exists; legal `display` keys. Prints `file:path: problem`, exit 1 on error |
| `describe <file>` | compact summary for reading existing models |
| `grid <image> --cells <n> [--out <png>]` | numbered grid overlay on the reference |
| `brief check <file>` | schema (`brief.schema.json`) + geometry validation |
| `texture <brief> [--patch <patch.json>]` | pixel grids + palette to PNG; patch mode recolours or redraws regions of existing PNGs |
| `preview <file\|brief> [--reference <image>] [--turntable]` | software-rasterised multi-angle render, optional reference montage |
| `score <pack> [--brief <f>] [--budget <b>] [--baseline <model>]` | automated acceptance checks; `--baseline` adds the render-equality check used by optimize |
| `animate build <model> <plan> --route <1-4>` | generates route files (`.mcmeta`, model variants, `.mcfunction`, or `.bbmodel`) |
| `animate preview <model> <plan>` | frame-strip PNG and GIF of a keyframe plan |
| `animate check <plan>` | detached parts, extreme angles, variant budget |
| `review <path>` | full audit report (extends `validate` and `score`) |
| `optimize <path> --out <dir>` | merge cuboids, drop unseen faces, report counts |
| `variants <model> <spec>` | generate a consistent variant set (`variants.schema.json`) |
| `convert <path> --to <version\|bbmodel>` | version/format conversion |
| `pack <paths...> --out <dir> [--zip]` | merge into one pack, resolve collisions, build zip |
| `import <file>` | `.bbmodel` or vanilla model to brief |
| `install <pack> --target <dir\|default> [--yes] [--force]` | copy pack to a resourcepacks folder; outside the working directory only with `--yes` |
| `install <pack> --print-config <server\|itemsadder\|oraxen\|nexo\|modelengine> [--url <u>]` | zip + sha1 + `server.properties` lines, or plugin steps |
| `setup codex [--global\|--project]` | install skills for Codex and write `mcmodel.path` |
| `ref <name>` | print a file from `references/` |
| `help [command]` | print `references/help.md`, or one command's section |
| `version` | CLI version, Node version, supported Minecraft versions |

Editing existing models: the agent edits JSON directly, then runs `validate`. No edit-ops API. Texture edits use `texture --patch`.

## 8. Testing

- Unit tests per command (`node:test`).
- Golden fixtures: stool, lamp, sword with briefs and expected previews.
- Contract test: a prompt emitted by `plan-model` parses in `build-model`.
- Smoke test: both phases on a fixture image.
- Help test: every file in `commands/` and folder in `skills/` appears in `help.md`.
- Skill lint: every `SKILL.md` has valid `name`/`description` frontmatter within limits, `name` matches its folder, and contains the CLI-resolution block.
- Manifest test: `plugin.json` and `marketplace.json` parse and their name and version match `package.json`.
- Resolution test: the CLI is found under all three resolution paths.
- Path test: fixtures under a folder name with spaces and brackets.
- Optimize test: render of optimized model equals render of original.
- Pack test: two models with colliding namespaces merge without collision.
- Animation fixtures: one per route (flipbook, frame swap, display entity, `.bbmodel`) with expected files and preview strips.
- CI runs the full suite on Windows, macOS and Linux with Node 18, 20 and 22.

## 9. Limits

"Perfect" cannot be guaranteed; image reading is approximate. Mitigations: measuring grid, blockout check, visual comparison loop, honest deviation report. Organic shapes (faces, creatures) approximate poorly because Minecraft models are cuboids.

The verify loop needs a model that can view images. If the host model cannot, the skill skips visual comparison, relies on `score`, and says so in the report.

## 10. Assumptions to confirm

- Default 16x16 textures.
- Default delivery is a vanilla resource pack. Blockbench `.bbmodel` output is produced only when the delivery answer is ModelEngine; plugin-specific configs (ItemsAdder, Oraxen, Nexo) are generated only as far as `delivery-targets.md` documents them, and unsupported parts are listed as manual steps.
- Previews are PNG montages, not an interactive viewer.
- `brief check`, `scaffold` and `validate` depend on `version-matrix.json`; versions not in the matrix are refused with a clear message instead of guessed.

To verify at build time against current host docs:
- Claude Code: `commands/` and skills both load from a plugin; command frontmatter keys (`description`, `argument-hint`, `allowed-tools`); `${CLAUDE_PLUGIN_ROOT}` expands inside `SKILL.md`; whether skills also appear as `/model-creator:<skill>` and duplicate the commands (if so, keep the commands and note it in README).
- Codex: skill discovery folders (`~/.codex/skills/`, `.agents/skills/`) and `$skill` invocation syntax; whether Codex plugin manifests are supported yet (if so, add one without changing skills).
- Exact rotation rules and `pack_format` values for each version in the matrix.
