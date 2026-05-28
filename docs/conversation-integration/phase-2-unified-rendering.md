# 阶段 2：统一 Timeline 渲染

> **状态**：草稿，待逐 step 确认后落地  
> **前置依赖**：Phase 1 全部完成（TimelineEntry 模型 + ChatSessionStore + WebSocket 通道 + JSONL 全量解析）  
> **原则**：每个 step 一个 PR；UI 改动必须遵循 `docs/ui-update/design-system.md`

---

## 阶段 2 目标与基石意义

### 核心目标（一句话）

> 历史消息和实时消息通过**同一套组件**渲染，用户感知不到"旧消息"和"新消息"的界限——打开 Session Detail 即是完整对话界面，输入消息后 AI 回复无缝追加在下方。

### 当前问题

| 现状 | 问题 |
|------|------|
| 历史消息用 `SessionDetail` + 虚拟列表渲染 `Message[]` | 只读，无交互 |
| 实时对话在 worktree 分支用 `ActiveMessageArea` 渲染 raw events | 与历史消息样式不一致、组件不同 |
| 两套渲染路径 | 连接后有"割裂感"——历史区和实时区样式、布局、行为不同 |
| Turn complete 后需要 refetch 对齐 | 如果 refetch 慢，用户看到闪烁/消失/重排 |

### 目标状态

```
用户打开 Session Detail
  → 看到历史消息（TimelineEntry[] 渲染）
  → 底部有 [连接并继续对话] 按钮
  → 点击连接后，按钮变为输入框
  → 输入消息，AI 回复无缝追加在历史消息下方
  → 流式文本、工具调用、thinking 全部用同一套组件
  → 断开连接后，新消息已固化在 timeline 中，刷新后完全一致
```

### 关键设计交付物

| # | 设计交付 | 一句话说明 |
|---|---------|-----------|
| 1 | **MessageTimeline 组件** | 唯一的 timeline 渲染容器，接受 `TimelineEntry[]`，内部按 kind 分发 |
| 2 | **Entry 子组件族** | UserMessage / AssistantMessage / ToolCard / SystemNotice / RawEvent |
| 3 | **History → TimelineEntry 适配器** | 将 Phase 1 增强后的 `Message[]` 转换为 `TimelineEntry[]` |
| 4 | **Live/History 合并策略** | 实时 timeline + 历史 timeline 的去重合并逻辑 |
| 5 | **StreamingBlock 组件** | 正在生成的 assistant 文本 + thinking 实时渲染 |
| 6 | **AutoScroll 行为控制** | 底部跟随 / 用户上翻停止 / 新消息提示 |
| 7 | **ConnectBar 组件** | 连接/断开/状态指示器 + 输入框切换 |
| 8 | **SessionDetail 重构** | 现有页面从"只读历史"升级为"历史 + 对话"一体化 |

### 四大基石

#### 基石 1：MessageTimeline = "一个组件渲染一切"

```tsx
<MessageTimeline
  entries={mergedTimeline}     // 历史 + 实时合并后的完整 timeline
  streamingEntry={currentStreaming}  // 正在生成的 assistant（未固化）
  onScrollToEntry={scrollTo}
/>
```

- 所有消息（无论来源）都是 `TimelineEntry`，用同一个 `renderEntry(entry)` 分发
- 虚拟列表保证长对话性能（复用现有 virtual list 方案）
- 流式消息作为 timeline 末尾的"临时条目"，不进入 timeline state

#### 基石 2：Entry 子组件族 = "每种消息独立可测试"

```
MessageTimeline
  ├─ UserMessage        渲染用户消息 + 附件
  ├─ AssistantMessage   渲染 AI 回复 + thinking 折叠 + 模型标签
  ├─ ToolCard           渲染工具调用（通用版，Phase 4 再按类型定制）
  ├─ SystemNotice       渲染系统事件（权限变更、日期分隔、compaction）
  └─ StreamingBlock     渲染正在生成的文本（markdown 增量 + 光标动画）
```

每种组件：
- 接收对应类型的 `TimelineEntry` 作为 props
- 不关心数据来自历史还是实时（props 结构相同）
- 独立 storybook / 单元测试

#### 基石 3：合并策略 = "无缝拼接不重复"

```
历史 timeline（从 /api/sessions/:id 加载）
  ↓ 转换为 TimelineEntry[]（adapter）
  + 
实时 timeline（从 ChatSessionStore.timeline）
  ↓ 通过 uuid/message_id 去重
  = 
mergedTimeline（UI 消费的最终数据）
```

关键规则：
- 实时产生的 entry 在 `TurnComplete` 后，refetch 历史会包含相同消息
- 合并时以 `message_id` / `tool_use_id` / `uuid` 为 key 去重
- 实时 entry 优先（因为可能包含更多字段如 duration）
- 合并触发时机：turn complete + 定时对齐（30s）

#### 基石 4：StreamingBlock = "流式体验的核心"

流式文本不能等 turn complete 才显示。StreamingBlock 直接消费 store 的 streaming 状态：

```tsx
// StreamingBlock 消费的状态
{
  streamingText: string;     // 累积的 assistant 文本（增量追加）
  thinkingText: string;      // 累积的 thinking 文本
  thinkingStartMs: number;   // thinking 开始时间（用于显示 elapsed）
  thinkingEndMs: number;     // thinking 结束时间
  activeToolId: string|null; // 当前正在执行的工具
}
```

渲染策略：
- thinking 阶段：显示 thinking 面板（可折叠）+ elapsed 计时
- text 阶段：增量 markdown 渲染（不是每个 token 重新 parse 全文）
- tool 阶段：ToolCard 显示为 "running" 状态
- 完成后：StreamingBlock 消失，固化为正式 AssistantMessage entry

