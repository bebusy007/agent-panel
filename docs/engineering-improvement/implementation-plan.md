# 工程优化实施计划

> 本文是落地 coding 的最终 roadmap，按依赖顺序排列，不划分时间。
> 产品目标见 `product-spec.md`，技术方案见 `tech-spec.md`，竞品研究见 `competitor-study.md`。

---

## 执行原则

1. **先基础设施，后业务代码**：工程基座不做完，不开始业务功能
2. **每个 Plan 独立可验证**：完成后必须能通过对应的检查
3. **不混入无关重构**：每个 commit 聚焦单一能力
4. **跨平台兼容**：所有工具选型不依赖特定 OS
5. **格式化单独 commit**：格式化改动放在独立 commit，写入 `.git-blame-ignore-revs`

---

## Plan 1：代码格式化基础设施

**目标**：建立前后端统一的代码格式化规范。

**输入**：现有代码（无格式化配置）

**交付**：
1. `web/.prettierrc` + `web/.prettierignore`
2. `src-server/rustfmt.toml`
3. `web/package.json` 新增 `format` 和 `format:check` scripts
4. `.gitattributes`（LF 换行规则）
5. `.editorconfig`（跨编辑器一致性）
6. 执行 `prettier --write` 格式化前端代码
7. 执行 `cargo fmt` 格式化后端代码
8. 将格式化 commit hash 写入 `.git-blame-ignore-revs`

**验收**：
- `cd web && pnpm format:check` 通过
- `cd src-server && cargo fmt --check` 通过
- `git blame` 正常工作（不受格式化 commit 干扰）

**被依赖**：Plan 4（CI）、Plan 7（pre-commit）

---

## Plan 2：ESLint 前端 Lint

**目标**：建立前端静态分析。

**输入**：Plan 1 完成（格式化后的代码）

**交付**：
1. `web/eslint.config.js`（ESLint v9 flat config）
2. `web/package.json` 新增 `lint` 和 `lint:fix` scripts
3. 修复现有代码中的 lint error（从 warn 开始，不 block 开发）

**验收**：
- `cd web && pnpm lint` 通过（0 error，允许 warn）

**被依赖**：Plan 4（CI）、Plan 7（pre-commit）

**依赖**：Plan 1

---

## Plan 3：后端错误码体系 + Panic Hook

**目标**：建立结构化错误定位能力。

**输入**：现有 `src-server/src/logging.rs` 和 `main.rs`

**交付**：
1. `src-server/src/error_codes.rs`：定义错误码常量（`SCAN-*`, `LOAD-*`, `WS-*`, `SRCH-*`, `FILE-*`, `FAV-*`, `USG-*`）
2. `src-server/src/panic_hook.rs`：panic 时写 `crash.log`（时间戳 + 系统信息 + backtrace）
3. 修改 `main.rs`：在 tracing 初始化后调用 `panic_hook::install()`
4. 在现有关键路径的日志调用中加入 `code` field（`tracing::error!(code = "SCAN-001", ...)`)

**验收**：
- 手动触发 panic（`std::process::abort()`），验证 `crash.log` 生成
- 日志文件中包含 `code` field
- `grep "SCAN-001" logs/agent-panel.*.log` 能定位到对应日志

**被依赖**：Plan 4（CI 可以跑 crash 测试）

**依赖**：无

---

## Plan 4：CI Workflow

**目标**：建立自动化质量门禁。

**输入**：Plan 1（格式化）、Plan 2（lint）、Plan 3（错误码）

**交付**：
1. `.github/workflows/ci.yml`：
   - 前端 job：pnpm install → typecheck → format:check → lint → test:unit
   - 后端 job：cargo fmt --check → cargo clippy -- -D warnings → cargo test
   - 并发组 `ci-${{ github.ref }}`，`cancel-in-progress: true`
2. `.github/pull_request_template.md`
3. `.github/ISSUE_TEMPLATE/`（bug_report.yml, feature_request.yml, question.yml）
4. `.github/dependabot.yml`（npm + Cargo 周更，GitHub Actions 月更）

**验收**：
- 推送代码后 CI 自动运行
- 格式化/lint/test 失败时 CI 红灯
- PR 模板自动填充

**被依赖**：所有后续 Plan

**依赖**：Plan 1, 2, 3

---

## Plan 5：Pre-commit Hook

**目标**：提交前自动检查，减少 CI 失败。

**输入**：Plan 1（格式化）、Plan 2（lint）

