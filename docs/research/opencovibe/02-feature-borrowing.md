# 02 · 七大功能借鉴方案

> 本文档对应你列的 7 个"很中意的功能"。每节按 **OpenCovibe 怎么做的 / 关键代码 / 网页版可行性 / 我们怎么抄** 的结构展开。

---

## 1. 会话详情独立页 + 左侧轮次栏 + 定位按钮

### OpenCovibe 怎么做

- **路由**：`/chat?run=<runId>` 是一个**整页路由**，不是 drawer。详情页通过 URL 参数携带 `runId`。
- **关键代码**：`src/routes/chat/+page.svelte`（4643 行，最大文件）。
- **左栏**：`+layout.svelte` 中的全局 sidebar，按 cwd 分组 runs（项目文件夹树）。同一 cwd 下展开后，每个 conversation 是一个 `ConversationItem.svelte`。
- **轮次/工具树侧栏**：在**右侧** `ToolActivity.svelte`（1018 行，组件），按 turn 分组：
  - `turns = $derived.by(() => { ... })`：从 timeline 中以 `user` 消息为分界线分 turn；
  - 每个 turn 显示：`turnIndex` + `userPreview`（前 40 字符）+ 该轮内的工具调用树；
  - 工具支持 `parent_tool_use_id` 嵌套层级（subagent 递归子树）。
- **定位按钮**：
  - 工具按钮 `onclick={() => onScrollToTool(tool.tool_use_id)}`；
  - 轮次 header `onclick={() => onScrollToTurn(turn.anchorId)}`（无工具时直接跳）；
  - 父组件 chat page 实现 `scrollToTool` / `scrollToMessage`，用 anchorId 定位到对应 DOM 节点 `scrollIntoView({ behavior: "smooth", block: "center" })`。

### 我们现状

- 详情走 `DetailDrawer`（`web/src/components/DetailDrawer.tsx`），从右侧滑出 640px 浮层，**不是整页**；
- 左侧只有 5 个一级标签的 `Layout.tsx`，没有"项目文件夹树"；
- 详情内的搜索/导航有（`InPaneSearch` + `centerMarkInScroller`），但**没有工具/轮次的目录式定位**。

### 网页版可行性

✅ **完全没问题**。SPA + react-router 给个 `/sessions/:id` 路由即可，一切现有 React 知识够用。

### 借鉴方案

#### 路由改造

```
现有                                改造后
─────────                           ─────────
/sessions       (列表 + drawer)     /sessions          (列表)
                                    /sessions/:id      (整页详情)
```

- `SessionsView.tsx` 卡片点击改为 `navigate(\`/sessions/\${id}\`)` 而非打开 drawer；
- 新建 `pages/SessionDetailView.tsx`：左轮次栏 + 中间会话主体 + 右工具/文件栏；
- 保留 drawer 用于"概览页/收藏页快速预览"场景。

#### 三栏布局

```
┌─────────────────────────────────────────────────────────────┐
│ 顶部：会话标题 + 来源 badge + cwd + Resume 菜单 + 删除      │
├──────────┬───────────────────────────────────┬──────────────┤
│ 左侧     │ 中间：会话消息流（虚拟滚动）       │ 右侧         │
│ 轮次栏   │   ├ user message                  │ 5 tab：      │
│ (200px)  │   │  ├ assistant text             │  Tools       │
│          │   │  ├ tool_use (InlineToolCard)  │  Files       │
│ Turn 1   │   │  └ tool_result                │  Info        │
│ Turn 2   │   ├ user message                  │  Context     │
│ Turn 3 ◄ │   └ ...                           │  Tasks       │
│ ...      │                                   │ (280px)      │
└──────────┴───────────────────────────────────┴──────────────┘
```

#### 关键实现要点

1. **轮次抽取**：从 messages 数组里以 `role === "user"` 切分；每个 turn 携带 `messageId`（作为 anchorId）；
2. **anchorId**：每条 message 渲染时 `<div id={\`msg-\${m.id}\`}>`；
3. **scrollToMessage(id)**：`document.getElementById(...).scrollIntoView({ block: 'center' })`，注意虚拟滚动列表要先 `scrollToIndex` 再 `scrollIntoView`；
4. **当前 turn 高亮**：用 `IntersectionObserver` 监听中间区每条 user message，进入视口时高亮左侧对应 turn；
5. **键盘快捷键**：`j` / `k` 上下翻 turn（抄 OpenCovibe `keybindingStore` 思路，简单 React 实现即可）。