### Phase 2 完成后的功能影响

#### 立即可用

| 功能 | 说明 |
|------|------|
| 在 Session Detail 续接对话 | 点击连接 → 输入框出现 → 发消息 → 流式回复 |
| 历史 thinking 内容展示 | Phase 1 解析了 thinking_text，Phase 2 渲染为可折叠面板 |
| 实时 thinking 面板 | thinking delta 实时显示 + elapsed 计时 |
| 工具调用实时状态 | tool start → running → result（同一卡片原地更新） |
| 自动滚动 + 新消息提示 | 在底部自动跟随，上翻后显示 "↓ 新消息" 浮标 |
| 消息搜索覆盖实时消息 | 因为实时消息也在 timeline 中，搜索自然覆盖 |
| 历史 usage/cost 显示 | AssistantMessage 组件渲染 token 用量标签 |
| 系统事件展示 | 权限变更、日期分隔、compaction 标记有专属样式 |

#### 为后续 Phase 解锁

| 后续功能 | Phase 2 提供的基础 |
|---------|-------------------|
| Phase 3 StatusBar | 从 store 读 model/usage/permissionMode 显示 |
| Phase 3 输入区 | ConnectBar 已建立，只需升级为完整 console |
| Phase 4 ToolCard 定制渲染 | ToolCard 组件已存在，Phase 4 只是按 tool_name 分发子组件 |
| Phase 4 权限面板 | pendingPermissions 已在 store，Phase 4 做 UI 面板 |
| Phase 5 Export | timeline 完整，直接序列化为 markdown/HTML |
| Phase 5 Rewind | timeline 中有 user entry，可选择回退点 |

---

## 基于 agent-panel 现有能力

### 复用

| 现有模块 | 文件 | Phase 2 中如何复用 |
|---------|------|-------------------|
| 虚拟列表 | SessionDetail 内 `@tanstack/react-virtual` | MessageTimeline 内部继续用相同方案，只是输入从 Message[] 变为 TimelineEntry[] |
| ToolCard 分发模式 | `tool-cards/ToolCard.tsx` 的 `canonicalTool()` → `renderPretty()` | Entry 子组件按 `entry.kind` 分发，同模式 |
| MessageBlock 样式 | `session/MessageBlock.tsx` 的 CSS 类和布局 | Entry 子组件复用其视觉基础（圆角、间距、颜色） |
| MessageToolbar | `session/MessageToolbar.tsx` | Entry 卡片内复用复制/收藏/raw view 按钮 |
| SessionContext | `session/SessionContext.tsx` 的 Provider + useSession() 模式 | 扩展加入 chat connection + merged timeline，不改 Provider 签名 |
| Turn 分组逻辑 | `turn-grouping.ts` | 基于 TimelineEntry[] 重新计算 turns（TimelineEntry 有 parentUuid 链，更准确） |
| 搜索功能 | SessionContext 内的 `useSessionSearch()` | 在 mergedTimeline 上重新实现搜索（按 text/thinkingText/toolOutput 匹配） |
| 设计系统 | `index.css` 的 CSS 变量 | 所有新组件颜色/间距/圆角从变量取，不硬编码 |
| react-markdown | 已有依赖 | AssistantMessage 内复用 |
| favouriting | SessionContext 已有 `favIds` + `toggleFav()` | Entry 子组件直接使用 |

### 替换

| 被替换 | 替换为 | 说明 |
|--------|--------|------|
| `SessionDetail` 中 `messages.map(...)` | `<MessageTimeline entries={...} />` | 单一渲染容器 |
| `MessageBlock` 作为渲染入口 | `renderEntry()` + Entry 子组件族 | 按 kind 分发 |
| worktree 分支 `ActiveMessageArea` | 完全不用 | StreamingBlock + 统一 timeline 替代 |
| worktree 分支 `event-to-message.ts` | 完全不用 | history-adapter（Phase 1）+ ChatSessionStore 替代 |

### 新建

| 新建文件 | 说明 |
|---------|------|
| `web/src/components/conversation/MessageTimeline.tsx` | 唯一 timeline 渲染容器 |
| `web/src/components/conversation/UserMessage.tsx` | 用户消息渲染 |
| `web/src/components/conversation/AssistantMessage.tsx` | AI 回复渲染（含 thinking 折叠 + model 标签 + usage 标签） |
| `web/src/components/conversation/StreamingBlock.tsx` | 正在生成的文本实时渲染 |
| `web/src/components/conversation/ThinkingPanel.tsx` | Thinking 可折叠面板 |
| `web/src/components/conversation/ConnectBar.tsx` | 连接/断开/输入栏（四态） |
| `web/src/lib/conversation/timeline-merger.ts` | Live + History 合并去重 |
| `web/src/lib/conversation/use-auto-scroll.ts` | 自动滚动 hook |

### 修改

| 文件 | 改动 | 风险 |
|------|------|------|
| `SessionDetail.tsx` | 消息渲染部分替换为 MessageTimeline | 中——需确保视觉一致 |
| `SessionContext.tsx` | 新增 chat connection + liveMessages + merge | 中——需确保现有功能不退化 |
| `SessionDetailView.tsx` | 底部添加 ConnectBar，Header 添加状态指示器 | 低——增量添加 |
| `MessageBlock.tsx` | 保留为向后兼容引用，或标记 deprecated | 低——先保留 |

---

## Resume / New Session 深度设计（三方案对比 + 问题修复）

> 参考来源：Claude Code CLI 实际行为、OpenCovibe session_actor.rs + api.ts、Codex app-server-protocol thread 模型

### 1. Claude Code CLI 的实际行为