**交付**：
1. `lefthook.yml`：
   - pre-commit：prettier --write + eslint --fix + cargo fmt（parallel）
   - pre-push：tsc --noEmit + cargo test
2. `web/package.json` 新增 `lefthook` dev dependency
3. `README.md` 或 `CONTRIBUTING.md` 中添加安装说明

**验收**：
- `lefthook install` 成功
- 提交代码时自动格式化
- push 前自动跑 typecheck 和测试

**被依赖**：无

**依赖**：Plan 1, 2

---

## Plan 6：ts-rs 类型自动生成

**目标**：前后端类型编译期对齐。

**输入**：现有 Rust 类型定义（`src-server/src/models/`）

**交付**：
1. `src-server/Cargo.toml` 新增 `ts-rs` 依赖
2. 给核心类型加 `#[derive(TS)]` + `#[ts(export)]` 注解：
   - `SessionSummary`
   - `Message`
   - `StatsResponse`
   - `UsageOverview`
   - `FavoriteItem`
   - `SearchHit`
   - `SubagentMeta`
   - `ImageMeta`
3. `web/tsconfig.json` 新增 `paths` 指向 generated 类型
4. `src-server/build.rs` 或 `cargo test` 触发类型导出到 `web/src/types/generated.ts`
5. `web/package.json` 新增 `types:generate` script（`cd ../src-server && cargo test export_ts`）

**验收**：
- `cd src-server && cargo test export_ts` 生成 `web/src/types/generated.ts`
- `cd web && pnpm typecheck` 通过
- 修改 Rust 类型后，前端 typecheck 报错（验证对齐生效）

**被依赖**：Plan 8（组件测试依赖类型）

**依赖**：无

---

## Plan 7：zod Schema（表单/配置校验）

**目标**：关键 API 响应的运行时校验。

**输入**：Plan 6（ts-rs 生成的基础类型）

**交付**：
1. `web/src/lib/schemas/session.ts`：SessionSummary、Message schema
2. `web/src/lib/schemas/search.ts`：搜索请求/响应 schema
3. 修改 `web/src/lib/api.ts` 的 `request<T>()`：dev 模式下用 zod 校验
4. 定义 zod schema 时复用 ts-rs 生成的类型作为 `z.infer` 基础

**验收**：
- dev 模式下，API 返回不符合 schema 时控制台报错
- 生产模式无性能影响

**被依赖**：无

**依赖**：Plan 6

---

## Plan 8：MSW Tauri Mock 层

**目标**：前端组件测试的基础设施。

**输入**：现有 `web/src/lib/api.ts`（Tauri invoke 调用）

**交付**：
1. `web/tests/msw/tauriMocks.ts`：vi.mock 替换 `@tauri-apps/api/core` 和 `@tauri-apps/api/event`
2. `web/tests/msw/server.ts`：MSW server
3. `web/tests/msw/handlers.ts`：~15 个核心 Tauri command 的 handler（sessions, search, stats, usage, favorites, extensions, mcps, skills, resume, logs, trash）
4. `web/tests/msw/state.ts`：内存状态仓库 + `resetState()` + fixture 数据
5. `web/tests/setupGlobals.ts`：ResizeObserver + localStorage polyfill
6. `web/tests/setupTests.ts`：MSW lifecycle hooks（beforeAll/afterEach/afterAll）+ i18n setup
7. `web/vite.config.ts` 新增 `test.setupFiles`

**验收**：
- `pnpm test:unit` 通过（现有 24 个测试不受影响）
- 新增一个组件测试验证 MSW mock 工作正常

**被依赖**：Plan 9（组件测试）、Plan 10（hook 测试）

**依赖**：无

---

## Plan 9：前端组件测试

**目标**：覆盖关键页面组件。

**输入**：Plan 8（MSW Mock 层）

**交付**：
1. `web/tests/components/SessionDetail.test.tsx`：
   - 渲染 user/assistant 消息
   - 渲染 tool_use 卡片（Read/Edit/Bash）
   - tool_use/tool_result 配对
   - Turn 侧边栏导航
   - 搜索高亮
2. `web/tests/components/ToolCard.test.tsx`：
   - 各工具类型分发到正确卡片
   - 折叠/展开
   - Pretty/Raw 切换
   - 状态 badge 显示
3. `web/tests/components/MessageBlock.test.tsx`：
   - 角色着色
   - XML 标签检测和渲染
   - 长消息折叠
   - 图片缩略图
