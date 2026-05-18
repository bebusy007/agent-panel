# 04 · 实施方案 v1（基于 research 重排版）

> 这是 P0-P6 实际施工依据。此前 README.md / 03-roadmap.md 的阶段编号被本文档**覆盖**——以本文为准。
>
> 依据：`research/tool-cards-and-right-sidebar.md`、`research/indexing-and-usage-backend.md`、`research/skill-panel-session-formats.md`。

---

## 0. 关键决策（先确定）

### 0.1 我们是只读看板，OpenCovibe 一半的设计可以裁掉

| OpenCovibe 有 | 我们要不要 | 理由 |
|---|---|---|
| 8 种 BusToolItem status | **保留 6 种**：`running` / `success` / `error` / `denied` / `permission_denied` / `ask_pending` | 历史会话里这些状态都可能存在，要忠实展示 |
| Render level 1/2/3 三档 | **保留 3 档**：单行(L1) / 默认展开(L2) / 大卡(L3，含交互卡) | 决定卡片的视觉占位，与是否交互无关 |
| subagent 嵌套 sub-timeline | **保留嵌套** | Claude Code 的 Task 工具会 spawn sub-agent，子树里的 tool 用缩进显示；Cursor / Codex 没这数据就扁平 |
| Lazy fetch truncated tool result | **不要** | 我们一次性 load session，没 stream |
| Permission / AskUserQuestion / ExitPlanMode 交互卡 | **read-only 模式**：保留卡片 + 显示原始数据 + 当时的状态徽章（"已批准"/"已拒绝"/"已回答 X"），**不渲染交互按钮**（点了也没用，我们不发请求） | 历史会话里这些消息存在，必须忠实展示 |
| Background tasks tab | **不要** | 历史会话没有后台任务 |
| Context tab（context window 历史曲线） | **可选**，仅在数据存在时显示（Claude Code 才有） | Cursor/Codex 没这数据 |
| TeamTools (TeamCreate/TaskCreate/SendMessage) | **仅 Claude Code 实现**；其它源不做 | Cursor/Codex 不产这数据 |
| Session 运行中检测 + 实时指示 | **新增** `isRunning` 字段 (mtime ≤ 5min)；详情页"●实时"指示灯；删除按钮在 running 时弹更醒目警告 | 用户可能正在另一个终端跑 Claude Code/Cursor，我们要避免误删，并清楚提示 |

### 0.2 数据模型扩展

#### `Message`（新增 5 个可选字段，向后兼容）

```typescript
export interface Message {
  // ... 现有字段 ...

  /** 工具调用 ID。Claude `tool_use.id`；Codex `call_id`；其它源 scanner 自生成稳定 hash */
  toolUseId?: string;
  /** 用于 subagent / nested call 视觉缩进；未知则空 */
  parentToolUseId?: string;
  /** 工具调用状态：常态 success / error；未结束时 running；
   *  此外保留 denied / permission_denied / ask_pending 用于交互卡历史展示 */
  toolStatus?: "running" | "success" | "error" | "denied" | "permission_denied" | "ask_pending";
  /** 来源 payload 类型，便于"原始 JSON"视图标记和调试 */
  sourcePayloadType?: string;
  /** 当时这条消息的"答案/审批结果"快照——AskUserQuestion / Permission / ExitPlanMode 用
   *  例如：{ kind: "answered", value: "Yes" } / { kind: "approved" } / { kind: "denied", reason: "..." } */
  interactionResult?: { kind: string; value?: string; reason?: string };
}
```

`tool_result` 行的 `toolUseId` 必须能反查到对应 `tool_use` 的 ID（在 P1 里实现配对算法）。

#### `SessionSummary`（新增 1 个字段）

```typescript
export interface SessionSummary {
  // ... 现有字段 ...

  /** 该会话是否"看起来还在跑"——文件 mtime 在最近 5 分钟内。
   *  用于：sidebar 项目树的 ● 实时指示；详情页顶部状态徽章；
   *  删除按钮的"运行中"警告（更醒目，沿用原 cascade 逻辑）。
   *  实现：scanner 在收尾时按 (now - mtime) ≤ 300s 判断。*/
  isRunning?: boolean;
}
```