#### 新建会话（无 --resume）

```bash
claude --output-format stream-json --input-format stream-json \
       --verbose --permission-prompt-tool stdio
```

CLI 行为：
1. 生成新的 session_id（UUID）
2. stdout 首行输出 `system/init`：`{ type: "system", subtype: "init", session_id: "xxx-xxx", model: "...", slash_commands: [...], tools: [...], ... }`
3. JSONL 文件**不会立即创建**——在第一轮对话开始时才创建
4. CLI 等待 stdin 输入

#### 续接会话（--resume）

```bash
claude --resume <session-id> --output-format stream-json \
       --input-format stream-json --verbose --permission-prompt-tool stdio
```

CLI 行为：
1. 加载已有 JSONL 文件
2. stdout 首行输出 `system/init`（session_id 不变）
3. **Replay 最后的 turn** 作为 stream-json 事件（user echo → assistant → tool results），这些事件的 UUID 与 JSONL 中**完全相同**
4. CLI 等待新的 stdin 输入

#### --continue（继续最近会话）

```bash
claude -c --output-format stream-json ...
```

等价于 `--resume` 最近一次在当前目录下的 session_id。

#### --fork-session（分叉）

```bash
claude --resume <sid> --fork-session -p "(fork checkpoint)" \
       --output-format json --max-turns 1
```

创建一个新 session_id，以原会话的上下文为起点。OpenCovibe 用此实现 rewind。

#### 关键推论

1. **Resume 时 CLI 不 replay 历史消息**（POC 验证：CLI v2.1.153 在 stream-json + `--max-turns 1` 下只输出当前 turn 事件）。前端无需 replay 去重。
2. **新建时没有历史**，session_init 中 session_id 是新 UUID，前端需要从占位 key 迁移。
3. **session_id 格式是 UUID**（如 `b3c75025-2905-4c0e-b0bf-1a168b763a28`），文件名同此。
4. **JSONL 文件路径**：`~/.claude/projects/{sanitized-cwd-hash}/{session-id}.jsonl`。新建时文件在第一轮对话开始才创建。

### 2. OpenCovibe 的 Resume/New 方案

#### 启动模式

OpenCovibe 的 `api.startSession()` 通过 `mode` 参数区分：

```typescript
// 新建
api.startSession(runId)  // mode=undefined

// Resume
api.startSession(runId, "resume_session", sessionId)

// Continue
api.startSession(runId, "continue_session", undefined)
```

后端 `SessionActor::spawn_actor()` 接收 `is_resume: bool` 参数：

```rust
// ProtocolState 标记 resume 状态
protocol: ProtocolState::new(is_resume),

// turn 编号从 resume 基线开始
initial_turn_index: count_user_messages_in_jsonl(),
initial_auto_ctx_id: count_user_messages_in_jsonl(),
```

#### Resume replay 处理（OpenCovibe）

OpenCovibe 的 ProtocolState 标记 `is_resume`，处理 replay 事件。但 **POC 验证 Claude CLI v2.1.153 在 stream-json 模式下不 replay 历史事件**——所以我们不需要这个机制。OpenCovibe 的 replay 逻辑可能用于 pipe 模式（非 stream-json）或更早的 CLI 版本。

#### 新建 session_id 迁移

OpenCovibe 的 `run_id` 在后端启动时已分配（由前端生成），所以**不需要迁移 key**。这是我们和他们最大的不同——他们用前端生成的 run_id，我们用 CLI 生成的 session_id。

### 3. Codex 的 Thread 模型

Codex 用 `ThreadId` 而非 session_id：
- 客户端发送 `thread/start` request → server 创建 thread → 返回 `ThreadId`
- 客户端加载历史 → 通过 `thread/items` request 获取 thread history
- **没有 resume 概念**——每个 thread 自动 persist，重新打开时 server 自动加载历史

**关键差异**：Codex 的 thread 创建和 ID 分配由 server 同步完成，不存在"等 CLI 返回 session_id"的异步问题。

### 4. 当前 Phase 2 设计的问题

#### 问题 1：新建会话的 session_id 迁移不完整

```
当前流程（有问题）：
  前端 → WS /ws/chat/new → Manager 分配 conn_xxx
  → Actor spawn → CLI session_init → session_id = "real-uuid"
  → Connected(session_id="real-uuid") 发送
  → 前端收到 real-uuid 但 UI 还在 /sessions/conn_xxx 路由
  → Manager.migrate_session_key() 未自动调用
  → 重连时用 conn_xxx 找不到 session
```

**修复**：
1. `handle_ws_session()` 在收到 `Connected` 事件后，检测 session_key 变化 → 调用 `manager.migrate_session_key(old_conn_key, real_session_id)`
2. 前端在收到 `Connected` 且 sessionId 变化时 → `navigate(/sessions/${newSessionId})` 更新 URL
3. 此流程需要在 Phase 2 Step 2.8（新建会话入口）中明确实现

#### 问题 2：新建会话的 JSONL 文件在第一轮对话前不存在

```
New session 流程：
  → CLI spawning → session_init
  → 用户输入第一条消息前，JSONL 不存在
  → SessionDetail 尝试加载 /api/sessions/{session_id} → 404 或空数据
```

**修复**：SessionDetail 在新建模式下不等待历史加载（跳过 loading spinner 直接显示空 timeline + connected 状态）。第一条消息发送后 JSONL 自动创建。

Phase 2 Step 2.8 需要明确处理这种情况。

#### 问题 3：不存在的 session 不会报错

POC 验证：`--resume non-existent-session-id` 时 CLI **不报错**，而是创建新 session（新 session_id），仅在 stderr 输出 warning。

