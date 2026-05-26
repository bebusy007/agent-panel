#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
# AgentPanel 一键打包
# 在当前分支上跑全量检查 + 打 macOS .dmg
# ─────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET=$(rustc -vV | grep host | cut -d' ' -f2)
BRANCH="$(git branch --show-current)"

echo "══════════════════════════════════════════"
echo "  AgentPanel 打包"
echo "  分支: $BRANCH"
echo "  架构: $TARGET"
echo "══════════════════════════════════════════"

# ── 1. 清理 ─────────────────────────────────────────────
echo ""
echo "▸ [1/8] 清理上次产物..."
rm -rf "$ROOT/web/dist"
rm -f "$ROOT/src-tauri/binaries/agent-panel-server-"*
echo "  ✓ 清理完成"

# ── 2. 前端类型检查 ─────────────────────────────────────
echo ""
echo "▸ [2/8] TypeScript 类型检查..."
cd "$ROOT/web"
npx tsc --noEmit
echo "  ✓ 类型检查通过"

# ── 3. 前端测试 + 覆盖率 ────────────────────────────────
echo ""
echo "▸ [3/8] 前端测试 + 覆盖率..."
cd "$ROOT/web"
npx vitest run --coverage
echo "  ✓ 前端测试通过"

# ── 4. Rust 代码检查 ────────────────────────────────────
echo ""
echo "▸ [4/8] Rust 代码检查 (clippy)..."
cd "$ROOT"
cargo clippy -p agent-panel-server --all-targets 2>&1 | tail -5
echo "  ✓ clippy 通过"

# ── 5. 后端测试 + 覆盖率 ────────────────────────────────
echo ""
echo "▸ [5/8] 后端测试 + 覆盖率（要求 ≥90% 行覆盖率）..."
cd "$ROOT"
cargo llvm-cov test -p agent-panel-server \
  --ignore-filename-regex "(main|logging|ws|test_utils)\.rs$" \
  --fail-under-lines 90
echo "  ✓ 后端测试通过，覆盖率达标"

# ── 6. 编译前端 ─────────────────────────────────────────
echo ""
echo "▸ [6/8] 编译前端..."
cd "$ROOT/web"
pnpm build
echo "  ✓ web/dist 就绪"

# ── 7. 编译后端 + 复制侧推 ──────────────────────────────
echo ""
echo "▸ [7/8] 编译后端 (release) + 复制侧推文件..."
cd "$ROOT"
cargo build --release -p agent-panel-server
SIDECAR_SRC="$ROOT/target/release/agent-panel-server"
SIDECAR_DST="$ROOT/src-tauri/binaries/agent-panel-server-$TARGET"
cp "$SIDECAR_SRC" "$SIDECAR_DST"
chmod +x "$SIDECAR_DST"
echo "  ✓ 侧推文件 → $SIDECAR_DST"

# ── 8. Tauri 打包 ───────────────────────────────────────
echo ""
echo "▸ [8/8] Tauri 打包..."
cd "$ROOT"
cargo tauri build 2>&1
echo ""

# ── 完成 ─────────────────────────────────────────────────
DMG=$(find "$ROOT/target" -name "*.dmg" 2>/dev/null | head -1)
if [ -n "$DMG" ]; then
    echo "══════════════════════════════════════════"
    echo "  ✅ 打包完成！"
    echo ""
    echo "  产物: $DMG"
    echo "  大小: $(ls -lh "$DMG" | awk '{print $5}')"
    echo "══════════════════════════════════════════"
else
    echo "  ⚠ 脚本跑完了但没找到 DMG，检查 target/ 目录"
    exit 1
fi
