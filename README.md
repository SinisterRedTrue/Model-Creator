# Model Creator

Skills for Claude Code and OpenAI Codex that turn a reference image into a finished **Minecraft Java block/item model**: resource-pack JSON, textures, item definitions, previews. Then edit it, animate it, review, optimize, retexture, make variants, convert versions, merge packs and install.

Supports Minecraft Java 1.20 to 1.21.8 (`mcmodel ref version-matrix`). Runs locally on Windows, macOS and Linux with Node 18+. No `npm install` needed.

The ChatGPT web chat cannot run it (it needs a local shell). Use Codex (CLI, IDE extension or the ChatGPT desktop Codex app) or Claude Code.

## Install

### Claude Code

```
/plugin marketplace add SinisterRedTrue/Model-Creator
/plugin install model-creator@sinisterred
```

Local copy instead: `/plugin marketplace add "<path to this folder>"`, or start Claude Code with `claude --plugin-dir "<path to this folder>"`.

### Codex

```
git clone https://github.com/SinisterRedTrue/Model-Creator.git
node Model-Creator/core/bin/mcmodel.js setup codex --global
```

Use `--project` instead of `--global` to install into `.agents/skills/` of the current project. Restart Codex. Update with `git pull` and the same `setup` command.

## Use

Session 1, plan:

```
/model-creator:plan ./refs/lamp.png a desk lamp
```

Answer the questions. You get a build prompt (also saved to `plans/<name>.prompt.md`).

Session 2, build (new session):

```
/model-creator:create-model ./refs/lamp.png
<paste the prompt>
```

You get `mcmodel-out/<name>/` (resource pack), preview montages, give commands and a deviation report.

In Codex use the skill names: `$plan-model`, `$build-model`, and so on, or ask in plain words. A pasted prompt that starts with `<!-- mcmodel-build v1 -->` is recognised on its own.

Give the reference image as a **file path**. A pasted image is not saved as a file, and the tools need one.

## Commands

| Claude Code | Codex skill | Does |
|---|---|---|
| `/model-creator:plan` | `$plan-model` | Image to build prompt |
| `/model-creator:create-model` | `$build-model` | Prompt to resource pack |
| `/model-creator:edit-model` | `$edit-model` | Change a model from an instruction |
| `/model-creator:create-animation` | `$animate-model` | Flipbook, frame swap, display-entity datapack or ModelEngine `.bbmodel` |
| `/model-creator:review` | `$review-model` | Audit, no changes |
| `/model-creator:optimize` | `$optimize-model` | Fewer elements, same look |
| `/model-creator:retexture` | `$retexture-model` | New textures, same geometry |
| `/model-creator:variants` | `$variants-model` | Consistent variant set |
| `/model-creator:convert` | `$convert-model` | Other version, or to/from `.bbmodel` |
| `/model-creator:pack` | `$pack-model` | Merge packs, zip |
| `/model-creator:preview` | `$preview-model` | Multi-angle or turntable render |
| `/model-creator:import` | `$import-model` | `.bbmodel`/vanilla model to a brief |
| `/model-creator:install` | `$install-model` | Copy into Minecraft, or server/plugin config |
| `/model-creator:help` | `$help` | Command list |

Originals are never overwritten unless you ask; results go to copies or new folders in your working directory (`plans/`, `mcmodel-out/`).

## The `mcmodel` CLI

The skills drive a small CLI you can also run yourself:

```
node core/bin/mcmodel.js help
node core/bin/mcmodel.js scaffold mcmodel-out/oak_stool --brief core/fixtures/stool/brief.json
node core/bin/mcmodel.js preview mcmodel-out/oak_stool --turntable
node core/bin/mcmodel.js score mcmodel-out/oak_stool
```

Every command takes `--json`. Exit codes: `0` ok, `1` check failed, `2` usage error, `3` unsupported version or format.

## Limits

- Image reading is approximate. The grid, the blockout check and the verify loop narrow the gap, and the build reports remaining deviations.
- Minecraft models are cuboids: faces and creatures come out blocky.
- Vanilla items have no skeletal animation; `create-animation` picks a route and lists what it cannot do.
- Plugin configs (ItemsAdder, Oraxen, Nexo) are best-effort; check them against your plugin version.
- Previews come from a built-in software renderer, close to the game but not identical.

## Development

```
npm test
```

Layout and design: [SPEC.md](SPEC.md). Agent rules: [AGENTS.md](AGENTS.md).

## License

MIT. Vendored libraries keep their licenses (see `core/vendor/README.md`).