#### 文件清单（新建/改）

- 🆕 `web/src/pages/SessionDetailView.tsx` —— 三栏布局
- 🆕 `web/src/components/TurnSidebar.tsx` —— 左侧轮次栏
- ♻️ `web/src/components/SessionDetail.tsx` —— 拆出消息流部分（不再被 drawer 套住）
- ♻️ `web/src/pages/SessionsView.tsx` —— 卡片点击 → `navigate`

---

## 2. 会话右侧栏

### OpenCovibe 怎么做

`src/lib/components/ToolActivity.svelte`，宽 280px，5 个 icon tab：

| Tab | 作用 | 关键数据 |
|---|---|---|
| **Tools** | 按 turn 分组的工具调用树；展示工具名 + style 色块 + 一段 detail；支持父子缩进；可折叠 turn | timeline → buildToolTree() → ToolNode |
| **Context** | Context window 历史曲线 + per-turn token 用量 | `ContextHistoryPanel` + `TurnUsage[]` |
| **Files** | 这个会话动过的所有文件，带 R/W/E/P 标签（Read/Write/Edit/Persisted）+ 点击跳到 tool_use | `extractFilesFromTimeline + mergeFileEntries` |
| **Info** | sessionId / runName / status / startedAt / endedAt / 时长 / model / cost / numTurns / Subagents 列表 | `SessionInfoData` |
| **Tasks** | 后台任务通知（subagent / async tool） | `Map<task_id, TaskNotificationItem>` |

每个 icon 右上角小圆点 badge 表示有数据。

### 我们现状

- 详情 drawer 内只有"消息列表 + Cmd+F 内搜"，没有 tab；
- 没有"文件统计"、"用量统计"、"会话元信息"的独立呈现。

### 网页版可行性

✅ 100% 能做。

### 借鉴方案

直接抄过来 4 个 tab（Tasks 我们没有，砍掉）：

#### `RightSidebar.tsx` 5 tab → 4 tab

```typescript
type RightSidebarTab = "tools" | "files" | "info" | "context";

interface RightSidebarProps {
  session: SessionFull;
  messages: Message[];
  onScrollToMessage: (id: string) => void;
  onScrollToTool: (toolUseId: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}
```

#### 各 tab 内容

| Tab | 数据来源（已有） | 数据来源（需补） | UI 抄哪 |
|---|---|---|---|
| Tools | `messages.filter(m => m.role === "tool_use")` | 父子嵌套（`parent_tool_use_id` 多数源没有，先做扁平） | `ToolActivity.svelte` 的 `toolNodeView` snippet |
| Files | 从 messages 里 grep `tool_use.input.file_path / path / pattern` | 工具→action 映射表（Read=R, Write=W, Edit=E） | `FilesPanel.svelte`（103 行，全抄） |
| Info | `SessionFull` 的元信息（已有 cwd / model / messageCount / tokensTotal / lastActivity / startedAt） | `cost`、`durationMs` 需要补计算 | `SessionInfoPanel.svelte` |
| Context | per-message tokens（cursor 和 codex jsonl 里有） | 聚合成时间线 | `ContextHistoryPanel.svelte` |

#### 折叠/展开

- localStorage 保存 collapsed 状态；
- 折叠后只保留 44px 宽的 icon rail（参考 OpenCovibe 主侧栏）。

#### 文件清单

- 🆕 `web/src/components/RightSidebar.tsx`
- 🆕 `web/src/components/right-sidebar/ToolsTab.tsx`
- 🆕 `web/src/components/right-sidebar/FilesTab.tsx`
- 🆕 `web/src/components/right-sidebar/InfoTab.tsx`
- 🆕 `web/src/components/right-sidebar/ContextTab.tsx`（可选，P2）
- 🆕 `web/src/lib/file-entries.ts` —— `extractFilesFromMessages()` 工具函数

---

## 3. 工具调用块美化 UI（每块按工具类型 + 看原始数据）

### OpenCovibe 怎么做

