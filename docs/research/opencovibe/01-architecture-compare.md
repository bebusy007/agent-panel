# 01 · 架构对比

## 1. 总览

```
OpenCovibe                                  skill-panel
─────────────────────                       ─────────────────────
Tauri v2 (Rust + WebView)                   Bun runtime
  ├─ Svelte 5 / SvelteKit                     ├─ Hono server
  ├─ Tailwind v3                              └─ React 18 + Vite + Tailwind v3
  ├─ xterm.js
  ├─ marked + highlight.js + DOMPurify
  └─ Custom i18n (en + zh-CN)

后端能力（Rust）                              后端能力（Bun/TS）
  ├─ session_actor (子进程管控)                 ├─ scanners/* (skill/mcp/sessions)
  ├─ stream-JSON / PTY / pipe 协议              ├─ chokidar 文件监视
  ├─ web_server (broadcast/dispatch/ws)         ├─ trash.ts 软删除/级联
  ├─ storage/* 索引 + 元数据                    ├─ favorites.ts
  ├─ commands/* 给前端的 invoke API             ├─ resume.ts 终端/IDE 启动
  └─ proxy / agent / hooks                      └─ sessions-search.ts (基础 substring)
```

## 2. 技术栈逐项对比

| 维度 | OpenCovibe | skill-panel | 评价 |
|---|---|---|---|
| 运行时 | Rust 1.75+ + Node 20+ | Bun 1.0+ | 我们更轻；Bun 内置 sqlite/jsonl/fs，对扫描类应用是最优解 |
| 前端框架 | Svelte 5（runes，`$state`/`$derived`） | React 18（hooks） | 各有千秋；Svelte 5 更"少代码"但生态偏小，React 招人/找模板更容易 |
| 状态管理 | Svelte runes + 全局 stores（class-based） | React useState + 自写 hooks | 都不算重 |
| 路由 | SvelteKit 文件路由 | react-router v7 | SvelteKit 路由更"标准"；我们目前路由偏简单 |
| 样式 | Tailwind 3 + CSS variables | Tailwind 3 | 一样 |
| Markdown | marked + highlight.js + DOMPurify | react-markdown + rehype-highlight + remark-gfm | 一样档次 |
| 终端 | xterm.js | 无 | 我们不需要 |
| i18n | 自写轻量 runtime（en/zh-CN） | 无（中文硬编码） | OpenCovibe 这块做得好；不过我们是个人/小团队工具，先不上 i18n 也行 |
| 测试 | Vitest | 无 | 应当补上 |

## 3. 数据存储 / 扫描策略对比

### OpenCovibe（自产数据）

```
~/.opencovibe/
├── settings.json                # 用户设置
├── runs/<run-id>/
│   ├── meta.json                # 这个 run 的元数据（model/cwd/cost/...）
│   ├── events.jsonl             # 这个 run 的所有事件（user_message / tool_use / ...）
│   └── artifacts.json           # 摘要
├── prompt-index.jsonl           # 跨所有 run 的全文消息索引
├── prompt-index-manifest.json   # 索引的 mtime/size 指纹（增量重建）
├── run-index.jsonl              # 跨所有 run 的摘要索引（含 facets 数据）
├── run-index-manifest.json      # 同上
└── claude_usage.jsonl           # Claude Code 全局用量索引（扫 ~/.claude）
```

**关键设计**：

1. **双索引文件**——`prompt-index`（全文检索）+ `run-index`（摘要 + facets）；都是 JSONL；
2. **manifest + fingerprint 增量**——每次重建只读 mtime/size 变化过的 run；
3. **120s 内存 TTL**——`std::sync::LazyLock<Mutex<Option<CachedIndex>>>`，热路径完全不碰磁盘；
4. **atomic write**——`.tmp → rename` + `0o600` 权限，崩了不会留半截。

> 看 `src-tauri/src/storage/prompt_index.rs` 和 `src-tauri/src/storage/run_index.rs`。

### skill-panel（消费别人的数据）

```
~/.claude/        ~/.cursor/        ~/.codex/        ~/.beam/
└── skills/       └── skills-cursor/  └── sessions/    └── <ws>/skills/
└── projects/     └── projects/       └── skills/
└── plugins/      └── mcp.json
└── settings.json
└── history.jsonl
```

```
./logs/                          # 我们生成的本地状态（运行时产物）
├── sessions-trash/<id>/         # 软删除回收站 + manifest
├── favorites.json
└── sessions-state.json          # hidden/trashed 用户标记
```

**关键设计**：