### 0.3 工具命名归一

新增 `shared/tool-aliases.ts` 维护 canonical 映射表：

```typescript
const TOOL_ALIASES: Record<string, string> = {
  // Cursor agent / Cursor composer 别名
  "Shell": "Bash",
  "read_file": "Read",
  "edit_file": "Edit",
  "write_file": "Write",
  "list_directory": "LS",
  "search_files": "Grep",
  // Codex 别名
  "exec_command": "Bash",
  "apply_patch": "Edit",
  // 其它见 research/skill-panel-session-formats.md §7.1
};

export function canonicalTool(rawName: string): string {
  return TOOL_ALIASES[rawName] ?? rawName;
}
```

`tool-colors.ts` 同时给 raw 名和 canonical 名注册（Bash + bash + Shell + exec_command 都映射到 emerald 色）。

### 0.4 索引文件目录

```
./logs/
├── index/
│   ├── run-index.jsonl
│   ├── run-index-manifest.json
│   ├── prompt-index.jsonl
│   ├── prompt-index-manifest.json
│   └── usage-cache.json         (Claude global usage 缓存)
├── sessions-trash/              (现有)
├── favorites.json               (现有)
└── sessions-state.json          (现有)
```

### 0.5 不抄的工程细节

- ❌ `web_server` (Tauri broadcaster/dispatch) — 我们本来就是 web server
- ❌ `setupWizard` / `keybindingStore` 全套配置 — 简化版即可（只做 Cmd+F 内搜 + j/k 翻 turn）
- ❌ Memory editor / Permission rules / Plan mode 路由 — 不在我们 scope
- ❌ MCP discover 在线安装 / hooks 启停切换 — 坚持只读
- ❌ Background tasks tab — 历史会话没有

### 0.6 沿用 / 保留的现有功能（不能丢）

- ✅ **消息收藏（per message）**：现 `SessionDetail.tsx` 里"hover 出 ⭐"机制原样搬到新整页 MessageStream
- ✅ **整会话级删除**：保留 `cascadeCandidates` + 二次输入"删除"才永久删 + 30 天回收站
- ✅ **Resume 菜单**：保留现 ResumeMenu，搬到 SessionDetailHeader
- ✅ **Cmd+F 详情内搜**：保留 InPaneSearch，集成到 MessageStream
- ✅ **删除时的"运行中"警告**：现有逻辑（"若 Claude Code 正在使用此会话…"）增强为红色更醒目，根据 isRunning 自动触发
- ✅ **隐藏/取消隐藏**：保留 SessionItem 的 hide/show 菜单

---

## 1. 阶段总表（最终定版）

| 阶段 | 主题 | 估时 | 主要交付 | 依赖 |
|---|---|---|---|---|
| **P0** | 双层 sidebar + 项目文件夹树 | 30-45 min | 新 Layout，左栏永久项目树 | 无 |
| **P1** | Scanner ingestion 升级（跨 agent 工具归一） | 45-60 min | 5 source 都输出 `toolUseId/toolStatus`，Codex function_call 入流 | 无 |
| **P2** | 会话详情整页 + 三栏 + 工具卡片美化 | 90-120 min | `/sessions/:id` 整页 + 左轮次栏 + 右 4 tab + 12 张工具卡 | P1 |
| **P3** | 持久化双索引 + 高级搜索页 | 60-75 min | run-index + prompt-index + `/history` | P1 |
| **P4** | 用量统计页 | 45-60 min | `/usage` heatmap+chart+by-model+by-source | P1, P3 |
| **P5** | /extensions 五子区 | 60-75 min | hooks/plugins/agents 三个新 scanner + 统一 /extensions | 无 |
| **P6** | 改名 agent-panel + 文档 + CLI 别名 | 15-30 min | 名字 + readme + CHANGELOG | 全部 |
| **R**  | review-agent 全量 review + bug fix | 30-60 min | 修 review 出的问题 | 全部 |

合计估时 **6-9 小时**，token 预算 **~120 万**。

---

## 2. P0 — 双层 sidebar + 项目文件夹树

### 文件改动