- **入口**：`InlineToolCard.svelte`（1766 行）—— 决定渲染层级、折叠/展开、副 timeline；
- **细节**：`ToolDetailView.svelte`（1357 行）—— 按 `tool_name` 分发到不同渲染分支：

| 工具 | 美化方式 |
|---|---|
| `Read` | 用 `renderCodeWithLineNumbers`，带行号 + 语法高亮 |
| `Edit` / `MultiEdit` / `Write` | `renderDiffHunk` 用 `<table>` 渲染 diff，行号 + +/- 颜色 + 语法高亮 |
| `Bash` | `colorizeCommand`（命令着色）+ `ansiToHtml`（输出） |
| `Grep` / `Glob` | 文件路径列表 |
| `WebFetch` | URL + 截断的内容 |
| `Task` (subagent) | `TeamToolDetail` 嵌套 + 子 timeline |
| `TodoWrite` | 任务勾选列表 |
| `ExitPlanMode` | 抽出 plan 内容渲染成 markdown |

辅助函数：
- `extractOutputText`、`extractImageBlocks`、`getLanguageFromPath`、`isImagePath`、`isPlanFilePath`、`copyToClipboard`、`computeFallbackPatch`(`diff` 包的 `structuredPatch`)。

工具颜色映射在 `src/lib/utils/tool-colors.ts`，每个工具一组 `{ bg, text, icon }`。

### OpenCovibe 没做的

⚠️ **没有"美化 / 原始 JSON"切换** —— 想看原始 input/output 的话只能复制工具 JSON 到外面看。

### 我们现状

- `SessionDetail.tsx` 现在按 role 分支：`assistant` 用 `ReactMarkdown`、`tool_use` 直接 `JSON.stringify(toolInput)` 当 markdown 代码块、`tool_result` 类似——**没有任何按工具类型的美化**。

### 网页版可行性

✅ 完全能做，且我们有差异化机会（加 raw 切换）。

### 借鉴方案

#### 设计：每块卡片有三种视图

```
┌─────────────────────────────────────────────────────────┐
│ [icon] Edit  src/foo.ts          [美化 ▾] [📋 Copy]    │
├─────────────────────────────────────────────────────────┤
│  美化视图（默认）                                         │
│   行号 |  - const x = 1                                  │
│   行号 |  + const x = 2                                  │
│  原始 JSON 视图（点切换）                                 │
│   { "input": { ... }, "output": { ... }, "tool_use_id": ... } │
└─────────────────────────────────────────────────────────┘
```

#### 文件结构

```
web/src/components/tool-cards/
├── ToolCard.tsx            # 入口，按 tool_name 分发
├── tool-colors.ts          # 颜色 + 图标映射（抄 OpenCovibe 的）
├── tool-rendering.ts       # 工具函数（getToolDetail / getLanguageFromPath / ...）
├── cards/
│   ├── ReadCard.tsx        # 行号渲染
│   ├── EditCard.tsx        # diff table
│   ├── BashCard.tsx        # 命令 + ANSI 输出
│   ├── GrepCard.tsx        # 匹配列表
│   ├── WriteCard.tsx       # 新建文件
│   ├── TodoWriteCard.tsx   # 任务勾选
│   ├── WebFetchCard.tsx    # URL + content
│   ├── TaskCard.tsx        # subagent
│   ├── DefaultCard.tsx     # fallback：JSON 美化打印
│   └── RawJsonView.tsx     # 共用的"原始 JSON"视图
└── ToolCardHeader.tsx      # 共用头部：图标 + 名字 + detail + 视图切换 + 复制
```

#### 实现要点

1. **dispatcher**：`<ToolCard tool={msg}>` → 内部 switch `tool.tool_name`；
2. **headers** 永远显示，body 切换"美化/原始/折叠"三种状态；
3. **diff 渲染**：直接用 `npm i diff`（OpenCovibe 同款 `structuredPatch`），渲染表格抄 `renderDiffHunk()`；
4. **语法高亮**：`highlight.js` 已经在依赖里；
5. **ANSI**：`npm i ansi-to-html` 或抄 OpenCovibe 的 `src/lib/utils/ansi.ts`；
6. **shell 高亮**：抄 `src/lib/utils/shell-colorize.ts`（200 行内）。

#### 跨 agent 兼容性

要注意：