1. **不写源文件**——所有变更都落在 `./logs/`；
2. **chokidar 文件监视** + 内存缓存（`server/lib/cache.ts`、`sessions-cache.ts`）；
3. **substring 全文搜索**（`server/lib/sessions-search.ts`）——目前是简单的循环 `String.includes`，够用但不带 facets。

### 差距

| 项 | OpenCovibe | skill-panel | 影响 |
|---|---|---|---|
| 持久化索引 | ✅ JSONL + manifest | ❌ 全在内存 | 重启 = 全量重扫；500+ session 启动会卡 |
| 增量重建 | ✅ mtime/size 指纹 | ⚠️ chokidar 增量但缓存丢就重做 | 同上 |
| Facets（项目/agent/工具/cost/日期分面） | ✅ | ❌ | 无法做高级筛选 |
| 跨会话全文 | ✅（提取 user_message + assistant text） | ⚠️ 只搜 summary（title/firstMsg/cwd） | 我们的 deep 搜索只能"先点进去再 Cmd+F" |
| 用量统计 | ✅ heatmap + chart + by-model + run table | ❌ 只有 4 张概览卡 | 需要补 |

**这是最重要的架构升级方向**：把 OpenCovibe 的"双索引文件 + manifest + 内存 TTL"模式整套搬到 Bun，所有 jsonl 文件落在 `./logs/index/` 下。

## 4. 前后端通信对比

| | OpenCovibe | skill-panel |
|---|---|---|
| 主路 | Tauri `invoke()` + `listen()` 事件流 | HTTP REST + 拉取（`fetch`） |
| 实时推送 | Tauri event bus（`team-update` / `task-update` / `ocv:status-changed`...） | 无（chokidar 在 server 端，前端靠"重新扫描"按钮 / 切页刷新） |
| 远程访问 | 内置 web_server（broadcaster/dispatch/ws）转发 invoke 到浏览器 | 天生就是浏览器访问 |

**值不值得加 SSE/WS**：

- 当前轮询模式对**只读看板**已经很够；
- 唯一明显该上 SSE 的是"扫描完成提示"——可以让"重新扫描"按钮变成 progress bar；
- 但优先级不高，P3 之前不做。

## 5. 是否需要切换到 Tauri？

**不需要**。理由分两层：

### 技术层面：网页能做的

- 文件读取/写入：服务端做（Bun 比 Rust 还快上手）
- 持久化索引：jsonl 文件 + Bun.file().writer()
- 文件监视：chokidar（已经在用）
- SQLite blob 解析（cursor-composer）：`bun:sqlite`（已经在用）
- Diff 渲染：`diff` npm 包（OpenCovibe 也是用 `structuredPatch`）
- 语法高亮：`highlight.js`（同款）
- 子进程启动（resume）：`Bun.spawn` 或 `child_process`，已实现

### 网页做不到的（OpenCovibe 因此用 Tauri）

- ❌ 子进程长期托管 + stdin/stdout 流式 → 我们不做对话
- ❌ 全局快捷键、system tray → 网页用一次开一次足够
- ❌ Native file dialog → 服务端读路径就行
- ❌ Auto-update + 公证签名 → 网页应用直接 npm 更新

**唯一灰色地带**：浏览器外打开 `cursor://` `terminal://` 这种 URL scheme。

- 浏览器可以触发 `window.open("cursor://...")`，但会被弹"是否打开"框；OpenCovibe 在桌面端可以无感打开。
- **解决**：保持现状（用户点 ResumeMenu → server 端用 `open` 包打开），效果一样好。

## 6. 一些值得直接抄过来的工程细节

| 来自 OpenCovibe 的小技巧 | 用在哪 |
|---|---|
| `normalizeCwd()` 处理 Windows 盘符大小写、`/` `\` 统一 | 我们的 cwd 分组 |
| `requestId` 单调计数器丢弃过期响应 | 所有 debounced 后端调用 |
| `_seq` 计数器防止 stale fs.readdir 回填 | 文件树/git diff |
| `setupWizard` 流程 | 不抄 |
| `keybindingStore` 全局快捷键 | 抄一部分（搜索 / 定位 / 关闭 drawer） |
| `dbg(scope, ...)` 分类调试日志 | 我们的 console.log 散得到处都是 |
| `resync timer` debounce 重连后补偿同步 | 文件监视重连 |
| `floor_char_boundary` 截断 UTF-8 不截半 | 索引/snippet 生成 |

## 7. 一句话技术决策

> **保持 Bun + Hono + React + Vite 这一套**，把 OpenCovibe **后端的索引架构**抄过来，把 OpenCovibe **前端的工具卡片 / 右侧栏 / 项目文件夹树 UI** 翻译成 React。**不要切 Svelte**——投入产出比太低。
