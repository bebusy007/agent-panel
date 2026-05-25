# 工程化竞品研究：cc-switch 与 OpenCovibe

> 本文是工程优化的技术调研基础。所有结论均来自对两个项目源码的逐文件审查。
> 对应产品目标见 `product-spec.md`，技术方案见 `tech-spec.md`，实施计划见 `implementation-plan.md`。

---

## 1. 研究对象

| 项目 | 定位 | 技术栈 | 仓库 |
|------|------|--------|------|
| cc-switch | AI 编程助手的 API Provider 管理器 | React 18 + Rust/Tauri 2 | github.com/farion1231/cc-switch |
| OpenCovibe | Claude Code CLI 的 GUI 包装器 | Svelte 5 + Rust/Tauri 2 | github.com/TwitterIsGood/OpenCovibe |

两个项目都是 Tauri 2 桌面应用，与 agent-panel 技术栈高度相似（Rust 后端 + JS 前端 + Tauri shell）。

---

## 2. 代码一致性

### cc-switch

**前端格式化**：Prettier v3.6，配置在根目录。`pnpm format` 写入，`pnpm format:check` 检查。CI 里作为独立 job 运行。

**后端格式化**：`rustfmt`，通过 `cargo fmt --check` 在 CI 中强制检查。`rust-toolchain.toml` 指定 Rust 1.95 + rustfmt + clippy 组件。

**换行符**：`.gitattributes` 强制 LF 换行（`.rs`, `.toml`, `.json`, `.md`, `.yml`, `.ts`, `.tsx`, `.js`, `.jsx`, `.html`, `.css`, `.sh`），二进制文件标记为 binary。

**Commit 规范**：CONTRIBUTING.md 强制 Conventional Commits（`feat(provider):`, `fix(tray):`, `docs(readme):`, `ci:`, `chore(deps):`）。

### OpenCovibe

**前端格式化**：使用 SvelteKit 默认配置，没有独立的 Prettier 配置文件。

**后端格式化**：默认 rustfmt，没有 `rustfmt.toml`。

**换行符**：没有 `.gitattributes`。

### 结论

cc-switch 在代码一致性上做得更完整。agent-panel 应该至少做到：Prettier + rustfmt + .gitattributes + .editorconfig。

---

## 3. 类型对齐

### cc-switch

**方案：手写 + zod 运行时校验**。

前端 `src/lib/schemas/` 有 4 个 zod schema 文件：
- `common.ts`：JSON/TOML 配置验证，用 `superRefine` 做自定义校验
- `mcp.ts`：MCP 服务器验证，条件校验（stdio 要 command，http 要 url）
- `provider.ts`：Provider 表单验证
- `settings.ts`：设置项验证

所有 schema 用 `z.infer<typeof schema>` 推导 TypeScript 类型，保持运行时校验和静态类型同步。

后端 Rust 类型用 `serde` 序列化，前端用 zod 反序列化——两边各自定义，通过 zod 在运行时对齐。

**没有使用 ts-rs 或 typeshare 等自动类型生成工具。**

### OpenCovibe

**方案：纯手写，无校验**。

前端 `src/lib/types.ts` 是一个 1500+ 行的类型定义文件，手写所有接口。没有 zod 校验，没有自动类型生成。

### 结论

cc-switch 的 zod 方案适合表单验证和配置文件校验，但对于 API 响应类型，更好的方案是 ts-rs 自动生成 TypeScript 类型，实现编译期对齐。agent-panel 应该用 ts-rs 做 API 类型自动同步，用 zod 做表单/配置验证。

---

## 4. 测试基础设施

### cc-switch 前端测试

**框架**：Vitest v2 + jsdom + @testing-library/react v16 + MSW v2.11

**测试文件**：42 个（19 组件 + 12 hooks + 6 config + 2 integration + 3 utils）

**Tauri IPC Mock（MSW Bridge 模式）**：

这是 cc-switch 测试架构最值得学习的设计。核心思路：

1. `tests/msw/tauriMocks.ts` 用 `vi.mock()` 替换 `@tauri-apps/api/core` 的 `invoke` 函数
2. 替换后的 `invoke(command, payload)` 实际执行 `fetch("http://tauri.local/${command}", { method: "POST", body: JSON.stringify(payload) })`
3. MSW 拦截这些 HTTP 请求，返回内存状态
4. `tests/msw/state.ts` 提供 440 行的内存数据库，模拟后端持久化
5. 每个测试 `afterEach` 重置状态（`resetProviderState()` + `server.resetHandlers()` + `vi.clearAllMocks()`）

