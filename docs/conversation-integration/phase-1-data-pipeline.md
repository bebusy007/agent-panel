# 阶段 1：数据管道完整性

> **状态**：草稿，待逐 step 确认后落地  
> **前置阅读**：无（本文自包含 Unified Timeline 基石设计）  
> **原则**：全 Phase 在一个 PR 下串行执行，每个 step 一个 commit。每完成一个 commit 后 review 确认，再继续下一个。粒度小到可以逐行 review；每个 step 有明确验收标准

---

## 全局五阶段总览

| 阶段 | 目标 | 用户感知 |
|------|------|---------|
| **1. 数据管道完整性** | CLI 产出的每类数据正确解析、传输、存入 store。UI 可只做最简渲染，但数据不丢 | 历史消息 thinking 可见；连接 CLI 后事件完整接收 |
| **2. 统一 Timeline 渲染** | 历史和实时消息通过同一套组件渲染 | 用户分不出"历史"和"新消息"，体验一致 |
| **3. 控制台化输入区** | 输入区从 textarea 升级为组合式控制台，按独立组件逐个添加 | 有 StatusBar、SlashMenu、附件、模型/权限模式展示 |
| **4. 深度工具 & 交互渲染** | 每种工具类型有定制渲染，权限/thinking/elicitation 有完整交互 | 工具调用从"日志"变成"操作面板" |
| **5. 增强 & 打磨** | rewind、export、context 可视化、SSH、分叉等高级功能 | 锦上添花 |

**本文档只聚焦阶段 1。后续阶段的细化文档在各阶段启动前编写。**

---

## 阶段 1 目标与基石意义

### 核心目标（一句话）

> 让 agent-panel 对 Claude Code 产出的每一 bit 数据都"看得见、存得住、查得到"——此后所有 UI 功能都只是"怎么渲染这些数据"的问题，不再需要回头补数据管道。

### 关键设计交付物

| # | 设计交付 | 一句话说明 |
|---|---------|-----------|
| 1 | **TimelineEntry 数据模型** | 前端消费的唯一数据类型，历史和实时都转换为它 |
| 2 | **ChatEvent 枚举** | stream-json → 工程内部的中间表示，所有实时事件的标准化表达 |
| 3 | **增强版 Message 结构** | JSONL 解析结果，比当前多 thinking_text/usage/cost/duration/cwd/git_branch 等 |
| 4 | **Session Meta API** | 会话级汇总数据（总 cost、总 token、turn 数、model、CLI version） |
| 5 | **conversation 后端模块** | Transport + SessionActor + Manager + 协议解析器 |
| 6 | **ChatSessionStore（前端）** | 对话状态机，所有 UI 组件只消费它的派生状态 |
| 7 | **WebSocket 对话通道** | 浏览器 ↔ 后端 ↔ CLI 的双向通信管道 |

### 四大基石及后续 Phase 依赖

#### 基石 1：TimelineEntry = "统一语言"

后续所有 phase 的 UI 组件**只消费 TimelineEntry**，不再直接处理 raw JSON。

- Phase 2（渲染）：`<MessageTimeline entries={timeline} />` 一个组件搞定
- Phase 3（输入区）：从 SessionInit 事件获取 slash commands、model、permission mode
- Phase 4（工具定制渲染）：`ToolTimelineEntry.tool_name` 决定用哪个子组件
- Phase 5（rewind）：沿 `parentUuid` 链回溯到 checkpoint

如果没有 TimelineEntry，后续每个 phase 都要自己做数据适配，重复劳动且不一致。

#### 基石 2：ChatSessionStore = "单一状态源"

前端所有对话相关 UI **只从 store 读状态**，不自己维护本地 state。

- Phase 2 的流式渲染 → `store.streamingText`
- Phase 3 的 StatusBar → `store.usage`, `store.model`, `store.permissionMode`
- Phase 4 的权限面板 → `store.pendingPermissions`
- Phase 5 的导出 → `store.timeline`（完整序列化）

如果没有 store，后续每个组件都要自己订阅 WebSocket、解析事件、维护状态，耦合且难测试。

#### 基石 3：完整 JSONL 解析 = "历史不丢数据"

当前 master 丢了很多信息（thinking、cost、usage、duration、permission 变更、file snapshot）。Phase 1 补齐后：

- **thinking 可见** → Phase 2 直接渲染，不需要再改解析器
- **cost/usage 可用** → Phase 3 StatusBar 直接读，不需要再改后端
- **file-history-snapshot 可查** → Phase 5 rewind 直接用，不需要再补数据源
- **parentUuid 链保留** → Phase 5 fork/rewind 直接沿链回溯

如果 Phase 1 不做完整，后续每做一个功能都要"先回去补解析"，开发节奏被打断。

#### 基石 4：conversation 后端模块 = "实时对话的地基"

Transport + Actor + Manager 三层，Phase 1 做好后：

- Phase 2 只需要在前端接 WebSocket + 把事件喂给 store，后端不用再动
- Phase 3 的中断/权限响应 → 调 Actor 的 command channel
- Phase 4 的 hook 响应 → 同理
- Phase 5 的 rewind → 新增一个 ActorCommand 变体即可

### Phase 1 完成后的功能影响

#### 立即改善（Phase 1 本身带来）

| 功能 | 现状 | Phase 1 后 |
|------|------|-----------|
| 历史消息中的 thinking 内容 | 显示为 "(thinking)" 占位符，实际内容丢失 | 完整 thinking 文本通过 API 返回 |
| 会话 cost/token 统计 | 不可见 | `/api/sessions/:id/meta` 返回总 cost、总 token |
| Turn 耗时 | 不可见 | 每条 assistant 消息带 `duration_ms` |
| 权限模式变更历史 | 丢失 | 作为系统消息出现在 timeline |
| CLI 环境检测 | 不存在 | `/api/config/conversation/check` 返回完整检测 |
| 日期分隔线 | 不存在 | `date_change` attachment 解析为日期标记 |
| Hook 取消记录 | 丢失 | `hook_cancelled` 关联到对应 tool_use |

#### 为后续 Phase 解锁的功能

| 后续功能 | 依赖的 Phase 1 基石 |
|---------|-------------------|
| 实时对话（打字 → 流式回复） | WebSocket 通道 + ChatSessionStore + SessionActor |
| 流式 thinking 面板 | ChatEvent::ThinkingDelta + store.thinkingText + store.thinkingStartMs |
| 实时 token 用量显示 | ChatEvent::UsageUpdate + store.usage |
| 工具调用实时状态 | ChatEvent::ToolUseStart/Delta/End/Result + store.timeline Tool entry |
| 权限审批 UI | ChatEvent::PermissionRequest + store.pendingPermissions + ActorCommand::SendPermission |
| Slash 命令菜单 | ChatEvent::SessionInit.slash_commands + store.slashCommands |
| Context 进度条 | store.usage.inputTokens + modelUsage.context_window |
| Rewind（回退） | file-history-snapshot 解析 + parentUuid 链 + ActorCommand::Rewind |
| Export（导出） | 完整 timeline（历史+实时已合并） |
| StatusBar | store.model + store.usage + store.permissionMode + store.cliVersion |
| 子 agent 嵌套展示 | parentToolUseId + subagent JSONL 加载 |
| 会话分叉（fork） | parentUuid 对话树 + session metadata |

---

## 基于 agent-panel 现有能力

### 复用

