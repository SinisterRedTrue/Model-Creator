# Build prompt contract (v1)

`plan-model` writes one self-contained prompt. `build-model` runs it in a fresh session with no other memory. The prompt is plain Markdown with no host-specific syntax, so a prompt made in Claude Code builds in Codex and the reverse.

`mcmodel brief check <file>.prompt.md` checks the marker, the section order and the brief.

## Sections, in this order

1. Marker line, alone on the first line: `<!-- mcmodel-build v1 -->`
2. `## Intent`
3. `## Brief`
4. `## Build steps`
5. `## Acceptance checklist`
6. `## Known risks`
7. `## Fallbacks`

`v1` changes only when sections change. The brief has its own `"schema_version"`. `build-model` refuses a marker or schema version it does not know.

## Template

````markdown
<!-- mcmodel-build v1 -->
# Build: <subject>

Defaults applied: resolution, style, hidden sides (listed so nothing is silent).

## Intent

- Subject: <one sentence>
- Reference image: <path>
- Minecraft version: 1.21.8
- Model type: Furniture/prop
- Delivery: vanilla resource pack
- Base item: paper (default)
- Namespace / name: custom / desk_lamp (default)
- Texture resolution: 16 (default)
- Art style: vanilla-faithful (default)
- Scale: furniture, 1 block tall
- Hidden sides: mirror (default)
- Fidelity: simplify (default)
- Element budget: normal (<=100) (default)
- Extras: emissive bulb
- Display slots: gui, ground, item frame
- Output form: folder and zip
- Notes: <free text, verbatim>

## Brief

```json
{ "schema_version": 1, "name": "desk_lamp", "namespace": "custom", "spec": { ... }, "palette": { ... }, "textures": { ... }, "parts": [ ... ] }
```

## Build steps

1. `mcmodel brief check <this prompt file>`
2. `mcmodel scaffold mcmodel-out/desk_lamp --brief <this prompt file>`
3. `mcmodel validate mcmodel-out/desk_lamp`
4. `mcmodel preview mcmodel-out/desk_lamp --reference <reference image>`
5. `mcmodel score mcmodel-out/desk_lamp --brief <this prompt file>`
6. Verify loop (max 4 rounds), then deliver.

## Acceptance checklist

- [ ] `validate` has 0 errors and `score` passes.
- [ ] Silhouette matches the reference from the front and side views.
- [ ] Shade sits on top of the pole, centred.
- [ ] Bulb visible from below and glowing.
- [ ] Element count within budget.

## Known risks

- Depth of the shade is a guess (image shows the front only).

## Fallbacks

- Over budget: merge the two pole pieces, drop the base bevel.
- UV bleed on the pole: use whole units, or switch that texture to 32px.
````

## Rules

- The brief is the single source of truth. The Intent section repeats the answers for people; if they differ, the brief wins.
- Write commands as `mcmodel <command>`. The build skill runs them as `node "<MCMODEL>" <command>`.
- Paths in the brief (`reference_images`, texture `file`) are relative to the prompt file's folder, or absolute.
- Mark every default with `(default)` in Intent and list it in `spec.defaults_applied`.
- Acceptance items must be checkable by looking at the montage or by a command.