这个模式的好处：
- 测试走的是真实 API 层代码（invoke wrapper → fetch → MSW handler → state mutation）
- 状态有持久性（在一个测试里 add provider，后面能查回来）
- 可以用 `server.use()` 临时覆盖 handler 测错误场景
- 可以用 `emitTauriEvent()` 测 Tauri 事件驱动的 UI 更新

**组件测试模式**：
- Mock Radix UI 原子组件（Dialog, Checkbox, Tabs 等）为简单 HTML 包装
- `vi.hoisted()` 处理 mock 引用的提升问题
- 本地 `renderForm()` / `renderWithQueryClient()` 辅助函数
- QueryClient 包装，`retry: false`
- `fireEvent` 模拟用户交互
- `waitFor` 等待异步状态变化

**Hook 测试模式**：
- `renderHook` + `act`
- `createXxxMock()` 工厂函数
- `createWrapper()` 创建 QueryClient 包装

### cc-switch 后端测试

**集成测试**：11 个文件在 `src-tauri/tests/`：
- `support.rs`：共享测试工具（`ensure_test_home()`, `reset_test_fs()`, `test_mutex()`, `create_test_state()`）
- 其余 10 个文件覆盖 provider 切换、MCP 管理、导入导出、proxy 配置、skill 同步、deep link 解析等

**关键设计**：
- `Database::memory()`：内存 SQLite，完整 schema + 数据种子，零磁盘 I/O
- `test_mutex()`：全局互斥锁，序列化共享 HOME 目录的测试
- `ensure_test_home()`：隔离的临时 HOME 目录，重定向所有文件 I/O
- `test-hooks` Cargo feature：暴露 `_test_hook` 函数绕过 Tauri `State<>` 注入
- Schema migration 测试：保存历史 schema SQL 快照，验证迁移链的数据完整性

**单元测试**：350+ 个 `#[cfg(test)]` 测试，覆盖 proxy 模块（300+）、配置解析、数据库 DAO 等。

### OpenCovibe 测试

**前端**：Vitest，测试数量少于 cc-switch。

**后端**：标准 Rust 测试，没有 cc-switch 那样的 `support.rs` 基础设施。

### 结论

cc-switch 的测试基础设施是最成熟的。agent-panel 应该：
1. 搭建 MSW Tauri Mock 层（最关键）
2. 建立后端 `tests/support.rs` + `Database::memory()` 模式
3. 补充组件测试和集成测试

---

## 5. 错误处理

### cc-switch

**统一错误类型**：`AppError` 枚举（thiserror），包含 `Localized { key, zh, en }` 双语变体。

**错误码体系**：`src-tauri/src/proxy/log_codes.rs` 定义结构化前缀码：
- `CB-*`：Circuit Breaker 事件（6 个）
- `SRV-*`：Server 生命周期（6 个）
- `FWD-*`：Forwarder/retry 事件（3 个）
- `FO-*`：Failover 事件（5 个）
- `RSP-*`：Response 处理错误（5 个）
- `USG-*`：Usage 日志错误（2 个）

日志中直接使用：`log::warn!("CB-001: circuit opened for provider {}", id)`。排查问题时 `grep "CB-001"` 即可。

**Crash 捕获**：`panic_hook.rs` 写 `crash.log`，包含时间戳、系统信息、panic 消息、源码位置、完整 backtrace。自动设置 `RUST_BACKTRACE=1`。

**请求级日志**：`proxy_request_logs` SQLite 表，记录每次 API 请求的 token 用量、费用、延迟、状态码。

### OpenCovibe

**统一错误类型**：`AppError` 枚举，类似 cc-switch 但没有双语支持。

**没有错误码体系**，没有 crash hook，没有结构化请求日志。

### 结论

agent-panel 应该：
1. 丰富现有 `AppError`，加 `Localized` 双语变体
2. 建立错误码体系（`SCAN-*`, `WS-*`, `LOAD-*` 等前缀码）
3. 加 panic_hook → crash.log
4. 加请求级日志（WebSocket 连接、session 加载等关键操作）

---

## 6. CI/CD

### cc-switch

**4 个 GitHub Actions Workflow**：

1. **ci.yml**（PR/push 触发）：
   - 前端 job：pnpm install → `pnpm typecheck` → `pnpm format:check` → `pnpm test:unit`
   - 后端 job：Rust setup → `cargo fmt --check` → `cargo clippy -- -D warnings` → `cargo test`
   - 并发组 `ci-${{ github.ref }}`，`cancel-in-progress: true`

