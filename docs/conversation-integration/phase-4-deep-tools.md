# 阶段 4：深度工具 & 交互渲染

> **状态**：设计确认中  
> **前置依赖**：Phase 2 全部完成（MessageTimeline + StreamingBlock 已可用）+ Phase 3（StatusBar + Console 已可用）

---

## 核心目标

> 让 agent-panel 已有的 12 种 ToolCard **支持实时状态**（running → success/error 动态更新），同时新增 **PermissionPanel**（嵌在 ToolCard 内）、**Tool Burst 折叠**、**ToolActivity 侧栏**（增强现有右侧栏）、**子 Agent 递归嵌套渲染**。

**Phase 4 的核心不是重做 ToolCard，而是让已有的优秀静态渲染系统支持"对话进行中"的动态状态。**

---

## 阶段 4 目标与基石意义

### 关键设计交付物

| # | 交付 | 说明 |
|---|------|------|
| 1 | **ToolCard 实时状态** | 已有 12 种卡片新增 running/executing/permission_prompt 状态 |
| 2 | **PermissionPanel（嵌入 ToolCard）** | 权限请求时 ToolCard 内部出现 Allow/Deny/Deny&Stop + AcceptForSession |
| 3 | **TerminalPane (xterm.js)** | Bash output 渲染为完整交互式终端（可选开启） |
| 4 | **EditCard 三视图切换** | Diff view / Raw JSON / Input Only（保留已有 pretty/raw 切换机制） |
| 5 | **Tool Burst 折叠** | 连续工具自动折叠，error/running 的不折叠 |
| 6 | **ToolActivity 侧栏** | 增强现有 RightSidebar 新增 "工具" tab |
| 7 | **AgentCard 递归展开** | Task/Agent 工具卡片内嵌子 Timeline，支持递归展开 |
| 8 | **TodoWrite 实时渲染** | TodoWriteCard 支持项级别完成/未完成状态切换 |

### 基石意义

**Phase 4 是 agent-panel 从"只读历史面板"变为"实时对话工作台"的关键阶段。**

- 已有 ToolCard 系统是 agent-panel 最大的前端资产——12 种工具类型、折叠/展开、pretty/raw 切换、ANSI 着色、diff 渲染、语法高亮
- Phase 4 让这些卡片**感知实时状态**：running 时自动展开、tool_result 到达时更新 output、permission_prompt 时显示审批按钮
- PermissionPanel 嵌入 ToolCard 而非独立浮层——权限请求是工具调用的一部分，用户应在看工具卡片时直接审批
- ToolActivity 侧栏利用 Codex 的"工具生命周期可视化"理念，让用户追踪当前/历史工具调用

### Phase 4 完成后的功能影响

| 功能 | 说明 |
|------|------|
| 实时工具状态 | 工具调用卡片从 running → success/error 实时更新 |
| 权限审批 GUI | ToolCard 内直接 Allow/Deny，不再依赖 CLI 的 [Y/n] |
| AcceptForSession | 审批时可选择"本次会话始终允许" |
| Bash 终端 | 可选 xterm.js 完整终端渲染（替代 ansi-to-html 轻量方案） |
| Diff 三视图 | 用户可在 diff / raw JSON / input only 之间切换 |
| Tool Burst | "5 个 Bash 调用" → 点击展开看每个的详情 |
| 工具侧栏 | 右侧栏新增工具调用的树形列表 + 文件变更列表 |
| 子 Agent 嵌套 | AgentCard 展开后显示子 Agent 的完整 timeline |

---

## 基于 agent-panel 现有能力

### 复用