| 操作 | 文件 |
|---|---|
| 🆕 | `web/src/lib/sidebar-groups.ts` —— `normalizeCwd / buildProjectFolders / autoExpandForRun` 翻译自 OpenCovibe |
| 🆕 | `web/src/lib/sidebar-state.ts` —— localStorage 封装（expanded/pinned/removed cwds + sidebar width） |
| ♻️ | `web/src/components/Layout.tsx` —— 改 IconRail(44) + SidebarPanel(220) 双层 |
| 🆕 | `web/src/components/sidebar/IconRail.tsx` |
| 🆕 | `web/src/components/sidebar/SidebarPanel.tsx` —— 根据 `useLocation()` 切内容 |
| 🆕 | `web/src/components/sidebar/SessionsSidebar.tsx` —— 项目文件夹树（in /sessions） |
| 🆕 | `web/src/components/sidebar/ProjectFolderItem.tsx` —— 含 `isRunning` 时一颗绿色脉冲点 |
| ♻️ | `web/src/pages/SessionsView.tsx` —— 当 sidebar 已显示项目树时，去掉页内 `CollapsibleProjectChips`；保留搜索 + status filter |
| ♻️ | `web/src/components/SessionItem.tsx` —— 卡片左上角加 `isRunning` 时的"●实时"小徽章 |

### 自测

- 启动 dev server，浏览 / /sessions /skills /mcps /favorites 各页：左栏永远在
- /sessions 时左栏显示项目文件夹，可展开/折叠/pinned
- 刷新页面，状态保持
- typecheck

### Commit

```
feat(P0): two-tier sidebar with persistent project folder tree
```

---

## 3. P1 — Scanner ingestion 升级

### 目标

让 5 个 scanner 都输出 `toolUseId` / `parentToolUseId` / `toolStatus`，并把 Codex 的 `function_call` / `function_call_output` 行从"丢弃"变为"配对成 tool_use + tool_result"。这是 P2 工具卡片的前置条件。

### 文件改动

| 操作 | 文件 | 改动概要 |
|---|---|---|
| ♻️ | `shared/types.ts` | `Message` 增 `toolUseId / parentToolUseId / toolStatus / sourcePayloadType` |
| 🆕 | `shared/tool-aliases.ts` | canonical 映射表 |
| ♻️ | `server/scanners/sessions/claude-code.ts` | `extractToolInfo` 改为按 content[] **遍历**而非取第一个；写入 `tool_use.id` 到 `Message.toolUseId`；`parent_tool_use_id` (从 `parentUuid` 链推断) 写 `parentToolUseId`；`is_error` → `toolStatus="error"` |
| ♻️ | `server/scanners/sessions/codex.ts` | 接受 `payload.type === "function_call"` → 输出 `tool_use` Message，`call_id` → `toolUseId`，`name` → `toolName`，`arguments` (JSON 字符串解析) → `toolInput`；接受 `function_call_output` → 输出 `tool_result`，匹配 `call_id` |
| ♻️ | `server/scanners/sessions/cursor-agent.ts` | 解析 `message.content[]` 内 `type:"tool_use"` → `tool_use` Message；自生成 `toolUseId` = stable hash(sessionId + msgIdx + toolIdx) |
| ♻️ | `server/scanners/sessions/cursor-composer.ts` | 当 `BubbleData.toolFormerData` 存在时，附加一条 `tool_use` Message；`toolName` = `toolFormerData.name`；`toolInput` = `toolFormerData.params`；`toolOutput` = `toolFormerData.result?.content` 或 stringify |
| ♻️ | `server/scanners/sessions/loader.ts` | sessionFull 加 `toolUseLinkMap` (toolUseId → resultMessageId) 用于前端定位 |
| ♻️ | `server/scanners/sessions/util.ts` | 新增 `detectRunning(filePath, nowMs): boolean` —— mtime ≥ now-300s 即 isRunning；所有 scanner summarise 时调用并写入 SessionSummary.isRunning |
| ♻️ | `server/scanners/sessions/claude-code.ts` (额外) | 提取 `interactionResult` for ExitPlanMode (从相邻 user 消息推断 approved/denied) / AskUserQuestion (从 user 答复推断) / Permission (从后续 tool_status 推断) |

### 自测

写一个 ad-hoc 验证脚本（不入仓）：

