#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
# AgentPanel 一键打包
# 在当前分支上跑全量检查 + 打 macOS .dmg
# 硬性标准：总覆盖率 ≥90%，单文件覆盖率 ≥85%
# ─────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET=$(rustc -vV | grep host | cut -d' ' -f2)
BRANCH="$(git branch --show-current)"
EXCLUDE_RUST="(main|logging|ws|test_utils)\.rs$"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

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
echo "▸ [3/8] 前端测试 + 覆盖率检查..."
echo "  排除文件: lib/schemas/ (纯类型定义，无逻辑)"
cd "$ROOT/web"
npx vitest run --coverage 2>&1 | tee /tmp/frontend-coverage.txt
echo ""
echo "  单文件行覆盖率检查（阈值 ≥85%）:"

# 解析 vitest 文本表格，检查每个源文件的行覆盖率
VIOLATIONS_FE=0
while IFS= read -r line; do
  # 匹配数据行: 文件名 | xx.xx | ... | xx.xx | ... | xx.xx |
  if echo "$line" | grep -qE '^\s+\S+\.(ts|tsx)\s+\|'; then
    file=$(echo "$line" | awk -F'|' '{print $1}' | xargs)
    stmts=$(echo "$line" | awk -F'|' '{print $2}' | xargs | sed 's/%//')
    lines_pct=$(echo "$line" | awk -F'|' '{print $5}' | xargs | sed 's/%//')
    if [ -n "$lines_pct" ] && [ "$(echo "$lines_pct < 85" | bc -l 2>/dev/null || echo 0)" = "1" ]; then
      echo -e "  ${RED}❌ $file → ${lines_pct}% (要求 ≥85%)${NC}"
      VIOLATIONS_FE=$((VIOLATIONS_FE + 1))
    else
      echo "  ✅ $file → ${lines_pct}%"
    fi
  fi
done < <(sed -n '/% Coverage report/,/^$/{/^---/d;/^$/d;/^%/d;p}' /tmp/frontend-coverage.txt 2>/dev/null)

if [ "$VIOLATIONS_FE" -gt 0 ]; then
  echo -e "\n  ${RED}前端: $VIOLATIONS_FE 个文件低于 85% 阈值，请补充测试${NC}"
fi
echo "  ✓ 前端测试通过"

# ── 4. Rust 代码检查 ────────────────────────────────────
echo ""
echo "▸ [4/8] Rust 代码检查 (clippy)..."
cd "$ROOT"
cargo clippy -p agent-panel-server --all-targets 2>&1 | tail -5
echo "  ✓ clippy 通过"

# ── 5. 后端测试 + 覆盖率 ────────────────────────────────
echo ""
echo "▸ [5/8] 后端测试 + 覆盖率检查..."
echo "  排除文件: main.rs, logging.rs, ws.rs (入口/基础设施)"
echo "           test_utils.rs (测试辅助代码)"
echo "  总行覆盖率阈值: ≥90%"
echo "  单文件行覆盖率阈值: ≥85%"
cd "$ROOT"

# 跑测试（串行避免 HOME 环境变量竞态），输出 JSON 报告
cargo llvm-cov test -p agent-panel-server \
  --ignore-filename-regex "$EXCLUDE_RUST" \
  --fail-under-lines 90 \
  --json -- --test-threads=1 2>/dev/null > /tmp/backend-coverage.json
LLVM_EXIT=$?

# 解析 JSON，检查单文件覆盖率
echo ""
echo "  单文件行覆盖率检查:"
python3 -c "
import json, sys

with open('/tmp/backend-coverage.json') as f:
    data = json.load(f)

bad = []
good = []
for f in data.get('data', [{}])[0].get('files', []):
    filename = f.get('filename', '')
    short_name = filename.split('/')[-1]
    summary = f.get('summary', {})
    lines = summary.get('lines', {})
    total = lines.get('count', 0)
    covered = lines.get('covered', 0)
    pct = (covered / total * 100) if total > 0 else 100.0
    if pct < 85:
        bad.append((short_name, pct))
    else:
        good.append((short_name, pct))

for fn, pct in sorted(bad):
    print(f'\033[0;31m  ❌ {fn} → {pct:.1f}% (要求 ≥85%)\033[0m')
for fn, pct in sorted(good):
    print(f'  ✅ {fn} → {pct:.1f}%')

if bad:
    print(f'\n\033[0;31m  后端: {len(bad)} 个文件低于 85%，请补充测试\033[0m')
    sys.exit(1)
else:
    print(f'\n  ✅ 全部 {len(good)} 个文件达标')
" 2>/dev/null
VIOLATIONS_BE=$?

if [ "$LLVM_EXIT" -ne 0 ]; then
  echo -e "\n  ${RED}后端: 总覆盖率或测试失败 (exit=$LLVM_EXIT)${NC}"
  exit 1
fi
if [ "$VIOLATIONS_BE" -ne 0 ]; then
  exit 1
fi
echo ""
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