| 现有模块 | 文件 | Phase 1 中如何复用 |
|---------|------|-------------------|
| Message struct | `scanner/session_loader.rs:23` | 扩展 8 个新字段（thinking_text, usage, cost_usd, duration_ms, stop_reason, cwd, git_branch, message_id），保持向后兼容 |
| ContentBlock 枚举 | `scanner/session_loader.rs:744` | 新增 Thinking 变体，不改已有变体 |
| load_messages() | `scanner/session_loader.rs:53` | 增强解析逻辑（thinking 暂存、元数据提取），不改变函数签名 |
| extract_blocks() | `scanner/session_loader.rs:762` | 匹配 thinking block 类型，不改已有匹配分支 |
| is_thinking_only() | `scanner/session_loader.rs:732` | 已有函数，修复其"丢弃 thinking 内容"的问题 |
| router 挂载模式 | `router/mod.rs` | 新增 chat + cli_check 路由，复用 axum Router::merge() 模式 |
| ts-rs 类型导出 | 已有 `#[derive(TS)]` 用法 | Message 新增字段自动生成 TS 类型 |
| search_in_messages() | `scanner/session_loader.rs` | Message 新增 thinking_text 字段后搜索自然覆盖 |

### 新建

| 新建模块 | 位置 | 说明 |
|---------|------|------|
| conversation/ 模块 | `src-server/src/conversation/` | types、protocol、stdin_writer、transport、session_actor、manager（6 个文件） |
| ChatEvent 类型 | `src-server/src/conversation/types.rs` | 新增，stream-json 解析的中间表示 |
| conversation TS 类型 | `web/src/lib/conversation/` | types、chat-protocol、chat-session-store、use-chat-connection、history-adapter |
| WS 对话路由 | `src-server/src/router/chat.rs` | `/api/ws/chat/resume/{id}` + `/api/ws/chat/new` |
| CLI 预检端点 | `src-server/src/router/cli_check.rs` | `/api/config/conversation/check` |
| Session Meta API | `src-server/src/router/sessions.rs` | `/api/sessions/:id/meta`（汇总 cost/token/duration） |

### 修改

| 文件 | 改动 | 风险 |
|------|------|------|
| `scanner/session_loader.rs` | Message 新增字段 + ContentBlock 新增变体 + thinking 处理修复 + 元数据解析 | 低——全部 Option 字段向后兼容，已有测试需补充 thinking_text: None |
| `router/mod.rs` | 合并新路由 | 低——Router::merge() 操作 |
| `main.rs` | 初始化 SessionManager，传入 build_api_router | 低——新增变量 + 传参 |
| `Cargo.toml` | 零新增依赖 | 无风险 |

---

## 0. 基石：Unified Timeline 数据模型

### 0.1 核心命题

Agent Panel 的对话功能有两种数据来源：

| 来源 | 格式 | 获取方式 | 特点 |
|------|------|---------|------|
| 历史 JSONL | 磁盘 `.jsonl` 文件 | 启动时一次性加载 | 完整、离线可用、但无增量 |
| 实时 stream-json | CLI stdout 流式输出 | WebSocket 推送 | 增量、低延迟、但事件交织 |

**Unified Timeline 的目标**：两种来源归一为同一种数据模型（`TimelineEntry`），前端用同一套组件渲染。用户分不出"历史消息"和"新消息"。

这是 OpenCovibe 体验好的第一原因。当前 `worktree-conversation-integration` 分支没有做对——它维持了"历史区 + 活跃区"双轨渲染。

### 0.2 JSONL 文件格式全集（历史数据源）

基于对真实 session JSONL 文件的分析，以下是 Claude Code 写入 JSONL 的所有已知 entry type：

#### 核心会话条目

| type | 用途 | 关键字段 | 当前 master 处理 |
|------|------|---------|-----------------|
| `user` | 用户消息 | `message.content`（string 或 array）、`uuid`、`parentUuid`、`cwd`、`gitBranch`、`permissionMode`、`version` | ✅ 正确解析 |
| `assistant` | AI 回复 | `message.content`（array: text/thinking/tool_use blocks）、`message.model`、`message.stop_reason`、`message.usage`、`costUsd` | ⚠️ thinking block 丢失 |

#### user.message.content block types（当 content 为 array 时）

| block type | 用途 | master 处理 |
|------------|------|------------|
| `text` | 纯文本输入 | ✅ |
| `tool_result` | 工具结果（tool_use_id + content + is_error） | ✅ |
| `image` | 图片附件（base64） | ✅ |
| `document` | PDF 附件（base64） | ❌ 未处理 |

#### assistant.message.content block types

| block type | 用途 | 关键字段 | master 处理 |
|------------|------|---------|------------|
| `text` | 回复正文 | `text` | ✅ |
| `thinking` | 思考过程 | `thinking`（非 `text`）、`signature` | ❌ **静默丢弃** |
| `tool_use` | 工具调用 | `id`、`name`、`input` | ✅ |

#### assistant 消息上的 usage 对象字段

```json
{
  "input_tokens": 5763,
  "cache_creation_input_tokens": 6084,
  "cache_read_input_tokens": 26506,
  "output_tokens": 505,
  "server_tool_use": { "web_search_requests": 0, "web_fetch_requests": 0 },
  "service_tier": "standard",
  "cache_creation": { "ephemeral_1h_input_tokens": 0, "ephemeral_5m_input_tokens": 6084 },
  "inference_geo": "",
  "iterations": [],
  "speed": "standard"
}
```

当前 master **完全忽略** `message.usage` 和 `costUsd` 字段。

#### 元数据条目

| type | 用途 | 关键字段 | master 处理 |
|------|------|---------|------------|
| `system` (subtype: `turn_duration`) | turn 耗时统计 | `durationMs`、`messageCount` | ❌ 跳过 |
| `system` (subtype: `away_summary`) | 离开摘要 / compaction | `content` | ❌ 跳过 |
| `permission-mode` | 权限模式变更记录 | `permissionMode` | ❌ 跳过 |
| `ai-title` | AI 生成的会话标题 | `aiTitle` | ❌ 跳过（但 summary 用了） |
| `last-prompt` | 最近的 user prompt 快照 | `lastPrompt`、`leafUuid` | ❌ 跳过 |
| `file-history-snapshot` | 文件变更快照 | `snapshot`、`messageId`、`isSnapshotUpdate` | ❌ 跳过 |
| `queue-operation` | 消息队列操作 | `operation`（enqueue/dequeue）、`content` | ❌ 跳过 |
| `attachment` | 附件 meta | `attachment`（与 user 消息关联） | ❌ 跳过 |

#### 公共字段（大部分条目都有）

```
uuid, parentUuid, sessionId, timestamp, isSidechain, version,
entrypoint, cwd, gitBranch, userType, isMeta
```

### 0.2.x JSONL 字段全景参考

以下是 JSONL 中所有字段的**完整穷举**，包含语义说明和工程映射目标。

#### 公共字段（绝大多数 entry 都有）

| 字段 | 类型 | 语义 | 工程映射 |
|------|------|------|---------|
| `type` | string | entry 类型标识 | 分发解析器的路由键 |
| `uuid` | string (UUID) | 当前 entry 唯一 ID | → `Message.id` / `TimelineEntry.id` |
| `parentUuid` | string\|null | 父 entry 的 uuid，构成**对话树**链表 | → 用于构建 turn 分组、子 agent 嵌套、rewind 回溯 |
| `sessionId` | string (UUID) | 所属 session ID | 校验用，与文件名一致 |
| `timestamp` | string (ISO 8601) | 写入时间 | → `Message.timestamp` / `TimelineEntry.ts` |
| `isSidechain` | bool | 是否为子 agent（sidechain）的条目 | `true` = 子 agent 会话，文件位于 `subagents/` 目录 |
| `isMeta` | bool | 是否为元数据条目（不含对话内容） | `true` 的条目通常不进 timeline |
| `userType` | string | 用户类型 | 已知值：`"external"`（人类用户）。子 agent 也是 `"external"` |
| `entrypoint` | string | 启动入口 | 已知值：`"cli"`（命令行）、`"sdk-cli"`（SDK 调用） |
| `cwd` | string | entry 产生时的工作目录 | → `Message.cwd`，用于 git、文件路径解析 |
| `gitBranch` | string | entry 产生时的 git 分支 | → `Message.git_branch`，用于显示分支标签 |
| `version` | string | CLI 版本号 | → session metadata，用于版本兼容判断 |