```typescript
// 临时测试：bun run --no-tsconfig server/scanners/sessions/index.ts ...
// 找各 source 各一个真实 session，检查输出的 messages 里
// tool_use 和 tool_result 是否能用 toolUseId 配对
```

或更简单：直接 `curl http://127.0.0.1:7788/api/sessions/<id>` 看 messages 里 toolUseId 是否符合预期。

### Commit

```
feat(P1): unified tool call extraction across 5 sources

- Claude Code: emit toolUseId for every tool_use/tool_result; iterate
  all content blocks instead of taking only the first
- Codex: ingest function_call + function_call_output (previously dropped)
- Cursor agent: parse content[] tool_use blocks
- Cursor composer: lift toolFormerData into Message
- New shared/tool-aliases.ts canonical name map
```

---

## 4. P2 — 会话详情整页 + 三栏 + 工具卡片美化

### 4.1 路由

```
/sessions          列表页（保留）
/sessions/:id      整页详情（新）
```

`SessionsView.tsx` 卡片点击 → `navigate(\`/sessions/\${id}\`)`，drawer 仅保留作"概览页快速预览"。

### 4.2 三栏布局

```
┌──────────┬───────────────────────────────────┬──────────────┐
│ 左 200px │ 中 flex-1 (虚拟滚动 messages)     │ 右 280px      │
│ 轮次栏   │   ├ user                          │ 4 tab:        │
│ Turn 1 ◄ │   │  ├ assistant                  │  Tools/Files  │
│ Turn 2   │   │  └ <ToolCard>                 │  Info/Context │
│ ...      │   └ ...                           │ (可折叠)      │
└──────────┴───────────────────────────────────┴──────────────┘
```

### 4.3 文件改动

| 操作 | 文件 |
|---|---|
| 🆕 | `web/src/pages/SessionDetailView.tsx` 三栏容器 + 顶部 toolbar |
| 🆕 | `web/src/components/session/SessionDetailHeader.tsx` 标题 + 来源 badge + cwd + isRunning ●实时指示 + Resume 菜单 + Star/Unstar **整会话**（新功能） + 删除按钮（沿用 cascade，running 时 ConfirmDialog 加红色警告） |
| 🆕 | `web/src/components/session/TurnSidebar.tsx` |
| 🆕 | `web/src/components/session/RightSidebar.tsx` (3-4 tab：Tools / Files / Info；仅 Claude Code 有 contextHistory 时多 Context tab) |
| 🆕 | `web/src/components/session/right-sidebar/ToolsTab.tsx` |
| 🆕 | `web/src/components/session/right-sidebar/FilesTab.tsx` |
| 🆕 | `web/src/components/session/right-sidebar/InfoTab.tsx` |
| 🆕 | `web/src/components/session/right-sidebar/ContextTab.tsx` (条件渲染，仅 Claude Code 显示) |
| ♻️ | 现 `web/src/components/SessionDetail.tsx` 里的"消息悬停 ⭐ 收藏"机制完整保留到新 MessageStream 组件 |
| ♻️ | 现 `ConfirmDialog` 增加 `isRunning?: boolean` prop，true 时 header 红色警示文案 |
| ♻️ | `web/src/components/SessionDetail.tsx` 拆出消息流逻辑，去掉 drawer 套子 |
| 🆕 | `web/src/lib/turn-grouping.ts` 从 messages 切分 turn |
| 🆕 | `web/src/lib/file-entries.ts` 从 messages 抽取 file actions |
| 🆕 | `web/src/lib/tool-colors.ts` 抄 OpenCovibe 完整表 |
| 🆕 | `web/src/lib/tool-rendering.ts` `getToolDetail / getLanguageFromPath / extractOutputText / formatTokenCount / formatDuration / friendlyToolName` |
| 🆕 | `web/src/lib/ansi.ts` `stripAnsi / escapeHtml / ansiToHtml / hasAnsiCodes` |
| 🆕 | `web/src/lib/shell-colorize.ts` `colorizeCommand` |
| 🆕 | `web/src/components/tool-cards/ToolCard.tsx` dispatcher |
| 🆕 | `web/src/components/tool-cards/ToolCardHeader.tsx` (图标 + 名字 + detail + 视图切换 + 复制) |
| 🆕 | `web/src/components/tool-cards/RawJsonView.tsx` |
| 🆕 | `web/src/components/tool-cards/cards/ReadCard.tsx` 行号渲染 |
| 🆕 | `web/src/components/tool-cards/cards/EditCard.tsx` diff table（用 `diff` 包） |
| 🆕 | `web/src/components/tool-cards/cards/WriteCard.tsx` |
| 🆕 | `web/src/components/tool-cards/cards/BashCard.tsx` ANSI + shell color |
| 🆕 | `web/src/components/tool-cards/cards/GrepCard.tsx` |
| 🆕 | `web/src/components/tool-cards/cards/GlobCard.tsx` |
| 🆕 | `web/src/components/tool-cards/cards/WebFetchCard.tsx` |
| 🆕 | `web/src/components/tool-cards/cards/WebSearchCard.tsx` |
| 🆕 | `web/src/components/tool-cards/cards/TodoWriteCard.tsx` |
| 🆕 | `web/src/components/tool-cards/cards/TaskCard.tsx` |
| 🆕 | `web/src/components/tool-cards/cards/ExitPlanModeCard.tsx` read-only：plan markdown + 状态徽章（已批准/已拒绝/未决定） |
| 🆕 | `web/src/components/tool-cards/cards/AskUserQuestionCard.tsx` read-only：问题 + 选项列表，标注当时的回答 |
| 🆕 | `web/src/components/tool-cards/cards/PermissionPromptCard.tsx` read-only：被请求的工具+参数，标注 allowed/denied |
| 🆕 | `web/src/components/tool-cards/cards/SkillCard.tsx` Skill 工具调用展示 |
| 🆕 | `web/src/components/tool-cards/cards/DefaultCard.tsx` JSON fallback |
| 🆕 | `web/src/components/session/SubAgentBlock.tsx` 把同一 parentToolUseId 的子工具收成树状缩进 sub-timeline（仅 Claude Code 有数据） |
| ♻️ | `web/src/index.css` 添加 prose-chat / diff-table 等关键 CSS（从 OpenCovibe app.css 抽取） |
| ♻️ | `web/src/main.tsx` 路由加 `/sessions/:id` |
| ♻️ | `web/src/App.tsx` 同步 |
| ➕ | `package.json` deps: `diff`, `ansi-to-html`（替代手写） |

