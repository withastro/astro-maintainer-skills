#!/usr/bin/env python3
"""
Replace the version number in an Astro release-graphic SVG.

The version number in these templates is NOT editable text — it is baked into a
single vector `<path>` (outlined glyphs). This script regenerates the outline for a
new version string using Astro's "Obviously" brand font, positions it to match the
template, horizontally centers it, and splices it back into the SVG. Everything else
(background, gradients, drop-shadow filters, grain) is left untouched.

Usage:
    python3 set-version.py <input.svg> <output.svg> <version>

Example:
    python3 set-version.py assets/og-template.svg /tmp/og-7.2.svg 7.2

Dependencies:
    pip3 install fonttools uharfbuzz brotli

The Obviously brand font is bundled alongside this script at
../assets/Obviously.woff2.
"""

import os
import re
import sys

# --- Layout constants -------------------------------------------------------
# These describe how the "Obviously" glyphs (unitsPerEm=1000, weight axis wght=475
# "Semibold") map into the template's user space. They were derived by fitting the
# original "6" glyph to its known position in the template and hold for both the
# og (1200x630) and blog-post (1500x643) templates, which share the same text scale.
WGHT = 475
SCALE_X = 0.36355419847328246   # font units -> svg units (x)
SCALE_Y = -0.3634683870967742   # font units -> svg units (y), flipped (svg y is down)
BASELINE_Y = 463.8573793548387  # svg y of the font baseline (y_font = 0)

FONT_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "Obviously.woff2")

# The version text lives in the single group whose filter id starts with this marker.
FILTER_MARKER = "filter3_ddddddd_"


def get_font_path():
    path = os.path.abspath(FONT_PATH)
    if not os.path.exists(path):
        print(f"ERROR: bundled font not found at {path}", file=sys.stderr)
        sys.exit(1)
    return path


def build_version_path(version, font_path, center_x):
    """Return an SVG path `d` string for `version`, centered horizontally on center_x."""
    from io import BytesIO
    import uharfbuzz as hb
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.pens.boundsPen import ControlBoundsPen

    # HarfBuzz cannot read woff2 directly (it does not do the brotli
    # decompression), so it would map every character to .notdef. Decompress the
    # font to an in-memory sfnt (TTF) first and hand HarfBuzz those bytes.
    sfnt = BytesIO()
    ttf = TTFont(font_path)
    ttf.flavor = None
    ttf.save(sfnt)
    face = hb.Face(sfnt.getvalue())

    def shape(text):
        f = hb.Font(face)
        f.set_variations({"wght": WGHT})
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(f, buf)
        return [(i.codepoint, p.x_advance, p.x_offset, p.y_offset)
                for i, p in zip(buf.glyph_infos, buf.glyph_positions)]

    ft = TTFont(font_path)
    inst = instantiateVariableFont(ft, {"wght": WGHT})
    glyph_set = inst.getGlyphSet()
    glyph_order = inst.getGlyphOrder()

    def render(base_x):
        pen_x = 0
        parts = []
        bounds = ControlBoundsPen(glyph_set)
        for gid, xadv, xoff, yoff in shape(version):
            name = glyph_order[gid]
            e = base_x + SCALE_X * (pen_x + xoff)
            f = BASELINE_Y + SCALE_Y * yoff
            mtx = (SCALE_X, 0, 0, SCALE_Y, e, f)
            svg = SVGPathPen(glyph_set)
            glyph_set[name].draw(TransformPen(svg, mtx))
            cmds = svg.getCommands()
            if cmds:
                parts.append(cmds)
            glyph_set[name].draw(TransformPen(bounds, mtx))
            pen_x += xadv
        return " ".join(parts), bounds.bounds

    # First pass at an arbitrary base, then translate so the bbox is centered.
    _, (xmin, _, xmax, _) = render(0.0)
    delta = center_x - (xmin + xmax) / 2
    d, bbox = render(delta)
    return d, bbox


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    in_path, out_path, version = sys.argv[1], sys.argv[2], sys.argv[3]

    svg = open(in_path).read()

    # Center x = half of the viewBox width.
    m = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg)
    if not m:
        m = re.search(r'width="([\d.]+)"', svg)
        vb_w = float(m.group(1))
    else:
        vb_w = float(m.group(1))
    center_x = vb_w / 2

    # Locate the version-text group and its single <path d="...">.
    marker = svg.find(FILTER_MARKER)
    if marker == -1:
        print(f"ERROR: could not find version group ({FILTER_MARKER}) in {in_path}",
              file=sys.stderr)
        sys.exit(1)
    g_start = svg.rfind("<g", 0, marker)
    g_end = svg.find("</g>", g_start)
    block = svg[g_start:g_end]
    pm = re.search(r'(<path\b[^>]*\bd=")([^"]*)(")', block)
    if not pm:
        print("ERROR: no <path> with d= in version group", file=sys.stderr)
        sys.exit(1)

    font_path = get_font_path()
    new_d, (xmin, ymin, xmax, ymax) = build_version_path(version, font_path, center_x)

    new_block = block[:pm.start(2)] + new_d + block[pm.end(2):]
    new_svg = svg[:g_start] + new_block + svg[g_end:]
    open(out_path, "w").write(new_svg)

    print(f"Wrote {out_path}")
    print(f"  version: {version}")
    print(f"  viewBox width: {vb_w:g}  center_x: {center_x:g}")
    print(f"  glyph bbox: x {xmin:.1f}-{xmax:.1f}  y {ymin:.1f}-{ymax:.1f}")


if __name__ == "__main__":
    main()
