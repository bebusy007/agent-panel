以下为基于仓库 `/Users/wangshujun/github-space/OpenCovibe/` 的阅读结论，按你要求的 13 个 section 组织。**TurnUsage** 定义在 `src/lib/stores/types.ts`，不在 `src/lib/types.ts`；迁移时建议与 `TimelineEntry` / `BusToolItem` 一并对照 `stores/types` 与 `types.ts` 的重复导出关系。

---

### 1. 数据模型

`src/lib/types.ts` 中相关接口（节选为 TypeScript 形态）：

```typescript
// ContextSnapshot.data 实际类型见 $lib/utils/context-parser 的 ContextData
export interface ContextSnapshot {
  runId: string;
  turnIndex: number;
  ts: string;
  data: import("$lib/utils/context-parser").ContextData;
}

export interface FileEntry {
  path: string;
  action: "read" | "write" | "edit" | "persisted";
  toolUseId?: string;
  status?: string;
}

export interface SessionInfoData {
  sessionId?: string;
  runId?: string;
  runName?: string;
  cwd: string;
  numTurns: number;
  status: RunStatus;
  startedAt: string | null;
  endedAt: string | null;
  lastTurnDurationMs: number;
  tokensEstimated: boolean;
  model: string;
  agent: string;
  cliVersion: string;
  permissionMode: string;
  fastModeState: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  contextWindow: number;
  contextUtilization: number;
  compactCount: number;
  microcompactCount: number;
  mcpServers: McpServerInfo[];
  remoteHostName?: string | null;
  platformId?: string | null;
  cliUsageIncomplete?: boolean;
  runSource?: string;
  authSourceLabel?: string;
  platformName?: string;
  cliUpdateAvailable?: string;
}

export interface BusToolItem {
  tool_use_id: string;
  tool_name: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  status:
    | "running"
    | "success"
    | "error"
    | "denied"
    | "ask_pending"
    | "permission_denied"
    | "permission_prompt";
  permission_request_id?: string;
  duration_ms?: number;
  elapsed_time_seconds?: number;
  summary?: string;
  suggestions?: PermissionSuggestion[];
  tool_use_result?: Record<string, unknown>;
}

export type TimelineEntry =
  | { kind: "user"; id: string; anchorId: string; content: string; ts: string; attachments?: Attachment[]; cliUuid?: string }
  | { kind: "assistant"; id: string; anchorId: string; content: string; ts: string; thinkingText?: string; model?: string }
  | { kind: "tool"; id: string; anchorId: string; tool: BusToolItem; ts: string; subTimeline?: TimelineEntry[] }
  | { kind: "separator"; id: string; anchorId: string; content: string; ts: string }
  | { kind: "command_output"; id: string; anchorId: string; content: string; ts: string };
```

**TurnUsage**（`src/lib/stores/types.ts`）：

```typescript
export interface TurnUsage {
  turnIndex: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
  durationApiMs?: number;
  durationMs?: number;
}
```

**ContextData**（`src/lib/utils/context-parser.ts`）：`model`, `usedTokens`, `maxTokens`, `percentage`, `categories[]`, `subTables[]`。

---

### 2. 工具颜色映射

`src/lib/utils/tool-colors.ts`：`ToolColor` 含 **bg / text / icon / border**（每项均为 Tailwind 类名字符串 + SVG path）。`getToolColor(name)` 未命中时用 `defaultToolColor`。

**完整 `toolColors` 键与四字段**（与源码一致）：