**修复**：前端在收到 SessionInit 后检查 session_id 是否与请求的 session_id 一致。不一致时显示提示 "Session not found, created new session"。

#### 问题 4：`--include-partial-messages` 引入 stream_event 信封

POC 验证：加 `--include-partial-messages` 后，大部分事件包装在 `{"type":"stream_event","event":{...}}` 中，增加了 `message_start`、`message_delta`、`message_stop` 等新事件。

**修复**：Phase 1 Step 1.2 协议解析器需支持 stream_event 信封解包 + 新增事件类型。Phase 1 doc 的事件表已更新。

### 5. 具体修复清单（POC 后更新）

| # | 问题 | 影响 Phase | 修复 |
|---|------|-----------|------|
| 1 | Manager.migrate_session_key() 未自动调用 | Phase 1 Step 1.7 | chat.rs 中检测 session_id 变化并调用 migrate |
| 2 | 新建时 SessionDetail 等待加载 | Phase 2 Step 2.8 | 新建模式跳过历史加载，直接显示空 timeline |
| 3 | 前端 session_id 变化后不导航 | Phase 2 Step 2.8 | useEffect 检测 sessionId 变化 → navigate |
| 4 | 不存在的 session 不报错 | Phase 2 | SessionInit 后对比 session_id，提示用户 |
| 5 | stream_event 信封 + 新事件类型 | Phase 1 Step 1.2 | 事件表已更新，解析器实现时支持 |

---

## 核心设计约束：数据一致性保证

> Phase 2 必须在整个数据生命周期中保证用户体验的丝滑和无跳变。以下约束贯穿所有 Step。

### Streaming vs Entry：两层数据

| 层 | 内容 | 生命周期 | 创建依据 |
|----|------|---------|---------|
| **Streaming 层** | `store.streamingText`（逐 token 累积） | 仅存在于 AI 回复期间，TurnComplete 时丢弃 | text_delta 事件追加 |
| **Entry 层** | `AssistantMessage TimelineEntry` | 持久化，进入 timeline | **`assistant` 汇总事件的完整 text** |

### 四条一致性规则

```
规则 1：streaming 是"显示用草稿"，不是正式数据
  - streamingText / thinkingText 只用于 StreamingBlock 临时渲染
  - 绝不持久化到 store.timeline

规则 2：正式 TimelineEntry 只从"完整事件"创建
  - AssistantMessage entry ← assistant 汇总事件的完整 text（非累积 delta）
  - Tool entry output ← tool_result 事件
  - 保证 live entry.text === history entry.text（同源数据）

规则 3：历史数据是最终权威
  - refetch 后，history entry 替换同 id 的 live entry
  - history 的 usage/cost/duration 更完整（含 turn_duration 等元数据）

规则 4：替换时内容相同 → 用户无感知
  - 因为规则 2，live 和 history 内容完全一致
  - 替换只是"补齐字段"（cost/duration），不是"改内容"
```

### TurnComplete 是分界点

```
Before TurnComplete（流式阶段）：
  UI 展示 StreamingBlock（临时、可能不完整）
  
At TurnComplete（固化瞬间）：
  ① StreamingBlock 消失
  ② 正式 AssistantMessage entry 创建（从 assistant 汇总事件）
  ③ 视觉：文本"凝固"（闪烁光标 → 静态排版）
  ④ 内容不变 → 用户无跳变感

After TurnComplete（对齐阶段）：
  ⑤ 触发 refetch JSONL → historyEntries 更新
  ⑥ merge 去重 → history 替换 live（内容相同）
  ⑦ 用户无感知
```

### Refetch 策略

| 触发条件 | 动作 | 用户体验 |
|---------|------|---------|
| TurnComplete 事件 | 延迟 500ms 后 refetch（等 CLI 写完 JSONL） | 无感知 |
| File watcher 检测变化 | 立即 refetch | 无感知 |
| 定时 30s | refetch | 无感知 |
| Refetch 期间 | live entries 保持显示，直到 history 确认包含它们 | 无闪烁 |
| Refetch 完成 | merge 去重，live 中已确认的 entries 可清除 | 无感知 |

### 边界场景承诺

| 场景 | 保证 |
|------|------|
| 正常 turn | streaming text === final entry text（零跳变） |
| miss delta（channel overflow） | TurnComplete 时正式 entry 仍然完整（从汇总事件，非累积） |
| 断连后 CLI 继续 | 刷新后 history 补全（数据只增不减） |
| CLI 崩溃 | 最后一条未 complete 的 streaming 丢失（不可避免） |

---

## 0. 组件架构设计

### 0.1 整体页面布局（Session Detail 改造后）

```
┌─────────────────────────────────────────────────────────────────┐
│ Session Detail Header                                            │
│  [← 返回] [标题] [状态指示器: ● Connected] [Resume] [导出] [删除] │
├──────────┬───────────────────────────────────────┬──────────────┤
│ Turn     │  MessageTimeline                      │ Right        │
│ Sidebar  │  ┌─────────────────────────────────┐  │ Sidebar      │
│          │  │ TimelineEntry (user)             │  │ (现有)       │
│          │  │ TimelineEntry (assistant)        │  │              │
│          │  │ TimelineEntry (tool)             │  │              │
│          │  │ TimelineEntry (system)           │  │              │
│          │  │ ...                              │  │              │
│          │  │ ─── 续接分隔线（可选） ───        │  │              │
│          │  │ TimelineEntry (user) [实时]      │  │              │
│          │  │ StreamingBlock [正在生成]         │  │              │
│          │  └─────────────────────────────────┘  │              │
│          ├───────────────────────────────────────┤              │
│          │  ConnectBar / ChatInput               │              │
│          │  ┌─────────────────────────────────┐  │              │
│          │  │ [离线时] [▶ 连接并继续对话]      │  │              │
│          │  │ [连接后] [ 输入框 ...     ] [发] │  │              │
│          │  └─────────────────────────────────┘  │              │
└──────────┴───────────────────────────────────────┴──────────────┘
```

