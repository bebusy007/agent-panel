# 对话集成技术方案

> 对应产品方案：`product-spec.md`

## 目录

1. [技术选型与依赖](#1-技术选型与依赖)
2. [系统架构](#2-系统架构)
3. [后端：Session Manager 模块](#3-后端session-manager-模块)
4. [后端：stream-json 协议解析](#4-后端stream-json-协议解析)
5. [后端：WebSocket 对话通道](#5-后端websocket-对话通道)
6. [后端：进程生命周期管理](#6-后端进程生命周期管理)
7. [后端：配置管理](#7-后端配置管理)
8. [前端：连接状态 Hook](#8-前端连接状态-hook)
9. [前端：输入区组件](#9-前端输入区组件)
10. [前端：流式消息渲染](#10-前端流式消息渲染)
11. [前端：Slash 菜单组件](#11-前端slash-菜单组件)
12. [前端：权限审批组件](#12-前端权限审批组件)
13. [Transport 抽象层](#13-transport-抽象层)
14. [文件清单与改动范围](#14-文件清单与改动范围)
15. [实施阶段划分](#15-实施阶段划分)
16. [风险与缓解](#16-风险与缓解)
17. [补充：协议细节与边界澄清](#17-补充协议细节与边界澄清)

---

## 1. 技术选型与依赖

### 后端新增依赖

| Crate | 用途 | 说明 |
|-------|------|------|
| 无新增 | `tokio::process` | 已包含在 tokio full features 中 |
| 无新增 | `tokio::sync::Mutex` | 已可用，用于 session 操作互斥 |
| 无新增 | `serde_json` | 解析 stream-json 事件 |

后端零新增依赖，所有能力已被现有 Cargo.toml 覆盖。

### 前端新增依赖

| Package | 用途 |
|---------|------|
| 无新增 | 现有 `ansi-to-html` 可处理终端输出着色 |
| 无新增 | 现有 `react-markdown` 处理 Markdown 渲染 |

前端同样零新增依赖。

### CLI 要求

- `claude` CLI >= v2.1.100（支持 `--output-format stream-json --input-format stream-json`）
- 通过 `claude --version` 在连接时校验版本

---

## 2. 系统架构

### 整体数据流

```
Browser (React)
    │
    │ WebSocket /api/ws/chat/resume/{id} 或 /api/ws/chat/new?cwd=...
    ▼
agent-panel-server (Rust/Axum)
    │
    │ SessionManager
    │   ├── spawn claude CLI (tokio::process::Command)
    │   ├── stdin writer (用户消息 → CLI)
    │   └── stdout reader (CLI 事件 → 解析 → WebSocket)
    │
    ▼
claude CLI (本地二进制)
    │
    │ ANTHROPIC_API_KEY (env)
    ▼
Anthropic API
```

### 模块划分（后端）

```
src-server/src/
  conversation/           # 新增模块
    mod.rs               # 模块入口，re-export
    manager.rs           # SessionManager：管理所有活跃 session
    session_actor.rs     # 单个 session 的 actor（spawn/IO/lifecycle）
    protocol.rs          # stream-json 事件解析器
    transport.rs         # Transport trait 定义 + LocalTransport 实现
    config.rs            # 对话配置读写
    types.rs             # 共享类型定义
  router/
    chat.rs              # 新增：WebSocket chat 路由
```

### 模块划分（前端）

```
web/src/
  components/conversation/    # 新增目录
    ChatInput.tsx            # 输入框 + 发送按钮
    SlashMenu.tsx            # Slash 命令浮层
    ConnectionStatus.tsx     # 连接状态指示器
    PermissionCard.tsx       # 权限审批卡片
    ActiveMessageArea.tsx    # 活跃消息流式渲染区
    StreamingMessage.tsx     # 单条流式消息
  lib/
    use-chat-connection.ts   # WebSocket 连接管理 hook
    chat-protocol.ts         # 前后端消息类型定义
    stream-buffer.ts         # 流式消息缓冲与状态管理
```

---

## 3. 后端：Session Manager 模块

### 职责

SessionManager 是全局单例，管理所有活跃的 CLI 会话实例。

### 核心数据结构

- `sessions: HashMap<String, Arc<Mutex<SessionActor>>>` — 按 session_id 索引
- 全局通过 Axum 的 `Extension` 或 `State` 注入路由

### SessionActor 生命周期

每个 SessionActor 拥有：
- `child: tokio::process::Child` — CLI 子进程 handle
- `stdin: ChildStdin` — 写入通道
- `event_tx: broadcast::Sender<ChatEvent>` — 事件广播给 WebSocket 客户端
- `state: SessionState` — 当前状态 (connecting/connected/disconnecting)
- `epoch: u64` — 操作版本号，防并发

### 关键操作

| 操作 | 行为 |
|------|------|
| `connect(session_id, config)` | 获取 Mutex → 校验状态 → spawn CLI → 启动 stdout 读取 task → 返回 event_rx |
| `disconnect(session_id, epoch)` | 获取 Mutex → 校验 epoch → kill child → 等待退出 → 清理 |
| `send_message(session_id, text)` | 获取 Mutex → 校验 connected → 写入 stdin |
| `send_permission(session_id, request_id, decision)` | 写入 control_response 到 stdin |

### 互斥策略

- 每个 session 独立一把 `tokio::sync::Mutex`，不同 session 操作不互相阻塞
- connect/disconnect 为独占操作（hold mutex 全程）
- send_message 为快速操作（hold mutex 仅写 stdin 期间）

---

## 4. 后端：stream-json 协议解析

### Claude CLI stream-json 输出格式

CLI 以 `--output-format stream-json` 运行时，stdout 每行一个 JSON 对象。

**CLI 原始事件（Raw Event）**：

| 原始 type | 说明 |
|-----------|------|
| `system` (subtype: `init`) | 会话初始化，含 session_id、slash_commands |
| `content_block_start` | 新内容块开始（text 或 tool_use） |
| `content_block_delta` | 内容增量（text_delta、thinking_delta 或 input_json_delta） |
| `content_block_stop` | 内容块结束 |
| `assistant` | 完整 assistant 消息（含所有 content blocks） |
| `user` | 用户消息 / tool_result 回传 |
| `result` | turn 结束，含 usage 统计和结束状态 |
| `control_request` | 权限请求 / 中断响应 |

**内部 ChatEvent 枚举（后端解析后）**：

| ChatEvent 变体 | 来源 | 前端用途 |
|---------------|------|---------|
| `SessionInit { session_id, slash_commands }` | system/init | 初始化 Slash 菜单、获取 session_id |
| `ThinkingDelta { text }` | content_block_delta (thinking) | 展示思考过程 |
| `TextDelta { text }` | content_block_delta (text_delta) | 流式文本渲染 |
| `ToolUseStart { tool_use_id, tool_name }` | content_block_start (tool_use) | 渲染 ToolCard 骨架 |
| `ToolInputDelta { tool_use_id, json_delta }` | content_block_delta (input_json_delta) | 填充 ToolCard 参数 |
| `ToolUseEnd { tool_use_id }` | content_block_stop | ToolCard 进入执行态 |
| `ToolResult { tool_use_id, output, status }` | user message 中的 tool_result | ToolCard 完成态 |
| `PermissionRequest { request_id, request }` | control_request (can_use_tool) | 渲染 PermissionCard |
| `TurnComplete { usage, stop_reason }` | result | 更新状态栏、触发 flush |
| `Raw(Value)` | 未识别的事件 | 透传前端 debug |

### 解析策略

1. **逐行读取** stdout（`BufReader::read_line`）
2. **JSON 解析**：`serde_json::from_str` → 匹配 event type
3. **未知类型降级**：遇到无法识别的事件类型，包装为 `ChatEvent::Raw(json_value)` 透传前端
4. **工具输入累积**：tool_use 的 input 可能分多次 delta 到达，用 HashMap 按 tool_use_id 累积拼接
5. **错误容忍**：单行解析失败不终止，记录 warning 日志后继续

### 输出：ChatEvent 枚举

解析后统一转为内部 `ChatEvent` 枚举，通过 broadcast channel 推送。前端收到的 WebSocket 消息即为序列化后的 ChatEvent。

---

## 5. 后端：WebSocket 对话通道

### 路由设计

新增两个 WebSocket 路由：
- `GET /api/ws/chat/resume/{session_id}` — 续接已有 session
- `GET /api/ws/chat/new?cwd={project_dir}` — 在指定目录新建 session

与现有 `/api/ws`（文件 watcher 事件）独立，互不影响。

### 连接协议

**连接建立**：
1. 前端发起 WebSocket 连接（resume 或 new）
2. 后端 spawn CLI，发送 `{ type: "state_change", state: "spawned" }` 通知前端
3. 等待 CLI 输出 system/init 事件，解析出 session_id
4. 发送 `{ type: "connected", epoch: N, session_id: "...", reconnect_token: "..." }` 给前端
5. 开始转发后续 CLI 事件

**前端 → 后端消息类型**：

| type | payload | 说明 |
|------|---------|------|
| `user_message` | `{ text: string }` | 用户输入 |
| `permission_response` | `{ request_id, decision: "allow"/"deny" }` | 权限审批 |
| `interrupt` | `{}` | 中断当前生成 |
| `disconnect` | `{}` | 主动断开 |

**后端 → 前端消息类型**：

| type | payload | 说明 |
|------|---------|------|
| `state_change` | `{ state: "spawned" }` | CLI 进程已启动，等待初始化 |
| `connected` | `{ epoch, session_id, reconnect_token }` | 初始化完成，可以对话 |
| `event` | `ChatEvent` | CLI 事件（文本/工具/权限等） |
| `state_change` | `{ state: "idle", reason? }` | turn 结束（含 interrupted） |
| `error` | `{ code, message }` | 错误 |
| `disconnected` | `{ reason }` | 断开完成 |

**Slash 命令数据源**：

后端解析到 `system/init` 后的处理顺序：
1. 从中提取 `session_id` → 写入 `connected` 消息
2. 发送 `connected` 给前端
3. **紧接着**将完整的 `SessionInit` 事件作为 `{ type: "event", ... }` 转发给前端
4. 前端从 `SessionInit` 事件中提取 `slash_commands` 初始化菜单

即：`connected` 只负责连接确认 + session_id + token；slash_commands 通过后续 event 传递。如果 init 事件未携带命令列表，前端使用内置 fallback 表。

### 多 Tab 防护

SessionManager 记录每个 session 的当前 WebSocket 连接数。如果已有连接：
- 新 WebSocket 连接收到 `{ type: "error", code: "already_connected" }`
- 前端据此显示"已在其他窗口连接"

### 断线重连

WebSocket 断开后，前端 3 秒后自动重连。后端检测到 WebSocket 断开：
- CLI 仍在运行 → 保持运行，等待 30 秒内重连（支持页面切换、刷新等场景）
- 超过 30 秒无重连 → kill CLI 进程
- 用户显式发送 disconnect → 立即 kill，不等待

页面切换时 WebSocket 不主动关闭（连接维持在全局 context 中，非页面级）。

---

## 6. 后端：进程生命周期管理

### Spawn 流程

```
1. 检测 claude 是否存在（which claude 或配置的 binary_path）
2. 校验版本 >= v2.1.100
3. 构建 Command:
   - program: claude
   - 模式 A（resume）: args: ["--output-format", "stream-json", "--input-format", "stream-json", "--verbose", "--permission-prompt-tool", "stdio", "--include-partial-messages", "--resume", session_id]
   - 模式 B（new）: args: ["--output-format", "stream-json", "--input-format", "stream-json", "--verbose", "--permission-prompt-tool", "stdio", "--include-partial-messages"]
   - 可选 args: ["--model", model, "--permission-mode", mode]
   - cwd: 项目目录（new 模式必须指定）
   - env: 继承当前进程环境（CLI 自身管理认证）
   - stdin: Stdio::piped()
   - stdout: Stdio::piped()
   - stderr: Stdio::piped()
   - kill_on_drop: true
4. spawn → 获得 Child handle
5. 启动 stdout reader tokio task
6. 启动 stderr reader tokio task（记录日志）
```

### Kill 流程

```
1. 关闭 stdin（drop ChildStdin）→ CLI 收到 EOF 信号
2. 等待 3 秒 CLI 自行退出
3. 超时则 child.kill() 强制终止
4. child.wait() 回收进程资源
5. 从 SessionManager.sessions 中移除
```

### 孤儿进程清理

服务启动时：
1. 读取 `{data_dir}/agent-panel/active-pids.json`（上次记录的活跃 PID 列表）
2. 对每个 PID 检查是否仍存活（`kill(pid, 0)` 系统调用）
3. 如果存活且为 claude 进程 → kill
4. 清空 PID 文件

运行时：
- 每次 spawn 记录 PID 到文件
- 每次 kill 完成后从文件移除

### Server 优雅退出

- 注册 SIGTERM/SIGINT handler（tokio signal）
- 收到信号后：遍历所有活跃 session，依次 kill
- 等待所有 child wait 完成后退出

---

## 7. 后端：配置管理

### P0 配置策略

P0 阶段极简配置，不做独立配置 UI。CLI 的认证由 `claude auth` 自行管理。

配置文件路径：`~/.claude/agent-panel-config.json`

```json
{
  "conversation": {
    "claude_binary_path": ""
  }
}
```

仅一个可选项：指定 claude 二进制路径（为空时自动从 PATH 查找）。

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config/conversation/check` | 检测 claude CLI 可用性、版本、认证状态 |

`check` 端点返回：
```json
{
  "cli_found": true,
  "cli_version": "2.1.146",
  "cli_path": "/usr/local/bin/claude",
  "auth_status": "authenticated"
}
```

### P1 扩展（后续）

P1 增加完整配置 CRUD + key 覆盖 + 脱敏展示。

---

## 8. 前端：连接状态 Hook

### `useChatConnection(sessionId: string)`

核心 Hook，管理 WebSocket 连接和状态机。

**返回值**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `state` | `'idle' \| 'connecting' \| 'connected' \| 'disconnecting' \| 'error'` | 当前状态 |
| `connect()` | `() => void` | 发起连接 |
| `disconnect()` | `() => void` | 主动断开 |
| `sendMessage(text)` | `(text: string) => void` | 发送用户消息 |
| `respondPermission(id, decision)` | 函数 | 回复权限请求 |
| `interrupt()` | `() => void` | 中断生成 |
| `events` | `ChatEvent[]` | 活跃消息事件流 |
| `slashCommands` | `SlashCommand[]` | 可用 slash 命令 |
| `error` | `string \| null` | 错误信息 |

**内部逻辑**：
- 创建 WebSocket 连接:
  - resume: `new WebSocket(ws://host/api/ws/chat/resume/${sessionId})`
  - new: `new WebSocket(ws://host/api/ws/chat/new?cwd=${encodeURIComponent(cwd)})`
  - 重连: `new WebSocket(ws://host/api/ws/chat/resume/${sessionId}?token=${reconnectToken})`
- 重连时通过 URL query 参数 `token` 携带 reconnect_token
- onopen → 状态变 connecting（等待后端 connected 消息）
- 收到 `connected` → 状态变 connected
- 收到 `event` → append 到 events 数组
- 收到 `error` → 状态变 error
- onclose → 如果是意外断开，启动 3 秒重连倒计时
- 组件 unmount → **不断开 WebSocket**（连接维持在全局 store 中，跨页面存活）
- 只有用户显式点击断开 → 发送 disconnect + 关闭 WebSocket

**Epoch 防护（前端侧）**：
- 每次 connect/disconnect 递增本地 epoch
- 收到后端消息时校验 epoch，不匹配则忽略

---

## 9. 前端：输入区组件

### ChatInput 组件

根据连接状态切换三种展示：

| 状态 | 展示 |
|------|------|
| idle / error | [▶ 连接并继续对话] 按钮（或 [重试]） |
| connecting / disconnecting | Loading spinner + 文字 |
| connected | 输入框 + 发送/停止按钮 |

### 输入框特性

- **多行支持**：textarea，Shift+Enter 换行，Enter 发送
- **自动高度**：内容增加时自动撑高（最大 200px），发送后恢复单行
- **快捷键**：Ctrl+Enter 强制发送（无论是否有 slash 菜单打开）
- **历史回溯**：↑ 键在输入为空时，回溯上一条发送的消息（本地维护历史栈）
- **Slash 触发**：输入 `/` 时通知 SlashMenu 组件显示

### 状态栏

输入框下方一行状态栏，显示：
- 当前模型名（从 CLI init 事件获取）
- 本次对话 token 用量（实时更新）
- 估算费用（从 usage 事件累积）

### AI 生成中的行为

- 输入框**不禁用**（允许用户提前准备下一条消息）
- 发送按钮变为 [■ 停止] 按钮
- 点击停止 → 调用 `interrupt()`
- 按 Esc 键 → 同样触发 `interrupt()`（对标 CLI 单次 Esc 中断）
- AI 响应中发送消息 → 消息排队，当前 turn 结束后自动发送

### 中断的技术实现

前端发送 `{ type: "interrupt" }` → 后端收到后向 CLI stdin 写入 interrupt control_request。
CLI 中断当前生成，返回 `result` 事件（可能含 error 信息）。
后端将 result 归一为 `state_change: { state: "idle", reason: "interrupted" }` 发给前端。
中断后已生成的内容保留。

### 消息队列机制

后端 SessionActor 维护 per-session 消息队列，确保一次只有一个 turn 写入 stdin：

1. 用户发送消息 → 入队 `pending_messages: VecDeque<UserMessage>`
2. 如果当前无活跃 turn → 立即取队首写入 stdin，标记 `active_turn = true`
3. 如果有活跃 turn → 仅入队，不写 stdin
4. 收到 `result` 事件 → `active_turn = false`，检查队列是否有下一条
5. 队列非空 → 取队首写入 stdin，开始新 turn

前端行为不变：用户可在 AI 响应中输入并发送，消息在后端排队。

---

## 10. 前端：流式消息渲染

### 架构：双区渲染

```
MessageStream (现有虚拟列表)
  └─ 历史消息 [...messages from session JSON]

ActiveMessageArea (新增)
  └─ 分隔线 "── 以下为本次对话 ──"
  └─ StreamingMessage × N（当前活跃的消息）
```

### ActiveMessageArea 组件

- 不使用虚拟化（活跃消息数量有限，通常 < 20 条）
- 直接 map 渲染，基于 `useChatConnection().events` 驱动
- 每轮 AI 回复完成后，调用 `flushToHistory()` 将消息合并到上方虚拟列表

### StreamingMessage 组件

处理单条正在流式生成的 assistant 消息：

**文本渲染优化**：
- 维护 `textRef: React.MutableRefObject<string>` 累积全文
- 每收到 text delta，直接 `textRef.current += delta`
- 使用 `requestAnimationFrame` 节流，每帧最多 render 一次
- Markdown 解析采用增量策略：只解析最后一个完整段落（以 `\n\n` 分隔），之前段落缓存解析结果

**ToolCard 流式**：
- tool_use 开始 → 创建新 ToolCard（loading 态）
- input_delta → 累积参数 JSON 字符串
- tool_use 完成 → 尝试 parse 参数 JSON，渲染完整 ToolCard
- tool_result → 更新 ToolCard 为完成态

**复用现有组件**：
- 完成的消息直接复用 `MessageBlock`
- 完成的 tool 直接复用 `ToolCard`（BashCard/EditCard/ReadCard 等）
- 流式中的 tool 用简化的 `StreamingToolCard`（只显示名称 + spinner + 参数预览）

### 滚动管理

`useAutoScroll` hook：
- 监听 scroll 事件，判断是否在底部（距底部 < 50px）
- `isAtBottom` 为 true 时，每次 events 更新后 `scrollToBottom()`
- `isAtBottom` 为 false 时，显示"新消息"浮标
- 浮标点击 → `scrollToBottom()` + 重置 `isAtBottom = true`

### flushToHistory 流程

当收到 `ChatEvent::TurnComplete` 或前端收到 `state_change: { state: "idle" }` 时：
1. 将活跃区的 events 转换为 `Message[]` 格式（匹配现有 `RustMessage` 接口）
2. append 到 `SessionContext.messages`
3. 清空活跃区 events
4. 触发虚拟列表 `scrollToIndex(last)` 确保无跳变
5. 同时，文件 watcher 会检测到 session jsonl 变化，触发后台 refetch 对齐

---

## 11. 前端：Slash 菜单组件

### 数据源

命令列表从 CLI 的 `system/init` 事件获取。如果 init 未携带，使用内置 fallback 表（参考 OpenCovibe 的 `KNOWN_COMMAND_DESCRIPTIONS`）。

### SlashMenu 组件

Props：
- `query: string` — 当前输入（`/` 之后的部分）
- `onSelect(command: string): void` — 选中回调
- `onClose(): void` — 关闭回调

内部状态：
- `selectedIndex: number` — 当前高亮项
- `filteredCommands: SlashCommand[]` — 模糊过滤后的列表

### 交互实现

- 使用 `position: absolute` 定位在输入框上方
- `max-height: 300px; overflow-y: auto`
- 方向键移动 selectedIndex，超出范围循环
- `scrollIntoView({ block: "nearest" })` 确保高亮项可见
- Enter 触发 `onSelect(filteredCommands[selectedIndex].name)`
- Escape 触发 `onClose()`

### 命令分组

```typescript
const GROUPS = {
  session: ['status', 'context', 'resume', 'compact'],
  coding: ['review', 'test', 'init'],
  config: ['model', 'permission-mode', 'config'],
  skills: [], // 动态从 init 事件填充
  other: ['help', 'clear', 'logout'],
};
```

未分类的命令归入 "other"。

### 子命令处理

`/model` 选中后：
1. 关闭 SlashMenu
2. 弹出 ModelPicker 子浮层（模型列表也来自 init 事件）
3. 用户选择模型后，发送 `/model sonnet` 给 CLI

---

## 12. 前端：权限审批组件

### PermissionCard 组件

渲染在 ActiveMessageArea 内，当收到 `control_request` 类型事件时创建。

Props：
- `requestId: string`
- `toolName: string`
- `toolInput: object`
- `onRespond(decision: 'allow' | 'deny'): void`

### 状态流转

```
pending（显示 Allow/Deny 按钮）
    ↓ 用户点击
responded（按钮置灰，显示"已批准"或"已拒绝"）
```

### 防重复提交

- 点击后立即将 requestId 加入 `submittedIds: Set<string>`
- 按钮根据 submittedIds 决定是否 disabled
- 不依赖网络响应，纯前端防护

### 批量操作

当 `pendingPermissions.length > 1` 时，在权限卡片区顶部显示：
- [全部允许 (N)] 按钮
- 点击后循环调用 `onRespond('allow')` for each pending

### 与现有 AskUserQuestionCard 的关系

当前项目已有 `AskUserQuestionCard`（用于展示历史记录中的 AskUserQuestion 工具调用）。
权限审批是实时交互，逻辑不同但视觉风格可参考。完成后的权限卡片也按相同风格渲染为只读态。

---

## 13. Transport 抽象层（长远兼容）

### 设计目的

为未来 SSH Remote Transport 预留接口，确保本期实现不与远程方案冲突。

### 实现方式：Enum Dispatch（非 trait object）

```rust
pub enum Transport {
    Local(LocalTransport),
    // 未来: Ssh(SshTransport),
}

impl Transport {
    pub async fn spawn(&mut self, config: &SpawnConfig) -> Result<()> { ... }
    pub async fn write_stdin(&mut self, data: &str) -> Result<()> { ... }
    pub fn stdout_stream(&self) -> broadcast::Receiver<String> { ... }
    pub fn stderr_stream(&self) -> broadcast::Receiver<String> { ... }
    pub async fn kill(&mut self) -> Result<()> { ... }
    pub async fn wait(&mut self) -> Result<ExitStatus> { ... }
    pub fn is_alive(&self) -> bool { ... }
}
```

零新增依赖，编译期确定，无 dyn 开销。
未来增加 SSH 只需添加 enum variant + match arm。

### 本期实现：LocalTransport

直接包装 `tokio::process::Child`。SessionActor 持有 `Transport` enum 值。

### 未来：SshTransport

通过 SSH 连接远程机器 spawn claude CLI。只需添加 `Transport::Ssh(SshTransport)` variant。

### 前端无感知

Transport 层完全在后端封闭，前端只和 WebSocket 通信，不关心 CLI 在本地还是远程。

---

## 14. 文件清单与改动范围

### 后端新增文件

| 文件 | 职责 |
|------|------|
| `src-server/src/conversation/mod.rs` | 模块入口 |
| `src-server/src/conversation/manager.rs` | SessionManager 全局单例 |
| `src-server/src/conversation/session_actor.rs` | 单 session 生命周期 |
| `src-server/src/conversation/protocol.rs` | stream-json 解析器 |
| `src-server/src/conversation/transport.rs` | Transport trait + LocalTransport |
| `src-server/src/conversation/config.rs` | 配置文件读写 |
| `src-server/src/conversation/types.rs` | ChatEvent 等共享类型 |
| `src-server/src/router/chat.rs` | WebSocket chat 路由 |

### 后端修改文件

| 文件 | 改动 |
|------|------|
| `src-server/src/main.rs` | 注册 conversation 模块，初始化 SessionManager，注册信号 handler |
| `src-server/src/router/mod.rs` | 挂载 chat 路由 |

### 前端新增文件

| 文件 | 职责 |
|------|------|
| `web/src/components/conversation/ChatInput.tsx` | 输入区组件 |
| `web/src/components/conversation/SlashMenu.tsx` | Slash 命令浮层 |
| `web/src/components/conversation/ConnectionStatus.tsx` | 连接状态指示器 |
| `web/src/components/conversation/PermissionCard.tsx` | 权限审批卡片 |
| `web/src/components/conversation/ActiveMessageArea.tsx` | 活跃消息区 |
| `web/src/components/conversation/StreamingMessage.tsx` | 单条流式消息 |
| `web/src/components/conversation/StreamingToolCard.tsx` | 流式工具卡片 |
| `web/src/lib/use-chat-connection.ts` | WebSocket 连接 hook |
| `web/src/lib/chat-protocol.ts` | 前后端消息类型 |
| `web/src/lib/stream-buffer.ts` | 流式消息缓冲 |
| `web/src/lib/chat-store.ts` | 全局连接 store（跨页面维持 WebSocket 连接） |

### 前端修改文件

| 文件 | 改动 |
|------|------|
| `web/src/pages/SessionDetailView.tsx` | 集成 ConnectionStatus + ChatInput |
| `web/src/pages/SessionsView.tsx` | 新增"新建对话"入口按钮 |
| `web/src/components/session/SessionContext.tsx` | 扩展 context，新增 chat connection 相关状态 |
| `web/src/components/session/MessageStream.tsx` | 底部插入 ActiveMessageArea |
| `web/src/components/ResumeMenu.tsx` | 改造为"连接"按钮（替代原有复制命令逻辑） |
| `web/src/App.tsx` | 全局注入 ChatStore provider，app 关闭确认逻辑 |

---

## 15. 实施阶段划分

### Phase 1：后端基础（可独立验证）

1. 实现 `conversation/types.rs` — 定义 ChatEvent 枚举和消息类型
2. 实现 `conversation/transport.rs` — Transport trait + LocalTransport
3. 实现 `conversation/protocol.rs` — stream-json 解析器
4. 实现 `conversation/config.rs` — 配置读写（极简版，仅 binary_path）
5. 实现 `conversation/session_actor.rs` — 单 session 生命周期（支持 new + resume 两种模式）
6. 实现 `conversation/manager.rs` — SessionManager（含多 tab 防护、30s 重连窗口）
7. 实现 `router/chat.rs` — WebSocket 路由（resume + new 两个端点）
8. 集成到 `main.rs`（信号 handler + 孤儿清理）

**验证方式**：用 wscat 连接 WebSocket，手动发送 connect/message/interrupt，观察 CLI 输出转发

### Phase 2：前端连接与基础对话

1. 实现 `lib/chat-protocol.ts` — 类型定义
2. 实现 `lib/use-chat-connection.ts` — WebSocket hook
3. 实现 `ConnectionStatus.tsx` — 状态指示器
4. 实现 `ChatInput.tsx` — 输入框（先不含 Slash）
5. 改造 `SessionDetailView.tsx` 集成以上组件
6. 实现 `ActiveMessageArea.tsx` — 基础文本流式渲染

**验证方式**：在 GUI 中连接 session，发送消息，看到流式文本回复

### Phase 3：完善渲染与交互

1. 实现 `StreamingMessage.tsx` — Markdown 增量渲染
2. 实现 `StreamingToolCard.tsx` — 工具调用流式展示
3. 实现 `PermissionCard.tsx` — 权限审批
4. 实现 `SlashMenu.tsx` — 命令菜单
5. 实现滚动管理（useAutoScroll）
6. 实现 flushToHistory 合并逻辑

**验证方式**：完整对话流程，包含工具调用、权限审批、Slash 命令

### Phase 4：健壮性与边界

1. 进程孤儿清理
2. 多 Tab 防护
3. 断线重连
4. 优雅退出
5. 错误处理全覆盖
6. 性能优化（长对话、快速 token）

**验证方式**：压测场景（快速连断、关闭 tab、kill server）

---

## 16. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| stream-json 协议不稳定 | CLI 更新后解析失败 | 未知事件 fallback 为 Raw 透传；解析器模块化，易修改 |
| CLI 长时间无输出（网络慢） | 用户以为卡死 | 心跳检测 + "等待中..." 状态；显示 thinking 动画 |
| 大段输出导致 WebSocket 背压 | 前端渲染卡顿 | 后端按 16KB 分片发送；前端 RAF 节流渲染 |
| 用户未安装 claude CLI | 功能不可用 | connect 时检测并给出安装引导（npm install -g @anthropic-ai/claude-code） |
| `--resume` 对已损坏 session 失败 | 连接失败 | 捕获 stderr 错误信息，友好提示用户 |
| macOS 子进程清理不如 Windows Job Object 可靠 | 可能有孤儿 | kill_on_drop + stdin EOF + PID 文件三重保障 |
| 前端 Markdown 增量解析复杂度高 | 首次实现可能有 bug | 先用简单策略（每次 parse 最后 2000 字符），性能不够再优化 |

---

## 17. 补充：协议细节与边界澄清

### 17.1 stream-json stdin 输入格式样例

后端写入 CLI stdin 的 JSON 行格式（参考 OpenCovibe session_actor.rs）：

**用户消息**：
```json
{"type":"user","uuid":"550e8400-e29b-41d4-a716-446655440000","message":{"role":"user","content":"帮我写一个排序函数"}}
```

**权限响应（allow）**：
```json
{"type":"control_response","response":{"subtype":"success","request_id":"req_abc123","response":{"behavior":"allow","updatedInput":{}}}}
```

**权限响应（deny）**：
```json
{"type":"control_response","response":{"subtype":"success","request_id":"req_abc123","response":{"behavior":"deny","message":"User denied permission"}}}
```

**中断信号**：
```json
{"type":"control_request","request_id":"int_001","request":{"subtype":"interrupt"}}
```

> 注：以上格式基于 OpenCovibe 逆向和 CLI stream-json 文档推断。实现前需用 `claude --output-format stream-json --input-format stream-json --verbose` 实际测试验证，如有差异以实测为准。

### 17.2 权限审批协议

CLI 发出的 `control_request` 事件样例（stdout）：
```json
{
  "type": "control_request",
  "request_id": "req_abc123",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "Bash",
    "tool_use_id": "tu_xyz",
    "input": {"command": "rm -rf ./build"},
    "suggestions": [{"rule": "allow Bash(rm *)"}]
  }
}
```

前端响应（后端写入 stdin）：

allow：
```json
{"type":"control_response","response":{"subtype":"success","request_id":"req_abc123","response":{"behavior":"allow","updatedInput":{}}}}
```

deny：
```json
{"type":"control_response","response":{"subtype":"success","request_id":"req_abc123","response":{"behavior":"deny","message":"User denied permission"}}}
```

- allow 时 `updatedInput` 为空对象 `{}`（不是 null），如需修改工具输入可填充
- deny 时 `message` 为拒绝原因字符串（展示给 AI 参考）

**"始终允许"功能**：P0 只实现 allow/deny 两个按钮。"始终允许"涉及 permission rules 持久化（写入 `~/.claude/settings.json`），复杂度较高，列为 P1。P0 的 UI 中不展示"始终允许"按钮。

### 17.3 消息去重策略

**问题**：flushToHistory 将活跃消息合并到 messages 数组后，文件 watcher 也会检测到 session jsonl 变化并触发 refetch，可能导致重复渲染。

**稳定 ID 规则**：
- assistant 消息：使用 CLI 事件中的 `message_id`（来自 content_block_start/assistant 事件）
- user 消息（从 GUI 发出）：使用写入 stdin 时的 `uuid` 字段
- tool_result：使用 `tool_use_id`（与对应 tool_use 共享）

**去重流程**：
1. 活跃区的每条消息都有上述稳定 ID
2. flushToHistory 时，记录已合并的 ID 集合到 `flushedIds: Set<string>`
3. Watcher 触发 refetch 后，对比新数据与 flushedIds，跳过已存在的消息
4. Refetch 数据中如出现 flushedIds 之外的新消息（外部 CLI 写入），追加到历史
5. Refetch 完成后清空 flushedIds（此时数据源已对齐）

**乐观 user 消息**：前端乐观渲染的 user 气泡使用 stdin uuid 作为 key，refetch 后通过 uuid 匹配去重，不会重复。

### 17.4 新建会话 session_id 获取

**来源**：CLI 的 `system` (subtype: `init`) 事件中包含 `session_id` 字段。

**流程**：
1. 后端 spawn CLI（new 模式）
2. 先发送 `{ type: "state_change", state: "spawned" }` 通知前端进程已启动
3. CLI 输出 `system/init` 事件 → 后端解析出 `session_id`
4. 后端发送 `{ type: "connected", epoch, session_id }` 给前端（此时才算真正连接成功）
5. 前端收到后更新 URL（路由跳转到 `/sessions/{new_session_id}`）

**注意**：`connected` 消息在 new 模式下延迟到 system/init 解析完成后才发送；resume 模式下也等 system/init（确保 session_id 校验一致）。前端在 `spawned` → `connected` 之间显示"初始化中..."。

**SessionManager 临时索引**：new 模式 spawn 后尚无 session_id，此时 SessionManager 用临时 `connection_id`（UUID）管理该 actor。收到 SessionInit 后，将 actor 从 `connection_id` key 迁移到真实 `session_id` key。WebSocket 路由返回 `connection_id` 给前端用于后续消息路由。

**前端消息路由**：同一 WebSocket 连接内的前端消息（user_message、interrupt 等）不需要携带 connection_id 或 session_id。后端通过 WebSocket 连接实例直接路由到绑定的 actor。connection_id 仅用于服务端临时索引和日志追踪。

### 17.5 CLI + GUI 并发写同一 session 的风险

**现状分析**：
- `claude --resume` 会创建一个新的 CLI 实例，该实例以 append 方式写入 session jsonl
- 如果用户同时在终端和 GUI 中 resume 同一 session，两个 CLI 实例各自独立运行
- 两者都是 append-only 写入，不会覆盖对方数据
- 但消息交错可能导致对话上下文混乱（对 AI 不友好）

**处理策略**：
1. P0 不做强制互斥（成本过高）
2. 在 GUI 连接时检测该 session 的 jsonl 文件最近修改时间（启发式弱提示，不能可靠证明"其他 CLI 正在写入"）
3. 如 mtime 在最近 5 秒内被更新且非本进程写入，在 UI 中显示黄色警告："该 session 可能在其他终端中活跃"
4. 由用户自行决定是否继续（不阻断连接流程）

### 17.6 连接 owner 定义

**Connection owner = WebSocket 连接实例**（一个浏览器 tab 内一个 WebSocket）。

| 场景 | 行为 |
|------|------|
| 同一 tab 内页面切换 | WebSocket 维持在全局 store，不断开 |
| 刷新页面 | WebSocket 断开 → 后端等待 30s → 前端重连后恢复 |
| 复制 tab（Cmd+T 再粘贴 URL） | 新 tab 新建 WebSocket → 后端拒绝（same session already_connected） |
| 同一浏览器两个窗口 | 同上，第二个 WebSocket 被拒绝 |
| 不同浏览器 | 同上，按 WebSocket 连接实例判断 |

**判断逻辑**（后端）：SessionManager 对每个 session_id 维护 `Option<WebSocket sender>` + `reconnect_token: String`。

- 首次连接时生成随机 token，通过 `connected` 消息返回前端
- 前端将 token 存储在 **sessionStorage**（刷新不丢失，关闭 tab 丢失）
- 防复制 tab 抢占：使用 BroadcastChannel 发心跳（每 5s），同源 tab 收到心跳且 session_id 相同时，新 tab 判定为冲突并显示提示
- 断开后 30s 重连窗口内，只有携带正确 token 的 WebSocket 才能重连
- 无 token 或 token 不匹配 → 视为新客户端 → 拒绝（already_connected）
- 30s 超时后 token 失效，任何客户端都可以重新连接
- 刷新页面 → sessionStorage 保留 token → 自动重连成功 → 恢复事件流
- 复制 tab → sessionStorage 被复制 → 但 BroadcastChannel 心跳检测到原 tab 仍活跃 → 新 tab 不发起连接

### 17.7 PID 文件路径

PID 文件改为 Agent Panel 自身的数据目录，不污染 Claude 配置空间：

- macOS: `~/Library/Application Support/agent-panel/active-pids.json`
- Linux: `~/.local/share/agent-panel/active-pids.json`

使用 Rust 的 `dirs::data_dir()` 获取平台对应路径。

### 17.8 Transport 实现方式

不使用 `#[async_trait]` + `Box<dyn Transport>`（async trait 不是 dyn-safe），改用 enum dispatch：

**修正方案**：使用 enum dispatch，不需要 trait object：

```rust
enum Transport {
    Local(LocalTransport),
    // 未来: Ssh(SshTransport),
}

impl Transport {
    async fn write_stdin(&mut self, data: &str) -> Result<()> {
        match self {
            Self::Local(t) => t.write_stdin(data).await,
        }
    }
    // ... 其他方法同理
}
```

优势：零新增依赖，编译期完全确定，性能无开销。
未来增加 SSH 只需添加 enum variant + match arm。

**结论**："后端零新增依赖"判断正确。第 13 章已改为 enum dispatch 方案，无需 async-trait crate。

### 17.9 stderr 错误分类与展示规则

后端 stderr reader 按关键词分类，决定如何处理：

| stderr 内容匹配 | 错误码 | 行为 |
|----------------|--------|------|
| `authentication` / `auth` / `login` | `auth_failed` | 前端显示"认证失败，请在终端运行 claude auth login" |
| `model` / `not available` | `model_unavailable` | 前端显示"模型不可用" |
| `quota` / `rate limit` / `429` | `quota_exceeded` | 前端显示"额度不足或速率限制" |
| `ENOENT` / `not found` | `cli_not_found` | 前端显示安装引导 |
| `version` / `update` | `version_mismatch` | 前端提示升级 CLI |
| 其他 | `unknown_error` | 记录日志；如果 CLI 退出则展示完整 stderr |

**规则**：
- spawn 失败期间的 stderr → 全部作为错误展示给用户
- 运行中的 stderr → 仅记录日志，不展示（CLI 正常运行也会有 info 级 stderr）
- CLI 异常退出（非 0 exit code）→ 展示最后 5 行 stderr
