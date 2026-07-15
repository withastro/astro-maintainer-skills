#!/usr/bin/env bash
#
# Render a release-graphic SVG to the raster format the astro.build blog expects.
#
# Usage:
#   render.sh <input.svg> <output.(jpg|webp)> <width> <height>
#
# Examples:
#   render.sh /tmp/og-7.2.svg        out/og-astro-7.2.jpg         1200 630
#   render.sh /tmp/blog-post-7.2.svg out/blog-post-astro-7.2.webp 1500 643
#
# The og/social image is JPEG (1200x630); the blog cover image is WebP (1500x643).
# Renders at 2x with headless Chrome for crisp output, then downscales.
set -euo pipefail

IN="$1"; OUT="$2"; W="$3"; H="$4"
EXT="${OUT##*.}"
TMP="$(mktemp -d)"
PNG2X="$TMP/2x.png"
PNG1X="$TMP/1x.png"

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
if [ ! -x "$CHROME" ]; then
  echo "ERROR: Chrome not found at \$CHROME. Set CHROME to your Chrome/Chromium binary." >&2
  exit 1
fi

ABS_IN="$(cd "$(dirname "$IN")" && pwd)/$(basename "$IN")"

"$CHROME" --headless --disable-gpu --force-device-scale-factor=2 --hide-scrollbars \
  --window-size="$W,$H" --screenshot="$PNG2X" "file://$ABS_IN" >/dev/null 2>&1

sips -z "$H" "$W" "$PNG2X" --out "$PNG1X" >/dev/null 2>&1

case "$EXT" in
  jpg|jpeg)
    sips -s format jpeg -s formatOptions 90 "$PNG1X" --out "$OUT" >/dev/null 2>&1
    ;;
  webp)
    if ! command -v cwebp >/dev/null 2>&1; then
      echo "ERROR: cwebp not found. Install with: brew install webp" >&2
      exit 1
    fi
    cwebp -q 90 "$PNG1X" -o "$OUT" >/dev/null 2>&1
    ;;
  *)
    echo "ERROR: unsupported output extension .$EXT (use jpg or webp)" >&2
    exit 1
    ;;
esac

rm -rf "$TMP"
echo "Wrote $OUT ($(sips -g pixelWidth -g pixelHeight "$OUT" | tail -2 | tr -d ' \n'))"