| key | bg | text | icon (path d) | border |
|-----|-----|------|---------------|--------|
| read_file | bg-blue-500/10 | text-blue-500 dark:text-blue-400 | M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z | border-blue-500/30 |
| Read | 同上 | 同上 | 同上 | 同上 |
| write_file | bg-amber-500/10 | text-amber-600 dark:text-amber-400 | M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z | border-amber-500/30 |
| Write | 同上 | 同上 | 同上 | 同上 |
| edit_file | 同 write_file | 同 write_file | 同 write_file | border-amber-500/30 |
| Edit | 同 write_file | 同 write_file | 同 write_file | border-amber-500/30 |
| bash | bg-emerald-500/10 | text-emerald-600 dark:text-emerald-400 | M4 17l6-6-6-6M12 19h8 | border-emerald-500/30 |
| Bash | 同上 | 同上 | 同上 | 同上 |
| list_directory | bg-purple-500/10 | text-purple-600 dark:text-purple-400 | M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z | border-purple-500/30 |
| search_files | bg-purple-500/10 | text-purple-600 dark:text-purple-400 | M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.35-4.35 | border-purple-500/30 |
| Grep / Glob | 同 search_files | 同 search_files | 同 search_files | border-purple-500/30 |
| Task | bg-cyan-500/10 | text-cyan-600 dark:text-cyan-400 | M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 | border-cyan-500/30 |
| AskUserQuestion | bg-yellow-500/10 | text-yellow-600 dark:text-yellow-400 | M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z | border-yellow-500/30 |
| WebFetch / WebSearch | bg-sky-500/10 | text-sky-600 dark:text-sky-400 | M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z | border-sky-500/30 |
| TaskOutput | bg-cyan-500/10 | text-cyan-600 dark:text-cyan-400 | M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3 | border-cyan-500/30 |
| TaskStop | bg-red-500/10 | text-red-600 dark:text-red-400 | M6 6h12v12H6z | border-red-500/30 |
| TaskCreate | bg-teal-500/10 | text-teal-600 dark:text-teal-400 | M12 5v14M5 12h14 | border-cyan-500/30（源码如此） |
| TaskGet | bg-cyan-500/10 | text-cyan-600 dark:text-cyan-400 | M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z | border-cyan-500/30 |
| TaskUpdate | bg-cyan-500/10 | text-cyan-600 dark:text-cyan-400 | M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15 | border-cyan-500/30 |
| TaskList | bg-cyan-500/10 | text-cyan-600 dark:text-cyan-400 | M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01 | border-cyan-500/30 |
| NotebookEdit | bg-violet-500/10 | text-violet-600 dark:text-violet-400 | M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13l2 2 4-4 | border-violet-500/30 |
| EnterPlanMode | bg-indigo-500/10 | text-indigo-600 dark:text-indigo-400 | M12 2l4 4-4 4M12 22l-4-4 4-4M20 12H4 | border-indigo-500/30 |
| ExitPlanMode | bg-indigo-500/10 | text-indigo-600 dark:text-indigo-400 | M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11 | border-indigo-500/30 |
| Skill | bg-rose-500/10 | text-rose-600 dark:text-rose-400 | M13 2L3 14h9l-1 8 10-12h-9l1-8z | border-rose-500/30 |
| TeamCreate | bg-teal-500/10 | text-teal-600 dark:text-teal-400 | M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM23 21v-2a4 4 0 0 1-3-3.87M16 3.13a4 4 0 0 1 0 7.75 | border-teal-500/30 |
| TeamDelete | bg-red-500/10 | text-red-600 dark:text-red-400 | M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM23 6l-6 6M17 6l6 6 | border-red-500/30 |
| SendMessage | bg-violet-500/10 | text-violet-600 dark:text-violet-400 | M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z | border-violet-500/30 |
| PowerShell | bg-blue-500/10 | text-blue-600 dark:text-blue-400 | M5 3l7 9-7 9M14 21h7 | border-blue-500/30 |
| Monitor | bg-cyan-500/10 | text-cyan-600 dark:text-cyan-400 | M12 20v-6M6 20V10M18 20V4 | border-cyan-500/30 |

**defaultToolColor**：`bg: bg-muted`, `text: text-muted-foreground`, `icon: M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5`, `border: border-border/30`。

---

### 3. `tool-rendering.ts` 关键工具函数