#### 对话树结构说明

```
user (uuid=A, parentUuid=null)        ← 第 1 轮 user
  └─ attachment (uuid=B, parentUuid=A) ← user A 的附件
  └─ assistant (uuid=C, parentUuid=B)  ← 回复 user A
       └─ user (uuid=D, parentUuid=C)  ← 第 2 轮 user
            └─ assistant (uuid=E, parentUuid=D)
```

- `parentUuid` 构成单链表（每个 entry 指向前一个 entry）
- 第一条 user 的 `parentUuid` 为 `null`
- **续接（resume）** 时，新 user 的 `parentUuid` 指向上一次会话的最后一条 entry
- **子 agent** 的 entries 在单独的 `subagents/agent-{hash}.jsonl` 文件中，`isSidechain=true`

#### user entry 完整字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `"user"` | 固定 |
| `message.role` | `"user"` | 固定 |
| `message.content` | string \| Array\<ContentBlock\> | string = 纯文本；array = 含 tool_result/image/text blocks |
| `promptId` | string (UUID) | 本次 prompt 的唯一 ID（同一 prompt 可产生多条 entry） |
| `permissionMode` | string | 发送时的权限模式（`"default"`/`"bypassPermissions"`/`"acceptEdits"` 等） |
| + 所有公共字段 | | |

user.message.content 为 array 时的 block types：

| block type | 字段 | 说明 |
|------------|------|------|
| `text` | `{ type: "text", text: "..." }` | 纯文本 |
| `tool_result` | `{ type: "tool_result", tool_use_id, content, is_error }` | 工具执行结果 |
| `image` | `{ type: "image", source: { type: "base64", media_type, data } }` | 图片 |
| `document` | `{ type: "document", source: { type: "base64", media_type, data } }` | PDF |

#### assistant entry 完整字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `"assistant"` | 固定 |
| `message.id` | string | API 返回的 message ID，全局唯一 | → `Message.message_id` |
| `message.role` | `"assistant"` | 固定 |
| `message.model` | string | 模型标识（如 `"aws.claude-opus-4.6-nova05"`） | → `Message.model` |
| `message.stop_reason` | string | 停止原因：`"end_turn"` / `"tool_use"` / `"max_tokens"` | → `Message.stop_reason` |
| `message.stop_sequence` | string\|null | 停止序列（通常 null） | 暂不用 |
| `message.usage` | UsageObject | token 用量详情 | → `Message.usage` |
| `message.content` | Array\<ContentBlock\> | 回复内容 blocks | 解析为 text/thinking/tool_use |
| `costUsd` | number\|null | 本条消息 API 费用 | → `Message.cost_usd` |
| + 所有公共字段 | | |

assistant.message.content block types：

| block type | 字段 | 说明 |
|------------|------|------|
| `text` | `{ type: "text", text: "..." }` | 回复正文 |
| `thinking` | `{ type: "thinking", thinking: "...", signature: "..." }` | 思考过程（`thinking` 字段，不是 `text`） |
| `tool_use` | `{ type: "tool_use", id, name, input }` | 工具调用 |

assistant.message.usage 完整结构：

```json
{
  "input_tokens": 5763,
  "output_tokens": 505,
  "cache_creation_input_tokens": 6084,
  "cache_read_input_tokens": 26506,
  "server_tool_use": { "web_search_requests": 0, "web_fetch_requests": 0 },
  "service_tier": "standard",
  "cache_creation": { "ephemeral_1h_input_tokens": 0, "ephemeral_5m_input_tokens": 6084 },
  "inference_geo": "",
  "iterations": [],
  "speed": "standard"
}
```

#### attachment entry 完整字段

attachment entry 与紧随的 user 消息关联（通过 `parentUuid` 链接）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `"attachment"` | 固定 |
| `attachment` | Object | 附件数据 |
| `attachment.type` | string | 附件子类型（见下表） |
| + 所有公共字段 | | |

attachment.type 全量枚举：

| attachment.type | 字段 | 语义 | 工程处理 |
|----------------|------|------|---------|
| `skill_listing` | `{ content, skillCount, isInitial }` | Skills 列表快照 | → session metadata（可用于 slash 菜单） |
| `task_reminder` | `{ content: [], itemCount }` | 后台任务提醒 | → 如 content 非空则显示为系统通知 |
| `edited_text_file` | `{ filename, snippet }` | 文本文件编辑上下文 | → 工具调用的补充信息（关联到对应 tool_use） |
| `queued_command` | `{ prompt, commandMode }` | 排队的用户输入 | → 显示为"排队消息"系统通知 |
| `hook_cancelled` | `{ hookName, toolUseID, hookEvent, command, durationMs }` | Hook 取消记录 | → 工具状态更新为 "cancelled by hook" |
| `date_change` | `{ newDate }` | 日期变更标记 | → timeline 分隔线（"── 2026-05-12 ──"） |
| `command_permissions` | `{ allowedTools }` | 权限变更记录 | → session metadata |

#### system entry 完整字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `"system"` | 固定 |
| `subtype` | string | 子类型 |
| + 各 subtype 特有字段 | | |
| + 所有公共字段 | | |

system.subtype 全量枚举：

| subtype | 特有字段 | 语义 | 工程处理 |
|---------|---------|------|---------|
| `turn_duration` | `durationMs`, `messageCount` | 本 turn 的 API 耗时和消息数 | → 关联到对应 assistant 的 `duration_ms` |
| `away_summary` | `content` | 离开摘要（compaction 后的上下文总结） | → timeline 系统消息 |

#### 其他顶层 entry types

| type | 字段 | 语义 | 工程处理 |
|------|------|------|---------|
| `permission-mode` | `permissionMode`, `sessionId` | 权限模式变更 | → timeline 系统通知 |
| `ai-title` | `aiTitle`, `sessionId` | AI 生成的会话标题 | → SessionSummary.title |
| `last-prompt` | `lastPrompt`, `leafUuid`, `sessionId` | 最近 user prompt 快照 | → session metadata（resume 按钮显示） |
| `file-history-snapshot` | `messageId`, `isSnapshotUpdate`, `snapshot` | 文件版本快照 | → session metadata，rewind 功能的基础 |
| `queue-operation` | `operation`("enqueue"/"dequeue"), `content`, `timestamp`, `sessionId` | 消息队列操作 | → timeline 系统通知（排队/出队） |

#### file-history-snapshot.snapshot 结构

```json
{
  "messageId": "uuid-of-user-message",
  "timestamp": "ISO-8601",
  "trackedFileBackups": {
    "/path/to/file.ts": [version1_hash, version2_hash, version3_hash],
    ...
  }
}
```

- `trackedFileBackups` 是文件路径 → 版本列表的映射
- 每个 "版本" 是文件内容的 hash（可用于 rewind 时恢复文件到某个版本）
- `isSnapshotUpdate=true` 表示增量更新（只含变更文件），`false` 表示完整快照

#### 子 agent（subagent）会话结构

子 agent 的 JSONL 存放在 `{session-dir}/subagents/agent-{hash}.jsonl`，附带 `.meta.json`：

```json
// agent-a1a39dc48ebde5936.meta.json
{ "agentType": "claude-code-guide" }
```