- Claude Code 工具名是 `Read` / `Edit` / `Bash` / `Grep` / ...
- Cursor agent 工具名可能是 `read_file` / `edit_file` / `run_terminal_cmd` / ...
- Codex 又是另一套

→ 需要在 `tool-rendering.ts` 加一个 **canonical tool name 映射**：

```typescript
const TOOL_ALIASES: Record<string, string> = {
  "read_file": "Read",
  "edit_file": "Edit",
  "run_terminal_cmd": "Bash",
  // ...
};
function canonicalTool(name: string): string {
  return TOOL_ALIASES[name] ?? name;
}
```

---

## 4. 左侧文件目录（按文件夹分类的会话）

### OpenCovibe 怎么做

- **数据来源**：`api.listRuns()` 返回所有 `TaskRun[]`；
- **分组逻辑**：`src/lib/utils/sidebar-groups.ts` 的 `buildProjectFolders(runs, favoriteRunIds, pinnedCwds, removedCwds)`：
  - `normalizeCwd()` 统一路径（盘符大写、`\` → `/`、去 trailing slash）；
  - 按 normalized cwd 分桶，每桶内再按 sessionId 聚合成 `ConversationGroup`；
  - 支持 pinned cwd（手动选的目录即使无 run 也常驻）和 removed cwd（用户隐藏的目录）；
  - 返回 `ProjectFolder[]`，每个含 `conversations` + `latestActivityAt`；
- **UI**：`ProjectFolderItem.svelte` 渲染单个文件夹，可展开看其下 conversations。
- **状态持久化**：`expandedProjects` Set 存 localStorage `ocv:expanded-projects`，pinned/removed 也都在 localStorage。
- **联动**：进入某个 run 时，`autoExpandForRun()` 自动展开该 run 所在的文件夹；切换 cwd 时自动展开新 cwd。

### 我们现状

- 没有左侧文件夹树；左栏只有 5 个一级 NavLink（概览/Skills/MCPs/Sessions/收藏）；
- Sessions 页有 `CollapsibleProjectChips` 把 cwd 列成"chip 横排"，是当筛选用而非"层级树"。

### 网页版可行性

✅ 100% 能做。`buildProjectFolders` 是纯函数可以原样翻译成 TS。

### 借鉴方案

#### 改动

把现 Layout 从"窄一级 nav"改成"宽双层 sidebar"：

```
┌──────────────────────────────────┐
│  44px 图标栏  │  220px 内容栏    │
│              │                   │
│  📊 概览      │  🔍 搜索框        │
│  💬 会话  ◄──│                   │
│  🧩 扩展      │  📁 项目文件夹     │
│  📈 用量      │   ├ ▾ work/proj1 │
│  ⭐ 收藏      │   │   ├ Convo A  │
│              │   │   └ Convo B  │
│              │   └ ▸ work/proj2 │
│              │   📍 未分类       │
│              │     └ Convo C    │
└──────────────┘                   │
```

进入"会话/扩展/用量"等分区时，220px 那栏内容跟着变（参考 OpenCovibe 的 `pluginActiveSection`、`memoryScopeExpanded` 等）。

#### 实现细节

1. **TS 端**：把 `sidebar-groups.ts` 翻译过来：

   ```typescript
   // web/src/lib/sidebar-groups.ts
   export function normalizeCwd(cwd?: string): string { ... }
   export function buildProjectFolders(
     sessions: SessionSummary[],
     favoriteIds: Set<string>,
     pinnedCwds: string[],
     removedCwds: string[]
   ): ProjectFolder[] { ... }
   ```

2. **localStorage keys**（直接抄）：
   - `agent-panel:expanded-projects`
   - `agent-panel:pinned-cwds`
   - `agent-panel:removed-cwds`
   - `agent-panel:sidebar-width`

3. **保留我们的优势**：
   - 在文件夹树**上方**保留搜索框 + Source filter chips（claude-code / cursor-agent / cursor-composer / codex / claude-history）；
   - 搜索时切换到"扁平结果模式"（OpenCovibe 在 `searchResults.length > 0` 时也是这么干的）。

4. **跨 source 的 cwd 归一**：Cursor agent 的 cwd 和 Claude Code 的 cwd 可能落在同一目录，分组时可以用 normalizedCwd 合并展示，每个 conversation 上挂 source badge。

#### 文件清单

- 🆕 `web/src/lib/sidebar-groups.ts`
- ♻️ `web/src/components/Layout.tsx` —— 双层 sidebar
- 🆕 `web/src/components/sidebar/ProjectFolderItem.tsx`
- 🆕 `web/src/components/sidebar/ProjectFolderTree.tsx`
- 🆕 `web/src/components/sidebar/SessionsSidebar.tsx`（包工具栏 + 树）

---

## 5. 搜索（OpenCovibe 怎么这么强？是 Tauri 给的吗？）

### 直接回答

**不是 Tauri 给的**。OpenCovibe 搜索强的原因是 **后端建了持久化全文索引 + facets**，跟 Tauri 完全无关。**我们用 Bun + JSONL 文件可以 1:1 复刻**。

### OpenCovibe 实现细节

#### 索引结构

`src-tauri/src/storage/prompt_index.rs`：

```rust
pub struct PromptEntry {
    pub run_id: String,
    pub seq: u64,
    pub ts: String,
    pub text: String,           // 截断到 500 字符
    pub event_id: Option<String>,
}
```

`src-tauri/src/storage/run_index.rs`：

```rust
pub struct RunIndexEntry {
    pub run_id: String,
    pub cwd: String,
    pub agent: String,
    pub model: Option<String>,
    pub status: RunStatus,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub name: Option<String>,
    pub prompt_preview: String,
    pub tools_used: Vec<String>,
    pub tool_call_count: u32,
    pub files_touched: Vec<String>,
    pub total_cost_usd: f64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub duration_ms: u64,
    pub num_turns: u64,
    pub error_summary: Option<String>,
    pub has_errors: bool,
    pub permission_denied_count: u32,
}
```

→ run-index 自带所有 facets 维度。

#### 增量重建

manifest 文件存 `Map<run_id, (events_mtime_ns, events_size, meta_mtime_ns, meta_size)>`：

```rust
fn file_fingerprint(path: &Path) -> Option<(u128, u64)> {
    let meta = fs::metadata(path).ok()?;
    let mtime = meta.modified()?.duration_since(UNIX_EPOCH)?.as_nanos();
    Some((mtime, meta.len()))
}
```

每次重建只扫"指纹变化过的 run"，已 indexed 的直接复用上次结果。

#### 搜索 API（前端调用）

```typescript
searchPrompts(query: string): Promise<PromptSearchResult[]>
searchRuns(filters: RunSearchFilters): Promise<RunSearchResponse>
```

`RunSearchResponse` 含 `results` + `facets`：

```typescript
interface Facets {
  totalCost: number;
  projects: { value: string; count: number }[];
  agents: { value: string; count: number }[];
  tools: { value: string; count: number }[];
}
```

facets 是**后端直接算好的 group-by**，前端拿来当筛选条件 chips 渲染。

#### 前端筛选 UI

`src/routes/history/+page.svelte`：

- 顶部搜索框（debounce 300ms）
- 状态 pills（completed / failed / stopped / running / idle）
- 折叠的高级面板：项目下拉、agent 下拉、日期预设（today / 7d / 30d / 90d / all）、cost min/max、tool chips
- 排序：date / cost / tokens / turns
- 分页 load more（limit 50）

### 我们现状

- `server/lib/sessions-search.ts`：纯 substring 搜索 summary（title + firstUserMessage + cwd），没建索引；
- 详情内 `InPaneSearch.tsx`：DOM 内 `mark` 高亮，导航 prev/next；
- 没有 facets 概念。

### 网页版可行性

✅ 100% 能做，**不需要任何 Tauri 能力**。

### 借鉴方案

#### Bun 端实现

```
server/lib/index/
├── run-index.ts          # 扫所有源 → RunIndexEntry[] → 写 logs/index/run-index.jsonl
├── prompt-index.ts       # 扫所有源消息 → PromptEntry[] → 写 logs/index/prompt-index.jsonl
├── manifest.ts           # 指纹比较 + 增量
└── search.ts             # 内存查询：fuzzy / facets / sort / paginate
```

存储路径：

```
./logs/index/
├── run-index.jsonl
├── run-index-manifest.json
├── prompt-index.jsonl
└── prompt-index-manifest.json
```

#### 关键技术点

1. **Bun 写 jsonl**：`Bun.file().writer()` 流式写、`new Bun.FileSink()`；
2. **指纹**：Node `fs.statSync` 给 `mtimeMs` 即可（不需要 ns 精度）；
3. **内存 cache TTL**：`Map<key, { computedAt, data }>` + 120s TTL 检查；
4. **atomic write**：`writeFileSync(.tmp)` + `renameSync()`；
5. **搜索算法**：substring 已经够用；要想"模糊匹配"可以加 `fuse.js`（仅前端用，服务端只做精确/前缀匹配快）。

#### API 改造

```typescript
// 新增
POST /api/runs/search
  body: RunSearchFilters
  response: { results, totalMatching, facets }