**`getToolDetail(input)`**  
按「第一个有值的字段」链式返回：`file_path` → `notebook_path` → `path` → `command` → `pattern` → `query` → `url` → `description` → `prompt` → `team_name` → `subject` → `taskId`/`task_id`（格式 `#…`）→ `skill` → `recipient`；空对象返回 `""`。

**`getToolRenderLevel(name, status)` → `1 | 2 | 3`**  
- `AskUserQuestion`：恒为 **3**。  
- `status === "permission_prompt"`：**3**。  
- `ExitPlanMode` 且 `permission_prompt`：**3**（计划审批大卡）；其它 `ExitPlanMode` 状态为 **1**（单行）。  
- `LEVEL_2_TOOLS`：`Bash`, `bash`, `Edit`, `edit_file`, `Write`, `write_file` → **2**。  
- 其余 → **1**。  
含义：**1** 信息型单行；**2** 输出为主、默认展开、左侧强调边框；**3** 交互卡（问答 / 权限 / 计划审批）。

**其它函数逻辑摘要**  
- `friendlyToolName`：固定映射表（如 Bash→「Run commands」），否则原名。  
- `planFileName` / `isPlanFilePath`：`/.claude/plans/` 或 `.claude/plans/` 且以 `.md` 结尾；`planFileName` 取末段去 `.md`。  
- `extractTaskToolMeta`：需 `subagent_type` 或 `subagentType` 字符串；返回 `subagentType`, `description`, `model`, `isolation`, `prompt`（prompt 超 200 字符截断加 `…`）。  
- `extractOutputText`：字符串直接；对象优先 `content` 数组/字符串、`error`、顶层数组块，最后 `JSON.stringify`。  
- `extractImageBlocks`：`content` 或顶层数组里 `type === "image"` 的块。  
- `getLanguageFromPath`：扩展名 → highlight.js 语言名映射表。  
- `isImagePath`：扩展名集合 png/jpg/jpeg/gif/webp/svg/bmp/ico/avif。  
- `isToolTerminal`：`success | error | denied | permission_denied`。  
- `shouldShowSubTimeline(status, hasSubTimeline)`：无子时间线 → false；否则 **非 terminal** 时默认展开（terminal 时默认折叠）。  
- `extractStructuredOutput`：解析 JSON 字符串、unwrap `content` 等，供 Team 工具等使用。

**导出（命名）**：`extractTextFromBlocks`, `extractOutputText`, `extractImageBlocks`, `getLanguageFromPath`, `isImagePath`, `extractStructuredOutput`, `friendlyToolName`, `isPlanFilePath`, `planFileName`, `extractTaskToolMeta`, `isToolTerminal`, `isToolActive`, `shouldShowSubTimeline`, `aggregateBatchStatus`, `detectBatchGroups`, `detectToolBursts`, `planFileSuffix`, `extractPlanContent`, `applyPlanEditsForward`, `getToolRenderLevel`, `getToolDetail`, `formatSuggestionLabel`, `copyToClipboard`；以及类型 `TaskToolMeta`, `ToolBurst`。

---

### 4. `InlineToolCard.svelte` 渲染逻辑

**Props**：`tool`, `subTimeline`, `runId`, `fetchToolResult`, `onAnswer`, `onApprove`, `onPermissionRespond`, `onExitPlanClearContext`, `taskNotifications`, `planContent`, `latestPlanTool`, `showPermissionInPanel`（用途见源码注释：懒加载、权限 IPC、计划内容、是否交给浮动 PermissionPanel）。

**状态**  
- `userExpanded: boolean | null`：`null` 表示用默认推导；显式点击后覆盖。  
- `submitting`：权限/回答提交中；`tool.status` 变化时 `$effect` 复位。  
- `lazyResult` / `lazyLoading` / `lazyFailed`：截断结果懒加载；`isTruncated` 来自 `tool_use_result._truncated`。