### 4.4 自测

- typecheck
- 起 dev server，进 /sessions 列表 → 点一个 cursor agent session（含 tool_use）→ 应跳到 /sessions/:id 整页
- 用 playwright MCP：navigate + snapshot + 截图，看：
  - 左轮次栏出现且可点击
  - 中间消息流里 tool_use 渲染成有色卡片
  - 右栏 Tools tab 列出工具
  - 点 ToolCard 头部 → 切换"原始 JSON"视图
  - 点工具卡 detail 切换展开/折叠
- 抽查至少 3 种 source 的会话（claude-code / cursor-agent / codex）

### Commit（拆 4 子）

```
feat(P2.1): standalone session detail route + three-column layout
feat(P2.2): right sidebar with Tools/Files/Info tabs
feat(P2.3): tool card dispatcher + 6 core cards (Read/Edit/Write/Bash/Grep/Default)
feat(P2.4): remaining tool cards + raw JSON toggle + visual polish
```

### ⏸️ 自检暂停点

- P2.3 完成后跑一次 playwright snapshot 截图给自己看，目测 UI 是否合理
- P2 全部完成后跑全套 source 抽查

---

## 5. P3 — 持久化双索引 + 高级搜索页

### 5.1 后端

| 操作 | 文件 |
|---|---|
| 🆕 | `server/lib/index/manifest.ts` 指纹 + atomic write |
| 🆕 | `server/lib/index/run-index.ts` 扫所有 source → RunIndexEntry → ./logs/index/run-index.jsonl |
| 🆕 | `server/lib/index/prompt-index.ts` 扫所有 user/assistant 消息 → PromptEntry → prompt-index.jsonl |
| 🆕 | `server/lib/index/search.ts` 内存查询 + facets |
| 🆕 | `server/routes/search.ts` `POST /api/runs/search` `POST /api/prompts/search` `POST /api/index/rebuild` |
| ♻️ | `server/lib/watcher.ts` 文件变动 → 节流 → invalidate cache |
| ♻️ | `server/index.ts` 启动后异步预热索引（不阻塞 server start） |