**关键设计决策**：
- 不新建独立页面，**嵌入现有 Session Detail**
- Turn Sidebar、Right Sidebar 保持不变
- MessageTimeline 替换现有的消息列表（`SessionDetail` 组件内部重构）
- ConnectBar 固定在底部，连接前是按钮，连接后是输入框

### 0.2 数据流

```
┌─ 历史加载路径 ──────────────────────────────────────┐
│ /api/sessions/:id → Message[] → adapter → historyTimeline: TimelineEntry[] │
└───────────────────────────────────────────────────────────────────┘
                                                    ↓ merge
┌─ 实时事件路径 ──────────────────────────────────────┐   ↓
│ WebSocket → ChatSessionStore.dispatch → liveTimeline: TimelineEntry[] │→ mergedTimeline
└───────────────────────────────────────────────────────────────────┘
                                                    ↓
                                         MessageTimeline (UI)
                                                    ↓
                                    ┌───────────────────────────────┐
                                    │ renderEntry(entry) → 子组件    │
                                    └───────────────────────────────┘
```

### 0.3 History → TimelineEntry 适配器设计

当前 Phase 1 增强后的 `Message` 需要转换为 `TimelineEntry`：

```typescript
function messageToTimelineEntry(msg: Message): TimelineEntry {
  switch (msg.role) {
    case "user":
      return { kind: "user", id: msg.id, text: msg.text ?? "", ts: msg.timestamp ?? "", ... };
    case "assistant":
      return { kind: "assistant", id: msg.id, text: msg.text ?? "", 
               thinkingText: msg.thinkingText, model: msg.model, usage: msg.usage, ... };
    case "tool_use":
      return { kind: "tool", id: msg.toolUseId ?? msg.id, toolName: msg.toolName ?? "",
               toolInput: msg.toolInput, toolStatus: "success", ... };
    case "tool_result":
      // tool_result 不生成独立 entry，而是更新对应 tool entry 的 output
      return null; // 特殊处理：合并到前面的 tool entry
    case "system":
      return { kind: "system", id: msg.id, subtype: inferSubtype(msg), ... };
    default:
      return { kind: "raw", id: msg.id, eventType: msg.role, data: msg.raw, ... };
  }
}
```

关键点：
- `tool_use` + `tool_result` 需要**合并为单条 Tool entry**（通过 `tool_use_id` 关联）
- 连续多条 assistant text blocks 属于同一个 assistant message → 合并
- system/permission-mode/date_change → 映射为 System entry 的不同 subtype

### 0.4 Streaming 渲染策略

**问题**：assistant 流式输出时，markdown 是不完整的（可能在 code block 中间、链接中间）。

**策略**：

| 阶段 | 渲染方式 |
|------|---------|
| Thinking | 纯文本追加（不做 markdown 解析），用等宽字体 |
| Text streaming（< 500 chars） | 纯文本 + 光标动画（避免 markdown 解析抖动） |
| Text streaming（> 500 chars） | markdown 增量解析（对已完成段落做解析，最后一段用纯文本） |
| Text complete（TurnComplete 后） | 完整 markdown 渲染 |

**技术方案**：
- 使用 `react-markdown` 现有方案
- streaming 时：按 `\n\n` 分段，前面的段落做完整 markdown 渲染，最后一段做纯文本 + 光标
- 这避免了"每个 token 重新 parse 全文"的性能问题
- 代码块特殊处理：检测未闭合的 ` ``` `，暂不高亮直到闭合

### 0.5 AutoScroll 行为

| 场景 | 行为 |
|------|------|
| 用户在底部（距底 < 100px） | 新消息到达时自动滚动到底 |
| 用户往上翻阅（距底 > 100px） | 停止自动滚动 |
| 停止自动滚动后有新消息 | 显示 "↓ 新消息" 浮标（带数量） |
| 点击浮标 | 平滑滚动到底部，恢复自动跟随 |
| AI 回复结束（TurnComplete） | 如果不在底部，浮标闪烁一次 |
| 用户手动发送消息 | 无论当前位置，立即滚动到底部 |

### 0.6 ConnectBar 状态机

```
┌─────────────────────────────────────────────────┐
│ 离线态（phase = empty/disconnected）              │
│ ┌─────────────────────────────────────────────┐ │
│ │ [▶ 连接并继续对话]     [上次: 2小时前]       │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ 连接中（phase = connecting）                     │
│ ┌─────────────────────────────────────────────┐ │
│ │ [● 连接中...]          [取消]               │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ 已连接（phase = idle/running）                   │
│ ┌─────────────────────────────────────────────┐ │
│ │ [ 输入框...            ] [发送/停止] [断开] │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ 错误态（phase = error）                          │
│ ┌─────────────────────────────────────────────┐ │
│ │ [✕ 连接失败: 原因...]   [重试]             │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## 1. Step 清单

> History Adapter 已移至 Phase 1 Step 1.9。Phase 2 开始时 `messagesToTimeline()` 已可用。

### Step 2.1：MessageTimeline 容器组件

**目标**：替换现有消息列表，用单一组件渲染 `TimelineEntry[]`。

**依赖**：Phase 1 完成（TimelineEntry 类型 + History Adapter + ChatSessionStore 均已就绪）

**改动范围**：
- 新建 `web/src/components/conversation/MessageTimeline.tsx`
- 修改 `web/src/components/SessionDetail.tsx`（替换消息渲染部分）

