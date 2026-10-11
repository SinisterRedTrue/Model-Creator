# Decomposition guide

How to turn a reference image into named cuboid parts.

## Order

1. Run `mcmodel grid <image> --cells 16` and look at the overlay. Columns count left to right, rows count up from the bottom (Minecraft Y).
2. Decide the scale: how many cells the subject spans. For a full-block object, the subject should span 16 cells. For a held item, the long side usually spans 12 to 16 units.
3. List the parts from biggest to smallest: body, then limbs, then details. Name them in `snake_case` (`seat`, `leg`, `blade`, `wing_l`).
4. For each part, read `from` and `to` on all three axes. The image gives two axes; take the third from the questionnaire (depth, hidden sides) or from proportions of similar real objects.
5. Mirror symmetric parts: write one, copy it with mirrored X (`x' = 16 - x`). Keep the twin's name with `_l` / `_r`.
6. Run `mcmodel brief check`, then `mcmodel preview --brief` and compare the blockout to the reference.

## Rules of thumb

- Start coarse. A good model is 5 to 30 cuboids. Add detail only where it changes the silhouette.
- Prefer whole units. Use half units only for thin parts (blades, handles); they need 32px textures to avoid bleed.
- Keep elements inside `0..16` for blocks. Items may use `-16..32` but stay centred around `8, 8, 8`.
- Thin parts: 1 unit thick reads well; 0 thickness (a plane) only for leaves, flames, cloth. A plane needs both faces it is seen from.
- Rotation: one axis, `22.5` or `45` degrees. Diagonal shapes (sword on its side, leaning post) are better built straight and turned by `display`, or as a short staircase of cuboids.
- Round shapes: approximate with 2 or 3 stacked cuboids of different widths (a cross-section "plus" shape). Never more than 4 per round part.
- Gaps between parts make the model look broken. Let parts touch or overlap by 0 to 0.5 units.
- Remove faces that are always covered (top of a leg under a seat). `score` reports them.
- Give each part a `pivot` where it would hinge (hinge of a door, root of a wing). Animation uses it.

## Fidelity choices

| Answer | Do |
|---|---|
| copy exactly | follow the image, more elements, keep small details if they are 1 unit or bigger |
| simplify | merge details below 1 unit into textures, keep the silhouette, aim for half the element count |

## Hidden sides

| Answer | Do |
|---|---|
| mirror | back = mirrored front, same textures |
| plain | back faces use a plain texture from the palette |
| second image | measure the second image the same way and use it for the back/side |

## Model types

| Type | Typical size | Notes |
|---|---|---|
| Weapon | 16 to 24 units long | Build upright, set `display` for hands; use the handheld transforms as a start |
| Item | fits 16x16 | GUI view matters most |
| Block | exactly 0..16 | Use `cullface` on faces flush with the block edge |
| Furniture/prop | up to 32 units tall (2 blocks) | Origin at the floor centre (`8, 0, 8`) |
| Pet / Mount | any | Group into bones (`body`, `head`, `leg_fl`...) for ModelEngine |
| Armor | | Vanilla armor is not a JSON model; build a head item (`head` display) or use a plugin |
| Skill/effect | small | Usually planes and emissive parts; often a texture flipbook |
| GUI | flat | Use `item/generated` with a sprite instead of elements when possible |