| 现有模块 | 文件 | Phase 4 中如何复用 |
|---------|------|-------------------|
| ToolCard 分发 | `tool-cards/ToolCard.tsx` 的 `canonicalTool()` → `renderPretty()` | **完全保留**，每个卡片新增实时状态 props |
| 12 种卡片组件 | `tool-cards/cards/*.tsx`（BashCard、EditCard、ReadCard、WriteCard、GrepCard、WebFetchCard、TodoWriteCard、TaskCard、ExitPlanModeCard、AskUserQuestionCard、DefaultCard、SubagentMessages） | **不改已有渲染逻辑**，只新增：(1) status badge；(2) permission buttons；(3) loading spinner |
| ToolCardHeader | `tool-cards/ToolCardHeader.tsx` 的 expand/collapse + ViewMode 切换 | 新增一种 ViewMode：`'input-only'` |
| ANSI 渲染 | `lib/ansi.ts` 的 `ansiToHtml()` + `hasAnsiCodes()` | 保留作为默认方案，xterm.js 作为可选增强 |
| Edit diff | `cards/EditCard.tsx` 的 `structuredPatch()` + `hljs` 语法高亮 | 保留，新增 input-only 视图 |
| SubagentMessages | `cards/SubagentMessages.tsx` | 扩展为递归 TimelineEntry 嵌套渲染 |
| RightSidebar | `session/RightSidebar.tsx` 的面板切换机制 | 新增"工具" tab，保留现有"文件"/"信息" tabs |
| 设计系统 | `index.css` 的 CSS 变量 | 所有新 UI 元素遵循设计规范 |
| ChatSessionStore | Phase 1 产出 | `store.pendingPermissions`、`store.timeline` 直接消费 |

### 新建

| 新建文件 | 说明 |
|---------|------|
| `web/src/components/conversation/PermissionPanel.tsx` | 嵌在 ToolCard 内的权限审批 UI（Allow/Deny/Deny&Stop + AcceptForSession） |
| `web/src/components/conversation/TerminalPane.tsx` | xterm.js 完整终端渲染（Bash output 可选方案） |
| `web/src/components/conversation/ToolBurstHeader.tsx` | 折叠组头部（"5 个 Bash 调用" + 展开按钮） |
| `web/src/components/conversation/ToolActivity.tsx` | 右侧栏工具 tab（工具调用树形列表） |
| `web/src/lib/conversation/tool-burst.ts` | Tool Burst 检测逻辑（分组规则） |

### 修改

| 文件 | 改动 | 风险 |
|------|------|------|
| `tool-cards/ToolCard.tsx` | 新增 `liveStatus` prop（running/executing/permission_prompt），running 时自动展开 | 低——新增 prop，默认行为不变 |
| `tool-cards/ToolCardHeader.tsx` | ViewMode 新增 `'input-only'` | 低——枚举扩展 |
| `tool-cards/cards/BashCard.tsx` | 新增 xterm.js 渲染模式（可选 prop） | 低——默认仍用 ansi-to-html |
| `tool-cards/cards/EditCard.tsx` | 新增 input-only 视图（只显示 old_string/new_string 文本对比） | 低——不改已有 diff 视图 |
| `tool-cards/cards/TaskCard.tsx` | 递归展开 subTimeline（用 TimelineEntry[] 而非 Message[]） | 中——需适配新数据模型 |
| `session/RightSidebar.tsx` | 新增"工具" tab | 低——增量添加 |
| `SessionContext.tsx` | 暴露 `store.pendingPermissions` 供 PermissionPanel 消费 | 低 |

### 新增依赖

| 包 | 用途 | 大小 |
|----|------|------|
| `@xterm/xterm` | 可选终端渲染（Phase 4 引入） | ~200KB gzipped ~50KB |
| `@xterm/addon-fit` | 终端自适应容器宽度 | ~5KB |

---

## 1. ToolCard 实时状态设计

### 已有基础

agent-panel 的 ToolCard 目前渲染**静态历史数据**：
- `tool` prop：tool_use Message（name、input、toolUseId）
- `result` prop：tool_result Message（output、toolStatus）
- status 从 result.toolStatus 继承

### Phase 4 升级：LiveStatus

ToolCard 新增 `liveStatus?: ToolLiveStatus` prop：

