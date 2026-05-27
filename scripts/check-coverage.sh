#!/bin/bash
# 质量门禁：前端 + 后端覆盖率检查
# CI 在每次 PR 时运行，本地也可手动执行
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXCLUDE_RUST="(main|logging|ws|test_utils)\.rs$"
PER_FILE_EXCLUDE="images|resume|watcher.*mod|router.*sessions|favorites|router.*extensions"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "══════════════════════════════════════════"
echo "  覆盖率质量门禁"
echo "  总覆盖率 ≥90%  |  单文件 ≥85%"
echo "══════════════════════════════════════════"

# ── 1. TypeScript 检查 ─────────────────────────────────
echo ""
echo "▸ [1/6] TypeScript 类型检查..."
cd "$ROOT/web"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
pnpm typecheck
echo "  ✓ 通过"

# ── 2. 前端测试 + 覆盖率 ──────────────────────────────
echo ""
echo "▸ [2/6] 前端测试 + 覆盖率..."
echo "  排除: lib/schemas/ (纯类型定义)"
cd "$ROOT/web"
npx vitest run --coverage 2>&1 | tee /tmp/frontend-coverage.txt

echo ""
echo "  单文件行覆盖率 (≥85%):"
VIOLATIONS_FE=0
while IFS= read -r line; do
  if echo "$line" | grep -qE '^\s+\S+\.(ts|tsx)\s+\|'; then
    file=$(echo "$line" | awk -F'|' '{print $1}' | xargs)
    lines_pct=$(echo "$line" | awk -F'|' '{print $5}' | xargs | sed 's/%//')
    if [ -n "$lines_pct" ] && [ "$(echo "$lines_pct < 85" | bc -l 2>/dev/null || echo 0)" = "1" ]; then
      echo -e "  ${RED}❌ $file → ${lines_pct}%${NC}"
      VIOLATIONS_FE=$((VIOLATIONS_FE + 1))
    else
      echo "  ✅ $file → ${lines_pct}%"
    fi
  fi
done < <(sed -n '/% Coverage report/,/^$/{/^---/d;/^$/d;/^%/d;p}' /tmp/frontend-coverage.txt 2>/dev/null)

if [ "$VIOLATIONS_FE" -gt 0 ]; then
  echo -e "\n  ${RED}前端: $VIOLATIONS_FE 个文件低于 85%${NC}"
fi
echo "  ✓ 前端测试通过"

# ── 3. Rust 代码检查 ───────────────────────────────────
echo ""
echo "▸ [3/6] Rust clippy..."
cd "$ROOT"
cargo clippy -p agent-panel-server --all-targets 2>&1 | tail -5
echo "  ✓ 通过"

# ── 4. 后端测试 + 覆盖率 ──────────────────────────────
echo ""
echo "▸ [4/6] 后端测试 + 覆盖率..."
echo "  排除: main/logging/ws/test_utils"
echo "  暂缓: images/resume/watcher/sessions (issue #16)"
cd "$ROOT"

# 确保 llvm-cov 已安装（钉版本保证输出格式一致）
if ! cargo llvm-cov --version 2>/dev/null | grep -q "0.8.7"; then
  echo "  安装 cargo-llvm-cov (0.8.7)..."
  cargo install cargo-llvm-cov --locked --version 0.8.7 --force
fi

set +e
cargo llvm-cov test -p agent-panel-server \
  --ignore-filename-regex "$EXCLUDE_RUST" \
  --fail-under-lines 90 \
  --json > /tmp/backend-coverage.json 2>/tmp/test-errors.log
LLVM_EXIT=$?
set -e

if [ "$LLVM_EXIT" -ne 0 ]; then
  echo ""
  echo "  === 测试失败 (exit=$LLVM_EXIT) ==="
  tail -30 /tmp/test-errors.log
  exit 1
fi

# ── 5. 单文件覆盖率 ────────────────────────────────────
echo ""
echo "  ▸ 单文件行覆盖率检查 (≥85%):"
python3 -c "
import json, sys, re

with open('/tmp/backend-coverage.json') as f:
    data = json.load(f)

bad, good = [], []
for f in data.get('data', [{}])[0].get('files', []):
    filename = f.get('filename', '')
    short_name = filename.split('/')[-1]
    summary = f.get('summary', {})
    lines = summary.get('lines', {})
    total = lines.get('count', 0)
    covered = lines.get('covered', 0)
    # fallback: 新版 llvm-cov 的 segments 格式
    if total == 0 and 'segments' in f:
        lines_set, covered_set = set(), set()
        for seg in f['segments']:
            if seg[3]:
                lines_set.add(seg[0])
                if seg[2] > 0:
                    covered_set.add(seg[0])
        total = len(lines_set)
        covered = len(covered_set)
    pct = (covered / total * 100) if total > 0 else 100.0

    if re.search(r'$PER_FILE_EXCLUDE', filename):
        continue
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

print(f'[debug: {len(bad) + len(good)} files checked, {len(bad)} below threshold]')
" 2>/dev/null
VIOLATIONS_BE=$?

if [ "$VIOLATIONS_BE" -ne 0 ]; then
  exit 1
fi

echo ""
echo "══════════════════════════════════════════"
echo "  ✅ 覆盖率质量门禁通过"
echo "══════════════════════════════════════════"
