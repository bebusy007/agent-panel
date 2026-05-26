# 工程优化技术方案

> 对应产品目标见 `product-spec.md`，竞品研究见 `competitor-study.md`，实施计划见 `implementation-plan.md`。

---

## 1. 代码一致性

### 1.1 前端格式化：Prettier

**配置文件**：`web/.prettierrc`

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

**忽略文件**：`web/.prettierignore`（忽略 `dist/`, `node_modules/`, `*.md`）

**npm scripts**（在 `web/package.json`）：
- `format`: `prettier --write "src/**/*.{ts,tsx,css,json}"`
- `format:check`: `prettier --check "src/**/*.{ts,tsx,css,json}"`

### 1.2 后端格式化：rustfmt

**配置文件**：`src-server/rustfmt.toml`

```toml
max_width = 100
tab_spaces = 4
edition = "2024"
use_field_init_shorthand = true
use_try_shorthand = true
```

### 1.3 前端 Lint：ESLint

**方案**：ESLint v9 flat config（`web/eslint.config.js`）

**核心规则**：
- `@typescript-eslint/no-explicit-any`: warn
- `@typescript-eslint/no-unused-vars`: error（ignore `_` 前缀）
- `react-hooks/rules-of-hooks`: error
- `react-hooks/exhaustive-deps`: warn
- `no-console`: warn（允许 `console.warn` 和 `console.error`）

**不引入额外插件**：不加 eslint-plugin-import、eslint-plugin-tailwindcss 等，保持最小配置。

### 1.4 .gitattributes

```
* text=auto eol=lf
*.rs text eol=lf
*.toml text eol=lf
*.ts text eol=lf
*.tsx text eol=lf
*.js text eol=lf
*.jsx text eol=lf
*.json text eol=lf
*.md text eol=lf
*.yml text eol=lf
*.yaml text eol=lf
*.css text eol=lf
*.html text eol=lf
*.sh text eol=lf
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.woff binary
*.woff2 binary
*.ttf binary
*.exe binary
*.dll binary
```

### 1.5 .editorconfig

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.rs]
indent_size = 4

[*.toml]
indent_size = 4
```

### 1.6 格式化迁移策略

格式化现有代码会导致大量文件变更，影响 git blame。处理方式：

1. 在一个独立 commit 中执行格式化（`prettier --write` + `cargo fmt`）
2. 将该 commit hash 写入 `.git-blame-ignore-revs`
3. `git config blame.ignoreRevsFile .git-blame-ignore-revs`

---

## 2. 类型对齐

### 2.1 方案选型

| 方案 | 优点 | 缺点 | 适用 |
|------|------|------|------|
| ts-rs | 编译期生成 `.d.ts`，零运行时开销 | 需要给 Rust 类型加 `#[ts(export)]` 注解 | API 响应类型 |
| zod | 运行时校验，表单验证 | 需要手写 schema | 表单/配置文件 |
| OpenAPI codegen | 标准化，多语言支持 | 配置复杂，需要额外 build step | 微服务（不适用） |

**决策**：API 响应类型用 ts-rs 自动生成，表单/配置用 zod 运行时校验。

### 2.2 ts-rs 集成

**依赖**（在 `src-server/Cargo.toml`）：
```toml
[dependencies]
ts-rs = "10"

[dev-dependencies]
ts-ts = "10"  # 仅在测试时导出类型
```

**标注方式**：
```rust
use ts_rs::TS;

#[derive(Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SessionSummary {
    pub id: String,
    pub source: String,
    pub title: String,
    // ...
}
```

**类型导出**：
- 用 `cargo test` 触发类型导出（ts-rs 的 `#[ts(export)]` 在测试时生成文件）
- 输出到 `web/src/types/generated.ts`
- `.gitignore` 排除 `web/src/types/generated.ts`（它是 build artifact）
- 或者不排除，让它成为可 review 的代码（推荐）

**渐进迁移**：
- Phase 1：只标注核心类型（SessionSummary, Message, StatsResponse, UsageOverview）
- Phase 2：扩展到所有 API 响应类型
- Phase 3：移除 `api.ts` 里的手写 `Rust*` 类型，改用 generated 类型