**derived**  
- `expanded`：`userExpanded ?? (renderLevel===2 || (isPlan && latestPlanTool) || isInputStreaming)`。  
- `isInputStreaming`：`running` 且非 Ask、非 Agent/Task、有 `input` 键、且存在 `_inputJsonAccum`（流式 JSON）。  
- `showSubTimeline`：若有 `userExpanded !== null` 且存在 subTimeline，**用 userExpanded 同时控制「主内容展开」和「子时间线」**；否则用 `shouldShowSubTimeline`。  
- `isAgentLike`：`Agent` 或 `Task`。  
- `isAsk`：`AskUserQuestion`。  
- `isPlan`：路径为 plan 文件。  
- `detail` / `displayDetail`：plan 时用 i18n 计划标签。

**折叠/展开**：Level 1/2 整行 `handleToggle`：`hasSubTimeline ? !showSubTimeline : !expanded`，并写入 `userExpanded`。Level 3 分支不走同一套 header。

**SubTimeline UI**：`mt-2 ml-4 pl-3 border-l-2 border-blue-500/30`；`assistant` 显示 thinking + Markdown；`tool` 递归 `svelte:self`。

**三路 UI**  
1. **AskUserQuestion**：running/ask_pending → 黄框提问+选项；permission_prompt → 琥珀权限流；结束后灰框展示选项选中态 / `isAskDenied` 红徽章「拒绝」。  
2. **ExitPlanMode + permission_prompt**：靛青主题四按钮（清上下文、自动 accept、手动批准、保留计划+deny+备注）；`planContent` 预览 Markdown。  
3. **普通 tool**：Level 3 为权限/占位；Level 1/2 为图标+标题行+可选 `ToolDetailView`。

**permission**：`showPermissionInPanel && permission_prompt && 非 Ask/ExitPlanMode` → 一行「等待浮动面板」。否则琥珀 **Allow / Deny / Deny+Stop** + `suggestions` 蓝按钮链。

**permission_denied**：并入 `statusKind === "error"`，`StatusIcon` 显示 **error**（叉号），无单独红色条除非 Ask 的 `isAskDenied` 徽章。

**头部**：图标 `getToolColor`；Task 显示 `extractTaskToolMeta`；Bash 优先 `description` 否则 `$ command` 截断；`outputSizeLabel` 来自 `tool_use_result` 多种形状；`StatusIcon(done|error|running)`。

---

### 5. `ToolDetailView` 按工具分发

| 工具 | input / output / tool_use_result | UI | 关键类 |
|------|----------------------------------|-----|--------|
| **Bash** | `input.command`；`tool_use_result` 含 `stdout`,`stderr`,`interrupted`；否则 `extractOutputText(output)` | `colorizeCommand`→HTML；ANSI→`safeAnsiHtml` 或 strip；运行中脉冲光标 | `tool-terminal` |
| **Read** | `filePath`；`tool_use_result.file`：`content`,`numLines`,`startLine`,`totalLines` | 图片：`extractImageBlocks`+data URL；否则 `renderCodeWithLineNumbers`+hljs；可选复制 | `tool-file-header`, `tool-code-block`, `tool-line-num` |
| **Edit** | `structuredPatch`+`oldString`+`originalFile`；fallback `old_string`/`new_string` | `adjustHunkLineNumbers`+`renderDiffHunk`；hunk 头 `@@ -oldStart,oldLines +newStart,newLines @@`；尾部可有 `outputText` 小框「tool_result」 | `diff-section`, `diff-table`, `diff-row-*`, `diff-gutter`, `diff-sign-*` |
| **Write** | 计划路径：`input.content` → **Markdown**（优先于 patch）；`writeHasPatches` 同 Edit；新文件 `input.content` 行号高亮 | 同上 | `prose-chat`（计划） |
| **Grep / Glob** | `input.pattern`,`path`,`glob`；`grepResult`/`globResult` 统计 | 顶部输入摘要+计数；输出 `pre` 纯文本或 Markdown(WebFetch) | 紫色/灰辅助色 class |
| **WebFetch** | `tool_use_result`：`code`,`bytes`,`codeText`,`url` | 状态徽章+`MarkdownContent` | `prose-chat` |
| **WebSearch** | `results[]` 结构化链接 | 每条 `title`+`url` 链接列表 | — |
| **Task** | `input.subagent_type`,`prompt`；`taskResult` 统计/async | 短摘要+Markdown 输出 | — |
| **TodoWrite** | `newTodos[]` status 徽章 | 列表行 | 状态色 tailwind |
| **Skill** | `commandName`,`status`,`result` | forked 时 Markdown | — |
| **ExitPlanMode** | `awaitingLeaderApproval`；`plan` | Markdown | `prose-chat` |
| **NotebookEdit** | `new_source`,`language`,`notebook_path`,`edit_mode` | `renderCodeWithLineNumbers(nbLang)` | `tool-file-header` |
| **Team\*** | `isTeamTool` → `TeamToolDetail.svelte` | TeamCreate/TaskCreate/… 各自分支；`extractStructuredOutput` | — |
| **默认** | `JSON.stringify(input)` hljs json；`outputText` pre | 大块可复制 | — |

