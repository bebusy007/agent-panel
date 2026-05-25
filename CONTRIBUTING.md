# Contributing to Agent Panel

## 开发环境

### 前置条件

- Node.js 22+
- pnpm 10+
- Rust 1.85+（edition 2024）
- macOS（当前主要平台）

### 安装依赖

```bash
# 前端
cd web && pnpm install

# 后端
cd src-server && cargo build
```

### 本地开发

```bash
# 启动后端（端口 7788）
cd src-server && cargo run

# 启动前端（端口 5173，自动代理 /api 到后端）
cd web && pnpm dev
```

## 代码规范

### 前端

- **格式化**：Prettier（`pnpm format` / `pnpm format:check`）
- **Lint**：ESLint（`pnpm lint` / `pnpm lint:fix`）
- **类型检查**：TypeScript strict mode（`pnpm typecheck`）
- **测试**：Vitest（`pnpm test`）

### 后端

- **格式化**：rustfmt（`cargo fmt` / `cargo fmt --check`）
- **Lint**：clippy（`cargo clippy -- -D warnings`）
- **测试**：cargo test

## Commit 规范

使用 Conventional Commits 格式：

```
type(scope): description
```

类型：
- `feat`：新功能
- `fix`：修复
- `refactor`：重构（不改变功能）
- `docs`：文档
- `test`：测试
- `chore`：构建/工具/依赖
- `ci`：CI/CD

示例：
```
feat(sessions): add session search with filters
fix(api): handle null model in session summary
docs(readme): update installation instructions
test(favorites): add CRUD integration tests
chore(deps): bump react to 18.3.1
```

## PR 流程

1. 从 `master` 创建 feature branch：`feature/xxx`
2. 确保所有检查通过：`pnpm typecheck && pnpm format:check && pnpm lint && pnpm test`
3. 后端检查：`cargo fmt --check && cargo clippy -- -D warnings && cargo test`
4. 提交 PR，使用 PR 模板
5. 等待 CI 通过
6. 请求 review

## 测试

### 前端测试

```bash
cd web && pnpm test           # 运行一次
cd web && pnpm test:watch     # watch 模式
```

测试文件位置：
- 纯逻辑测试：`web/src/lib/__tests__/`
- 组件测试：`web/tests/components/`
- Hook 测试：`web/tests/hooks/`

### 后端测试

```bash
cd src-server && cargo test
```

测试位置：
- 内联单元测试：各模块的 `#[cfg(test)]` 块
- API 集成测试：`src-server/src/router/*_tests.rs`

## 项目结构

```
agent-panel/
├── src-server/              # Rust 后端（Axum HTTP server）
│   ├── src/
│   │   ├── router/          # API 路由
│   │   ├── scanner/         # Session/Skill/MCP 扫描
│   │   ├── search/          # 全文搜索引擎
│   │   ├── models/          # 数据模型
│   │   └── watcher/         # 文件监控
│   └── Cargo.toml
├── web/                     # React 前端
│   ├── src/
│   │   ├── components/      # UI 组件
│   │   ├── pages/           # 页面
│   │   ├── lib/             # 工具函数、hooks、API
│   │   └── types/           # TypeScript 类型（含 ts-rs 生成）
│   └── package.json
├── docs/                    # 文档
├── scripts/                 # 构建脚本
└── .github/                 # GitHub 配置
```