子 agent JSONL 的 entries 与主会话格式相同，但：
- `isSidechain = true`
- `parentUuid` 链接子会话内部的条目
- 主会话中的 `tool_use(name="Agent")` 的 `tool_use_id` 哈希后 = 子 agent 文件名中的 hash

---

### 0.3 Stream-JSON 实时事件全集（WebSocket 数据源）

Claude CLI 以 `--output-format stream-json` 模式运行时，stdout 输出的每行是一个 JSON 对象。以下是 **ChatEvent** 全集：

#### 已确认事件类型（POC 2026-05-28 验证，CLI v2.1.153）

> ⚠️ 以下事件表基于实际 `--output-format stream-json --input-format stream-json --include-partial-messages` 运行验证。

| CLI stdout type | 内层 event.type | 说明 | ChatEvent 映射 |
|----------------|----------------|------|---------------|
| `system` (subtype: `init`) | — | 会话初始化（首事件） | `SessionInit` |
| `system` (subtype: `status`) | — | 状态更新（"requesting"等） | `SystemStatus` |
| `stream_event` | `message_start` | 新 assistant 消息开始（含 message_id + model） | `MessageStart` |
| `stream_event` | `content_block_start` | content block 开始（type: "thinking" / "text" / "tool_use"） | `ToolUseStart`（仅 tool 类型需要） |
| `stream_event` | `content_block_delta` | token 级增量（thinking_delta / text_delta / input_json_delta / signature_delta） | `ThinkingDelta` / `TextDelta` / `ToolInputDelta` |
| `stream_event` | `content_block_stop` | content block 结束 | `ToolUseEnd` |
| `stream_event` | `message_delta` | 消息级增量（stop_reason + usage） | `MessageDelta` |
| `stream_event` | `message_stop` | 消息结束 | 无独立 ChatEvent（内部状态标记） |
| `assistant` | — | 完整 assistant 消息（汇总，含 thinking/text/tool_use blocks + signature） | `AssistantMessage` |
| `user` (content: tool_result) | — | 工具结果（含 tool_use_result.stdout/stderr/exitCode） | `ToolResult` |
| `user` (有 uuid) | — | 用户消息回显 | `UserMessageEcho` |
| `result` | — | turn 结束（含 usage + modelUsage + cost + stop_reason） | `UsageUpdate` + `TurnComplete` |
| `control_request` | — | 权限/Hook/Elicitation 请求 | `PermissionRequest` / `HookCallback` / `ElicitationRequest` |
| `control_response` | — | CLI 对 control_request 的确认 | 无独立 ChatEvent（内部状态标记） |

**关键设计规则**：
- `stream_event` 是**信封**：解析器需先 `unwrap event` 字段得到内层 event.type
- `content_block_delta` 用 **index** 标识属于哪个 block（0 = thinking, 1 = text, 2+ = tool_use 等）
- `assistant` 汇总事件**与 delta 并行出现**：delta 用于流式显示，assistant 用于最终权威内容。两者 message_id 一致
- `user` event 中 tool_result 的 content 是数组，额外有 `tool_use_result` 字段（stdout/stderr/exitCode/interrupted）
- `result.modelUsage` 是 per-model 结构：`{"modelName": {inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens, costUSD, contextWindow, maxOutputTokens}}`

#### 未来可能新增的事件类型（兜底策略）

| 可能的 type | 来源 | 处理策略 |
|------------|------|---------|
| `goal` | Claude Code 新版本 | → `Raw` entry |
| `plan` / `artifact` | 潜在功能 | → `Raw` entry |
| `compact_boundary` | context compaction | → `System(CompactBoundary)` |
| `rate_limit` | 限流 | → `System(RateLimit)` |
| `task_notification` | 后台任务状态 | → `System(TaskNotification)` |
| 任何未知 type | — | → `Raw { event_type, data }` |

### 0.4 目标数据模型：TimelineEntry

```rust
/// 统一时间线条目 —— 历史和实时消息的单一表示
/// 
/// 这是前端最终消费的数据类型。
/// 历史 JSONL 解析 → TimelineEntry[]
/// 实时 ChatEvent 流 → reducer → TimelineEntry[]
/// 两者合并为一个完整 timeline。
enum TimelineEntry {
    /// 用户消息
    User {
        id: String,             // JSONL uuid
        text: String,
        attachments: Vec<AttachmentMeta>,
        ts: String,             // ISO 8601
        /// 是否为前端乐观插入（等待后端确认）
        optimistic: bool,
    },
    /// AI 回复（包含 thinking + text + usage）
    Assistant {
        id: String,             // message_id
        text: String,
        thinking_text: Option<String>,
        thinking_duration_ms: Option<u64>,
        model: Option<String>,
        usage: Option<TurnUsage>,
        stop_reason: Option<String>,
        ts: String,
    },
    /// 工具调用（经历 running → success/error 状态转换）
    Tool {
        id: String,             // tool_use_id
        tool_name: String,
        tool_input: Value,
        tool_output: Option<String>,
        tool_status: ToolStatus,
        is_error: bool,
        duration_ms: Option<u64>,
        /// 父 tool_use_id（子 agent 工具嵌套）
        parent_tool_use_id: Option<String>,
        /// 权限请求 ID（如果此 tool 正在等待权限）
        permission_request_id: Option<String>,
        ts: String,
    },
    /// 系统事件
    System {
        id: String,
        subtype: SystemSubtype,
        data: Value,
        ts: String,
    },
    /// 未知/未来事件
    Raw {
        id: String,
        event_type: String,
        data: Value,
        ts: String,
    },
}

enum ToolStatus {
    Running,            // input 可能还在累积
    Executing,          // input 完整，等待结果
    Success,
    Error,
    PermissionPrompt,   // 等待用户授权
    PermissionDenied,
    Interrupted,
}

enum SystemSubtype {
    SessionInit,
    TurnDuration,         // JSONL 的 system/turn_duration
    AwaySummary,          // JSONL 的 system/away_summary
    CompactBoundary,      // context compaction
    PermissionModeChange, // JSONL 的 permission-mode
    RateLimit,
    TaskNotification,
    HookCallback,
    ElicitationRequest,
    Error,
    Status,
}
```

**关键设计决策**：

1. **Tool 是可变条目，不是 start+end 两条**。tool_start 创建 entry（Running），tool_result 更新同一条的 output/status。

2. **Thinking 是 Assistant 的属性，不是独立条目**。thinking_delta 累积到 store 的 streaming 状态，assistant_message 完成时固化为 `Assistant.thinking_text`。

3. **Raw 是扩展性兜底**。Claude Code 未来新增事件类型（如 `goal`）被捕获为 Raw entry。UI 可按 `event_type` 选择性渲染。

4. **System 是结构化与灵活的折中**。已知子类型有枚举变体，未知子类型通过 `data` 传递。

### 0.5 ChatEvent → TimelineEntry 映射规则

| ChatEvent | Store 操作 |
|-----------|-----------|
| `TextDelta` | 追加 `streamingText` |
| `ThinkingDelta` | 追加 `thinkingText`，设 `thinkingStartMs` |
| `ToolUseStart` | 创建 `Tool(Running)` entry，建立 id→index 映射 |
| `ToolInputDelta` | 更新对应 Tool entry 的 `tool_input` |
| `ToolUseEnd` | Tool 状态 Running→Executing |
| `ToolResult` | 更新 Tool entry 的 `output`+`status` |
| `PermissionRequest` | 更新 Tool entry 状态→PermissionPrompt，加入 `pendingPermissions` |
| `AssistantMessage` | 固化 `streamingText`+`thinkingText` → `Assistant` entry |
| `UserMessageEcho` | 标记对应乐观 User entry 为已确认 |
| `UsageUpdate` | 更新 `usage` state |
| `TurnComplete` | 固化剩余流式状态，记录 `turnUsages`，phase→idle |
| `SessionInit` | 更新 metadata（model、commands、tools、mcp） |
| `Raw` | 创建 `Raw` entry |

