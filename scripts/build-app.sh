#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
# AgentPanel — one-shot build script with gate checks
# Produces: macOS .dmg (Apple Silicon or Intel)
# ─────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${1:-master}"
TARGET=$(rustc -vV | grep host | cut -d' ' -f2)

echo "══════════════════════════════════════════"
echo "  AgentPanel Build"
echo "  branch: $BRANCH"
echo "  target: $TARGET"
echo "══════════════════════════════════════════"

# ── 0. Checkout & pull ───────────────────────────────────
echo ""
echo "▸ [0/9] Checkout $BRANCH and pull latest..."
cd "$ROOT"
git checkout "$BRANCH"
git pull origin "$BRANCH"
echo "  ✓ on $BRANCH @ $(git rev-parse --short HEAD)"

# ── 1. Clean ─────────────────────────────────────────────
echo ""
echo "▸ [1/9] Cleaning..."
rm -rf "$ROOT/web/dist"
rm -f "$ROOT/src-tauri/binaries/agent-panel-server-"*
echo "  ✓ web/dist and sidecar binaries cleaned"

# ── 2. TypeScript check ─────────────────────────────────
echo ""
echo "▸ [2/9] TypeScript check..."
cd "$ROOT/web"
npx tsc --noEmit
echo "  ✓ typecheck passed"

# ── 3. Frontend tests + coverage ─────────────────────────
echo ""
echo "▸ [3/9] Frontend tests + coverage (≥90% lines)..."
cd "$ROOT/web"
npx vitest run --coverage
echo "  ✓ frontend tests passed, coverage met"

# ── 4. Rust lint ─────────────────────────────────────────
echo ""
echo "▸ [4/9] Rust clippy..."
cd "$ROOT"
cargo clippy -p agent-panel-server --all-targets 2>&1 | tail -5
echo "  ✓ clippy passed"

# ── 5. Rust tests + coverage ────────────────────────────
echo ""
echo "▸ [5/9] Rust tests + coverage (≥90% lines)..."
cd "$ROOT"
cargo llvm-cov test -p agent-panel-server --ignore-filename-regex "(main|logging|ws)\.rs$" --fail-under-lines 90
echo "  ✓ rust tests passed, coverage met"

# ── 6. Build frontend ───────────────────────────────────
echo ""
echo "▸ [6/9] Building frontend..."
cd "$ROOT/web"
npm run build
echo "  ✓ web/dist ready"

# ── 7. Build server + copy sidecar ──────────────────────
echo ""
echo "▸ [7/9] Building server (release) + sidecar..."
cd "$ROOT"
cargo build --release -p agent-panel-server
SIDECAR_SRC="$ROOT/target/release/agent-panel-server"
SIDECAR_DST="$ROOT/src-tauri/binaries/agent-panel-server-$TARGET"
cp "$SIDECAR_SRC" "$SIDECAR_DST"
chmod +x "$SIDECAR_DST"
echo "  ✓ server binary → $SIDECAR_DST"

# ── 8. Tauri build ──────────────────────────────────────
echo ""
echo "▸ [8/9] Building Tauri app..."
cd "$ROOT"
cargo tauri build 2>&1
echo ""

# ── Done ─────────────────────────────────────────────────
DMG_DIR="$ROOT/target/release/bundle/dmg"
if [ -d "$DMG_DIR" ]; then
    echo "══════════════════════════════════════════"
    echo "  ✅ Build complete!"
    echo ""
    echo "  DMG files:"
    ls -lh "$DMG_DIR"/*.dmg 2>/dev/null || echo "  (no .dmg found)"
    echo "══════════════════════════════════════════"
else
    echo "  Build finished. Check target/release/bundle/ for output."
fi