### 2.3 zod Schema

**位置**：`web/src/lib/schemas/`

**核心 schema**：
- `session.ts`：SessionSummary、Message 验证（用于 API 响应校验）
- `search.ts`：搜索请求参数验证
- `settings.ts`：设置项验证（如果未来有设置页面）

**用法**：
```typescript
import { z } from 'zod';

export const sessionSummarySchema = z.object({
  id: z.string(),
  source: z.enum(['claude-code', 'codex', 'cursor-agent']),
  title: z.string(),
  // ...
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;
```

**API 响应校验**（仅 dev 模式）：
```typescript
// api.ts
const request = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  const data = await res.json();
  if (import.meta.env.DEV && schema) {
    return schema.parse(data); // dev 模式下运行时校验
  }
  return data as T;
};
```

---

## 3. 测试基础设施

### 3.1 测试金字塔

```
        /  E2E  \          ← 暂不做（需要完整 Tauri 运行时）
       / 组件测试 \         ← 新增，覆盖关键页面
      /  hooks/utils \     ← 已有 24 个文件，继续补充
     / 后端集成+单元 \     ← 已有单元测试，新增集成测试
```

### 3.2 后端集成测试

**文件结构**：
```
src-server/tests/
  support.rs          # 共享测试工具
  session_api.rs      # Session API 端到端测试
  search_api.rs       # Search API 测试
  usage_api.rs        # Usage API 测试
  favorites_api.rs    # Favorites API 测试
  resume_api.rs       # Resume API 测试
  watcher_test.rs     # 文件监控测试
```

**support.rs 核心函数**：

```rust
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tempfile::TempDir;

/// 获取隔离的测试 HOME 目录
fn ensure_test_home() -> &'static PathBuf {
    static TEST_HOME: OnceLock<PathBuf> = OnceLock::new();
    TEST_HOME.get_or_init(|| {
        let dir = TempDir::new().unwrap();
        let path = dir.into_path();
        std::env::set_var("HOME", &path);
        // Windows 兼容
        #[cfg(target_os = "windows")]
        std::env::set_var("USERPROFILE", &path);
        path
    })
}

/// 全局互斥锁，序列化共享 HOME 的测试
fn test_mutex() -> &'static Mutex<()> {
    static MUTEX: OnceLock<Mutex<()>> = OnceLock::new();
    MUTEX.get_or_init(|| Mutex::new(()))
}

/// 创建测试用的 AppState
fn create_test_state() -> AppState {
    // 初始化内存数据库 + 测试目录
    AppState::new(/* ... */)
}

/// 重置测试文件系统
fn reset_test_fs() {
    // 清理 .claude, .cursor, .codex 等测试目录
}
```

**测试模式**：
```rust
#[test]
fn test_session_list_and_detail() {
    let _guard = test_mutex().lock();
    reset_test_fs();
    ensure_test_home();

    let state = create_test_state();
    // 1. 创建测试 session 文件
    // 2. 调用 API 列出 sessions
    // 3. 调用 API 获取 session detail
    // 4. 断言返回数据正确
}
```

### 3.3 前端 API Mock 层（MSW Bridge）

**核心思路**：把 Tauri `invoke(command, payload)` 转成 HTTP 请求，用 MSW 拦截。

**文件结构**：
```
web/tests/
  msw/
    tauriMocks.ts     # vi.mock() 替换 Tauri API
    server.ts         # MSW server
    handlers.ts       # 请求 handler（~30 个 Tauri command）
    state.ts          # 内存状态仓库
  setupTests.ts       # 测试 setup
  setupGlobals.ts     # polyfill（ResizeObserver, localStorage）
  components/         # 组件测试
    SessionDetail.test.tsx
    ToolCard.test.tsx
    MessageBlock.test.tsx
    SessionsSidebar.test.tsx
    Dashboard.test.tsx
  hooks/              # hook 测试
    useAsync.test.ts
    useCachedAsync.test.ts
```

**tauriMocks.ts 核心**：
```typescript
import { vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, payload?: unknown) => {
    const res = await fetch(`http://tauri.local/${command}`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    });
    if (!res.ok) throw new Error(`invoke failed: ${command}`);
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
  },
}));

