# Vendored libraries

Copied unchanged so the plugin runs without `npm install`. Pure JavaScript, no native builds.

| Folder | Package | Version | License | Used for |
|---|---|---|---|---|
| `pngjs/` | [pngjs](https://github.com/pngjs/pngjs) (`lib/` only) | 7.0.0 | MIT (`pngjs/LICENSE`) | PNG read/write |
| `jpeg-js/` | [jpeg-js](https://github.com/jpeg-js/jpeg-js) | 0.4.4 | BSD-3-Clause (`jpeg-js/LICENSE`) | JPEG reference images |
| `omggif/` | [omggif](https://github.com/deanm/omggif) | 1.0.10 | MIT (header of `omggif.js`) | GIF previews |

To update: `npm pack <name>@<version>`, extract, replace the files listed above, run `npm test`.
