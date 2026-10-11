<!-- mcmodel-build v1 -->
# Build: Desk lamp with a glowing bulb

Defaults applied: resolution, style, hidden sides, fidelity, budget.

## Intent

- Subject: desk lamp with a fabric shade, thin metal pole, square base and a glowing bulb under the shade
- Reference image: reference.png
- Minecraft version: 1.21.8
- Model type: Furniture/prop
- Delivery: vanilla resource pack
- Base item: paper
- Namespace / name: custom / desk_lamp
- Texture resolution: 16 (default)
- Art style: vanilla-faithful (default)
- Scale: furniture, just under 1 block tall
- Hidden sides: mirror (default)
- Fidelity: simplify (default)
- Element budget: normal (<=100) (default)
- Extras: emissive bulb
- Display slots: all (default)
- Output form: folder and zip
- Notes: none

## Brief

```json
{
  "schema_version": 1,
  "name": "desk_lamp",
  "namespace": "custom",
  "subject": "Desk lamp with a glowing bulb",
  "spec": {
    "minecraft_version": "1.21.8",
    "model_type": "furniture_prop",
    "delivery": "vanilla",
    "base_item": "paper",
    "custom_model_data": 1002,
    "resolution": 16,
    "style": "vanilla-faithful",
    "hidden_sides": "mirror",
    "fidelity": "simplify",
    "budget": "normal",
    "extras": [
      "emissive"
    ],
    "output_form": "both",
    "reference_images": [
      "reference.png"
    ],
    "defaults_applied": [
      "resolution",
      "style",
      "hidden_sides",
      "fidelity",
      "budget"
    ]
  },
  "palette": {
    "m": "#5b5f66",
    "n": "#41444a",
    "o": "#7a7f87",
    "s": "#d8c79a",
    "t": "#bfae80",
    "u": "#e9dcb4",
    "g": "#fff2a8",
    "h": "#ffd75e"
  },
  "textures": {
    "metal": {
      "rows": [
        "nnnnnnnnnnnnnnnn",
        "mmmmmmommommmmmm",
        "ommmommmmmmmmomo",
        "mmmommommommommm",
        "ommmmmmmmmmmmmmm",
        "nnnnnnnnnnnnnnnn",
        "mmmmomommommmmmm",
        "oommmommmmmmmmmm",
        "mommmmmmmmmmommm",
        "mmmmmmmmommmommm",
        "nnnnnnnnnnnnnnnn",
        "mmmmmmmmmmmmmmmm",
        "ooommmmmomomooom",
        "ommmommmmmmmmomm",
        "mmmmmmmmmmmmmmmm",
        "nnnnnnnnnnnnnnnn"
      ]
    },
    "shade": {
      "rows": [
        "tssstssstssstusu",
        "tssstusstsustuss",
        "tssstssstssstsss",
        "tssstssstssutsss",
        "tusstssstssstsss",
        "tusstssstssstuss",
        "tssstssstssstsss",
        "tssstssstssstsss",
        "tssstssutssstsss",
        "tssstssstssstsss",
        "tssstssstssutsss",
        "tssstsustsustsss",
        "tssstssstssutssu",
        "tusstssstssstsss",
        "tssstssutssstsss",
        "tssstssstssstsss"
      ]
    },
    "glow": {
      "rows": [
        "hhhhhhhhhhhhhhhh",
        "hhhhhhhhhhhhhhhh",
        "hhhhhhhhhhhhhhhh",
        "hhhhhhhgghhhhhhh",
        "hhhhhhgggghhhhhh",
        "hhhhhgggggghhhhh",
        "hhhhgggggggghhhh",
        "hhhgggggggggghhh",
        "hhhgggggggggghhh",
        "hhhhgggggggghhhh",
        "hhhhhgggggghhhhh",
        "hhhhhhgggghhhhhh",
        "hhhhhhhgghhhhhhh",
        "hhhhhhhhhhhhhhhh",
        "hhhhhhhhhhhhhhhh",
        "hhhhhhhhhhhhhhhh"
      ],
      "emissive": true
    }
  },
  "parts": [
    {
      "name": "base",
      "color": "#41444a",
      "elements": [
        {
          "from": [
            5,
            0,
            5
          ],
          "to": [
            11,
            1,
            11
          ],
          "faces": {
            "north": {
              "texture": "#metal"
            },
            "south": {
              "texture": "#metal"
            },
            "east": {
              "texture": "#metal"
            },
            "west": {
              "texture": "#metal"
            },
            "up": {
              "texture": "#metal"
            },
            "down": {
              "texture": "#metal"
            }
          }
        }
      ]
    },
    {
      "name": "pole",
      "color": "#7a7f87",
      "pivot": [
        8,
        1,
        8
      ],
      "elements": [
        {
          "from": [
            7.5,
            1,
            7.5
          ],
          "to": [
            8.5,
            5,
            8.5
          ],
          "faces": {
            "north": {
              "texture": "#metal"
            },
            "south": {
              "texture": "#metal"
            },
            "east": {
              "texture": "#metal"
            },
            "west": {
              "texture": "#metal"
            },
            "up": {
              "texture": "#metal"
            },
            "down": {
              "texture": "#metal"
            }
          }
        },
        {
          "from": [
            7.5,
            5,
            7.5
          ],
          "to": [
            8.5,
            9,
            8.5
          ],
          "faces": {
            "north": {
              "texture": "#metal"
            },
            "south": {
              "texture": "#metal"
            },
            "east": {
              "texture": "#metal"
            },
            "west": {
              "texture": "#metal"
            },
            "up": {
              "texture": "#metal"
            },
            "down": {
              "texture": "#metal"
            }
          }
        }
      ]
    },
    {
      "name": "shade",
      "color": "#d8c79a",
      "pivot": [
        8,
        9,
        8
      ],
      "elements": [
        {
          "from": [
            4,
            9,
            4
          ],
          "to": [
            12,
            14,
            12
          ],
          "faces": {
            "north": {
              "texture": "#shade"
            },
            "south": {
              "texture": "#shade"
            },
            "east": {
              "texture": "#shade"
            },
            "west": {
              "texture": "#shade"
            },
            "up": {
              "texture": "#shade"
            },
            "down": {
              "texture": "#shade"
            }
          }
        }
      ]
    },
    {
      "name": "bulb",
      "color": "#fff2a8",
      "elements": [
        {
          "from": [
            6.5,
            8,
            6.5
          ],
          "to": [
            9.5,
            9,
            9.5
          ],
          "light_emission": 15,
          "faces": {
            "north": {
              "texture": "#glow"
            },
            "south": {
              "texture": "#glow"
            },
            "east": {
              "texture": "#glow"
            },
            "west": {
              "texture": "#glow"
            },
            "down": {
              "texture": "#glow"
            }
          }
        }
      ]
    }
  ]
}
```

## Build steps

1. `mcmodel brief check desk_lamp.prompt.md`
2. `mcmodel scaffold mcmodel-out/desk_lamp --brief desk_lamp.prompt.md`
3. `mcmodel validate mcmodel-out/desk_lamp`
4. `mcmodel preview mcmodel-out/desk_lamp --reference reference.png`
5. `mcmodel score mcmodel-out/desk_lamp --brief desk_lamp.prompt.md`
6. Verify loop (max 4 rounds), then `mcmodel pack mcmodel-out/desk_lamp --out mcmodel-out/desk_lamp_release --zip`.

## Acceptance checklist

- [ ] validate has 0 errors and score passes.
- [ ] Shade is centred on the pole and wider than the base.
- [ ] Bulb is visible from below the shade.
- [ ] Pole is 1 unit thick and reaches from the base to the shade.
- [ ] Element count is within budget.

## Known risks

- Shade depth is assumed equal to its width (the image shows one side).

## Fallbacks

- Over budget: merge the two pole pieces.
- Texture bleed on the pole: switch the metal texture to 32px.