vi.mock('@tauri-apps/api/event', () => {
  const listeners = new Map<string, Set<Function>>();
  return {
    listen: async (event: string, handler: Function) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return () => listeners.get(event)?.delete(handler);
    },
    emit: async (event: string, payload?: unknown) => {
      listeners.get(event)?.forEach(fn => fn({ payload }));
    },
  };
});
```

**state.ts 核心**：
```typescript
// 内存数据库，模拟后端持久化
let sessions: Record<string, SessionSummary> = {};
let messages: Record<string, Message[]> = {};
let favorites: FavoriteItem[] = [];
// ... 更多状态

export function resetState() {
  sessions = { /* 默认 fixture */ };
  messages = {};
  favorites = [];
}

export function addSession(session: SessionSummary) {
  sessions[session.id] = session;
}
// ... 更多 setter
```

**handlers.ts 示例**：
```typescript
import { http, HttpResponse } from 'msw';
import * as state from './state';

export const handlers = [
  http.post('http://tauri.local/get_sessions', () => {
    return HttpResponse.json(state.sessions);
  }),
  http.post('http://tauri.local/get_session_detail', async ({ request }) => {
    const { id } = await request.json() as { id: string };
    return HttpResponse.json({
      summary: state.sessions[id],
      messages: state.messages[id] ?? [],
    });
  }),
  // ... 更多 handlers
];
```

### 3.4 组件测试模式

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionDetail } from '@/components/session/SessionDetail';
import { resetState, addSession, addMessages } from '../msw/state';

function renderWithQuery(ui: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('SessionDetail', () => {
  beforeEach(() => resetState());

  it('renders messages correctly', async () => {
    addSession({ id: 'test-1', source: 'claude-code', title: 'Test', /* ... */ });
    addMessages('test-1', [
      { id: 'm1', role: 'user', text: 'Hello' },
      { id: 'm2', role: 'assistant', text: 'Hi there' },
    ]);

    renderWithQuery(<SessionDetail sessionId="test-1" />);

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
      expect(screen.getByText('Hi there')).toBeInTheDocument();
    });
  });

  it('renders tool cards for tool_use messages', async () => {
    addMessages('test-1', [
      { id: 't1', role: 'tool_use', tool_name: 'Read', tool_input: { file_path: '/test.ts' } },
    ]);

    renderWithQuery(<SessionDetail sessionId="test-1" />);

    await waitFor(() => {
      expect(screen.getByText('Read')).toBeInTheDocument();
      expect(screen.getByText('/test.ts')).toBeInTheDocument();
    });
  });
});
```

### 3.5 Coverage 配置

**后端**（已有）：`cargo llvm-cov`，90% 行覆盖率阈值。

**前端**（在 `web/vite.config.ts`）：
```typescript
test: {
  coverage: {
    provider: 'v8',
    reporter: ['text', 'lcov'],
    include: ['src/**/*.{ts,tsx}'],
    exclude: ['src/**/*.test.{ts,tsx}', 'src/types/generated.ts'],
  },
}
```

---

## 4. 错误处理

### 4.1 错误码体系

**文件**：`src-server/src/error_codes.rs`