**MultiEdit**：当前 `ToolDetailView.svelte` **无**专门分支 → 走**默认** JSON + 文本。

**CSS 类作用**（见第 13 节）：`diff-table` 全宽表格对齐；`diff-row-added/removed/context` 行背景与文字色；`diff-sign-add/del` +/- 颜色；`tool-line-num` 行号列。

---

### 6. diff 与 ANSI

**`renderDiffHunk`**：对 hunk.lines 去掉首字符 `+/-/空格` 得 `cleanLines`；整段 `highlightBlock` 后按行对齐；每行根据 raw 首字符维护 `oldLine`/`newLine` 递增；`-` 仅 old 列有号，`+` 仅 new 列，空格双列；输出 `<table class="diff-table">`。

**`adjustHunkLineNumbers`**：若 `originalFile` 与 `oldString` 可定位，`indexOf` 得真实起始行；与 `hunks[0].oldStart` 算 offset，对所有 hunk 平移 `oldStart/newStart`。

**`computeFallbackPatch`**：`structuredPatch("", "", oldStr, newStr, "", "", { context: 3 })`；若 `originalFile` 含 `oldStr`，`lineOffset = linesBefore - 1`，给每个 hunk 的 `oldStart/newStart` 加上 offset。

**ANSI**：`ANSI_SIZE_LIMIT = 200_000`；超长或 `!hasAnsiCodes` 则 `safeAnsiHtml` 返回 `null`，降级为 `stripAnsi` 纯文本；运行中不解析 ANSI。

---

### 7. `ChatMessage.svelte` 结构

- **用户**：左侧用户图标+「You」；**助手**：橙色星形图标+「Claude」文案（i18n）。  
- **可选** `onRewind`：悬停显示倒带按钮。  
- **复制**：剪贴板，`copied` 状态 1.5s。  
- **时间**：今日仅时间，否则 `fmtDateTime`；`title` 完整时间。  
- **用户长消息**：`isUser && lineCount > 10` → `collapsed` 默认 true，`max-h-24` + mask 渐变；展开按钮。  
- **附件**：图片 data URL；其它 `FileAttachment`。  
- **助手**：可选 `thinkingText` 可折叠蓝框；正文 `div.prose-chat` + `MarkdownContent`。  
- **无 token usage**（本组件内）；usage 在 chat 页其它处。

---

### 8. `ToolActivity` 右侧栏

**Tab**：5 个图标 **Tools / Context / Files / Info / Tasks**（`activeTab`）；Context 有快照时绿点、Files 有文件时琥珀点、Tasks 有 `activeBackgroundTasks` 时蓝脉冲点。

**Turn 分组**：遍历 `timeline`，跳过 `separator`；遇 `user` 先 flush 当前 turn（含 `userPreview` 前 40 字、`anchorId`），`turnIdx++`；`tool` 用 `seen` 去重后挂到当前 turn 的 `ToolNode`（含递归 `buildToolTree(subTimeline)`）。