```typescript
type ToolLiveStatus = 'running' | 'executing' | 'permission_prompt' | 'success' | 'error' | 'interrupted';

// running：tool_use_start 已到达，input 可能还在累积
// executing：tool_use_end 已到达，等待 tool_result
// permission_prompt：control_request 到达，等待用户审批
// success/error：tool_result 已到达
// interrupted：turn 被中断，tool_use 无对应 result
```

**行为规则**：

| liveStatus | 自动展开 | 显示 spinner | 显示操作按钮 |
|------------|---------|------------|-------------|
| running | ✅ 自动展开 | ✅（"正在准备..."） | ❌ |
| executing | ✅ 保持展开 | ✅（"执行中..."） | ❌ |
| permission_prompt | ✅ 自动展开 | ❌ | ✅（Allow/Deny） |
| success/error | 不强制 | ❌ | ❌ |
| interrupted | 不强制 | ❌ | ❌ |

**实现**：ToolCard 内部判断 `liveStatus`：
```tsx
if (liveStatus === 'running' || liveStatus === 'executing' || liveStatus === 'permission_prompt') {
  // 强制展开，忽略用户的手动折叠（直到 status 变为 terminal）
  expanded = true;
}
```

### 从 ChatSessionStore 获取实时状态

```typescript
// 在 SessionContext 或 MessageTimeline 层
function getLiveStatus(toolUseId: string): ToolLiveStatus | undefined {
  const entry = store.timeline.find(e => e.id === toolUseId);
  if (!entry || entry.kind !== 'tool') return undefined;
  if (store.pendingPermissions.some(p => entry.permissionRequestId === p.request_id)) {
    return 'permission_prompt';
  }
  return entry.toolStatus as ToolLiveStatus;
}
```

---

## 2. PermissionPanel 设计（嵌入 ToolCard）

### 方案确认：嵌在 ToolCard 内（用户选择方案 B）

```
┌─ ToolCard: Bash ────────────────────────────┐
│ Bash · rm -rf ./build · ⏳ 等待审批          │
├─────────────────────────────────────────────┤
│ $ rm -rf ./build                             │
│                                              │
│ ┌─ PermissionPanel ────────────────────────┐ │
│ │ ⚠️ 危险操作                               │ │
│ │ [✓ Allow] [✗ Deny] [⏹ Deny & Stop]       │ │
│ │ [🔒 Allow for this session]              │ │
│ └───────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### 审批决策类型（参考 Codex）

| 决策 | 行为 | 对应 ActorCommand |
|------|------|------------------|
| Allow | 允许本次执行 | SendPermission(Allow) |
| Deny | 拒绝本次，CLI 继续 turn | SendPermission(Deny) |
| Deny & Stop | 拒绝 + 中断当前 turn | SendPermission(Deny) + Interrupt |
| Allow for Session | 允许 + 本次会话始终允许 | SendPermission(Allow) + 更新 store 缓存 |

### AcceptForSession 的实现

`AcceptForSession` 是 Codex 的设计亮点——用户批准后，CLI 记住该工具类型在本次会话中不需要再问。实现：

```typescript
// 前端维护一个 session 级的 allowlist
const sessionAllowlist = useRef<Set<string>>(new Set());

function handleAllowForSession(toolName: string, requestId: string) {
  sessionAllowlist.current.add(toolName);
  respondPermission(requestId, 'allow');
}

// 后续同 toolName 的 PermissionRequest 自动通过
// 注意：这只是前端 UI 层的优化——CLI 收到 Allow 后会自己记住
```

### 批量审批

多个 ToolCard 同时等待权限时：
- 每个 ToolCard 内嵌自己的 PermissionPanel（不合并）
- StatusBar 显示权限数量徽章："⏳ 3 个等待审批"
- 点击徽章滚动到第一个等待审批的 ToolCard

---

## 3. BashCard 终端渲染

### 当前方案

```
BashCard（现有）：
  ┌─ $ command ──────────────┐
  │ rm -rf ./build            │
  ├─ output ──────────────────┤
  │ [ANSI 着色文本 via ansi-to-html + dangerouslySetInnerHTML] │
  └───────────────────────────┘
