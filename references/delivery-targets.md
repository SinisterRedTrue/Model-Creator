# Delivery targets

What `mcmodel scaffold` writes for each `spec.delivery`, and what stays a manual step. Plugin configs are best-effort: check keys against the plugin version the user runs.

## vanilla (resource pack)

Writes:
- `pack.mcmeta` with the version's `pack_format`, `pack.png` icon.
- Model and textures under `assets/<ns>/`.
- 1.21.4+: `assets/<ns>/items/<name>.json` and `assets/minecraft/items/<base>.json` (`range_dispatch` on `custom_model_data`, fallback = vanilla model).
- Before 1.21.4: `assets/minecraft/models/item/<base>.json` with `overrides`.
- Block type: `assets/minecraft/blockstates/<base>.json` replacing every block of that type.

Give commands are printed by `scaffold`. Install with `mcmodel install <pack> --target default` (asks first), or as a server pack with `mcmodel install <pack> --print-config server`.

Manual: blocks with states (stairs, slabs, doors) need each variant mapped by hand.

## itemsadder

Writes the resource pack plus `<pack>.itemsadder/contents/<ns>/configs/<name>.yml`:

```yaml
info:
  namespace: custom
items:
  oak_stool:
    display_name: "Oak Stool"
    resource:
      material: PAPER
      generate: false
      model_path: item/oak_stool
```

Manual: copy `assets/<ns>` into `plugins/ItemsAdder/contents/<ns>/resourcepack/assets/<ns>`, copy the config, run `/iazip`.

## oraxen

Writes `<pack>.oraxen/items/<name>.yml`:

```yaml
oak_stool:
  displayname: "<white>Oak Stool"
  material: PAPER
  Pack:
    generate_model: false
    model: custom/item/oak_stool
```

Manual: copy `assets` into `plugins/Oraxen/pack/assets`, copy the item file, run `/oraxen reload all`.

## nexo

Writes `<pack>.nexo/items/<name>.yml`:

```yaml
oak_stool:
  itemname: "<white>Oak Stool"
  material: PAPER
  Pack:
    model: custom:item/oak_stool
```

Manual: copy `assets` into `plugins/Nexo/pack/assets`, copy the item file, run `/nexo reload all`.

## modelengine

Writes the resource pack (for previews) plus `<pack>.modelengine/<name>.bbmodel` (format `free`, one bone per brief part, pivot = part `pivot`).

Manual: copy the `.bbmodel` to `plugins/ModelEngine/blueprints`, run `/meg reload`. Add hitbox, seat and mount bones in Blockbench if needed. Animations come from `animate-model` route 4.

## fabric / forge

Writes the resource pack with `items/<name>.json` (1.21.4+) so an item registered as `<ns>:<name>` picks the model up.

Manual: copy `assets/<ns>` into `src/main/resources/assets/<ns>` and register the item in code.

## Server resource pack

`mcmodel install <pack> --print-config server --url <download url>` zips the pack and prints:

```
resource-pack=<url>
resource-pack-sha1=<sha1 of the zip>
require-resource-pack=true
```