**树与扁平**：`flattenNodes` 用于统计与 subagent 提取。

**折叠**：`collapsedTurns`：`turns.length` 变化时默认只展开**最后一轮**。

**回调**：`onScrollToTool?: (toolUseId: string) => void`；`onScrollToTurn?: (anchorId: string) => void`。

**状态徽章**：`categorizeBusStatus` → `StatusIcon`：`success`→done，`running`→running，`error|denied|permission_denied`→error，`ask_pending|permission_prompt`→other；Hook 模式类似。

**Summary chips**：`Object.entries(counts).sort((a,b)=>b[1]-a[1])`，仅当 `length > 1` 时显示。

**Subagents**：每 turn 扁平后 `tool_name==="Task"`，`extractTaskToolMeta`，`totalToolUseCount`/`totalDurationMs` 来自 `tool_use_result`。

**Background tasks**：`active` 优先，其次 `startedAt` 升序；展示 `bgElapsed`。

---

### 9. `FilesPanel` → React 草稿（注释型 JSX）

```tsx
// props: fileEntries: FileEntry[], onScrollToTool?: (id: string) => void
// shortPath: parts.length > 2 ? "…/" + lastTwo : full
// actionColor: write/edit amber, read blue, persisted emerald
// actionLabel: W|E|R|P

<div className="flex-1 overflow-y-auto py-1">
  {fileEntries.length === 0 ? (
    <div className="flex h-32 items-center justify-center text-xs text-muted-foreground/50">
      {/* i18n: no files */}
    </div>
  ) : (
    fileEntries.map((entry, i) => {
      const color = actionColor(entry.action);
      const canJump = !!entry.toolUseId;
      return canJump ? (
        <button
          key={`${entry.path}-${i}`}
          type="button"
          className="group w-full rounded-sm px-2.5 py-1 text-left transition-colors hover:bg-accent/50"
          onClick={() => onScrollToTool?.(entry.toolUseId!)}
          title={/* scroll to tool */}
        >
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold ${color.bg} ${color.text}`}>
              {actionLabel(entry.action)}
            </span>
            <span className="min-w-0 truncate text-[11px] text-foreground group-hover:underline">{shortPath(entry.path)}</span>
          </div>
        </button>
      ) : (
        <div key={`${entry.path}-${i}`} className="cursor-default px-2.5 py-1">
          <div className="flex items-center gap-1.5">
            {/* 同上 badge */}
            <span className="min-w-0 truncate text-[11px] text-muted-foreground">{shortPath(entry.path)}</span>
            {/* 不可定位：搜索图标 SVG */}
          </div>
        </div>
      );
    })
  )}