```

- 使用 `ansi-to-html`（~5KB）
- `dangerouslySetInnerHTML` 注入着色后的 HTML
- 支持 ANSI escape codes 的颜色/粗体/下划线
- **不支持**：光标移动、清屏、交互、256 色

### 新增方案：可选 xterm.js

BashCard 新增 `terminal` prop：

```
BashCard（terminal 模式）：
  ┌─ $ command ──────────────┐
  │ rm -rf ./build            │
  ├─ terminal ────────────────┤
  │ [xterm.js Terminal 实例]  │
  │ 完整 ANSI 支持             │
  │ 可选中/复制文本            │
  │ 只读模式（不可输入）        │
  └───────────────────────────┘
```

**切换规则**：
- 默认：ansi-to-html（轻量，够用）
- output 包含复杂 ANSI（光标移动/清屏/256 色）→ 自动切换 xterm.js
- 用户可在 StatusBar 设置中强制开启/关闭

**xterm.js 集成**：
```tsx
// TerminalPane.tsx
function TerminalPane({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const term = new Terminal({
      cols: 80,
      rows: Math.min(content.split('\n').length, 100),
      disableStdin: true,    // 只读
      cursorBlink: false,
    });
    term.open(ref.current!);
    term.write(content);
    termRef.current = term;
    return () => term.dispose();
  }, [content]);

  return <div ref={ref} />;
}
```

---

## 4. EditCard 三视图切换

### 现有视图

EditCard 已有两种视图（通过 ToolCardHeader 的 `ViewMode` 切换）：

| ViewMode | 渲染 |
|----------|------|
| `pretty` | 统一 diff（行号 + 绿/红着色 + hljs 语法高亮） |
| `raw` | RawJsonView（完整 tool_use + tool_result JSON） |

### 新增第三种视图

| ViewMode | 渲染 | 用途 |
|----------|------|------|
| `pretty` | 统一 diff（不变） | 默认，快速看到变更 |
| `input-only` | **新增**：并排显示 old_string/new_string（纯文本，无 diff 格式） | 开发者想看原始替换文本 |
| `raw` | 完整 JSON（不变） | 调试用 |

**input-only 视图**：

```
┌─ Edit · src/main.ts · +3/-1 ────── [Diff | Input | Raw] ─┐
├───────────────────────────────────────────────────────────┤
│ ── old_string ──           │ ── new_string ──            │
│ import { foo } from 'bar'; │ import { foo, baz } from 'bar'; │
│                            │ import { qux } from 'qux';   │
└───────────────────────────────────────────────────────────┘
```

**实现**：在 EditCard 内读取 `view` prop，三个分支渲染：
```tsx
{view === 'pretty' && <DiffView hunks={hunks} />}
{view === 'input-only' && <InputOnlyView oldStr={oldStr} newStr={newStr} />}
{view === 'raw' && <RawJsonView />}
```

### 视图切换 UI

复用 ToolCardHeader 的 ViewMode 切换按钮，改为三态循环（或三个 tab 按钮）：

```
[Diff] [Input] [Raw]     ← 当前选中高亮
```

---

## 5. Tool Burst 折叠设计

### 折叠规则

```typescript
function detectToolBursts(timeline: TimelineEntry[]): ToolBurst[] {
  const bursts: ToolBurst[] = [];
  let current: TimelineEntry[] = [];

  for (const entry of timeline) {
    if (entry.kind === 'tool' && entry.toolStatus === 'success') {
      current.push(entry);
    } else if (entry.kind === 'assistant' || entry.kind === 'user') {
      // assistant/user 文本中断 burst
      if (current.length > 1) bursts.push({ entries: current });
      current = [];
    } else if (entry.kind === 'tool' && entry.toolStatus !== 'success') {
      // error/running 的工具不参与折叠
      if (current.length > 1) bursts.push({ entries: current });
      current = [];
    }
  }
  if (current.length > 1) bursts.push({ entries: current });
  return bursts;
}
```

**规则**：
- 连续 success 工具（中间无 assistant/user 文本）→ 折叠
- 单个工具不折叠（`current.length > 1`）
- error/running 工具**不参与**折叠，单独展示
- 同名 vs 不同名**都折叠**（"Bash + Edit + Read ×3"）

### 折叠 UI

```
┌─ ToolBurstHeader ────────────────────────────┐
│ 📦 5 个工具调用 · 全部成功 · [展开]           │
│ Bash ×2 · Edit ×1 · Read ×2                  │
└───────────────────────────────────────────────┘
```

展开后：
```
📦 5 个工具调用 · [收起]
  ├─ Bash · npm install ✓
  ├─ Bash · npm test ✓
  ├─ Edit · src/main.ts ✓
  ├─ Read · README.md ✓
  └─ Read · package.json ✓