POST /api/prompts/search
  body: { query, limit }
  response: PromptSearchResult[]

// 重建
POST /api/index/rebuild
  query: ?source=run|prompt|all
```

#### 前端改造

新增 `pages/HistoryView.tsx`，结构按 OpenCovibe `history/+page.svelte` 抄：

- 顶部搜索 + filter toggle
- Status pills
- 高级筛选面板（项目/agent/日期/cost/tool）
- 排序按钮
- Run 卡片列表 + load more

可以直接替代或者并存于现 `SessionsView.tsx`（建议直接换掉）。

#### 跨 agent 数据归一

我们的优势：5 源都映射到 `RunIndexEntry`，cost/tokens 缺失的字段（如 cursor agent）置 0 或 undefined，前端按"该 source 是否有此字段"决定显隐。

---

## 6. 用量统计（区分 Claude Code / Cursor / Codex）

### OpenCovibe 怎么做

`src/routes/usage/+page.svelte`（642 行）：

- **顶部 scope 切换**：`global` (扫整个 ~/.claude) / `app` (只本 app 的 runs)
- **日期范围**：1d / 7d / 30d / 90d / All
- **4 张概览卡**：totalCost / totalTokens / totalRuns(or sessions) / activeDays(or streak)
- **52 周 heatmap**：`HeatmapCalendar` 组件，按日期格子，颜色深浅 = activity
- **30 天柱状图**：每天 cost / tokens / messages / sessions 切换
- **By Model 表格**：每个 model 的 in/out/cacheRead/cacheWrite/cost/百分比
- **Stacked Model Chart**：tokens 模式时按 model 堆叠
- **Run/Session 列表**：可按 date / cost / tokens / turns 排序

后端：`src-tauri/src/storage/claude_usage.rs`（963 行）—— 扫描 `~/.claude` 下所有 jsonl，提取每条消息的 token usage 和 cost；按日聚合；同款 manifest 增量。

### 我们现状

- `Dashboard.tsx` 4 张统计卡（Skills/MCPs/Sessions/收藏数量）+ source 分布 + 最近改动；
- 没有 cost / tokens 统计；
- 没有按 source 切分用量的能力。

### 网页版可行性

✅ 能做。Cursor agent / Codex 的 jsonl 里都带 token 字段；唯一受限的是 cost——

| Source | tokens 数据 | cost 数据 |
|---|---|---|
| `claude-code` | ✅ 完整 input/output/cache | ✅ 自带 `total_cost_usd` |
| `cursor-agent` | ✅ jsonl 里有 | ❌ 没有（需查 model 单价表算） |
| `cursor-composer` | ⚠️ 不一定（看版本） | ❌ |
| `codex` | ✅ | ⚠️ 看是否带（OpenAI 通常不带，需算） |
| `claude-history` | ❌（只是 prompt 列表） | ❌ |

→ Cursor / Codex 的 cost 我们用 **本地 model price table** 算（OpenCovibe 也有 `src-tauri/src/pricing.rs`），不准就标"估算"。

### 借鉴方案

#### 新增页面 `/usage`

```
顶部：source 切换 [全部] [Claude Code] [Cursor] [Codex]   日期 [1d 7d 30d 90d All]   [刷新]