</div>
```

源文件：`/Users/wangshujun/github-space/OpenCovibe/src/lib/components/FilesPanel.svelte`。

---

### 10. `SessionInfoPanel` 展示字段

**实际渲染**（`SessionInfoData` 中 **未展示** 的如 `cost`、`inputTokens` 等若在别处需要可接 `ContextHistoryPanel` 的 Resources 区）：  
- Session：`sessionId`（可复制全 id，按钮显示前 8 位）、`runName`、`status`（**running** 翠绿 / **failed** destructive / 其它 `foreground/80`）、`displayDuration`（running 用 `setInterval` 1s 更新 `elapsed`；否则 `endedAt-startedAt`）、`lastTurnDurationMs`、`numTurns`。  
- Model：`model`、`agent`、`cliVersion`（+ `cliUpdateAvailable` 提示）、`permissionMode`、`fastModeState`。  
- Environment：`cwd`、`remoteHostName`、`platformId`、**MCP 列表**（圆点：connected/running 绿，error/failed 红，其它灰）。  
- Auth（有则）：`authSourceLabel`、`platformName`。  
- Context（`contextWindow > 0`）：窗口 token 数、利用率条（≥90 橙 / ≥70 琥珀 / 否则绿）、`compactCount` + `microcompactCount`。  
- Quick links：`goto` CLI 配置、`goto` usage。

**复制**：仅 `sessionId` 按钮。

**计时器**：`activeTab === "info"` 且 `status === "running"` 且 `startedAt` 存在时 `setInterval` 1s。

---

### 11. `ContextHistoryPanel` + `ContextUsageGrid`

**Grid**（`ContextUsageGrid.svelte`）：`parseContextMarkdown(text)`；`buildGrid`：**100 格**，每类 `cat` 占 `round((pct/100)*100)` 格，最后一类吃掉剩余；每格 `{ icon: getIcon(name), color: getColor(name), category }`；**10 列**分行显示；右侧 legend 为 model 与分类列表。`getIcon` 对多数类为 `"⛁"`，Free space `▢`，Autocompact `⊠`。

**History 曲线/列表**（`ContextHistoryPanel`）：`mergedHistory` 按 `turnIndex` 合并 `ContextSnapshot` 与 `TurnUsage`；**LATEST** 区块：分类横向条（排除 Free space / Autocompact 若 `percentage>0`），`computeContextDelta(prev,latest)` 总体与分类 **Δ%**（`formatDelta` ▲/▼）。**RESOURCES**（`sessionInfo.cost>0 || inputTokens>0`）：累计费用、`latestCostDelta`，各 token 与 **latest turn** 的增量（琥珀 `+`）。**HISTORY**：`displayHistory.length > 1` 时，`displayHistory.toReversed()` 每行：turn 序号、时间、`snap.data.percentage`、`entryDelta`；展开后显示该 turn 分类行与 `getTurnCost` 等费用。

---

### 12. `ansi.ts` / `shell-colorize.ts` / `format.ts`

**ansi.ts**：`stripAnsi`；`escapeHtml`；`ansiToHtml`（SGR + 256 色）；`hasAnsiCodes`；内部 `color256ToHex`。

**shell-colorize.ts**：`colorizeCommand(command: string): string`（返回 HTML 片段，`$` 绿，命令名浅白，flag 青，字符串黄，运算符紫等）。

**format.ts**：`formatCost`；`formatTokenCount`；`formatDuration`；`formatCostDisplay`；`relativeTime`（重导出 `fmtRelative`）；`truncate`；`snippetAround`；`formatBytes`；`formatPasteSize`；`splitPath`；`fileName`；`isAbsolutePath`；`cwdDisplayLabel`；`formatInstallCount`。

---

### 13. CSS 关键依赖（`src/app.css`）

建议在 React 侧同步的非 Tailwind 工具类（`ToolDetailView` / 聊天 Markdown 强依赖）：

- **`prose-chat`**：聊天与工具内 Markdown 的标题、列表、checkbox、引用等（大块规则，约 280–400 行段）。  
- **`.tool-terminal`**：Bash 黑底终端块。  
- **`.diff-section`**, **`.diff-table`**, **`.diff-gutter`**, **`.diff-sign`**, **`.diff-sign-add/del`**, **`.diff-code`**, **`.diff-row-added/removed/context`**：统一 diff 表。  
- **`.tool-line-num`**：行号。  
- **`.tool-file-header`**：路径条。  
- **`.tool-code-block`**：dark 下背景加深（`.dark .tool-code-block`）。  
- 可选：**`.diff-removed`/`.diff-added`**（若别处使用；主路径以 table 行为主）。

hljs 相关：**`pre code.hljs`** 背景透明覆盖。

---

**补充**：`TeamToolDetail.svelte` 继续处理 `TaskGet`/`TaskList`/`SendMessage` 等（结构化输出 + Markdown），路径 `/Users/wangshujun/github-space/OpenCovibe/src/lib/components/TeamToolDetail.svelte`。若需要把 **MultiEdit / TodoRead** 做成与 Claude 插件一致，需在 `ToolDetailView` 增加分支或确认 CLI 是否映射到 `Edit`/`TodoWrite`。

[REDACTED]