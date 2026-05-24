# Agent Panel — Architecture

## 概述

Agent Panel 是一个 Tauri v2 桌面应用，采用 sidecar 架构：Rust 后端作为独立 HTTP server，前端 React SPA 通过 API 通信，Tauri 负责窗口管理和进程生命周期。

---

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 后端 | Rust / Axum | HTTP API + 数据扫描/搜索引擎 |
| 前端 | React 18 / Vite / Tailwind / shadcn/ui | SPA，虚拟滚动、代码高亮、diff 渲染 |
| 桌面 | Tauri v2 | sidecar 模式，server 独立进程 |
| 包管理 | Rust: Cargo workspace / 前端: pnpm |

---

## 项目结构

```
AgentPanel/
├── Cargo.toml              # Rust workspace root
├── src-server/             # Rust 后端
│   ├── src/
│   │   ├── main.rs         # Axum server 入口
│   │   ├── router/         # API 路由
│   │   ├── scanner/        # 文件扫描（rayon 并行）
│   │   ├── search/         # 全文搜索（aho-corasick）
│   │   ├── watcher/        # 文件监听（FSEvents）
│   │   └── cache/          # TTL 内存缓存
│   └── Cargo.toml
├── src-tauri/              # Tauri 桌面壳
│   ├── src/
│   │   └── main.rs         # sidecar 启动 + 窗口管理
│   └── Cargo.toml
├── web/                    # React 前端
│   ├── src/
│   │   ├── pages/          # 页面组件
│   │   ├── components/     # 通用组件
│   │   └── lib/            # 工具库
│   └── package.json
├── scripts/                # 构建/打包脚本
├── docs/                   # 项目文档
└── .github/                # CI/CD 配置
```

---

## 架构模式

### Sidecar 架构

Tauri App 启动时，以独立子进程运行 Rust server（`src-server/`），前端 WebView 通过 `http://127.0.0.1:7788` 访问 API。这种设计的好处：

- 前端开发和后端开发完全解耦（Vite dev server 代理到 `:7788`）
- Server 可独立部署（Linux 服务模式，无需 Tauri）
- Tauri 升级不影响后端逻辑

### 数据流

```
~/.claude/projects/*.jsonl  ─┐
~/.cursor/projects/*/       ─┤
~/.codex/sessions/          ─┤  扫描/索引 ──→ 内存缓存 ──→ Axum API ──→ React UI
~/.claude/skills/           ─┤                                    (http://127.0.0.1:7788)
~/.claude/settings.json     ─┘
```

### 关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 并发扫描 | rayon | CPU 密集型，并行加速明显 |
| 全文搜索 | aho-corasick | 多模式匹配，比 regex 快 |
| 文件监听 | FSEvents（macOS） | 原生事件，低开销 |
| 缓存策略 | TTL 内存缓存 | 会话数据读取频繁但更新少 |
| 虚拟滚动 | React virtuoso 或自定义 | 大会话数千条消息 |

---

## API 设计

API 基于 Axum，提供 REST 风格的查询接口：

- `GET /api/sessions` — 会话列表
- `GET /api/sessions/:id` — 会话详情（含消息流）
- `GET /api/search?q=...` — 全文搜索
- `GET /api/usage` — 用量统计
- `GET /api/extensions` — Skills/MCP/Hooks 列表

---

## 构建与部署

| 模式 | 命令 | 产物 |
|------|------|------|
| macOS App | `bash scripts/build-app.sh` | `.dmg` |
| Server Binary | `cargo build --release -p agent-panel-server` | 二进制 |
| 前端 Only | `cd web && pnpm build` | `web/dist/` 静态文件 |
| Linux 部署 | `./target/release/agent-panel-server --dist web/dist --port 7788` | 服务运行 |