4. `web/tests/components/SessionsSidebar.test.tsx`：
   - 项目文件夹树
   - 搜索过滤
   - Source 过滤
5. `web/tests/components/Dashboard.test.tsx`：
   - Stats card 渲染
   - 热力图
   - 最近 session 列表

**验收**：
- 新增组件测试全部通过
- 覆盖率报告包含 `src/components/` 目录

**被依赖**：无

**依赖**：Plan 8

---

## Plan 10：前端 Hook 测试

**目标**：覆盖核心自定义 hooks。

**输入**：Plan 8（MSW Mock 层）

**交付**：
1. `web/tests/hooks/useAsync.test.ts`：异步加载、取消、错误处理
2. `web/tests/hooks/useCachedAsync.test.ts`：缓存命中、失效、重新验证
3. `web/tests/hooks/useDebounced.test.ts`：防抖行为

**验收**：
- 新增 hook 测试全部通过

**被依赖**：无

**依赖**：Plan 8

---

## Plan 11：后端集成测试基座

**目标**：建立后端端到端测试能力。

**输入**：现有 `src-server/src/` 代码

**交付**：
1. `src-server/tests/support.rs`：
   - `ensure_test_home()`：隔离临时 HOME 目录
   - `test_mutex()`：全局互斥锁
   - `reset_test_fs()`：清理测试文件系统
   - `create_test_state()`：创建测试 AppState
   - `create_test_session_file()`：创建测试 JSONL 文件
2. `src-server/Cargo.toml` 新增 dev-dependencies：`tempfile`（已有）、`axum-test`

**验收**：
- `cargo test --test support` 通过（验证工具函数可用）
- `ensure_test_home()` 创建的目录在测试结束后自动清理

**被依赖**：Plan 12

**依赖**：无

---

## Plan 12：后端 API 集成测试

**目标**：覆盖核心 API 端到端流程。

**输入**：Plan 11（测试基座）

**交付**：
1. `src-server/tests/session_api.rs`：
   - 列出 sessions（空数据、有数据、按 source 过滤）
   - 获取 session detail（消息 + subagent + resume hints）
   - 搜索 sessions（全文搜索、过滤条件）
   - 软删除 + 恢复 + 永久删除
   - 刷新 session 列表
2. `src-server/tests/search_api.rs`：
   - 全局消息搜索（query + filters）
   - 分页
   - 空结果
3. `src-server/tests/usage_api.rs`：
   - 用量概览（不同 source、不同时间范围）
   - 活跃天数、连续天数计算
4. `src-server/tests/favorites_api.rs`：
   - 添加/删除收藏
   - 按 session 获取收藏
5. `src-server/tests/resume_api.rs`：
   - copy 模式返回命令提示
   - 无效 session ID 处理

**验收**：
- 所有集成测试通过
- 测试之间互相隔离（互不干扰）
- 测试不写入真实 HOME 目录

**被依赖**：无

**依赖**：Plan 11

---

## Plan 13：Release Workflow

**目标**：tag 驱动的多平台构建和发布。

**输入**：Plan 4（CI workflow 已就绪）

**交付**：
1. `.github/workflows/release.yml`：
   - 触发条件：tag `v*`
   - 构建矩阵：macOS (universal)、Windows (x86_64)、Linux (x86_64 + ARM64)
   - macOS：Tauri build + 代码签名 + 公证 + DMG
   - Windows：Tauri build + MSI + portable ZIP
   - Linux：Tauri build + AppImage + DEB + RPM
   - 自动发布 GitHub Release
   - 生成 `latest.json` 供 Tauri 自动更新
2. `src-tauri/tauri.conf.json` 配置自动更新端点

**验收**：
- 推送 `v*` tag 后自动触发构建
- 各平台产物正确生成
- GitHub Release 自动创建

**被依赖**：无

**依赖**：Plan 4

---

## Plan 14：运行时日志级别切换

**目标**：不重启服务即可调整日志级别。

**输入**：现有 `src-server/src/logging.rs`

**交付**：
1. 修改 `logging.rs`：使用 `tracing_subscriber::reload::Layer` 包装 `EnvFilter`
2. 新增 API：`GET /api/log-level` + `POST /api/log-level`
3. `web/src/pages/SettingsView.tsx`：新增日志级别下拉框

**验收**：
- `POST /api/log-level { level: "debug" }` 后日志立即变为 debug 级别
- `GET /api/log-level` 返回当前级别

**被依赖**：无

**依赖**：无

---