**具体要求**：

1. 接受 `entries: TimelineEntry[]` + `streamingEntry?: StreamingState`
2. 内部 `renderEntry()` 按 `kind` 分发到子组件
3. 复用现有虚拟列表方案（保持长对话性能）
4. 支持 `scrollToEntry(id)` 外部调用
5. 保持现有搜索高亮功能兼容

**不做**：
- 流式渲染（Step 2.4）
- 自动滚动（Step 2.5）
- 连接/输入区（Step 2.6）

**验收**：
- 现有 Session Detail 页面**视觉不变**（因为只是换了数据来源和组件，渲染结果相同）
- Turn Sidebar 导航正常
- 消息搜索正常

---

### Step 2.2：Entry 子组件族

**目标**：实现每种 TimelineEntry 的渲染组件。

**依赖**：Step 2.2

**改动范围**：
- 新建 `web/src/components/conversation/UserMessage.tsx`
- 新建 `web/src/components/conversation/AssistantMessage.tsx`
- 新建 `web/src/components/conversation/ToolCard.tsx`
- 新建 `web/src/components/conversation/SystemNotice.tsx`

**具体要求**：

1. **UserMessage**：文本 + 附件缩略图 + 时间戳 + 折叠长文本
2. **AssistantMessage**：markdown 渲染 + thinking 折叠面板 + model 标签 + usage 标签
3. **ToolCard**（通用版）：工具名 + 状态图标 + input 预览 + output 折叠 + 耗时
4. **SystemNotice**：按 subtype 不同样式（日期分隔线、权限变更通知、compaction 标记）

**设计规范**：
- 遵循 design-system.md 颜色/间距/圆角规范
- 复用现有 `MessageBlock` 的样式基础（不是从零开始）
- 每个组件可独立运行（不依赖 SessionContext）

**验收**：
- 视觉与现有 Session Detail 消息样式一致（渐进式替换，不突兀）
- thinking 面板可折叠/展开
- 长 tool output 可折叠

---

### Step 2.3：StreamingBlock 组件

**目标**：实时渲染正在生成的 assistant 回复和 thinking 过程。

**依赖**：Step 2.2

**改动范围**：
- 新建 `web/src/components/conversation/StreamingBlock.tsx`
- 新建 `web/src/components/conversation/ThinkingPanel.tsx`

**具体要求**：

1. **ThinkingPanel**：
   - 显示 thinking 文本（等宽字体，纯文本渲染）
   - 显示 elapsed 计时（从 thinkingStartMs 开始）
   - 默认展开，可折叠
   - thinking 结束后（thinkingEndMs 设置）停止计时

2. **StreamingBlock**：
   - 渲染 streamingText（markdown 增量：已完成段落解析，最后段纯文本 + 光标）
   - 位于 MessageTimeline 底部作为"临时条目"
   - TurnComplete 时消失（固化为正式 AssistantMessage entry）

3. **一致性约束（规则 1 & 2）**：
   - StreamingBlock **不产生正式 TimelineEntry**
   - TurnComplete 时，正式 entry 从 `assistant` 汇总事件创建（非累积 delta）
   - 转换瞬间用户无感知（因为 streamingText === assistant.text）

4. **性能要求**：
   - 文本追加不触发整个 timeline 重渲染（用 ref 直接操作或 memo）
   - 光标动画用 CSS animation
   - thinking 文本超长时截断显示 + "展开全部"

**验收**：
- 模拟 text_delta 事件序列 → 文本逐字出现，无抖动
- 模拟 thinking_delta → thinking_end → text_delta 序列 → thinking 面板正确计时和折叠
- TurnComplete 时 streaming→entry 转换 → **文本内容无跳变**
- 长文本流式渲染无明显掉帧

---

### Step 2.4：AutoScroll 行为

**目标**：实现 0.5 节定义的滚动行为。

**依赖**：Step 2.1 + Step 2.3

**改动范围**：
- 新建 `web/src/lib/conversation/use-auto-scroll.ts`
- 修改 `MessageTimeline.tsx` 集成 auto-scroll hook

**具体要求**：

1. `useAutoScroll(containerRef, { isStreaming, hasNewMessage })`
2. 底部检测：IntersectionObserver 或 scroll position 计算
3. 新消息浮标：显示未读数量，点击滚动到底
4. 用户发送消息：强制滚动到底
5. 浮标显示/隐藏有动画过渡

**验收**：
- 流式输出时在底部 → 自动跟随
- 上翻查看历史 → 不被拉回
- 新消息到达时不在底部 → 浮标显示
- 点击浮标 → 平滑滚动到底

---

### Step 2.5：ConnectBar 组件

**目标**：实现连接/断开/输入的底部控制栏。

**依赖**：Phase 1 Step 1.8（ChatSessionStore）、Step 2.2

**改动范围**：
- 新建 `web/src/components/conversation/ConnectBar.tsx`
- 修改 `SessionDetail.tsx` 集成 ConnectBar

**具体要求**：

1. 四种状态视图（0.6 节状态机）：离线、连接中、已连接、错误
2. 离线态：大按钮 [▶ 连接并继续对话]
3. 连接中：spinner + [取消]
4. 已连接态：textarea 输入框 + 发送按钮 + 停止按钮（running 时）
5. 错误态：错误信息 + [重试]
6. Enter 发送、Shift+Enter 换行、Esc 停止
7. Running 时输入框不禁用（可排队下一条）

**不做**（Phase 3 再做）：
- Slash 菜单
- 附件
- 模型/权限模式选择
- StatusBar
- 输入历史

**验收**：
- 点击连接 → spinner → 成功后输入框出现
- 输入消息 → 发送 → AI 流式回复
- 点击停止 → 中断当前回复
- 断开连接 → 回到按钮状态