### 0.6 当前 master 分支已有什么 / 缺什么

#### 已有（可复用）

| 能力 | 文件 | 说明 |
|------|------|------|
| JSONL 解析（user/assistant/tool_use/tool_result） | `session_loader.rs` | 核心逻辑正确，缺 thinking |
| ContentBlock 枚举（Text/Image/ToolUse/ToolResult） | `session_loader.rs:744` | 缺 Thinking 变体 |
| Message 结构体 | `session_loader.rs:23` | 缺多个字段 |
| Thinking-only 检测 | `session_loader.rs:732` | `is_thinking_only()` 已有 |
| Image 提取 | `session_loader.rs:827` | 正确 |
| 搜索功能 | `session_loader.rs` | 基于 Message 的全文搜索 |
| 前端虚拟列表渲染 | `SessionDetail.tsx` | 已有高性能列表 |
| Turn 分组 | `turn-grouping.ts` | 基于 Message[] 分组 |

#### 缺失（需本阶段全部补齐）

| # | 缺失 | 影响 | Step |
|---|------|------|------|
| A | `ContentBlock::Thinking` 变体 | thinking 文本无法提取 | 1.3 |
| B | `Message.thinking_text` 字段 | API 无法返回 thinking | 1.3 |
| C | `Message.message_id` 字段 | 实时/历史去重不可能 | 1.3 |
| D | `Message.usage` / `Message.cost_usd` | 无 token 用量信息 | 1.3 |
| E | `Message.duration_ms` | turn 耗时不可见 | 1.3 |
| F | `Message.parent_tool_use_id` | 子 agent 嵌套丢失 | 1.3 |
| G | `Message.stop_reason` | 无法区分 end_turn/tool_use/max_tokens | 1.3 |
| H | `Message.cwd` / `Message.git_branch` | 消息上下文信息丢失 | 1.3 |
| I | system/turn_duration 解析 | turn 耗时不可见 | 1.3 |
| J | system/away_summary 解析 | compaction 信息丢失 | 1.3 |
| K | permission-mode 变更记录 | 权限模式变更历史不可见 | 1.3 |
| L | queue-operation 解析 | 排队消息不可见 | 1.3 |
| M | file-history-snapshot 解析 | 文件变更记录丢失 | 1.3 |
| N | Session 级 cost/usage 汇总 API | 无法展示会话总开销 | 1.3 |
| O | `conversation/` 模块 | 不存在于 master | 1.1-1.7 |
| P | WebSocket 对话通道 | 不存在于 master | 1.7 |
| Q | ChatEvent / TimelineEntry 类型 | 不存在于 master | 1.1 |
| R | 前端 ChatSessionStore | 不存在于 master | 1.8 |

### 0.7 扩展性设计

**三层处理策略**：

```
新增事件类型的处理路径：

Layer 1: 已知且需要复杂 UI → 新增 ChatEvent 变体 + TimelineEntry 变体
  例：PermissionRequest、ToolUseStart

Layer 2: 已知但展示简单 → 映射到 System entry 的对应 subtype
  例：RateLimit → System(RateLimit)，前端显示一行通知

Layer 3: 未知 → 作为 Raw entry 保留完整数据
  例：未来 "goal" 类型 → Raw { event_type: "goal", data: {...} }

升级路径：
  Layer 3 → 频繁出现 → 评估升级到 Layer 2 或 Layer 1
  Layer 2 → 需要复杂渲染 → 升级到 Layer 1
```

**前端组件策略**：

```typescript
// MessageTimeline 组件内部根据 entry.kind 分发渲染
function renderEntry(entry: TimelineEntry) {
  switch (entry.kind) {
    case "user":       return <UserMessage {...entry} />;
    case "assistant":  return <AssistantMessage {...entry} />;
    case "tool":       return <ToolCard {...entry} />;
    case "system":     return <SystemNotice {...entry} />;
    case "raw":        return <RawEventDebug {...entry} />; // dev 模式显示
  }
}
```

每种 `kind` 的组件独立开发、独立测试。后续新增 `kind` 只需加一个 case + 一个新组件。

### 0.8 数据生命周期：实时数据如何变为历史数据

#### 核心事实

**Claude CLI 自己负责将对话数据写入 JSONL 文件**。我们不需要做持久化。

```
CLI 内部一次 turn：

  ① 接收用户输入（stdin）
  ② 调用 Anthropic API
  ③ 同时做两件事：
     a) stdout 输出 stream-json 事件（text_delta, tool_use_start, ...）← 我们实时捕获
     b) 写入 JSONL 文件（完整的 user/assistant/system entries）← CLI 自动做
  ④ Turn 结束后，JSONL 已包含完整数据
```

#### 两条数据路径的关系

| 路径 | 来源 | 特点 | 用途 |
|------|------|------|------|
| stream-json（实时） | CLI stdout | 增量、低延迟、事件粒度细 | 实时 UI 渲染 |
| JSONL（历史） | CLI 写磁盘 | 完整、权威、turn 级粒度 | 持久化、刷新后恢复 |

**关键**：stream-json 的 `assistant` 汇总事件和 JSONL 中的 `assistant` entry **来自同一份数据**。内容保证一致。

#### 生命周期时序

```
t0: 用户发送消息
    → CLI stdin 接收
    → CLI 写入 JSONL user entry
    → CLI stdout 输出 user_message_echo

t1: AI 开始回复
    → stdout: thinking_delta, text_delta（逐 token）
    → JSONL: 还没写（assistant entry 在 turn 结束时才写）

t2: Turn Complete
    → stdout: assistant 汇总事件（完整 text）
    → stdout: result 事件（usage, cost）
    → CLI 写入 JSONL assistant entry（完整 text + usage + cost）
    → CLI 写入 JSONL system/turn_duration entry

t3: 我们 refetch JSONL
    → historyEntries 更新，包含 t0~t2 的所有数据
    → merge 去重 → live entries 被 history 替换（内容相同）
    → 用户无感知
```

#### Streaming vs Entry：两层数据的关系

| 层 | 内容 | 生命周期 | 创建依据 |
|----|------|---------|---------|
| **Streaming 层** | `store.streamingText`（累积的 text_delta） | TurnComplete 时丢弃 | text_delta 逐个追加 |
| **Entry 层** | `AssistantMessage TimelineEntry` | 持久化 | **`assistant` 汇总事件的完整 text**（非累积 delta） |

**核心规则**：正式 TimelineEntry 永远从"完整事件"创建，不从 accumulated delta 创建。这保证了 live entry.text === history entry.text（同源数据）。

#### 一致性保证四条规则

```
规则 1：streaming 是"显示用草稿"，不是正式数据
  - streamingText / thinkingText 只用于 StreamingBlock 临时渲染
  - 绝不持久化、绝不写入 store.timeline

规则 2：正式 TimelineEntry 只从"完整事件"创建
  - AssistantMessage entry ← assistant 汇总事件的完整 text
  - Tool entry output ← tool_result 事件
  - 不用 accumulated deltas 创建正式 entry

规则 3：历史数据是最终权威
  - refetch 后，history entry 替换同 id 的 live entry
  - history 的 usage/cost/duration 更完整

规则 4：替换时内容相同 → 用户无感知
  - 因为规则 2，live entry text === history entry text（同源）
  - 替换只是"补齐字段"，不是"改内容"
```

#### Refetch 触发时机

