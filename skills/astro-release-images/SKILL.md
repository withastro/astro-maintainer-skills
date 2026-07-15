---
name: astro-release-images
description: >
  Create and convert the release graphics for an Astro minor (or major) release blog post on
  astro.build — the big "X.Y" version-number cover and social/OG images. Use this skill whenever
  the user wants to make release images, "create the 7.2 images", "generate the blog cover for the
  release", "make the OG image for the next Astro release", "update the release graphics", or
  convert those SVGs into the webp/jpg formats the blog uses. Covers both generating the versioned
  SVGs from the templates and rasterizing them.
license: BSD-3-Clause
metadata:
  author: matthewp
  version: "1.0"
---

# Astro Release Images

Every Astro release blog post uses two graphics that show the big version number ("7.2", "6.10",
etc.) on the branded gradient background:

| Role | Final filename | Format | Size | Frontmatter field |
|---|---|---|---|---|
| Blog cover / hero | `blog-post-astro-<version>.webp` | WebP | 1500×643 | `coverImage` |
| Social / OG image | `og-astro-<version>.jpg` | JPG | 1200×630 | `socialImage` |

They live in `src/content/blog/_images/astro-<vvv>/` in the astro.build repo (the directory drops
the dots, e.g. `7.2` → `astro-720`, `6.10` → `astro-6100`).

The version number in these graphics is **not editable text** — it is baked into a single vector
`<path>` of outlined glyphs. This skill regenerates that outline with Astro's brand font
("Obviously", weight 475 "Semibold"), auto-centers it, and splices it back into the template,
leaving the background, gradients, drop shadows, and grain untouched.

## Important: this is a two-phase process — do NOT run it all at once

There are two hard checkpoints. Stop at each one and wait for the user.

1. **Confirm the version number before generating anything.**
2. **After generating the SVGs, stop and have the user visually confirm them before converting** to
   webp/jpg.

Do not skip ahead. The raster conversion is cheap to redo, but you should never hand over final
assets the user hasn't eyeballed.

## Prerequisites

Bundled in this skill's `assets/`:

- `og-template.svg`, `blog-post-template.svg` — the branded templates
- `Obviously.woff2` — Astro's brand font (weight axis 290–475; the graphics use 475)

Tools / packages needed:

- Python 3 with `fonttools`, `uharfbuzz`, `brotli`: `pip3 install fonttools uharfbuzz brotli`
- Headless **Google Chrome** (used by `render.sh` for crisp rendering of the gradients, blur
  filters, and blend modes — librsvg-based renderers can be less faithful). Override the binary
  with the `CHROME` env var if needed.
- `cwebp` for WebP output: `brew install webp`
- `sips` (built into macOS)

## Phase 1 — Confirm the version

Before touching any files, make sure you know the exact version string.

- Ask the user for the version if it wasn't given (e.g. `7.2`, `6.10`, `8.0`).
- Write it exactly as it should appear in the graphic — including a trailing `.0` for majors if
  that's the intent (`8.0`), or two-digit minors (`7.10`).
- Confirm it back to the user before proceeding: *"I'll generate the release images for Astro
  **7.2** — correct?"*

Do not generate the SVGs until the version is confirmed.

## Phase 2 — Generate the SVGs

Run `scripts/set-version.py` once per template. It outputs SVGs with the new, centered version
number.

```bash
cd skills/astro-release-images

python3 scripts/set-version.py assets/og-template.svg        /tmp/og-<version>.svg        <version>
python3 scripts/set-version.py assets/blog-post-template.svg /tmp/blog-post-<version>.svg <version>
```

Example for 7.2:

```bash
python3 scripts/set-version.py assets/og-template.svg        /tmp/og-7.2.svg        7.2
python3 scripts/set-version.py assets/blog-post-template.svg /tmp/blog-post-7.2.svg 7.2
```

The script prints the glyph bounding box; sanity-check that it's horizontally centered (the bbox
center x should equal half the viewBox width — 600 for og, 750 for blog-post).

### STOP — get user confirmation

Render a quick preview so the user can look at it, then **stop and ask the user to confirm the
graphics look correct** before converting. Do not proceed to Phase 3 on your own.

Show them the SVGs directly, or a quick PNG preview, e.g.:

```bash
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless --disable-gpu --window-size=1200,630 \
  --screenshot=/tmp/og-<version>-preview.png "file:///tmp/og-<version>.svg"
```

Wait for explicit approval (e.g. "looks good", "ship it"). If they want changes, adjust and
re-preview.

## Phase 3 — Convert to blog formats

Only after the user approves. `scripts/render.sh` renders at 2× with headless Chrome, downscales,
and writes the final format based on the output extension.

```bash
# og / social  -> JPG 1200x630
scripts/render.sh /tmp/og-<version>.svg        <dir>/og-astro-<version>.jpg         1200 630

# blog cover   -> WebP 1500x643
scripts/render.sh /tmp/blog-post-<version>.svg <dir>/blog-post-astro-<version>.webp 1500 643
```

Place them in the release's image directory in the astro.build repo:

```
src/content/blog/_images/astro-<vvv>/blog-post-astro-<version>.webp
src/content/blog/_images/astro-<vvv>/og-astro-<version>.jpg
```

where `<vvv>` is the version with dots removed (`7.2` → `720`, `6.10` → `6100`).

Reference them in the blog post frontmatter:

```yaml
coverImage: '/src/content/blog/_images/astro-<vvv>/blog-post-astro-<version>.webp'
socialImage: '/src/content/blog/_images/astro-<vvv>/og-astro-<version>.jpg'
```

## Notes & troubleshooting

- **Naming has drifted over releases** (dashes, underscores, `blog-post-cover`, `header`). Follow
  the current 6.x/7.x convention above: `blog-post-astro-<version>.webp` + `og-astro-<version>.jpg`.
- Only these formats are supported for cover/social images by astro.build's `_resolveImage.ts`:
  PNG, JPG/JPEG, WebP. No SVG or AVIF. Both should be pre-optimized (the schema recommends WebP).
- **The version text is outlined, not real text** — you cannot find/replace "7.2" in the SVG; the
  digits are coincidental numbers in path coordinates. Always regenerate with `set-version.py`.
- The font, weight (475), scale, and baseline are pinned as constants in `set-version.py`; both
  templates share the same text scale, so the same constants work for og and blog-post.
- HarfBuzz can't read `.woff2` directly (no brotli decompression), so `set-version.py` decompresses
  the font to an in-memory sfnt before shaping. If you swap in a raw `.ttf`/`.otf` font this still
  works.
- If Chrome isn't at the default macOS path, set `CHROME=/path/to/chrome` before running the
  scripts.