## Plan 15：CHANGELOG + 贡献指南

**目标**：规范版本记录和贡献流程。

**输入**：所有前置 Plan 完成

**交付**：
1. `CHANGELOG.md`：记录所有工程优化项（Added 分类）
2. `CONTRIBUTING.md`：开发环境搭建、代码规范、commit 规范、PR 流程
3. 更新 `README.md`：添加开发指南链接

**验收**：
- CHANGELOG 格式符合 Keep a Changelog
- CONTRIBUTING.md 包含完整的本地开发步骤

**被依赖**：无

**依赖**：Plan 1-14

---

## 依赖关系图

```
Plan 1 (格式化)
  ├── Plan 2 (ESLint)
  │     ├── Plan 4 (CI)
  │     │     ├── Plan 5 (pre-commit)
  │     │     ├── Plan 13 (Release)
  │     │     └── Plan 15 (CHANGELOG)
  │     └── Plan 5 (pre-commit)
  └── Plan 4 (CI)

Plan 3 (错误码 + panic hook)
  └── Plan 4 (CI)

Plan 6 (ts-rs)
  └── Plan 7 (zod)

Plan 8 (MSW Mock)
  ├── Plan 9 (组件测试)
  └── Plan 10 (Hook 测试)

Plan 11 (后端测试基座)
  └── Plan 12 (后端 API 测试)

Plan 14 (日志级别切换)
  └── 无依赖，可随时做
```

## 执行顺序（线性化）

以下顺序尊重依赖关系，无依赖的 Plan 可以并行：

```
Phase A（基础设施）:
  1. Plan 1: 代码格式化
  2. Plan 2: ESLint（依赖 1）
  3. Plan 3: 错误码 + panic hook（无依赖，可与 1 并行）
  4. Plan 4: CI workflow（依赖 1, 2, 3）
  5. Plan 5: Pre-commit hook（依赖 1, 2）

Phase B（类型安全）:
  6. Plan 6: ts-rs 类型生成（无依赖，可与 Phase A 并行）
  7. Plan 7: zod schema（依赖 6）

Phase C（测试基座）:
  8. Plan 8: MSW Mock 层（无依赖，可与 Phase A/B 并行）
  9. Plan 11: 后端测试基座（无依赖，可与 8 并行）

Phase D（测试补充）:
  10. Plan 9: 组件测试（依赖 8）
  11. Plan 10: Hook 测试（依赖 8）
  12. Plan 12: 后端 API 测试（依赖 11）

Phase E（运维能力）:
  13. Plan 13: Release workflow（依赖 4）
  14. Plan 14: 日志级别切换（无依赖，可随时做）
  15. Plan 15: CHANGELOG + 贡献指南（依赖所有前置）
```

## 最终交付物清单

| 类别 | 文件 | 来源 Plan |
|------|------|----------|
| 格式化 | `web/.prettierrc`, `web/.prettierignore` | 1 |
| 格式化 | `src-server/rustfmt.toml` | 1 |
| 格式化 | `.gitattributes`, `.editorconfig` | 1 |
| 格式化 | `.git-blame-ignore-revs` | 1 |
| Lint | `web/eslint.config.js` | 2 |
| 错误处理 | `src-server/src/error_codes.rs` | 3 |
| 错误处理 | `src-server/src/panic_hook.rs` | 3 |
| CI | `.github/workflows/ci.yml` | 4 |
| CI | `.github/workflows/release.yml` | 13 |
| CI | `.github/pull_request_template.md` | 4 |
| CI | `.github/ISSUE_TEMPLATE/*.yml` | 4 |
| CI | `.github/dependabot.yml` | 4 |
| Pre-commit | `lefthook.yml` | 5 |
| 类型 | `web/src/types/generated.ts`（ts-rs 生成） | 6 |
| 类型 | `web/src/lib/schemas/*.ts` | 7 |
| 测试 | `web/tests/msw/*.ts` | 8 |
| 测试 | `web/tests/setupGlobals.ts`, `web/tests/setupTests.ts` | 8 |
| 测试 | `web/tests/components/*.test.tsx` | 9 |
| 测试 | `web/tests/hooks/*.test.ts` | 10 |
| 测试 | `src-server/tests/support.rs` | 11 |
| 测试 | `src-server/tests/*.rs` | 12 |
| 日志 | `src-server/src/logging.rs`（修改） | 14 |
| 文档 | `CHANGELOG.md` | 15 |
| 文档 | `CONTRIBUTING.md` | 15 |