### 5.2 前端

| 操作 | 文件 |
|---|---|
| 🆕 | `web/src/pages/HistoryView.tsx` 抄 OpenCovibe history 页（搜索 + status pills + 高级筛选 + 排序 + load more） |
| ♻️ | `web/src/lib/api.ts` 加 `runsSearch / promptsSearch / indexRebuild` |
| ♻️ | `web/src/App.tsx` 加 `/history` 路由 |
| ♻️ | `web/src/components/Layout.tsx` IconRail 加"历史"图标 |

> **决策**：保留 `/sessions` 作为"按项目文件夹浏览"的入口，新增 `/history` 作为"全局搜索 + 高级筛选"的入口。两者互补不冲突。

### 5.3 自测

- curl POST /api/runs/search 给 query / projects / dateFrom 等组合，验证 facets 和 results
- curl 跑 /api/index/rebuild 重建后再查
- 在 /history 页面用 playwright 测搜索框、status pill、advanced filter

### Commit

```
feat(P3.1): persistent run-index + prompt-index with manifest fingerprints
feat(P3.2): /history page with full-text search and faceted filters
```

---

## 6. P4 — 用量统计页

### 6.1 后端

| 操作 | 文件 |
|---|---|
| 🆕 | `server/lib/pricing.ts` 抄 OpenCovibe pricing 表 |
| 🆕 | `server/lib/usage.ts` 从 run-index 聚合，按 source/days/model 切；compute_streaks 算法 |
| 🆕 | `server/routes/usage.ts` `/api/usage/overview?source=&days=` `/api/usage/heatmap?source=` `/api/usage/by-model?source=` |

### 6.2 前端

| 操作 | 文件 |
|---|---|
| 🆕 | `web/src/pages/UsageView.tsx` |
| 🆕 | `web/src/components/usage/HeatmapCalendar.tsx` 52 周热图 |
| 🆕 | `web/src/components/usage/StackedModelChart.tsx` |
| 🆕 | `web/src/components/usage/SourceBreakdown.tsx` 我们的差异化 |
| ♻️ | `web/src/pages/Dashboard.tsx` 缩成"快览 + 跳到 /usage" |
| ♻️ | `web/src/App.tsx` `/usage` 路由 |

### 6.3 自测

- curl /api/usage/overview?source=claude-code&days=30
- /usage 页面切 source / 日期范围 → playwright snapshot 看图表

### Commit

```
feat(P4): usage analytics page with multi-source breakdown
```

---

## 7. P5 — /extensions 五子区

### 7.1 后端 scanner