| 触发条件 | 说明 |
|---------|------|
| TurnComplete 事件到达 | 每轮结束后 CLI 已将完整消息写入 JSONL |
| File watcher 检测 JSONL 变化 | agent-panel 已有文件监听机制 |
| 定时对齐（30s） | 兜底 |
| 页面刷新 / 重新进入 | 从零加载 |

#### 边界场景

| 场景 | 结果 | 用户体验 |
|------|------|---------|
| 正常完成 | live text === history text | 丝滑无跳变 |
| miss 几个 delta（channel overflow） | streaming 不完整 → TurnComplete 时正式 entry 完整 | 瞬间"补全"（极轻微） |
| 用户断开、CLI 继续完成 | JSONL 有完整数据，live 没有 → refetch 补全 | 刷新后看到完整回复 |
| CLI 崩溃（未 turn complete） | JSONL 可能缺 assistant entry → streaming 内容丢失 | 丢失最后一条未完成的回复 |
| 数据只增不减 | refetch 永远带来更多/更完整的数据 | 不会出现"有→无" |

---

## 1. Step 清单

### Step 1.1：Unified Timeline 类型定义（纯类型，零逻辑）

**目标**：定义 `ChatEvent`、`TimelineEntry`、`ToolStatus`、`SystemSubtype` 等全部类型。Rust 和 TypeScript 各一份。不写任何解析/渲染逻辑。

**依赖**：无

**改动范围**：
- 新建 `src-server/src/conversation/types.rs`
- 新建 `src-server/src/conversation/mod.rs`（仅 `pub mod types; pub use types::*;`）
- 新建 `web/src/lib/conversation/types.ts`
- 新建 `web/src/lib/conversation/index.ts`

**类型清单**：
- `ChatEvent` 枚举（所有实时事件变体）
- `TimelineEntry` 枚举（统一 timeline 的渲染数据模型）
- `ToolStatus` / `SystemSubtype` 枚举
- `MessageUsage` 结构体（per-message token 用量）
- `TurnUsage` 结构体（per-turn 用量汇总）
- `SlashCommandInfo` / `McpServerInfo` / `AttachmentMeta` 辅助类型
- `ServerMessage` / `ClientMessage`（WebSocket 通信协议）
- `SpawnConfig` / `SpawnMode`（CLI 启动配置）
- 前端 `ChatSessionState` / `SessionPhase` / `ChatAction` 基础类型

**不动**：
- `session_loader.rs`（Step 1.3 才改）
- 任何已有 API / 组件

**验收**：
```bash
cargo check -p agent-panel-server   # 编译通过
cd web && npm run typecheck          # 编译通过
```

---

### Step 1.2：协议解析器（stream-json → ChatEvent）

**目标**：实现完整的 `parse_stream_event()` 函数和有状态的 `ProtocolParser`（维护 tool_use index→id 映射）。

**依赖**：Step 1.1

**改动范围**：
- 新建 `src-server/src/conversation/protocol.rs`

**具体要求**：

1. 解析所有已确认事件类型（0.3 节表格中的全部）
2. 有状态解析器维护 `index → tool_use_id` 映射（解决 `content_block_delta` 只有 index 的问题）
3. `parse_assistant` 必须提取 thinking block → 输出 `ThinkingDelta`
4. `parse_user` 中 tool_result 的多 block content 完整拼接（不只取第一个）
5. 未知 event type → `Raw`
6. 非法 JSON → 跳过该行，warn log
7. 每种事件类型 ≥1 个单元测试

**从 worktree 复用**：`protocol.rs` 核心解析逻辑可复用，但需补全缺失事件 + 修复 parse_assistant thinking 遗漏。

**验收**：
```bash
cargo test -p agent-panel-server conversation::protocol
# 所有 ChatEvent 变体有对应测试覆盖
```

---

### Step 1.3：JSONL 解析全量补齐 —— 所有元数据/Thinking/Usage 全部落盘

**目标**：JSONL 中的**每一种 entry type 和每一个有价值字段**都要被解析并存入 `Message` 或新增的元数据结构。目标是"数据零丢失"——即便前端暂时不渲染，API 也要能返回完整数据。

**依赖**：Step 1.1（需要新字段定义）

**具体改动**：

#### A. ContentBlock 补全

1. **增加 `Thinking(String)` 变体**
   - `extract_blocks()` 中匹配 `"thinking"` 类型
   - 提取 `item.get("thinking")` 优先于 `item.get("text")`（真实数据用 `thinking` 字段）

2. **增加 `Document` 变体**（PDF 附件，user content 中出现）
   - 解析 `"document"` 类型 block

#### B. Message 结构体新增字段

全部 `Option`，`skip_serializing_if = "Option::is_none"`，向后兼容：

| 新字段 | 类型 | 数据来源 | 说明 |
|--------|------|---------|------|
| `thinking_text` | `Option<String>` | assistant.content thinking block | AI 思考过程原文 |
| `message_id` | `Option<String>` | assistant.message.id | 去重用 |
| `cost_usd` | `Option<f64>` | assistant 条目的 `costUsd` 字段 | 本条消息的 API 费用 |
| `usage` | `Option<MessageUsage>` | assistant.message.usage | token 用量 |
| `duration_ms` | `Option<u64>` | 关联的 system/turn_duration | 本 turn 耗时 |
| `stop_reason` | `Option<String>` | assistant.message.stop_reason | end_turn / tool_use / max_tokens |
| `parent_tool_use_id` | `Option<String>` | user.message 中 tool_result 的归属 | 子 agent 嵌套 |
| `cwd` | `Option<String>` | entry 公共字段 cwd | 消息发送时的工作目录 |
| `git_branch` | `Option<String>` | entry 公共字段 gitBranch | 消息发送时的 git 分支 |

新增辅助结构：
```rust
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MessageUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub cache_read_input_tokens: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_tier: Option<String>,
}
```

#### C. Thinking 处理修复

1. **thinking-only assistant**：
   - 当前：text 写死 `"(thinking)"`，actual thinking 丢失
   - 改为：暂存 `pending_thinking`；下一个 text-assistant 合并到 `thinking_text`
   - 边界：如果后面是 user 消息 → thinking 写入独立 assistant 消息的 `thinking_text` 字段

2. **混合 thinking+text assistant**：
   - 提取所有 thinking blocks → 拼接为 `thinking_text`
   - text blocks → 正常拼接为 `text`
   - 不再用 `_ => {}` 跳过 thinking

#### D. Usage / Cost 提取

每条 assistant 消息必须提取：
- `message.usage.input_tokens` / `output_tokens` / `cache_creation_input_tokens` / `cache_read_input_tokens` / `service_tier` → `Message.usage`
- `costUsd` → `Message.cost_usd`
- `message.stop_reason` → `Message.stop_reason`
- `message.model` → 已有 `Message.model`

#### E. 元数据条目全量解析

当前 master 完全跳过的条目，全部要解析并通过新的 API 暴露：

| JSONL entry type | 解析为 | 存储方式 |
|-----------------|--------|---------|
| `system` (subtype: `turn_duration`) | `TurnDurationMeta { duration_ms, message_count, parent_uuid }` | 附加到对应 turn 的最后一条 assistant Message.duration_ms |
| `system` (subtype: `away_summary`) | `AwaySummaryMeta { content }` | 作为 role="system" 的 Message 插入 timeline |
| `permission-mode` | `PermissionModeMeta { permission_mode }` | 作为 role="system" 的 Message 插入 timeline |
| `ai-title` | 提取 `aiTitle` | 更新 SessionSummary.title（已有逻辑，确认不丢失） |
| `last-prompt` | 提取 `lastPrompt` | 暂存为 session 元数据（API 可查，不进 timeline） |
| `file-history-snapshot` | 提取 `snapshot` | 暂存为 session 元数据（API 可查） |
| `queue-operation` | 提取 `operation` + `content` | 作为 role="system" 的 Message 插入 timeline |
| `attachment` | 关联到对应 user 消息 | 更新对应 Message 的 attachments |