```rust
/// 错误码前缀定义
/// 格式：{PREFIX}-{NNN}: {message}
///
/// SCAN-*  扫描相关
/// LOAD-*  数据加载相关
/// WS-*    WebSocket 相关
/// FAV-*   收藏相关
/// SRCH-*  搜索相关
/// USG-*   用量分析相关
/// FILE-*  文件操作相关

pub struct ErrorCode;

impl ErrorCode {
    // Session 扫描
    pub const SCAN_001: &'static str = "SCAN-001";  // JSONL 解析失败
    pub const SCAN_002: &'static str = "SCAN-002";  // 项目目录不可读
    pub const SCAN_003: &'static str = "SCAN-003";  // 缓存文件损坏

    // 数据加载
    pub const LOAD_001: &'static str = "LOAD-001";  // Session 文件不存在
    pub const LOAD_002: &'static str = "LOAD-002";  // 消息解析失败
    pub const LOAD_003: &'static str = "LOAD-003";  // Subagent 文件不存在

    // WebSocket
    pub const WS_001: &'static str = "WS-001";      // 连接建立失败
    pub const WS_002: &'static str = "WS-002";      // 消息发送失败
    pub const WS_003: &'static str = "WS-003";      // 连接意外断开

    // 搜索
    pub const SRCH_001: &'static str = "SRCH-001";  // 搜索索引损坏
    pub const SRCH_002: &'static str = "SRCH-002";  // mmap 映射失败

    // 文件操作
    pub const FILE_001: &'static str = "FILE-001";  // 软删除失败
    pub const FILE_002: &'static str = "FILE-002";  // 恢复失败
    pub const FILE_003: &'static str = "FILE-003";  // 永久删除安全检查失败

    // 收藏
    pub const FAV_001: &'static str = "FAV-001";    // 收藏文件写入失败
    pub const FAV_002: &'static str = "FAV-002";    // 收藏文件读取失败

    // 用量
    pub const USG_001: &'static str = "USG-001";    // JSONL 扫描中断
    pub const USG_002: &'static str = "USG-002";    // Token 计算异常
}
```

**使用方式**：
```rust
tracing::error!(code = ErrorCode::SCAN_001, path = %path, "failed to parse JSONL");
// 输出：ERROR scan_001 path=/xxx/yyy.jsonl "failed to parse JSONL"
```

**日志格式**：tracing 的 structured logging，`code` 作为 field 直接输出到 JSON 日志。排查时 `grep "SCAN-001" logs/agent-panel.*.log`。

### 4.2 Panic Hook

**文件**：`src-server/src/panic_hook.rs`

```rust
use std::backtrace::Backtrace;
use std::io::Write;

pub fn install(log_dir: &std::path::Path) {
    let log_path = log_dir.join("crash.log");

    std::panic::set_hook(Box::new(move |info| {
        let backtrace = Backtrace::force_capture();
        let thread = std::thread::current();
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");

        let mut msg = format!("=== Crash Report ===\n");
        msg.push_str(&format!("Timestamp: {}\n", timestamp));
        msg.push_str(&format!("OS: {} {}\n", std::env::consts::OS, std::env::consts::ARCH));
        msg.push_str(&format!("Thread: {:?}\n", thread.name()));
        msg.push_str(&format!("Panic: {}\n", info));
        msg.push_str(&format!("Backtrace:\n{:?}\n", backtrace));

        // 写入 crash.log（追加模式）
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true).append(true).open(&log_path)
        {
            let _ = writeln!(f, "{}", msg);
        }

        // 同时输出到 stderr
        eprintln!("{}", msg);
    }));
}
```

**调用时机**：`main.rs` 的 `main()` 函数开头，在 tracing 初始化之后。

### 4.3 运行时日志级别切换

**方案**：使用 tracing 的 `reload::Layer` 实现运行时调级。

**修改** `src-server/src/logging.rs`：

```rust
use tracing_subscriber::reload;

pub type Handle = reload::Handle<EnvFilter, Registry>;

/// 初始化日志系统，返回 reload handle
pub fn init() -> Handle {
    let (filter, reload_handle) = reload::Layer::new(EnvFilter::from_default_env());
    // ... 注册 subscriber
    reload_handle
}
```

**新增 API**：`GET /api/log-level` + `POST /api/log-level`

```rust
// GET /api/log-level → { level: "info" }
// POST /api/log-level { level: "debug" } → 立即生效
```

**前端**：Settings 页面加日志级别下拉框（error/warn/info/debug/trace）。

---

## 5. Pre-commit Hook

### 5.1 方案：lefthook

**配置文件**：`lefthook.yml`

