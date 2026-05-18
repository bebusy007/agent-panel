<h1 align="center">AgentPanel</h1>

<p align="center">
  本地只读看板 — 聚合 Claude Code / Cursor / Codex 的会话、Skills、MCP、用量数据<br/>
  不上传、不遥测、不改你的文件<br/>
  macOS 桌面 App / 浏览器访问 / Linux 服务部署
</p>

---

## TL;DR

用 AI 编程 agent（Claude Code、Cursor、Codex）时间一长，会话记录越来越多，散落在 `~/.claude/`、`~/.cursor/`、`~/.codex/` 各处。翻找历史会话很累，跨平台查找更累（比如想把 Cursor 里用过的某条命令在 Claude Code 里复用），让 agent 帮你翻还消耗 token，且不一定准确。

同时，Claude Code CLI 在长会话中查看历史记录不够直观，JSONL 格式的原始数据完全不可读。

AgentPanel 做的事：

- **聚合所有 agent 的会话记录到一个界面**，跨平台搜索和浏览
- **提供 GUI 查看完整的 agent 执行链路**，包括 Bash、Edit、Read、Write 等工具调用，以及 subagent、plan、todo 等任务信息
- **全文搜索**，在几百个会话、上万条消息中定位内容
- **本机所有 Skills、MCP servers、Hooks、Agents 的全局扫描可视**
- **token 用量统计**，按天、按来源、按模型查看

```bash
# macOS 桌面 App：双击 AgentPanel.dmg → 拖入 Applications → 打开

# 或命令行启动
cd src-server && cargo run
# 浏览器打开 http://127.0.0.1:7788
```

---

## 解决的问题

### 会话记录碎片化，跨平台翻找成本高

Claude Code 按项目存储在 `~/.claude/projects/*.jsonl`，Cursor 在 `~/.cursor/projects/*/agent-transcripts/`，Codex 在 `~/.codex/sessions/`。三套路径、三种格式，没有统一的浏览方式。想找某个历史对话，要么手动翻目录，要么让 agent 帮忙搜（消耗 token，结果不一定对）。

AgentPanel 跨 agent 聚合所有会话，按项目分组，支持按时间、token 量、消息数排序。

### CLI 下长会话不可读，工具调用是原始 JSON

Claude Code CLI 在长会话中回看历史记录很不方便。agent 执行的文件编辑、终端命令、代码读取等操作在 JSONL 中是原始 JSON，一次 Edit 几十行，Bash 输出夹杂 ANSI 转义码。

AgentPanel 以 GUI 展示完整的 agent 执行链路：

- **11 种工具卡片渲染**：Edit 显示 unified diff（行号 + 红绿高亮）、Bash 显示终端样式、Read 显示语法高亮代码
- **Subagent / Plan / Todo 任务信息**完整展示
- 每张卡片支持「美化 / 原始 JSON」切换

### 无法跨会话搜索

几百个会话、上万条消息，CLI 没有跨会话检索能力。

AgentPanel 内置全文搜索引擎，支持按来源、项目、日期筛选，点击结果直接跳转到对应消息。

### 本机 agent 资产分散不可见

Skills、MCP servers、Hooks、自定义 Agents 分散在各个配置文件中，token 消耗无处查看。

AgentPanel 全局扫描本机所有 agent 资产并可视化展示，提供用量看板（365 天热力图、按来源/模型统计）。

---

## 功能

| 页面 | 说明 |
|---|---|
| **概览** | 统计卡 + 来源分布 + 活动热力图 |
| **会话** | 按项目分组浏览，点击进入三栏详情（轮次导航 / 消息流 / 工具-文件-信息面板） |
| **搜索** | 跨所有会话的消息全文搜索，多维筛选，点击结果锚定到对应消息 |
| **用量** | 概览卡 + 365 天热力图 + 30 天趋势柱图 + 按来源/模型统计表 |
| **扩展** | Skills / MCP / Hooks / 自定义 Agents 全局扫描浏览 |
| **收藏** | 对任意消息收藏，集中查看，跳回原会话定位 |

