# Animation presets

Starting keyframes. Copy one into the plan's `parts`, rename the part, set the pivot, then adjust to the description. Times assume `length_ticks: 20`; scale `t` for other lengths.

## spin (loop, linear)

```json
"keyframes": [{ "t": 0, "rot": [0, 0, 0] }, { "t": 20, "rot": [0, 360, 0] }]
```

Pivot: centre of the part. Routes 1 to 4 except 2 (frame swap cannot turn past 45 degrees).

## bob (loop, ease-in-out)

```json
"keyframes": [{ "t": 0, "pos": [0, 0, 0] }, { "t": 10, "pos": [0, 1, 0] }, { "t": 20, "pos": [0, 0, 0] }]
```

## breathe (loop, ease-in-out)

```json
"keyframes": [{ "t": 0, "scale": [1, 1, 1] }, { "t": 10, "scale": [1.04, 1.06, 1.04] }, { "t": 20, "scale": [1, 1, 1] }]
```

Pivot: bottom centre of the body so it grows upward.

## wing flap (loop, ease-in-out)

Left wing (mirror the Z sign for the right wing):

```json
"keyframes": [{ "t": 0, "rot": [0, 0, -20] }, { "t": 10, "rot": [0, 0, 35] }, { "t": 20, "rot": [0, 0, -20] }]
```

Pivot: where the wing joins the body.

## tail sway (loop, ease-in-out)

```json
"keyframes": [{ "t": 0, "rot": [0, -15, 0] }, { "t": 10, "rot": [0, 15, 0] }, { "t": 20, "rot": [0, -15, 0] }]
```

Pivot: tail root.

## door swing (once or pingpong, ease-in-out)

```json
"keyframes": [{ "t": 0, "rot": [0, 0, 0] }, { "t": 20, "rot": [0, 90, 0] }]
```

Pivot: hinge edge. Route 2 caps at 45 degrees; use route 3 for a full swing.

## sword swing (once, snappy)

```json
"keyframes": [{ "t": 0, "rot": [0, 0, 0] }, { "t": 4, "rot": [-30, 0, 0] }, { "t": 10, "rot": [45, 0, 0] }, { "t": 20, "rot": [0, 0, 0] }]
```

Pivot: the grip. Route 2 with trigger `use` or `hit`.

## Glow / magic (route 1)

```json
"texture_animation": { "texture": "#glow", "effect": "pulse", "frames": 8, "frametime": 2, "interpolate": true, "strength": 0.6 }
```

Effects: `pulse`, `flicker`, `scroll_up`, `scroll_down`, `scroll_left`, `scroll_right`, `hue_cycle`, `shimmer`.

## Animation sets (route 4)

For `idle`, `walk`, `attack`: write one plan per animation with the same parts and pivots, and run `animate build` for each. They are added to the same `.bbmodel`. Walk cycles: legs swing opposite (`rot` X `+25` / `-25`), body bobs at twice the leg rate.

## Sound and particles (route 3)

`"extras": { "sound": "minecraft:block.note_block.chime", "particle": "minecraft:end_rod" }` adds a `playsound` and a `particle` line to the first frame.
