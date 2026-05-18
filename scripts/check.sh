#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
# AgentPanel — quick gate check (run before PR or merge)
# ─────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "══════════════════════════════════════════"
echo "  AgentPanel Gate Check"
echo "══════════════════════════════════════════"

echo ""
echo "▸ [1/5] TypeScript check..."
cd "$ROOT/web"
npx tsc --noEmit
echo "  ✓ typecheck passed"

echo ""
echo "▸ [2/5] Frontend tests + coverage (≥90% lines)..."
cd "$ROOT/web"
npx vitest run --coverage
echo "  ✓ frontend tests passed"

echo ""
echo "▸ [3/5] Rust clippy..."
cd "$ROOT"
cargo clippy -p agent-panel-server --all-targets 2>&1 | tail -5
echo "  ✓ clippy passed"

echo ""
echo "▸ [4/5] Rust tests + coverage (≥90% lines)..."
cd "$ROOT"
cargo llvm-cov test -p agent-panel-server --ignore-filename-regex "(main|logging|ws)\.rs$" --fail-under-lines 90
echo "  ✓ rust tests passed"

echo ""
echo "▸ [5/5] Rust build check..."
cd "$ROOT"
cargo build
echo "  ✓ build check passed"

echo ""
echo "══════════════════════════════════════════"
echo "  ✅ All checks passed"
echo "══════════════════════════════════════════"
