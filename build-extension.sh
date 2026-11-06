#!/usr/bin/env bash
# build-extension.sh
# Builds the Next.js app as a static export and merges it into extension/
# Run from the project root:  chmod +x build-extension.sh && ./build-extension.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$ROOT/dist"
EXT_DIR="$ROOT/extension"

# Files in extension/ that must NEVER be overwritten by Next.js output
PRESERVE=(
  "manifest.json"
  "background.js"
  "content.js"
  "content.css"
  "popup.html"
  "popup.js"
  "generate-icons.html"
  "icon16.svg"
  "icon48.svg"
  "icon128.svg"
)

echo ""
echo "🛡️  Ambient Shield — Extension Builder"
echo "──────────────────────────────────────"

# ── Step 1: Static export ─────────────────────────────────────────────────────
echo ""
echo "[1/3] Building Next.js static export..."
cd "$ROOT"
npm run build
echo "✅ Build complete → dist/"

# ── Step 2: Copy dist/ → extension/ (skip extension-specific files) ───────────
echo ""
echo "[2/3] Copying dist/ → extension/..."

# Build a quick lookup of preserve filenames
declare -A PRESERVE_MAP
for f in "${PRESERVE[@]}"; do
  PRESERVE_MAP["$f"]=1
done

# Walk dist/, copy to extension/ (skip files that must be preserved)
while IFS= read -r -d '' src; do
  rel="${src#$DIST_DIR/}"
  dest="$EXT_DIR/$rel"
  dest_dir="$(dirname "$dest")"

  # Is this file at the root of dist/ (no subdirectory)?
  if [[ "$rel" != */* ]]; then
    filename="$(basename "$rel")"
    if [[ -n "${PRESERVE_MAP[$filename]+_}" ]]; then
      echo "  ⏭  Skipping $filename (extension file)"
      continue
    fi
  fi

  mkdir -p "$dest_dir"
  cp "$src" "$dest"
done < <(find "$DIST_DIR" -type f -print0)

echo "✅ Files copied."

# ── Step 3: Summary ───────────────────────────────────────────────────────────
echo ""
echo "[3/3] Done! Load the extension:"
echo ""
echo "  1. Open Chrome → chrome://extensions"
echo "  2. Enable Developer Mode (top-right toggle)"
echo "  3. Click 'Load unpacked'"
echo "  4. Select: $EXT_DIR"
echo ""
echo "  ⚙  Local AI Setup (Ollama):"
echo "     Ensure Ollama is running with Gemma:"
echo "     OLLAMA_ORIGINS=\"chrome-extension://*\" ollama serve"
echo "     ollama pull gemma3:4b"
echo ""
echo "🛡️  Ambient Shield is ready."