2. **release.yml**（tag `v*` 触发）：
   - 4 平台矩阵：Windows 2022, Ubuntu 22.04 (x86 + ARM), macOS 14
   - macOS：universal binary + Apple 签名 + 公证 + DMG + 重试逻辑
   - Windows：MSI + portable ZIP
   - Linux：AppImage + DEB + RPM
   - 自动发布 GitHub Release + 生成 `latest.json` 供自动更新

3. **claude.yml**：Claude Opus 4.7 AI Code Review（`@claude` 触发，只读模式）

4. **stale.yml**：60 天标记 + 14 天关闭不活跃 issue

**Dependabot**：npm + Cargo 周更，GitHub Actions 月更，分组 PR。

### OpenCovibe

没有 CI/CD 配置文件。

### 结论

cc-switch 的 CI/CD 是生产级的。agent-panel 应该：
1. 建立 ci.yml（前后端并行检查）
2. 建立 release.yml（多平台构建）
3. 配置 Dependabot（如果推到 GitHub）

---

## 7. 日志系统

### agent-panel（现有）

**最强的日志系统**：
- tracing + tracing-subscriber（结构化 JSON）
- 日轮转，14 天保留 + 错误 30 天保留
- 前端 POST /logs 收集
- LogsView UI（文件选择 + 小时过滤）

### cc-switch

- tauri_plugin_log（纯文本）
- 启动时删除旧文件，单文件最大 1GB
- 运行时调级（前端 UI 控制）
- Crash 日志（panic_hook）
- 结构化错误码

### OpenCovibe

- env_logger（stderr only，纯文本）
- 前端 debug ring buffer（`dbg(tag, ...args)`，2000 条，按 tag 过滤，可导出 clipboard）

### 结论

agent-panel 的日志系统已经是最强的。需要补充：
1. panic_hook → crash.log（抄 cc-switch）
2. 运行时日志级别切换（抄 cc-switch，用 tracing reload layer）
3. 前端 debug ring buffer（抄 OpenCovibe 的 dbg 模式）

---

## 8. Pre-commit 与开发体验

### cc-switch

没有 pre-commit hook。靠 CI 兜底。CONTRIBUTING.md 有详细的 commit 规范和代码风格指南。

### OpenCovibe

没有 pre-commit hook。

### 结论

两个项目都没有 pre-commit。agent-panel 可以用 lefthook 做 pre-commit，在提交前自动跑 prettier + rustfmt + typecheck。

---

## 9. 依赖管理

### cc-switch

- Dependabot：npm + Cargo 周更，GitHub Actions 月更
- 分组 PR：前端依赖合一个 PR，后端依赖合一个 PR
- `chore(deps)` commit 前缀

### OpenCovibe

没有自动化依赖管理。

### 结论

agent-panel 应该配置 Dependabot（如果推到 GitHub）或 Renovate。

---

## 10. 总结：cc-switch vs OpenCovibe vs agent-panel

| 维度 | cc-switch | OpenCovibe | agent-panel 现状 | agent-panel 目标 |
|------|-----------|------------|-----------------|-----------------|
| 前端格式化 | Prettier ✅ | ❌ | ❌ | Prettier ✅ |
| 后端格式化 | rustfmt ✅ | 默认 | 默认 | rustfmt.toml ✅ |
| Lint | clippy ✅ | clippy ✅ | clippy ✅ | ESLint + clippy ✅ |
| .gitattributes | ✅ | ❌ | ❌ | ✅ |
| 类型对齐 | zod 运行时 | 手写 | 手写 | ts-rs 编译期 + zod 运行时 |
| 前端组件测试 | 19 个文件 ✅ | 少量 | ❌ | 覆盖核心组件 |
| 前端 hook 测试 | 12 个文件 ✅ | ❌ | ❌ | 覆盖核心 hooks |
| 后端集成测试 | 11 个文件 ✅ | ❌ | ❌ | support.rs + 集成测试 |
| API Mock 层 | MSW Bridge ✅ | ❌ | ❌ | MSW Bridge ✅ |
| 错误码体系 | ✅ 前缀码 | ❌ | ❌ | ✅ 前缀码 |
| Crash 日志 | ✅ panic_hook | ❌ | ❌ | ✅ panic_hook |
| CI | 4 workflow ✅ | ❌ | ❌ | ci + release |
| Pre-commit | ❌ | ❌ | ❌ | lefthook ✅ |
| Dependabot | ✅ | ❌ | ❌ | ✅ |
| 日志系统 | tauri_plugin_log | env_logger | tracing（最强）| tracing + 增强 |
| 运行时调级 | ✅ UI 控制 | ❌ | ❌ | ✅ tracing reload |
| 前端 debug | console.* | dbg ring buffer | POST /logs | POST /logs + ring buffer |
