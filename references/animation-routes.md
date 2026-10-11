# Animation routes

Vanilla Java item models have no skeletal animation. Pick the route that fits the model type and delivery, and tell the user what it cannot do.

| Route | Mechanism | Suits | Limits | Needs |
|---|---|---|---|---|
| 1. Texture flipbook | frames stacked in the PNG + `.png.mcmeta` | glow, flicker, flow, pulse, magic | geometry does not move; always playing | any version |
| 2. Model frame swap | pre-posed models switched by item state | swings, charging, open/close | discrete frames; one axis per element, 22.5 degree steps to 45; frames limited by budget (default 8) | 1.21.4+ |
| 3. Display entities | one `item_display` per part, `.mcfunction` frames interpolate transforms | props, furniture, spinning/bobbing parts | needs a datapack and entities; all copies animate in sync | 1.21.2+ |
| 4. Skeletal | `.bbmodel` bones + keyframes | pets, mounts: idle, walk, attack, death | needs ModelEngine; `.bbmodel` only | ModelEngine |

## Choosing

1. Only colour/light changes: route 1.
2. Held item reacting to use, cooldown or a command: route 2.
3. Placed object moving on its own in the world: route 3.
4. Creature, or delivery is ModelEngine: route 4.
5. The request needs a route the delivery cannot do (e.g. walk cycle as a vanilla pack): explain, offer the closest route.

## Plan file (`<name>.anim.json`)

Schema: `mcmodel ref anim-plan`.

```json
{
  "schema_version": 1,
  "name": "tilt",
  "route": 2,
  "minecraft_version": "1.21.8",
  "length_ticks": 20,
  "loop": "once",
  "easing": "linear",
  "trigger": "use",
  "intensity": "normal",
  "frames": 4,
  "parts": {
    "shade": {
      "elements": ["shade"],
      "pivot": [8, 9, 8],
      "keyframes": [
        { "t": 0, "rot": [0, 0, 0] },
        { "t": 20, "rot": [0, 0, 45], "easing": "ease-in-out" }
      ]
    }
  },
  "texture_animation": { "texture": "#glow", "effect": "pulse", "frames": 8, "frametime": 2, "interpolate": true, "strength": 0.6 },
  "extras": { "sound": "minecraft:block.note_block.chime", "particle": "minecraft:end_rod", "chain": ["idle", "walk"] }
}
```

- `t` is in ticks (20 per second). `rot` is degrees XYZ, `pos` is model units, `scale` is a factor.
- `elements` lists element names or indices. Without it, a part takes every element named `<part>` or `<part>_<n>`.
- `pivot` defaults to the bottom centre of the part.
- `intensity` scales rotation and position: subtle 0.5, normal 1, exaggerated 1.5.
- `frames`: how many samples for routes 2 and 3 and the preview strip.
- Leave out keys you do not need. `parent` names another part this one follows (route 3, previews and checks; route 4 bones stay flat, so nest them in Blockbench if needed).

## Triggers per route

| Trigger | Route 1 | Route 2 | Route 3 | Route 4 |
|---|---|---|---|---|
| always | yes | no | yes (`play` loops) | yes |
| use | no (always plays) | `using_item` + `use_duration` | call `play` yourself | ModelEngine state |
| hit | no | `cooldown` (give the item `use_cooldown`) | call `play` yourself | ModelEngine state |
| movement | no | no | no | walk animation |
| command | no | `custom_model_data` floats index 1 = frame | `/function <ns>:<model>/<anim>/play` | `/meg` command |

## Output per route

| Route | Files |
|---|---|
| 1 | copy of the pack with the strip PNG and `.png.mcmeta` |
| 2 | copy of the pack with `<model>_<anim>_f<k>.json` models and the item definition rewritten |
| 3 | copy of the pack with one model per part, plus `<pack>.datapack/` with `summon`, `play`, `frame_<k>`, `stop`, `kill` functions |
| 4 | `<model>.bbmodel` with bones and the animation; re-running adds more animations to the same file |
