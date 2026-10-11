---
name: help
description: Show Model Creator help - the list of every command/skill with its purpose and the typical workflow, or details for one command. Use when the user runs /model-creator:help, asks "model creator help", "what can model creator do", or how to use one of its commands.
---

# help

## Setup

Resolve the CLI once and call it `MCMODEL`:
1. `${CLAUDE_PLUGIN_ROOT}/core/bin/mcmodel.js`, if that variable was expanded to a real path.
2. Else the absolute path written in `mcmodel.path` in this skill's folder (Codex install).
3. Else `../../core/bin/mcmodel.js` relative to this skill's folder.

## Steps

1. Run `node "<MCMODEL>" help` for the full list, or `node "<MCMODEL>" help <command>` for one command (accepts `plan`, `plan-model`, `/model-creator:plan`).
2. Output the result verbatim. Do not add or remove commands.
3. If the CLI cannot be found, read `../../references/help.md` relative to this skill's folder instead.