---

## 性能

以下数据基于真实使用环境测试（579 个会话文件，277MB 数据，macOS Apple Silicon）：

| 指标 | 数值 |
|---|---|
| 131 个会话全量扫描 | 271ms |
| 缓存命中后响应 | <1ms |
| 会话列表加载（200 条） | 28ms |
| 全文搜索 3349 条匹配 | 185ms |
| 缓存后搜索 | 55ms |
| 大会话加载（2425 条消息，10MB） | 61ms |
| 内存占用 | 41MB |
| 文件描述符 | 17 个（FSEvents） |
| 桌面 App 体积 | 8.3MB（DMG） |
| Server 二进制 | 4.8MB |

---

## 数据源

| 来源 | 路径 | 数据 |
|---|---|---|
| Claude Code | `~/.claude/projects/` | 完整对话 + 工具调用 + token 用量 |
| Cursor Agent | `~/.cursor/projects/*/agent-transcripts/` | 完整对话 + 工具调用 |
| Codex | `~/.codex/sessions/` | 完整对话 + 工具调用 |
| Skills | `~/.claude/skills/`、`~/.cursor/skills-cursor/` | Skill 定义 + 触发词 |
| MCPs | `~/.claude/settings.json`、`~/.cursor/mcp.json` | Server 配置 + 工具列表 |
| Hooks & Agents | `~/.claude/settings.json`、`~/.claude/agents/` | Hook 规则 + Agent 定义 |

---

## 安装

### macOS 桌面 App

从 [Releases](#) 下载 `AgentPanel_x.x.x_aarch64.dmg`（Apple Silicon）或自行构建：

```bash
bash scripts/build-app.sh
# 产物：target/release/bundle/dmg/AgentPanel_x.x.x_aarch64.dmg
```

详细构建步骤见 [App 构建指南](docs/app-build-guide.md)。

### 命令行启动

```bash
cd src-server && cargo run
# 默认 http://127.0.0.1:7788
```

### Linux 服务部署

直接部署 server 二进制 + 前端构建产物，不需要 Tauri：

```bash
cargo build --release -p agent-panel-server
cd web && pnpm build
./target/release/agent-panel-server --dist web/dist --port 7788
```

---

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Rust / Axum — rayon 并行扫描、aho-corasick 全文搜索、FSEvents 文件监听、TTL 内存缓存 |
| 前端 | React 18 / Vite / Tailwind / shadcn/ui — 虚拟滚动、代码高亮、diff 渲染 |
| 桌面 | Tauri v2 — sidecar 架构，server 独立进程，app 约 8MB |

## 项目结构

```
AgentPanel/
├── Cargo.toml              # Rust workspace
├── src-server/             # Rust 后端（scanner / router / search / watcher）
├── src-tauri/              # Tauri 桌面壳（sidecar 启动 + 进程管理）
│   └── icons/app-icon.png  # 源图（构建时自动生成所有尺寸）
├── web/                    # React 前端（pages / components / lib）
├── scripts/build-app.sh    # 一键打包 DMG
└── docs/                   # 设计规范 + 构建指南
```

## 本地开发

桌面打包与本地开发完全独立：

```bash
# 后端（端口 7788）
cd src-server && cargo run

# 前端（Vite dev，代理 API 到 7788）
cd web && pnpm dev

# 测试
cargo test -p agent-panel-server
cd web && pnpm typecheck
```

---

## 隐私

- **只读** — 只扫描文件，不写入、不修改任何 agent 数据
- **本地** — 默认绑定 `127.0.0.1`，数据不出本机
- **零遥测** — 无外网请求、无数据采集
- **日志** — 桌面 App：`~/Library/Logs/AgentPanel/`（macOS）；命令行：`./logs/`

---

## License

MIT