#### F. 公共字段提取

每条 user/assistant 消息额外提取：
- `cwd` → `Message.cwd`
- `gitBranch` → `Message.git_branch`
- `version` → 暂存为 session 元数据

#### G. Session 级元数据新增 API

新增 `GET /api/sessions/:id/meta` 返回：
```json
{
  "total_cost_usd": 0.15,
  "total_input_tokens": 50000,
  "total_output_tokens": 8000,
  "total_cache_read_tokens": 120000,
  "total_cache_creation_tokens": 30000,
  "turn_count": 12,
  "total_duration_ms": 180000,
  "last_model": "claude-sonnet-4-20250514",
  "last_permission_mode": "bypassPermissions",
  "cli_version": "2.1.146",
  "file_snapshots": [...],
  "last_prompt": "..."
}
```

**验收**：
```bash
cargo test -p agent-panel-server scanner::session_loader
```
新增测试用例：
- thinking-only assistant → `thinking_text` 非空
- thinking+text assistant → 两个字段都非空
- thinking-only 后跟 user → thinking 不丢失
- 无 thinking → `thinking_text` 为 None（不回归）
- assistant 消息 → `usage` 字段非空，包含 input/output/cache tokens
- assistant 消息 → `cost_usd` 正确提取（null → None）
- assistant 消息 → `stop_reason` 正确提取
- system/turn_duration → 正确关联到 assistant 的 `duration_ms`
- system/away_summary → 生成 role="system" 消息
- permission-mode → 生成 role="system" 消息
- queue-operation → 生成 role="system" 消息
- `/api/sessions/:id/meta` 返回正确的汇总数据

---

### Step 1.4：Transport（CLI 进程 spawn/IO/exit）

**目标**：可靠地 spawn/管理 Claude CLI 进程，处理 stdout/stderr/exit。

**依赖**：Step 1.1

**改动范围**：
- 新建 `src-server/src/conversation/transport.rs`

**具体要求**：

1. spawn CLI with 正确参数：`--output-format stream-json --input-format stream-json --include-partial-messages --verbose --permission-prompt-tool stdio`（⚠️ `--include-partial-messages` 必须加——不加时无 token 级流式 delta，只有完整 assistant 消息。POC 已验证：加此 flag 后输出 62 个 content_block_delta/秒）
2. stdout 逐行读取 → broadcast channel
3. stderr 逐行读取 → broadcast channel（标记为 stderr source）
4. stdin 接管 → 返回 `ChildStdin`
5. `kill_on_drop(true)` 确保进程不泄露
6. kill 流程：关闭 stdin → 等 3s graceful exit → force kill
7. spawn 超时：10s 内无 stdout 输出 → 返回 `spawn_timeout` 错误
8. 退出码分类：0=normal, 非0=error, signal=killed

**从 worktree 复用**：`transport.rs` 基本可直接用，增加 stderr 透传 + spawn 超时。

**验收**：
```bash
cargo test -p agent-panel-server conversation::transport
```
- 不存在的二进制 → 明确错误
- echo 命令 → 读取 stdout 正确
- kill_on_drop 行为确认

---

### Step 1.5：SessionActor（turn engine + 命令处理）

**目标**：Actor 模式管理单个 CLI 会话的完整生命周期。

**依赖**：Step 1.2 + Step 1.4

**改动范围**：
- 新建 `src-server/src/conversation/session_actor.rs`
- 新建 `src-server/src/conversation/stdin_writer.rs`

**具体要求**：

1. Actor command loop（mpsc channel 接收命令）
2. Commands：SendMessage, SendPermission, Interrupt, Stop, Rewind, RespondHook, RespondElicitation
3. stdout 事件通过 ProtocolParser 解析后 broadcast
4. active_turn 状态 + 消息排队
5. turn complete → 链式派发下一条排队消息
6. Turn 超时保护：30min 无 turn complete → auto interrupt → 10s quarantine → force kill
7. event_seq 计数：每条 emit 的事件带单调递增序号
8. stdin_writer：构造 user_message、control_response（permission/hook/elicitation）、interrupt_request、rewind_request

**从 worktree 复用**：`session_actor.rs` 骨架 + `stdin_writer.rs` 整体可用，需增加超时/quarantine/新命令。

**验收**：
```bash
cargo test -p agent-panel-server conversation::session_actor
cargo test -p agent-panel-server conversation::stdin_writer
```

---

### Step 1.6：SessionManager（多会话 + 连接互斥 + epoch）

**目标**：管理所有活跃 CLI sessions，保证连接安全。

**依赖**：Step 1.5

**改动范围**：
- 新建 `src-server/src/conversation/manager.rs`

**具体要求**：

1. connect(config, reconnect_token) → 返回 event_rx + session_key + token
2. 同 session 互斥：已有活跃连接 → 返回 `already_connected`
3. Epoch 机制：每次新连接 epoch+=1，命令携带 epoch 校验
4. 30s 重连窗口：WS 断开后等待重连，超时 kill
5. reconnect_token 校验
6. shutdown_all()：server 关闭时清理所有进程
7. migrate_session_key()：new session 获得 session_id 后迁移 key

**从 worktree 复用**：`manager.rs` 核心逻辑可用，增加 epoch。

**验收**：
```bash
cargo test -p agent-panel-server conversation::manager
```
- 两个连接同一 session → 第二个被拒
- 断开→30s 内重连 → 成功
- 超时 → 进程被清理

---

### Step 1.7：WebSocket 路由 + CLI 预检端点

**目标**：HTTP/WS 层暴露对话通道和环境检查。

**依赖**：Step 1.6

**改动范围**：
- 新建 `src-server/src/router/chat.rs`
- 新建 `src-server/src/router/cli_check.rs`
- 修改 `src-server/src/router/mod.rs`（添加路由挂载）
- 修改 `src-server/src/main.rs`（初始化 SessionManager）

**WebSocket 路由**：
- `GET /api/ws/chat/resume/{session_id}` — 续接现有会话
- `GET /api/ws/chat/new?cwd=...` — 新建会话

**CLI 预检端点**：
- `GET /api/config/conversation/check` — 返回 CLI 可用性检测结果

**预检检查项**：
- CLI 是否存在（which claude）
- 版本（>= 2.1.100）
- 认证状态（claude auth status）
- stream-json 模式支持
- 中文错误提示

**handle_ws_session 的特殊处理**——新建会话的 session_id 迁移：

`/ws/chat/new` 创建的 session 初始 key 是 `conn_{uuid}`（临时 ID）。CLI 的 SessionInit 事件返回真实 session_id 后，需要：

1. 在 `handle_ws_session` 中监听 `Connected` 事件的 `session_id` 字段变化
2. 检测到 session_id 从 `conn_xxx` 变为 `real-uuid` → 调用 `manager.migrate_session_key(conn_key, real_uuid)`
3. 确保后续重连（30s 窗口内）可以用真实 session_id 找到 session

**从 worktree 复用**：`chat.rs` + `cli_check.rs` 基本可直接用，需补充上述迁移逻辑。

**验收**：
```bash
cargo test -p agent-panel-server router::integration_tests
curl http://127.0.0.1:7788/api/config/conversation/check | jq
```

---

### Step 1.8：前端 Store 字段 & Reducer 补全

**目标**：前端 `ChatSessionState` 覆盖所有后端事件类型，每个字段有 reducer 分支。

**依赖**：Step 1.1