┌─ 4 张卡 ──────────────────────────────────────┐
│ 总成本   总 token   总会话   活跃天数         │
└──────────────────────────────────────────────┘

┌─ 52 周 Heatmap ──────────────────────────────┐
│  ░░░░░░░▓▓▓▓░░░░▒▒▒▒▒▒▓▓▓▓░░░░░░░         │
└──────────────────────────────────────────────┘

┌─ 每日趋势（30天）  [cost][tokens][messages][sessions] ─┐
│   ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▁▂▃▄▅▆▇█▇▆▅▄▃▂▁          │
└──────────────────────────────────────────────────────┘

┌─ By Model ────────────────────────────────────────────┐
│ Model               | in    | out   | cost   | %     │
│ claude-sonnet-4.5   | 1.2M  | 230K  | $4.32  | 65%   │
│ claude-opus-4       | 200K  | 50K   | $1.85  | 28%   │
│ ...                                                    │
└──────────────────────────────────────────────────────┘

┌─ By Source ──────────────────────────────────────────┐  ← 我们的差异化
│ Claude Code (Desktop): 120 sessions, $X, Y tokens     │
│ Cursor agent:           80 sessions, $Z (估算), W tok │
│ Codex:                  5 sessions, $A (估算), B tok  │
└──────────────────────────────────────────────────────┘

