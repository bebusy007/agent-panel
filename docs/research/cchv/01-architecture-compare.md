# 01 - 架构对比：CCHV vs agent-panel

## 技术栈对比

| 层 | CCHV | agent-panel |
|---|---|---|
| **前端框架** | React 19 + Vite 7 | React + Vite |
| **样式** | Tailwind 4 + Radix UI + shadcn/ui | Tailwind + 自定义组件 |
| **状态管理** | Zustand (18 个 slice) | 轻量 state（hooks + context） |
| **虚拟滚动** | `@tanstack/react-virtual` + `react-window` | 自实现 |
| **Markdown** | `react-markdown` + `remark-gfm` | marked |
| **代码高亮** | Prism (prism-react-renderer) | Prism |
| **Diff 渲染** | `react-diff-viewer-continued` + `diff` | 自实现简版 |
| **搜索** | `flexsearch` (前端) + Rust aho-corasick (后端) | 简单字符串匹配 |
| **后端** | Rust (Tauri commands + Axum server) | Bun + Hono |
| **构建工具** | pnpm + Cargo | bun |
| **桌面壳** | Tauri 2 (Rust) | 无 |
| **测试** | Vitest + testing-library | 无 |

## 运行时架构对比

### CCHV 的双模式架构

```
模式 A：桌面 app
┌─────────────┐      IPC       ┌───────────────┐
│  React SPA  │  ◄──────────►  │  Tauri (Rust) │
│  (webview)  │                │  commands/    │
└─────────────┘                │  providers/   │
                               └───────────────┘

模式 B：headless server
┌─────────────┐     HTTP/SSE    ┌───────────────┐
│   Browser   │  ◄──────────►   │  Axum server  │
│             │                 │  (rust-embed) │
└─────────────┘                 └───────────────┘
```

Tauri commands 和 Axum handlers 共用同一套 Rust 逻辑（providers/models），只是入口不同。

### agent-panel 架构

```
┌─────────────┐    HTTP + WS    ┌──────────────┐
│   Browser   │  ◄──────────►   │  Bun + Hono  │
│  React SPA  │                 │  server/     │
└─────────────┘                 │  scanners/   │
                                └──────────────┘
```

简单直接。server 同时负责 API 和静态资源。WebSocket 用于实时推送文件变更。

## 数据流对比

### CCHV 读取 Claude Code 数据

```
~/.claude/projects/<encoded-path>/<session-id>.jsonl
    ↓ (Rust: providers/claude.rs)
    ↓ 逐行解析 JSONL → 标准化 Session 结构
    ↓ (IPC / HTTP)
    ↓ 前端 Zustand store
    ↓ messageSlice → 按 turn 分组 → 渲染
```

### agent-panel 读取数据

```
~/.claude/projects/<encoded-path>/<session-id>.jsonl
    ↓ (TS: server/scanners/claude.ts)
    ↓ 解析 → API 响应
    ↓ (HTTP + WS 通知)
    ↓ 前端直接渲染
```

核心差异：CCHV 在 Rust 端做了更多的预处理和索引构建。

## 状态管理对比

### CCHV 的 Zustand 18 slice

| slice | 职责 |
|---|---|
| analyticsSlice | 统计数据 |
| archiveSlice | 导出/导入 |
| boardSlice | Session Board 可视化 |
| captureModeSlice | 截图模式 |
| filterSlice | 过滤条件 |
| globalStatsSlice | 全局统计 |
| messageSlice | 消息列表 + sub-agent |
| metadataSlice | 会话元数据 |
| navigationSlice | 路由/导航状态 |
| navigatorSlice | 消息导航器 |
| projectSlice | 项目列表 |
| providerSlice | Provider 管理 |
| searchSlice | 全局搜索 |
| sessionPickerSlice | 会话选择 |
| settingsSlice | 设置 |
| watcherSlice | 文件监听 |

这种细粒度拆分的好处是职责清晰、可测试；代价是样板代码多。

### 我们的状态管理

目前较轻量，大部分状态在组件内或通过 hooks 管理。如果功能复杂度持续上升，可以参考 CCHV 的 slice 模式引入 Zustand。

## Provider 抽象对比

### CCHV (Rust)

```rust
// 每个 provider 实现两个函数
pub fn detect() -> Option<ProviderInfo> { ... }
pub fn get_base_path() -> Option<String> { ... }

// ProviderInfo 统一结构
struct ProviderInfo {
    id: String,
    display_name: String,
    base_path: String,
    is_available: bool,
}
```

9 个 provider 各自一个 `.rs` 文件，`mod.rs` 统一注册。

### agent-panel (TS)

```
server/scanners/
├── claude.ts       # Claude Code sessions
├── cursor.ts       # Cursor agent/composer
├── beam.ts         # Beam
├── mcp.ts          # MCP servers
├── hook.ts         # Hooks
└── index.ts        # 统一入口
```

我们的 scanner 更"杂"——既扫会话数据也扫资产配置，没有统一的 Provider interface。如果后续加更多 provider，可以参考 CCHV 抽出统一接口。

## 构建产物对比

| 维度 | CCHV | agent-panel |
|---|---|---|
| macOS | .dmg (~30MB) | `bun build --compile` (~60MB) 或 npx |
| Windows | .exe / .zip | 暂不支持 |
| Linux | .AppImage | 暂不支持 |
| Headless | `cchv-server` 单二进制 | `npx agent-panel` |
| Docker | 有 Dockerfile | 无 |

## 结论

CCHV 的架构更"重"但更成熟。对我们的启示：

1. **Provider 抽象值得借鉴**：统一 detect/getBasePath 接口
2. **Zustand slice 模式作为备选**：等状态复杂度到一定程度再引入
3. **双模式运行是好思路**：我们的 server 本身就是 Web，未来如果做桌面 app，Tauri 只需要当壳子包一层
4. **搜索索引思路**：CCHV 用 Rust 建索引 + 前端 flexsearch，我们可以在 Bun 端做类似的 jsonl 索引