```

**实现**：
- ToolBurstHeader 在 MessageTimeline 中作为特殊条目
- 展开后渲染子 ToolCard 列表（复用现有 ToolCard 组件）
- 性能：折叠时子 ToolCard 不渲染（懒加载）

---

## 6. ToolActivity 侧栏设计

### 与现有右侧栏的关系

agent-panel 现有 RightSidebar 有三个 tab：
- 工具（hook events 列表）
- 文件（文件变更列表）
- 信息（session 元数据）

**Phase 4 方案**：增强"工具"tab，不只显示静态 hooks，而是显示**实时工具调用树**。

### 工具 tab 结构

```
┌─ 工具 ───────────────────────────────────┐
│ Turn 3 · 3 个工具                        │
│  ├─ ✅ Bash · npm install · 2.1s         │
│  ├─ ✅ Edit · src/main.ts · 0.3s         │
│  └─ 🔄 Agent · code-reviewer · 45.2s     │ ← 当前正在运行
│       ├─ ✅ Read · README.md              │
│       ├─ ✅ Bash · npm test               │
│       └─ 🔄 Edit · src/test.ts            │ ← 子 Agent 的工具
│ Turn 2 · 1 个工具                         │
│  └─ ✅ Bash · ls · 0.1s                   │
│ Turn 1 · 2 个工具                         │
│  ├─ ✅ Read · package.json                │
│  └─ ✅ Edit · index.ts                    │
└──────────────────────────────────────────┘
```

**交互**：
- 点击工具 → MessageTimeline 滚动到对应 ToolCard
- 正在运行的工具 → 高亮 + spinner
- 子 Agent 工具 → 缩进显示
- 按 Turn 分组，默认展开最新 Turn

### 其余 tabs 保留

- **文件 tab**：基于 `file-history-snapshot`（Phase 1 解析）+ 实时 tool_use（Read/Edit/Write/Bash）提取文件变更
- **信息 tab**：session 元数据（已有功能，不变）

---

## 7. AgentCard 递归展开（子 Agent 嵌套）

### 已有基础

agent-panel 已有 TaskCard + SubagentMessages：
- `TaskCard.tsx`：显示子 agent 类型 + 展开/折叠
- `SubagentMessages.tsx`：显示子 agent 的消息列表

### Phase 4 升级：递归 TimelineEntry

**数据**：Phase 1 的 `TimelineEntry::Tool.parent_tool_use_id` + Phase 2 的 `mergeTimelines()`

子 Agent 的 timeline entries 通过 `parent_tool_use_id` 关联到父 Tool：

```typescript
function buildAgentTree(timeline: TimelineEntry[]): Map<string, TimelineEntry[]> {
  const map = new Map<string, TimelineEntry[]>();
  for (const entry of timeline) {
    if (entry.kind === 'tool' && entry.parentToolUseId) {
      const existing = map.get(entry.parentToolUseId) ?? [];
      existing.push(entry);
      map.set(entry.parentToolUseId, existing);
    }
  }
  return map;
}
```

**渲染**：AgentCard 展开后，递归渲染 subTimeline：
```tsx
function AgentCard({ entry, subTimeline }: Props) {
  return (
    <div>
      <Header>🐙 Agent · code-reviewer · 12 tools · 45.2s</Header>
      {expanded && (
        <div className="ml-4 border-l-2 border-muted pl-4">
          {subTimeline.map(child => (
            <MessageTimelineRenderer entry={child} />  // 递归！
          ))}
        </div>
      )}
    </div>
  );
}
```

**递归深度**：无限制（完整递归），靠 CSS 缩进 + border 区分层级。性能由虚拟列表保证（子 timeline 在折叠时不渲染）。

---

## 8. TodoWrite 实时渲染

### 已有

`TodoWriteCard.tsx` 渲染 TodoWrite 工具的输出——当前是静态文本。

### Phase 4 升级

Phase 1 的 ChatEvent stream 中，TodoWrite 工具的结果（`tool_result`）在对话过程中逐步更新。Phase 4 让 TodoWriteCard 感知更新：

```
┌─ TodoWrite ────────────────────────────────┐
│ 📋 任务列表                                 │
│ ✅ 1. 安装依赖 (2.1s)                       │
│ ✅ 2. 配置 ESLint (1.5s)                    │
│ 🔄 3. 运行测试 (15.3s · 进行中)             │
│ ⬜ 4. 提交代码                              │
│ ⬜ 5. 创建 PR                               │
└──────────────────────────────────────────────┘
```

**数据**：从 TodoWrite 的 tool_result output 解析 markdown 任务列表（与现有 TodoWriteCard 解析逻辑相同），但每条任务增加 `status` 追踪。

**实现**：复用现有 TodoWriteCard，新增 `liveStatus` prop 后自动显示任务级别的状态图标。

---

## 9. 粗略 Steps

| Step | 内容 | 依赖 | 复杂度 |
|------|------|------|--------|
| 4.1 | ToolCard 新增 `liveStatus` prop + 强制展开逻辑 | Phase 2 ToolCard | 低 |
| 4.2 | PermissionPanel 组件 + 嵌入 ToolCard | 4.1 | 中 |
| 4.3 | PermissionPanel AcceptForSession + 批量徽章 | 4.2 | 中 |
| 4.4 | xterm.js TerminalPane 集成（BashCard 可选模式） | 4.1 | 高 |
| 4.5 | EditCard input-only 视图（三态切换 UI） | 4.1 | 低 |
| 4.6 | Tool Burst 检测 + ToolBurstHeader 组件 | 4.1 | 中 |
| 4.7 | ToolActivity 侧栏（工具 tab 增强版） | 4.1 | 中 |
| 4.8 | AgentCard 递归展开（TimelineEntry 嵌套渲染） | 4.1 | 高 |
| 4.9 | TodoWriteCard 实时状态 | 4.1 | 低 |

---

## 10. 完成标准

- [ ] ToolCard 在 running/executing 时自动展开 + 显示 spinner
- [ ] PermissionPanel 在 ToolCard 内出现（Allow/Deny/Deny&Stop + AcceptForSession）
- [ ] 多个权限请求时 StatusBar 显示等待数量徽章
- [ ] xterm.js 终端模式可选用（默认仍用 ansi-to-html）
- [ ] EditCard 支持 Diff / Input Only / Raw JSON 三视图切换
- [ ] 连续 success 工具自动折叠，error/running 不折叠
- [ ] ToolActivity 侧栏工具 tab 按 turn 分组显示工具调用树
- [ ] 点击侧栏工具 → MessageTimeline 跳转到对应 ToolCard
- [ ] AgentCard 展开后递归显示子 Agent 的完整 timeline
- [ ] TodoWriteCard 实时更新任务状态
- [ ] 所有现有 ToolCard 在历史模式下行为不变（零回归）
- [ ] 设计规范合规

---

*Phase 5 预览：Rewind + Export + Context 可视化 + @ mention + 新建会话 + Fork + SSH。*