**改动范围**：
- 新建 `web/src/lib/conversation/chat-session-store.ts`
- 新建 `web/src/lib/conversation/chat-protocol.ts`（WS 消息类型）
- 新建 `web/src/lib/conversation/use-chat-connection.ts`（WS hook）

**Store 状态字段**：
```typescript
interface ChatSessionState {
  // Phase
  phase: SessionPhase;  // empty|connecting|connected|running|idle|error|disconnected
  sessionId: string | null;
  epoch: number;
  reconnectToken: string | null;

  // Timeline (unified)
  timeline: TimelineEntry[];
  streamingText: string;
  thinkingText: string;
  thinkingStartMs: number;
  thinkingEndMs: number;
  activeToolId: string | null;

  // Usage
  usage: UsageState;
  turnUsages: TurnUsage[];
  currentTurnStartMs: number | null;

  // Permissions
  pendingPermissions: PermissionRequest[];

  // Metadata
  model: string | null;
  slashCommands: SlashCommandInfo[];
  mcpServers: McpServerInfo[];
  cliVersion: string;
  permissionMode: string;
  cwd: string;

  // Rate limit
  rateLimit: { status: string; utilization?: number; resetsAt?: number } | null;

  // Compaction
  compactCount: number;
  lastCompactedAt: number;

  // Error
  error: string | null;

  // ── 内部守卫 ──
  _seenMessageIds: Set<string>;
  _seenToolIds: Set<string>;
  _toolIndex: Map<string, number>;  // tool_use_id → timeline index
}
```

**Reducer 分支完整覆盖** 0.5 节映射表中所有 ChatEvent。

**去重逻辑**：
- `_seenMessageIds`：AssistantMessage 只处理一次
- `_seenToolIds`：ToolUseStart 只创建一条 entry
- 乐观 User → UserMessageEcho 用 uuid 匹配合并

**从 worktree 复用**：`chat-session-store.ts` 骨架可用，需大量补全字段/分支/去重。

**验收**：
```bash
cd web && npm run typecheck
cd web && npm test -- chat-session-store
```

---

### Step 1.9：History Adapter（Message[] → TimelineEntry[]）

**目标**：提供纯函数，将 Phase 1 增强后的 `Message[]`（从 JSONL 加载）转换为 `TimelineEntry[]`，使历史和实时数据类型完全统一。

**依赖**：Step 1.1（TimelineEntry 类型）+ Step 1.3（增强 Message 含 thinking_text/usage/cost 等）

**改动范围**：
- 新建 `web/src/lib/conversation/history-adapter.ts`

**具体要求**：

1. **核心函数**：`messagesToTimeline(messages: Message[]): TimelineEntry[]`

2. **转换规则**：
   - `role="user"` → `TimelineEntry::User`
   - `role="assistant"` → `TimelineEntry::Assistant`（含 thinking_text, model, usage, cost）
   - `role="tool_use"` + 紧随的 `role="tool_result"`（同 tool_use_id）→ 合并为单条 `TimelineEntry::Tool`
   - `role="system"` → `TimelineEntry::System`（按内容推断 subtype）
   - 未知 role → `TimelineEntry::Raw`

3. **Tool 合并策略**：
   - tool_use 和 tool_result 通过 `tool_use_id` 关联
   - 合并为一条 Tool entry：name + input 来自 tool_use，output + is_error 来自 tool_result
   - 如果 tool_use 没有对应 tool_result（turn 被中断）→ status = "interrupted"
   - 如果 tool_result 没有对应 tool_use（历史数据不完整）→ 单独创建 Tool entry

4. **连续 thinking-only + text assistant 合并**：
   - Phase 1 Step 1.3 已在 session_loader 层处理（pending_thinking 合并到 thinking_text）
   - adapter 直接读取 `Message.thinking_text` 即可

5. **保持消息顺序**：转换后 TimelineEntry[] 的顺序与原始 Message[] 一致

6. **id 策略**：
   - User entry.id = Message.id（uuid）
   - Assistant entry.id = Message.message_id ?? Message.id
   - Tool entry.id = Message.tool_use_id ?? Message.id

**验收**：
```bash
cd web && npm test -- history-adapter
```
测试用例：
- 纯文本对话（user + assistant）→ 正确转换
- 含 thinking 的 assistant → thinkingText 正确映射
- tool_use + tool_result 相邻 → 合并为一条 Tool entry
- tool_use 无 result（interrupted）→ status = "interrupted"
- system 消息 → System entry
- 大量消息（1000+）→ 性能无问题

---

## 2. Step 依赖关系

```
Step 1.1（类型定义）── 基础，无依赖
  ├─→ Step 1.2（协议解析器）── 依赖 1.1
  │     └─→ Step 1.5（SessionActor）── 依赖 1.2 + 1.4
  │           └─→ Step 1.6（Manager）── 依赖 1.5
  │                 └─→ Step 1.7（路由 + 预检）── 依赖 1.6
  ├─→ Step 1.3（JSONL 全量补齐）── 依赖 1.1
  │     └─→ Step 1.9（History Adapter）── 依赖 1.1 + 1.3
  ├─→ Step 1.4（Transport）── 依赖 1.1
  └─→ Step 1.8（前端 Store）── 依赖 1.1
```

**建议执行顺序**：
1. **Step 1.1**（必须先做）
2. **并行**：Step 1.3（JSONL）、Step 1.4（Transport）、Step 1.8（前端 Store）
3. **Step 1.2**（解析器）
4. **Step 1.9**（History Adapter，依赖 1.3 完成）
5. **Step 1.5**（Actor）
6. **Step 1.6**（Manager）
7. **Step 1.7**（路由）

---

## 3. 与 worktree-conversation-integration 分支的关系

**不整体 merge，逐 step cherry-pick/改写**：

| Step | 从 worktree 复用 | 变更内容 |
|------|-----------------|---------|
| 1.1 | `types.rs`（局部） | 补全缺失变体，重新设计 TimelineEntry |
| 1.2 | `protocol.rs`（核心） | 补全事件 + 修 thinking + 修 tool_result |
| 1.3 | 无 | 纯 master 上改 session_loader |
| 1.4 | `transport.rs`（整体） | 加 stderr + 超时 |
| 1.5 | `session_actor.rs` + `stdin_writer.rs` | 加超时/quarantine/新命令 |
| 1.6 | `manager.rs` | 加 epoch |
| 1.7 | `chat.rs` + `cli_check.rs` | 基本直接用 |
| 1.8 | `chat-session-store.ts` | 大量补全 |

---

## 4. 阶段 1 完成标准

- [ ] 所有 9 个 Step commit 合入 PR，review 通过
- [ ] `Message.thinking_text` 正确填充（历史消息 thinking 可见）
- [ ] `Message.usage` / `Message.cost_usd` / `Message.duration_ms` 正确填充
- [ ] 所有 JSONL 元数据条目（system/turn_duration, away_summary, permission-mode, attachment 全类型）正确解析
- [ ] `ChatEvent` 覆盖所有已知 CLI stream-json 事件类型
- [ ] 未知事件 → Raw entry（不丢数据）
- [ ] `messagesToTimeline()` 能将 Message[] 正确转换为 TimelineEntry[]
- [ ] `historyEntries` 和 `liveEntries`（ChatSessionStore 产出）类型一致、字段对齐
- [ ] CLI 异常退出时无孤儿进程
- [ ] 同一 session 不会有两个活跃 WS 连接
- [ ] `cargo test` 全部通过
- [ ] `npm run typecheck` 全部通过
- [ ] 现有 Session Detail 页面不受影响（零回归）

---

*阶段 2 预览：统一 Timeline 渲染 —— MessageTimeline 组件渲染 `TimelineEntry[]`；Live + History 合并去重；StreamingBlock 实时渲染；历史和实时消息视觉完全一致。*