---

### Step 2.6：Live + History 合并逻辑

**目标**：连接后实时消息无缝追加在历史后面，turn complete 后去重对齐，全程用户无感知。

**依赖**：Step 2.1 + Phase 1 Step 1.8（ChatSessionStore）+ Phase 1 Step 1.9（History Adapter）

**改动范围**：
- 新建 `web/src/lib/conversation/timeline-merger.ts`
- 修改 `web/src/components/session/SessionContext.tsx` 集成合并

**具体要求**：

1. **合并函数**：`mergeTimelines(history: TimelineEntry[], live: TimelineEntry[]): TimelineEntry[]`

2. **去重规则**（一致性规则 3）：
   - key = `id`（uuid / message_id / tool_use_id）
   - history 中已存在的 id → live 中的同 id entry 丢弃
   - history 版本更权威（含 usage/cost/duration 等完整字段）

3. **Refetch 策略**：
   - TurnComplete 后延迟 500ms refetch（等 CLI 写完 JSONL）
   - File watcher 检测 JSONL 变化 → 立即 refetch
   - 定时 30s 兜底
   - Refetch 期间 live entries 保持可见（不闪烁）
   - Refetch 完成 → 重新 merge → live 中已被 history 覆盖的 entries 自动消失

4. **一致性保证**（规则 4）：
   - 因为 live entry 和 history entry 来自同一数据（assistant 汇总事件 / CLI JSONL），内容相同
   - 替换只是"补齐字段"（加 cost/duration），**不是改内容**
   - 用户看不到任何变化

5. **乐观 user 消息**：
   - 用户发送 → 立即创建 optimistic User entry（id=uuid）
   - 后端 UserMessageEcho → 标记为已确认
   - Refetch 后 history 包含同 uuid → merge 去重 → 无重复

6. **三种场景一致性**：
   - 纯历史：直接用 `messagesToTimeline(messages)`
   - 纯实时：直接用 `store.timeline`
   - 混合：`mergeTimelines(historyEntries, liveEntries)`

**验收**：
- 连接 → 发送消息 → AI 回复 → turn complete → 断开 → 刷新页面 → 消息完整可见
- 连接期间 refetch → 不出现重复消息、不闪烁、不跳变
- 乐观 user 消息发送后不闪烁
- TurnComplete 前后文本内容无变化（用 snapshot 对比）

---

### Step 2.7：SessionDetail 集成 & 回归测试

**目标**：将所有新组件集成到现有 Session Detail 页面，确保零回归。

**依赖**：Step 2.1~2.6 全部

**改动范围**：
- 修改 `web/src/components/SessionDetail.tsx`
- 修改 `web/src/components/session/SessionContext.tsx`
- 修改 `web/src/pages/SessionDetailView.tsx`

**具体要求**：

1. 用 `MessageTimeline` 替换现有消息列表
2. 底部添加 `ConnectBar`
3. 状态指示器添加到 Header（绿点/灰点/转圈）
4. 保持所有现有功能：搜索、Turn 导航、右侧栏、收藏、导出链接、删除
5. 不连接时 = 纯只读（与当前体验完全一致）
6. 连接后 = 对话模式（底部输入框、流式渲染）

**回归测试清单**：
- [ ] 搜索功能正常
- [ ] Turn Sidebar 导航正常
- [ ] 消息高亮跳转正常
- [ ] Right Sidebar 工具/文件信息正常
- [ ] 收藏消息正常
- [ ] 导出 .md 正常
- [ ] 删除/回收站正常
- [ ] 虚拟列表滚动性能正常（> 1000 条消息）
- [ ] 窗口 resize 不错乱

**验收**：
- 不连接时：现有所有功能正常（零回归）
- 连接后：能完成一轮完整对话（发送 → 流式回复 → 工具调用 → 结束）

---

### Step 2.8：新建会话入口

**目标**：提供从 GUI 创建全新 Claude Code 会话的能力。Phase 1 的 WebSocket `/api/ws/chat/new?cwd=...` 和后端 SpawnMode::New 已就绪，Phase 2 补上前端入口。

**依赖**：Step 2.7

**改动范围**：
- 新建 `web/src/pages/NewSessionView.tsx`
- 修改 `web/src/App.tsx`（添加路由）
- 修改 `web/src/pages/SessionsView.tsx`（添加入口按钮）

**具体要求**：

1. **路由**：`/sessions/new` → NewSessionView
2. **入口**：
   - Sessions 列表页顶部添加"新建对话"按钮（primary button，醒目但不大）
   - Dashboard 页面可添加快速入口（可选）
3. **NewSessionView 页面**：
   - 标题："新建对话"
   - 输入项：工作目录（cwd）
     - 文本输入框，带 placeholder "/Users/you/project"
     - 显示最近使用的项目目录（从浏览器的 sessionStorage/localStorage 读取历史 cwd）
     - 可选：文件夹选择按钮（使用浏览器 File System Access API 或手动输入）
   - 可选：模型选择（从 CLI 已知模型列表，非必填）
   - 可选：权限模式（default/acceptEdits/bypassPermissions，默认 default）
   - [开始对话] 按钮（cwd 为空时 disabled）
4. **导航与 session_id 迁移**：
   - 点击"开始对话" → 调用 `/api/ws/chat/new?cwd=...` 建立 WebSocket
   - 后端分配临时 key `conn_{uuid}`，spawn CLI
   - 前端 ChatSessionStore 处于 connecting 状态，显示 spinner
   - CLI 发送 SessionInit（含真实 session_id）
   - 后端 chat.rs 检测 session_key 从 `conn_xxx` 变为 `real-uuid` → 自动调用 `manager.migrate_session_key()`
   - 前端收到第二个 `Connected(session_id=real-uuid)` → ChatSessionStore 更新 sessionId
   - 前端 `useEffect` 检测 sessionId 变化 → `navigate(/sessions/${realSessionId})` 更新 URL
   - SessionDetail 处于 connected 状态，timeline 为空，输入框可用