```yaml
pre-commit:
  parallel: true
  commands:
    frontend-fmt:
      glob: "web/**/*.{ts,tsx,css,json}"
      run: cd web && npx prettier --write {staged_files} && git add {staged_files}
    frontend-lint:
      glob: "web/**/*.{ts,tsx}"
      run: cd web && npx eslint --fix {staged_files} && git add {staged_files}
    backend-fmt:
      glob: "src-server/**/*.rs"
      run: cargo fmt
      stage_fixed: true
    backend-clippy:
      glob: "src-server/**/*.rs"
      run: cargo clippy -- -D warnings

pre-push:
  commands:
    typecheck:
      run: cd web && npx tsc --noEmit
    backend-test:
      run: cargo test --manifest-path src-server/Cargo.toml
```

### 5.2 安装方式

```bash
# 全局安装
brew install lefthook

# 或通过 npm（dev dependency）
npm install -D lefthook

# 初始化
lefthook install
```

### 5.3 CI 中的等价检查

pre-commit 是本地检查，CI 中有等价的强制检查（更严格，因为 CI 跑的是 `--check` 模式而不是 `--write`）。

---

## 6. CI/CD

### 6.1 CI Workflow

**文件**：`.github/workflows/ci.yml`

```yaml
name: CI
on:
  pull_request:
    branches: [master]
  push:
    branches: [master]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'pnpm', cache-dependency-path: 'web/pnpm-lock.yaml' }
      - run: cd web && pnpm install --frozen-lockfile
      - run: cd web && pnpm typecheck
      - run: cd web && pnpm format:check
      - run: cd web && pnpm lint
      - run: cd web && pnpm test:unit

  backend:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { components: 'rustfmt,clippy' }
      - uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            src-server/target
          key: cargo-${{ hashFiles('src-server/Cargo.lock') }}
      - run: cd src-server && cargo fmt --check
      - run: cd src-server && cargo clippy -- -D warnings
      - run: cd src-server && cargo test
```

### 6.2 Release Workflow

**文件**：`.github/workflows/release.yml`

触发条件：tag `v*`。构建矩阵：macOS (universal)、Windows (x86_64)、Linux (x86_64 + ARM64)。

详细步骤参考 cc-switch 的 `release.yml`，适配 agent-panel 的项目结构。

### 6.3 Dependabot

**文件**：`.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /web
    schedule:
      interval: weekly
    labels: [dependencies, frontend]
    groups:
      frontend-deps:
        patterns: ["*"]
    commit-message:
      prefix: "chore(deps)"

  - package-ecosystem: cargo
    directory: /src-server
    schedule:
      interval: weekly
    labels: [dependencies, backend]
    groups:
      backend-deps:
        patterns: ["*"]
    commit-message:
      prefix: "chore(deps)"

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: monthly
    labels: [dependencies, actions]
    commit-message:
      prefix: "ci(deps)"
```

### 6.4 PR 模板

**文件**：`.github/pull_request_template.md`

```markdown
## Summary

<!-- 简述改动内容和原因 -->

## Related Issue

<!-- Fixes #xxx -->

## Checklist

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm format:check` 通过
- [ ] `pnpm lint` 通过
- [ ] `cargo clippy` 通过（如有 Rust 改动）
- [ ] 新增/修改的功能有对应测试
- [ ] UI 改动遵循设计系统（如有）
```

---

## 7. 依赖安全

### 7.1 npm audit

在 CI 中加一步：
```yaml
- run: cd web && pnpm audit --audit-level high
```

### 7.2 cargo audit

在 CI 中加一步：
```yaml
- uses: rustsec/audit-check@v2
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
```

---

## 8. CHANGELOG

**文件**：`CHANGELOG.md`

遵循 [Keep a Changelog](https://keepachangelog.com/) 格式 + [Semantic Versioning](https://semver.org/)。

```markdown
# Changelog

## [Unreleased]

### Added
- Prettier + ESLint 前端代码规范
- rustfmt 后端代码规范
- CI/CD workflow（typecheck + format + lint + test）
- ts-rs 自动生成 TypeScript 类型
- MSW Tauri Mock 层
- 后端集成测试（support.rs + API 测试）
- 前端组件测试
- 错误码体系（SCAN-*, LOAD-*, WS-* 等）
- Panic hook → crash.log
- 运行时日志级别切换
- Pre-commit hook（lefthook）
- Dependabot 依赖自动更新
- PR 模板 + Issue 模板
- .gitattributes + .editorconfig
```
