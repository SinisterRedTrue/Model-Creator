# Clarification questionnaire

Asked once, as one numbered form, before analysing the image. Skip questions the user already answered. Skip conditional questions that do not apply. Every optional question has a default; the user may answer `default`.

## Form to show the user

```
Before I plan the model, a few questions. Answer by number; "default" or blank keeps the default.

1. Minecraft version (e.g. 1.21.8)                                 [required]
2. Model type: Weapon, Armor, Pet, Mount, Skill/effect, Item, Block,
   GUI, Furniture/prop, Other                                      [required]
3. Delivery: vanilla resource pack / ItemsAdder / Oraxen / Nexo /
   ModelEngine / Fabric or Forge mod                               [default: vanilla resource pack]
4. Base item or block to replace (e.g. diamond_sword)              [default: <guess from type>]
5. Namespace and model name                                        [default: custom / <subject_slug>]
6. Texture resolution: 16, 32, 64, 128                              [default: 16]
7. Art style: vanilla-faithful, detailed pixel art, low-poly        [default: vanilla-faithful]
8. Scale (e.g. "sword, held normally", "1 block tall")             [default: <by type>]
9. Hidden sides: mirror the visible side, plain back, or a second
   image (give its path)                                           [default: mirror]
10. Fidelity: copy exactly, or simplify                            [default: simplify]
11. Element budget: low (<=30), normal (<=100), unlimited          [default: normal]
12. Extras: emissive parts, translucency, animated textures,
    variants (open/closed, damaged)                                [default: none]
13. Display slots that matter: first-person, third-person, GUI,
    ground, head, item frame                                       [default: <by type>]
14. Output: folder, .zip, both                                     [default: folder]
15. Anything the image does not show                               [default: none]

Also: the reference image's file path, if you only pasted it.
```

Show question 4 only for Weapon, Item, Block. Show question 3's plugin choices only when the user mentions a server.

## Mapping answers to `spec`

| # | `spec` key | Values |
|---|---|---|
| 1 | `minecraft_version` | a version from `mcmodel ref version-matrix` |
| 2 | `model_type` | `weapon`, `armor`, `pet`, `mount`, `skill_effect`, `item`, `block`, `gui`, `furniture_prop`, `other` |
| 3 | `delivery` | `vanilla`, `itemsadder`, `oraxen`, `nexo`, `modelengine`, `fabric`, `forge` |
| 4 | `base_item` | item or block id without `minecraft:` |
| 5 | `namespace`, `name` (brief top level) | `[a-z0-9_.-]+` |
| 6 | `resolution` | `16`, `32`, `64`, `128` |
| 7 | `style` | `vanilla-faithful`, `detailed-pixel-art`, `low-poly` |
| 8 | `scale` | free text |
| 9 | `hidden_sides` | `mirror`, `plain`, `second_image` (+ path in `reference_images`) |
| 10 | `fidelity` | `exact`, `simplify` |
| 11 | `budget` | `low`, `normal`, `unlimited`, or a number |
| 12 | `extras` | `emissive`, `translucency`, `animated_textures`, `variants` |
| 13 | `display_slots` | `first_person`, `third_person`, `gui`, `ground`, `head`, `item_frame` |
| 14 | `output_form` | `folder`, `zip`, `both` |
| 15 | `notes` | verbatim |

Add every defaulted key to `spec.defaults_applied`.

## Defaults by type

| Type | Base item | Display slots | Scale |
|---|---|---|---|
| Weapon | `diamond_sword` (axe-like: `diamond_axe`) | first/third person, gui, ground | held normally |
| Item | `paper` | gui, ground, first/third person | fits one slot |
| Block | `stone` | gui, ground, item frame | 1 block |
| Furniture/prop | `paper` | gui, ground, item frame, head | as described |
| Skill/effect | `paper` | first/third person, gui | small |
| GUI | `paper` | gui | 16x16 |
| Pet, Mount, Armor, Other | `paper` | gui, head | as described |

## Conflicts (ask one follow-up)

| Answers | Limit to explain | Offer |
|---|---|---|
| Pet or Mount + vanilla | Vanilla cannot animate or spawn creatures from a resource pack | ModelEngine (`.bbmodel`), or a static display model |
| Armor + vanilla | Worn armor is not a JSON model | A head-slot item model, or a plugin |
| Version older than 1.21.4 + model frame animation | Item definitions do not exist | Texture flipbook, or a newer version |
| Fabric/Forge + no item id | The mod must register the item | Use `<namespace>:<name>` as the id |
| Unsupported version | Not in the version matrix | List the supported versions |
| Budget low + fidelity exact | Both cannot hold | Pick one |