| 操作 | 文件 |
|---|---|
| 🆕 | `server/scanners/hook.ts` 扫 ~/.claude/settings.json + ~/.codex/settings.json hooks 字段 |
| 🆕 | `server/scanners/plugin.ts` 扫 ~/.claude/plugins/cache/ |
| 🆕 | `server/scanners/agent.ts` 扫 ~/.claude/agents/*.md (gray-matter) |
| 🆕 | `server/routes/hooks.ts` `/api/hooks` |
| 🆕 | `server/routes/plugins-installed.ts` `/api/plugins-installed` |
| 🆕 | `server/routes/agents.ts` `/api/agents` |
| ♻️ | `shared/types.ts` HookEntry / PluginEntry / AgentEntry |

### 7.2 前端

| 操作 | 文件 |
|---|---|
| 🆕 | `web/src/pages/ExtensionsView.tsx` 主入口 + section router (?section=skills/mcp/hooks/plugins/agents) |
| 🆕 | `web/src/components/extensions/SkillsSection.tsx` (迁移现 SkillsView) |
| 🆕 | `web/src/components/extensions/McpSection.tsx` (迁移现 MCPsView) |
| 🆕 | `web/src/components/extensions/HooksSection.tsx` |
| 🆕 | `web/src/components/extensions/PluginsSection.tsx` |
| 🆕 | `web/src/components/extensions/AgentsSection.tsx` |
| 🆕 | `web/src/components/sidebar/ExtensionsSidebar.tsx` 5 子区导航 |
| ♻️ | `web/src/App.tsx` `/extensions` `/extensions/:section`，旧 `/skills` `/mcps` 重定向 |
| ♻️ | `web/src/components/Layout.tsx` IconRail 用"扩展"代替 "Skills" + "MCPs" |

### 7.3 自测

- 各 section 都能展示
- 旧 `/skills` URL 仍然能跳到 `/extensions/skills`（避免别人书签失效）
- typecheck

### Commit

```
feat(P5.1): scanners for hooks/plugins/agents
feat(P5.2): unified /extensions with 5 sections
```

---

## 8. P6 — 改名 + 收尾

| 操作 | 文件 |
|---|---|
| ♻️ | `package.json`: name + bin (保留 skill-panel 别名) |
| 🆕 | `bin/agent-panel.mjs`: 复制 skill-panel.mjs 内容 |
| ♻️ | `web/src/components/sidebar/IconRail.tsx`: logo 文案 |
| ♻️ | `web/src/lib/sidebar-state.ts`: localStorage key 前缀 + 写迁移 |
| ♻️ | `README.md` `教程.md` `FEATURES.md` `USAGE.md` |
| 🆕 | `CHANGELOG.md` 0.2.0 全部变更 |

### Commit

```
chore(P6): rename to agent-panel; keep skill-panel as alias
```

---

## 9. 自测策略

### 9.1 后端

- 起 server: `bun --watch server/index.ts --no-open`
- 关键 API 用 curl 验证：

```bash
curl http://127.0.0.1:7788/api/health
curl http://127.0.0.1:7788/api/sessions | jq '.sessions | length'
# 拿一个 session id
SID=$(curl -s http://127.0.0.1:7788/api/sessions | jq -r '.sessions[0].id')
curl http://127.0.0.1:7788/api/sessions/$SID | jq '.messages | map(select(.role == "tool_use")) | length'
```

### 9.2 前端

- 起 dev: `bun run dev` (server + vite 双进程)
- 用 playwright MCP：
  - `browser_navigate` http://localhost:5173
  - `browser_snapshot` 看页面结构
  - `browser_click` 关键交互
  - `browser_take_screenshot` 关键页面留底
  - `browser_console_messages` 看有没有红色 error
  - `browser_network_requests` 看有没有 4xx/5xx

### 9.3 typecheck

每个 commit 前必跑：

```bash
bun run typecheck
```

### 9.4 review-agent

P0-P6 全部完成后，起一个 `review-agent` 做完整 code review，由我修复 review 出的问题。

---

## 10. 上下文管理策略

| 阶段 | 主 session 占用估算（累计） | 何时考虑 commit + 起新 session |
|---|---|---|
| Research 完成 | ~80K | — |
| 写 implementation plan v1 | ~100K | — |
| P0 完成 | ~150K | — |
| P1 完成 | ~220K | — |
| P2 完成 | ~450K | ⚠️ 接近 50%，留意 |
| P3 完成 | ~600K | ⚠️ 60%，**首选**在此处建议用户开新 session |
| P4 完成 | ~750K | 🚨 75%，**强烈建议**新 session |
| P5 完成 | ~900K | 🚨 90%，**必须**新 session |
| P6 + Review | — | 单独新 session |

**策略**：每个阶段完成后我先 git commit，告诉你"本阶段已完成、下阶段是否继续"。如果觉得 context 紧张，我主动建议你开新 session 让我自己读 git log 接续。

---

## 11. 我开干前的最后默认值

| 决策 | 默认 |
|---|---|
| 分支 | 已建 `feat/agent-panel-upgrade` |
| typecheck 失败 | 必须当场修，不允许跨阶段挂 |
| 改名（P6）是否做 | 做，但作为最后一个 commit，方便 revert |
| review-agent 是否在每阶段都跑 | 不，只在最后跑一次（per-phase 跑成本太高） |
| 失败回滚策略 | 阶段内：改到能跑；阶段后发现错：git revert 那段 commits |

——

**Plan v1 到此结束。下一步：开 P0。**
