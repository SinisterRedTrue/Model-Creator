---
description: "Edit an existing model from an instruction (works on a copy)"
argument-hint: "<model or pack path> <instruction> [image path]"
allowed-tools: Bash(node:*), Read, Write, Edit, Glob, Grep
---

Use the `edit-model` skill from the model-creator plugin and follow it exactly.

Arguments: $ARGUMENTS

If the arguments are empty, ask for the inputs listed in the skill before running anything.
