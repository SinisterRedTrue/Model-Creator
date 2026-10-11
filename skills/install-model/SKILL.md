---
name: install-model
description: Install a Minecraft resource pack built by Model Creator into a Minecraft resourcepacks folder, or print the exact server.properties or plugin (ItemsAdder, Oraxen, Nexo, ModelEngine) steps to deploy it. Use when the user runs /model-creator:install, or asks to install, deploy, put the pack in Minecraft, or set up a server resource pack.
---

# install-model

## Setup

Resolve the CLI once and call it `MCMODEL`:
1. `${CLAUDE_PLUGIN_ROOT}/core/bin/mcmodel.js`, if that variable was expanded to a real path.
2. Else the absolute path written in `mcmodel.path` in this skill's folder (Codex install).
3. Else `../../core/bin/mcmodel.js` relative to this skill's folder.

Check it with `node "<MCMODEL>" version`. Run every command as `node "<MCMODEL>" <command> ...` with each path in double quotes. Read references with `node "<MCMODEL>" ref <name>`.

## Steps

1. Ask where it goes if not given: the game on this computer (`default`), another `.minecraft` or `resourcepacks` folder, a server, or a plugin.
2. **Game folder.** This writes outside the working directory, so ask the user to confirm the exact destination first. Only after a clear yes run `install "<pack>" --target <dir|default> --yes`. Add `--force` only if the user agreed to replace an existing pack of the same name.
3. **Server.** `install "<pack>" --print-config server --url <download url if known>`. Give the user the lines for `server.properties` and the zip to upload. The sha1 changes on every rebuild.
4. **Plugin.** `install "<pack>" --print-config <itemsadder|oraxen|nexo|modelengine>` and relay the steps, with the generated config files from the build (see `ref delivery-targets`).
5. Report what was copied where, or the exact lines/steps, and how to enable the pack in game (Options > Resource Packs, F3+T to reload).

## Rules

- Never pass `--yes` without the user's confirmation in this conversation.
- Never delete anything in the user's Minecraft folder.
