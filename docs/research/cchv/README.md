# 调研报告：从 CCHV (Claude Code History Viewer) 学什么

> 本目录是对开源项目 [claude-code-history-viewer](https://github.com/jhlee0409/claude-code-history-viewer) 的调研，目标是找出"值得借鉴什么、和我们有什么差异、有什么可以互补"。
>
> 仓库本地路径：`/Users/wangshujun/github-space/claude-code-history-viewer`
> 我们的项目：`/Users/wangshujun/workspace/skill-panel`

---

## 一句话结论

**CCHV 是一个功能完善的 Tauri 桌面 app + headless server，走的是"大而全的 history viewer"路线**。它在会话浏览、多 provider 支持、analytics 等方面比我们成熟；但它**不做**资产管理（Skills/MCP/Hooks/Plugins/Agents 的展示和管理），这恰好是我们的差异化领地。我们应该借鉴它的 UI 渲染细节和数据解析经验，同时坚守"轻量 Web + agent 资产管理"的定位。

---

## CCHV 是什么 / 我们是什么

| 维度 | CCHV | agent-panel（我们） |
|---|---|---|
| **定位** | 多 AI assistant 统一历史浏览器 + analytics | 本机 agent 资产 + 历史 + 用量的统一看板 |
| **形态** | Tauri 桌面 app + headless server (Axum) | Web 应用（`npx agent-panel` 起 server） |
| **技术栈** | React 19 + Vite + Tailwind + Zustand + Tauri (Rust) | React + Vite + Tailwind + Bun + Hono |
| **支持的 provider** | 9 个：Claude Code、Gemini CLI、Antigravity、Codex CLI、Cline、Cursor、Aider、OpenCode、ForgeCode | 5 个：Claude Code、Cursor agent/composer、Codex、Claude history |
| **体量** | 85K 行 TS/TSX + Rust 后端 | 轻量得多 |
| **是否只读** | 是（只读浏览器） | 是（只读看板） |
| **桌面发行** | macOS/Windows/Linux (.dmg/.exe/.AppImage) | 暂无（web only） |
| **i18n** | 5 语言（en/ja/ko/zh-CN/zh-TW） | 无 |

---

## 三份子文档

| 文件 | 内容 |
|---|---|
| [01-architecture-compare.md](./01-architecture-compare.md) | 技术栈、架构、数据流对比 |
| [02-feature-borrowing.md](./02-feature-borrowing.md) | 值得借鉴的功能点及实现方案 |
| [03-differentiation.md](./03-differentiation.md) | 我们的差异化优势 |

---

## 架构概览

```
CCHV
├── src/                    # React 前端 (85K 行)
│   ├── components/         # 212 个 tsx 组件
│   │   ├── toolResultRenderer/  # 20 种工具结果渲染器
│   │   ├── SessionBoard/        # 多会话可视化分析
│   │   ├── AnalyticsDashboard/  # 统计面板
│   │   ├── SettingsManager/     # 设置管理
│   │   └── ...
│   ├── store/slices/       # Zustand 分片状态管理 (18 个 slice)
│   ├── services/           # 前端数据服务
│   ├── hooks/              # 自定义 hooks
│   └── i18n/               # 国际化
├── src-tauri/              # Tauri + Rust 后端
│   ├── src/commands/       # IPC 命令（文件读写、搜索等）
│   ├── src/providers/      # 9 个 provider 的数据读取逻辑
│   └── src/server/         # headless Axum HTTP server
└── scripts/                # 构建、i18n 等辅助脚本
```

---

## 值得借鉴的亮点

### 1. 工具结果的分类型渲染器

CCHV 有 20 种专门的 tool result renderer：FileEdit、Bash(Terminal)、WebSearch、MCP、Agent/SubAgent、Git、TodoUpdate 等。每种工具有针对性的 UI（diff view、ANSI 终端、搜索结果卡片）。

**我们可以借鉴**：我们已经有 ToolCard 体系，但分类粒度不够细。参考它的 `toolResultRenderer/` 拆分思路。

### 2. 多 Provider 统一抽象

每个 provider 一个 `detect()` + `get_base_path()` 函数，前端通过 `providerSlice` 统一管理。Provider 间的会话格式差异在 Rust 端就标准化了。

**我们可以借鉴**：我们的 scanner 模式类似，但没有统一的 provider 抽象接口。

### 3. Session Board（多会话可视化分析）

像素级 session 可视化 + attribute brushing + 活动时间线。比单纯的列表更直观。

**我们可以借鉴**：作为 Dashboard 增强方向。

### 4. 全局搜索 + FlexSearch

用 `flexsearch` 做前端全文搜索，Rust 端做索引构建。支持按 provider/project/日期过滤。

**我们可以借鉴**：我们目前搜索能力弱，可以参考其搜索架构。

### 5. Headless Server 模式

Tauri app 内嵌了一个完整的 Axum HTTP server（通过 Cargo feature 开关），可以 `cchv-server --serve` 独立跑。SPA 静态资源用 `rust-embed` 编译进二进制。

**参考价值**：如果我们将来做桌面 app，可以反过来做——Bun server 是主体，Tauri 只是个壳。

### 6. Zustand 分片状态管理

18 个 slice 各司其职（analytics、board、filter、message、navigation、search、settings 等），通过一个 `useAppStore` 组合。

**我们可以借鉴**：如果前端状态复杂度上升，参考其 slice 拆分方式。

---

## 我们不需要抄的

| CCHV 功能 | 为什么不抄 |
|---|---|
| 9 provider 全支持 | 我们优先做深而不是做广；先把核心 provider 做精 |
| Tauri 桌面 app | 我们坚持 Web 轻量路线 |
| i18n 5 语言 | 目前用户群不需要 |
| WSL 支持 | macOS 用户不需要 |
| rust-embed 资源嵌入 | 我们用 Bun，`bun build --compile` 就能实现类似效果 |
| Archive 管理（导出/导入） | 暂时不是核心需求 |
| Auto-updater | Web 应用不需要 |

---

## 关键差异化（我们有、CCHV 没有）

1. **Agent 资产管理**：Skills/MCP/Hooks/Plugins/Agents 的扫描、展示、搜索 —— CCHV 完全没有这块
2. **Favorites 收藏系统**：收藏 session、skill、MCP 等
3. **Resume（继续会话）**：从面板直接唤起终端继续会话
4. **轻量零安装**：`npx agent-panel` 即用，不需要下载 30MB+ 的桌面 app
5. **实时 file watcher + WebSocket 推送**：不用刷新页面就能看到新会话

---

## 总结

CCHV 在"history viewing"这个维度上做得很完善（85K 行代码量可见一斑），是一个成熟的开源参考。我们应该：

- **借鉴**：工具结果渲染器的分类设计、全局搜索架构、session 可视化思路
- **不抄**：桌面 app 壳子、过多的 provider 支持、i18n 等非核心功能
- **坚守**：agent 资产管理差异化、Web 轻量路线、操作性（resume/favorite）