┌─ 最近会话表（可按 cost/tokens/turns 排序） ────────────┐
│ ...                                                    │
└──────────────────────────────────────────────────────┘
```

#### 后端实现

- 复用 `run-index.ts`（已经有 `total_cost_usd / input_tokens / output_tokens`）
- 新增 `server/lib/usage.ts`：`getUsageOverview({ source?, days? })`
- 新增 `server/lib/pricing.ts`：本地 model → $/M tokens 表（手动维护，跟 OpenCovibe 同款）
- API：
  - `GET /api/usage/overview?source=&days=`
  - `GET /api/usage/heatmap?source=&days=365`
  - `GET /api/usage/by-model?source=&days=`

#### 前端

- 🆕 `web/src/pages/UsageView.tsx`
- 🆕 `web/src/components/usage/HeatmapCalendar.tsx`（抄 OpenCovibe）
- 🆕 `web/src/components/usage/StackedModelChart.tsx`（抄 OpenCovibe）
- 🆕 `web/src/components/usage/SourceBreakdown.tsx`（我们独有）

#### 注意事项

- Cursor / Codex 用 estimated cost 时打"~"前缀；
- claude-history 不计入用量（只是 prompt 历史，无 token 信息）；
- 顶部 source 切换记得带 source filter 传给所有图表。

---

## 7. 扩展面板（Skills / MCP / Hook / Plugin / Agent）

### OpenCovibe 怎么做

`src/routes/plugins/+page.svelte`（1917 行）+ `+layout.svelte` 的 `pluginSections`：

```typescript
const pluginSections = [
  { id: "skills",  label: "Skills",      icon: "sparkles" },
  { id: "mcp",     label: "MCP Servers", icon: "server" },
  { id: "hooks",   label: "Hooks",       icon: "webhook" },
  { id: "plugins", label: "Plugins",     icon: "package" },
  { id: "agents",  label: "Agents",      icon: "agents" },
];
```

进入 `/plugins` 时左侧 220px 栏切换成"5 子区导航"；右侧主内容跟着 active section 切换不同 panel：

| 子区 | 关键组件 | 数据来源 |
|---|---|---|
| Skills | 自身 page (Discover/Installed 切换) + skill 编辑器 | `~/.claude/skills/`、marketplace、社区 |
| MCP | `McpDiscoverPanel` + `McpConfiguredPanel` | `~/.claude/settings.json`、registry |
| Hooks | `HookManager` | `~/.claude/settings.json` 的 hooks 字段 |
| Plugins | 自身 page (Marketplace/Installed 切换) + Registries | `~/.claude/plugins/cache/`、marketplaces |
| Agents | `AgentsPanel` | `~/.claude/agents/*.md` |

每子区都支持搜索 + 详情 drawer。

### 我们现状

- `/skills` 单独一页（瀑布流卡片）
- `/mcps` 单独一页（卡片）
- 没有 hooks / plugins（marketplace） / agents 的扫描和展示

### 网页版可行性

✅ 都能做。差别只在我们**做不了在线安装**（不去执行 `git clone` 和子进程），只展示扫描到的。

### 借鉴方案

#### 路由合并

```
现有                         改造后
─────                        ─────
/skills                      /extensions          (默认 skills)
/mcps                        /extensions/skills
                             /extensions/mcp
                             /extensions/hooks
                             /extensions/plugins
                             /extensions/agents
```

如不想动 URL，可以用 query param：`/extensions?section=skills`。

#### 新增的扫描器

```
server/scanners/
├── skill.ts (已有)
├── mcp.ts (已有)
├── hook.ts        🆕  扫描 ~/.claude/settings.json + ~/.codex/settings.json 的 hooks
├── plugin.ts      🆕  扫描 ~/.claude/plugins/cache/ + marketplaces
└── agent.ts       🆕  扫描 ~/.claude/agents/*.md
```

#### Hook 扫描

Hook 配置在 `~/.claude/settings.json` 里：

```json
{
  "hooks": {
    "PreToolUse": [...],
    "PostToolUse": [...],
    "Notification": [...],
    "Stop": [...],
    "SubagentStop": [...]
  }
}
```

每个 hook 是 `{ matcher: "Tool", command: "shell..." }`。我们扫出来按事件分组展示就好。

#### Plugin 扫描

我们已经在 skill 扫描里覆盖了 `~/.claude/plugins/cache/<market>/<plugin>/<ver>/skills/`，所以 plugin **已经是部分扫到了**。补一个：

- 扫 `~/.claude/plugins/cache/<market>/<plugin>/<ver>/.opencode/plugin.json` 或 `claude_plugin.toml` 拿 plugin 元数据；
- 同时列出该 plugin 的 components: skills + commands + hooks + agents + mcp_servers

#### Agent 扫描

`~/.claude/agents/<name>.md` 是 frontmatter + body 的 markdown：

```markdown
---
name: code-reviewer
description: ...
tools: [Read, Grep]
---
You are a code reviewer...
```

复用我们 skill 的 `gray-matter` 解析就行。

#### UI 共用骨架

5 子区共享一个 `<ExtensionList>` 骨架：搜索框 + 来源 filter + 卡片网格 + 点击 drawer 详情。每子区往里塞自己的 `<XxxCard>` 和 `<XxxDetail>`。

#### 取舍

不抄 OpenCovibe 的：

- 在线 marketplace 安装/卸载（我们做不了）
- Skill 在 panel 里编辑（坚持只读）
- Plugin 启停切换（要写文件）

抄过来的：

- 5 子区分类导航
- 卡片 + 详情 drawer
- 各子区自带搜索/筛选

#### 文件清单

- 🆕 `server/scanners/hook.ts` / `plugin.ts` / `agent.ts`
- 🆕 `server/routes/hooks.ts` / `plugins-installed.ts` / `agents.ts`
- 🆕 `web/src/pages/ExtensionsView.tsx` —— 主入口，子区切换
- 🆕 `web/src/components/extensions/SkillsSection.tsx`（基本是现 SkillsView 的迁移）
- 🆕 `web/src/components/extensions/McpSection.tsx`
- 🆕 `web/src/components/extensions/HooksSection.tsx`
- 🆕 `web/src/components/extensions/PluginsSection.tsx`
- 🆕 `web/src/components/extensions/AgentsSection.tsx`
- 🆕 `shared/types.ts` 加 `HookEntry / PluginEntry / AgentEntry`

---

## 总结：网页版到底有没有限制

| 功能维度 | 网页版限制 | 解决方案 |
|---|---|---|
| 文件扫描 | 无 | Bun 直接 fs |
| SQLite 解析 | 无 | `bun:sqlite` |
| 持久化索引 | 无 | jsonl 文件 |
| 搜索/facets | 无 | 后端聚合 |
| 实时推送 | 轮询 / 手动刷新 | 可上 SSE，但优先级低 |
| 跨平台快捷键 | 仅在 web 内 | 够用 |
| 系统通知 | 仅 Web Notification API | 不需要（只读看板） |
| 拖拽文件 | 浏览器 File API | 不需要 |
| URL scheme（cursor:// terminal://） | ⚠️ 浏览器会询问 | 服务端用 `open` 包打开；已经是这样了 |
| 在线安装/卸载 plugin | ⚠️ 不能执行 shell（也不该） | 只展示已装的；安装由用户自己装好 |

**没有任何一项是必须切桌面 app 才能做的。**
