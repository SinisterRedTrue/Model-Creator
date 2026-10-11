---
description: "Build a resource pack from a Model Creator build prompt"
argument-hint: "<image path> [prompt file or pasted prompt]"
allowed-tools: Bash(node:*), Read, Write, Edit, Glob, Grep
---

Use the `build-model` skill from the model-creator plugin and follow it exactly.

Arguments: $ARGUMENTS

If the arguments are empty, ask for the inputs listed in the skill before running anything.