5. **新建模式下的特殊处理**：
   - JSONL 文件在第一轮对话开始前不存在 → SessionDetail 不等待 `/api/sessions/{id}` 返回数据
   - timeline 初始为空数组，显示引导提示 "发送第一条消息开始对话"
   - 第一条消息发送后 → CLI 创建 JSONL → scanner 可发现新 session
6. **与 resume 的共存**：
   - 新建会话时无历史（timeline 为空），MessageTimeline 显示空白 + 中间引导文字
   - Phase 2 ConnectBar 直接处于 connected 状态（不再显示"连接并继续对话"按钮）
   - 首次发送消息：后端用 SpawnMode::New 启动 CLI

**验收**：
- 从 Sessions 列表点击"新建对话" → 进入 NewSessionView
- 输入 cwd → 点击开始 → WebSocket 连接 → 跳转到 SessionDetail
- SessionDetail 中 timeline 为空 → 输入框可用 → 发送第一条消息
- 收到 AI 回复 → 消息出现在空的 timeline 中（Phase 2 完整流程）
- 断开后 → JSONL 文件已创建 → 刷新页面 → 可正常 resume

---

## 2. Step 依赖关系

```
Phase 1 完成（TimelineEntry + Adapter + Store + WebSocket 全部就绪）
  └─→ Step 2.1（MessageTimeline 容器）
        ├─→ Step 2.2（Entry 子组件族）
        │     └─→ Step 2.3（StreamingBlock）
        ├─→ Step 2.4（AutoScroll）
        └─→ Step 2.5（ConnectBar）
              └─→ Step 2.6（合并逻辑）
                    └─→ Step 2.7（集成 & 回归）
                          └─→ Step 2.8（新建会话入口）
```

**建议执行顺序**：
1. Step 2.1（MessageTimeline）— 替换现有列表，纯只读模式先跑通
2. Step 2.2（子组件）— 与 2.1 可部分并行
3. Step 2.3（Streaming）— 实时渲染
4. Step 2.4（AutoScroll）— 与 2.3 可并行
5. Step 2.5（ConnectBar）— 连接/输入 UI
6. Step 2.6（Merge）— 合并逻辑
7. Step 2.7（集成）— 收口
8. Step 2.8（新建会话）— resume 通了再做 new

---

## 3. 与现有代码的关系

### 复用

| 现有能力 | Phase 2 中如何复用 |
|---------|-------------------|
| `SessionDetail.tsx` 虚拟列表 | MessageTimeline 内部继续用相同方案 |
| `MessageBlock.tsx` 样式 | Entry 子组件复用其 CSS 类和布局 |
| `TurnSidebar` 分组逻辑 | 基于 TimelineEntry[] 重新计算 turns |
| `SessionContext` 数据管理 | 扩展（加入 chat connection + merged timeline） |
| `react-markdown` / 代码高亮 | AssistantMessage 内部复用 |
| 搜索功能 | 在 TimelineEntry[] 上重新实现（接口兼容） |

### 替换

| 被替换的代码 | 替换为 |
|------------|--------|
| `SessionDetail` 中直接渲染 `messages.map(...)` | `<MessageTimeline entries={...} />` |
| `MessageBlock` 组件（作为渲染入口） | 被 `renderEntry()` + 子组件族替代 |
| worktree 分支的 `ActiveMessageArea` | 完全不用，由 StreamingBlock + 统一 timeline 替代 |
| worktree 分支的 `event-to-message.ts` | 完全不用，由 history-adapter + ChatSessionStore 替代 |

### 保持不变

| 功能 | 说明 |
|------|------|
| Sessions 列表页 | 不涉及 |
| Session 元数据加载 | 不变，Phase 1 增强了字段但 API 兼容 |
| Watcher 实时刷新 | 不变 |
| 导出功能 | 不变（但底层数据更完整了） |

---

## 4. 阶段 2 完成标准

- [ ] 所有 8 个 Step PR 合并到 master
- [ ] Session Detail 中历史消息用 TimelineEntry 渲染（视觉与之前一致）
- [ ] 可在 Session Detail 中连接 CLI 并完成一轮对话
- [ ] 可从 Sessions 列表新建对话（输入 cwd → 进入空 SessionDetail → 发送第一条消息）
- [ ] 新建会话时 timeline 为空，第一条消息正常出现，断开后可 resume
- [ ] Thinking 内容（历史 + 实时）可折叠展示
- [ ] 工具调用有 running → success/error 状态转换
- [ ] 流式文本无抖动、无闪烁
- [ ] TurnComplete 时 streaming→entry 转换无跳变（一致性规则 2 验证）
- [ ] Refetch 后无重复消息、无内容变化（一致性规则 3/4 验证）
- [ ] 长对话（>1000 条）滚动流畅
- [ ] 断开后刷新页面，新消息完整保留
- [ ] 所有现有功能零回归（搜索、Turn 导航、收藏、导出、删除）
- [ ] `npm run typecheck` 通过
- [ ] 设计规范合规（颜色/间距/圆角来自 CSS 变量）

---

*阶段 3 预览：控制台化输入区 —— ConnectBar 升级为完整 ConversationConsole：StatusBar + SlashMenu + 附件 + 模型/权限选择 + Git Branch。每个子功能作为独立组件逐个添加。*
