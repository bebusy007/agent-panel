# OpenCovibe 对话交互学习与 Agent Panel 改造方案

> 目标：系统拆解 OpenCovibe 在 Claude Code GUI 对话上的交互模型，明确 Agent Panel 应该如何借鉴、哪些点与现有架构冲突、需要补齐哪些能力。本文优先级高于当前实现细节，后续编码以本文作为交互与状态模型基准。

---

## 0. 结论先行

Agent Panel 当前实现的问题不是“某个按钮不对”，而是**整体对话交互模型不对**。

当前实现更像：

1. WebSocket 收 raw events
2. 简单 group 成几个 block
3. turn complete 后刷新历史
4. 输入框只在 connected / running 两种粗状态间切换

OpenCovibe 的模型是：

1. 后端 actor 把 Claude CLI 事件归一为稳定 BusEvent
2. 前端 store 用 reducer 把事件折叠为 timeline 状态
3. 用户消息、assistant delta、thinking、tool、permission、usage 都进入同一个可回放状态机
4. UI 只消费派生状态，不直接消费 raw events
5. 输入栏是完整控制台：发送、运行中插队、停止、slash、权限模式、规则、技能、附件、截图、git branch、状态栏协同

因此，Agent Panel 需要从“事件列表渲染”升级为“ChatSessionStore + reducer + timeline + prompt console”的模型。

---

## 1. OpenCovibe 相关源码地图

### 1.1 前端对话页

- `src/routes/chat/+page.svelte`
  - 对话页面主入口。
  - 负责组合 `SessionStatusBar`、timeline 渲染、thinking 面板、PermissionPanel、PromptInput、ToolActivity 侧栏。
  - 注册全局 keybinding：interrupt、send、permission mode 切换、stash prompt、model picker 等。
  - 管理 auto-scroll、context snapshot、BTW side question、preview selection、rewind、permission response。

### 1.2 输入栏

- `src/lib/components/PromptInput.svelte`
  - OpenCovibe 交互最核心组件。
  - 不是单纯 textarea，而是“对话控制台”。
  - 管理输入文本、附件、粘贴大段文本、路径引用、slash 菜单、@ mention、权限模式、rules、skills、截图、发送/停止、git branch、输入历史、stash/restore。

### 1.3 状态栏 / cc-hud

- `src/lib/components/SessionStatusBar.svelte`
  - 展示当前 run、model、cost、tokens、context、permission mode、fast mode、auth source、CLI version、MCP、turn 数、duration、preview、tools、fork、rewind 等。
  - 可展开/收起，展开后展示更细 token 和上下文信息。

### 1.4 权限面板

- `src/lib/components/PermissionPanel.svelte`
  - 浮动在输入栏上方。
  - 单权限和多权限是两套布局。
  - 支持 allow、deny、deny and stop、allow all、deny all、suggestion rule。
  - 有 submitting 状态，避免重复提交。

### 1.5 工具/上下文侧栏

- `src/lib/components/ToolActivity.svelte`
  - 对工具调用、context history、files、session info、background tasks 做侧栏展示。
  - 能按 turn 聚合工具调用。

- `src/lib/components/ContextUsageGrid.svelte`
- `src/lib/components/ContextHistoryPanel.svelte`
  - 负责 context usage 的可视化和历史快照。

### 1.6 前端状态机

- `src/lib/stores/session-store.svelte.ts`
  - OpenCovibe 对话体验的真正核心。
  - 维护 `phase`、`timeline`、`streamingText`、`thinkingText`、`usage`、`turnUsages`、`permissionMode`、`sessionCommands`、`mcpServers`、`taskNotifications`、`contextWindow`、`contextUtilization` 等。
  - `_reduce()` 是事件归一和状态更新中心。

### 1.7 后端 actor / protocol

- `src-tauri/src/agent/session_actor.rs`
  - turn engine。
  - 维护 user queue、internal queue、active_turn、quarantine、permission response、interrupt。
  - 负责 stdin 写入和 stdout/control event 路由。

- `src-tauri/src/agent/claude_protocol.rs`
  - Claude stream-json parser。
  - 处理 `stream_event` 信封、`content_block_delta`、`assistant`、`user/tool_result`、`result`、`control_request`。
  - 维护 `last_tool_use_id`、tool id/name map、input json accumulator。

---

## 2. 消息 timeline：历史与实时如何拼接

### 2.1 OpenCovibe 怎么做

OpenCovibe 把历史 replay 和实时事件都统一归一到 `SessionStore.timeline`。

核心字段：

- `timeline: TimelineEntry[]`
- `streamingText: string`
- `thinkingText: string`
- `_seenMessageIds`
- `_seenToolIds`
- `_lastProcessedSeq`

核心事件处理：

- `user_message`
  - append 一个 `kind: "user"` 的 timeline entry。
  - 如果前端已经乐观插入了同样文本，则用内容匹配合并后端 uuid，避免重复。

- `message_delta`
  - 如果是主会话：追加到 `streamingText`。
  - 如果属于 subagent：追加到对应 parent tool 的 subTimeline streaming entry。

- `message_complete`
  - 使用 `message_id` 去重。
  - 把 `streamingText` 固化为 `kind: "assistant"` entry。
  - 清空 `streamingText`。
  - 如果当前 turn 有 `thinkingText`，一起保存到 assistant entry。

- `tool_start`
  - append 一个 `kind: "tool"` entry。
  - 记录 `tool_use_id` 到 timeline index 的映射。

- `tool_input_delta`
  - 找到对应 tool entry，增量更新 input。

- `tool_end`
  - 找到对应 tool entry，更新 status、output、duration、tool_use_result。

历史加载：

- 历史不是单独一套 UI。
- 历史 events 会 replay 进同一个 reducer。
- 实时 events 也进同一个 reducer。
- 所以“历史消息”和“当前消息”视觉上是同一套 timeline。

### 2.2 Agent Panel 当前差距

当前 Agent Panel 的实现是：

- 历史区来自 `SessionContext.messages`
- 实时区来自 `chat.events`
- `ActiveMessageArea` 直接 group raw events
- turn complete 后 refresh 历史并清空 active events

问题：

- 用户发送的消息不会以历史同款 UI 立即进入主消息列表。
- assistant delta 和历史 assistant message 不是同一种渲染路径。
- active 区和历史区割裂，视觉和交互不一致。
- flush 依赖 refetch，有天然延迟。
- 如果 refetch 慢，用户觉得“不是流式”。

### 2.3 Agent Panel 应该怎么做

需要新增 `ChatSessionStore`，把实时事件也 reducer 到 timeline：

```text
SessionContext.messages  -> 初始历史 timeline
WebSocket ChatEvent      -> ChatSessionStore reducer
UI                       -> unifiedTimeline = history + liveTimeline + streaming blocks
```

具体要求：

- 用户发送后，立即在列表中追加 `user` 消息，样式与历史 `MessageBlock` 一致。
- 后端确认 `user_message` 后，用 uuid 合并乐观消息。
- assistant `text_delta` 不单独作为 block，而是进入 `streamingText`。
- `assistant_message` 到达后固化为真正 assistant message。
- 工具和权限也进入统一 timeline，而不是孤立卡片。
- `turn_complete` 后只做后台 refetch 对齐，不阻塞主渲染。

---

## 3. Thinking / 思考过程

### 3.1 OpenCovibe 怎么做

OpenCovibe 有完整 thinking 状态：

- `thinkingText`
- `thinkingStartMs`
- `thinkingEndMs`
- `thinkingDurationSec`
- `thinkingVisible`
- `thinkingExpanded`

事件处理：

- `thinking_delta`
  - 主会话：追加到 `store.thinkingText`
  - subagent：追加到 parent tool 的 subTimeline streaming entry
  - 首次 thinking delta 设置 `thinkingStartMs`

- `message_delta`
  - 如果之前有 thinking 且 `thinkingEndMs` 还没设置，则设置 `thinkingEndMs`
  - 表示“思考结束，开始输出正文”

UI 展示：

- 在消息流底部有专门的 Thinking panel。
- 标题类似“Thinking / 思考过程”。
- 显示正在思考的动词和 elapsed 时间。
- 可折叠/展开。
- thinking 结束后，如果 assistant message complete，会把 thinkingText 保存到 assistant timeline entry。

OpenCovibe 的 thinking 不是“日志”，而是 assistant 回复的一部分状态。

### 3.2 Agent Panel 当前差距

当前 Agent Panel：

- 后端 parser 已经有 `ThinkingDelta`。
- 前端协议也有 `thinking_delta`。
- 但前端没有 `thinkingText` 状态。
- `ActiveMessageArea` 没有展示 thinking 面板。
- 历史 `MessageBlock` 里已有一些 meta/thinking 类内容，但实时流没有和它对齐。

### 3.3 Agent Panel 应该怎么做

需要在 `ChatSessionStore` 中维护：

- `thinkingText`
- `thinkingStartMs`
- `thinkingEndMs`
- `thinkingExpanded`

UI：

- 在 assistant streaming 区上方显示“思考过程”。
- 默认展开，允许折叠。
- 正在思考时显示 elapsed 秒数。
- 一旦正文 `text_delta` 到达，thinking 面板停止计时。
- `assistant_message` 完成时，把 thinkingText 固化进 assistant message，使历史和实时一致。

兼容点：

- Agent Panel 现有历史消息如果已经有 thinking 字段，需要映射到同一 UI。
- 如果历史没有 thinking 字段，只展示实时 thinking。

---

## 4. 当前 turn 用量：input / output / cache read / cache write

### 4.1 OpenCovibe 怎么做

OpenCovibe 有两层 usage：

#### 全局当前 usage

字段：

- `usage.inputTokens`
- `usage.outputTokens`
- `usage.cacheReadTokens`
- `usage.cacheWriteTokens`
- `usage.cost`
- `usage.modelUsage`
- `usage.durationApiMs`

来源：

- 后端 `usage_update` event。
- `result` 事件中的 usage 被归一为 `usage_update`。

#### 每 turn usage

字段：

- `turnUsages: TurnUsage[]`

每次 `usage_update`：

- 计算 `turnIndex`
- append 一条 `TurnUsage`

TurnUsage 包含：

- inputTokens
- outputTokens
- cacheReadTokens
- cacheWriteTokens
- cost
- durationApiMs
- durationMs

状态栏展示：

- `SessionStatusBar.svelte` 展示：
  - cost
  - input/output tokens
  - cache read / cache write
  - duration
  - per-turn duration tooltip
  - context bar

### 4.2 Agent Panel 当前差距

当前后端 `TurnComplete` 只有：

- usage
- stop_reason
- error

当前前端：

- 没有 status bar。
- 没有按 turn 保存用量。
- 没有展示 input/output/cache read/cache write。
- 没有 context window / utilization。

### 4.3 Agent Panel 应该怎么做

后端事件层建议：

- 把 `TurnComplete` 拆出或扩展为：
  - `usage_update`
  - `turn_complete`

前端 store：

- `usage`
- `turnUsages`
- `currentTurnUsage`

UI：

- 在底部输入区上方/下方做 status bar。
- 始终显示当前 turn：
  - input
  - output
  - cache read
  - cache write
  - cost
- 展开后显示：
  - turn count
  - duration
  - model
  - context
  - CLI version

兼容点：

- Agent Panel 现有 Usage 页面是历史统计，不应被实时 usage 状态污染。
- 实时 usage 仅存在当前连接 store；turn complete 后由 session JSONL / watcher 对齐历史统计。

---

## 5. StatusBar / cc-hud / context 含量

### 5.1 OpenCovibe 怎么做

`SessionStatusBar.svelte` 是 OpenCovibe 的 cc-hud。

Tier 1 常驻信息：

- agent / run 标识
- model
- running 状态
- context bar
- active background tasks
- compact 提示

Tier 2 展开信息：

- cwd
- session id
- fork parent
- cost
- input/output tokens
- cache read/write
- MCP servers
- turns
- duration
- permission mode
- fast mode
- verbose
- auth source
- remote host
- CLI version

Context bar：

- 输入：
  - `contextWindow`
  - `contextUtilization`
  - `contextWarningLevel`
- 计算逻辑在 store：
  - contextWindow 来自 `usage.modelUsage[*].context_window` 最大值
  - used = inputTokens + cacheReadTokens + cacheWriteTokens
  - utilization = used / contextWindow
- UI：
  - 进度条
  - 颜色分级：
    - none
    - moderate
    - high
    - critical
  - compact 后短暂 pulse

### 5.2 Agent Panel 当前差距

当前只有简单 `ConnectionStatus`：

- idle
- connecting
- connected
- error

缺：

- model
- cost
- token
- context
- permission mode
- CLI version
- cwd
- turn count
- duration
- compact marker

### 5.3 Agent Panel 应该怎么做

新增 `ConversationStatusBar`：

#### 收起态

- 左侧：状态点 + model
- 中间：context bar
- 右侧：input/output token 简写 + cost

#### 展开态

- cwd
- session id
- permission mode
- CLI version
- input/output/cache read/cache write
- turn count
- duration
- context window

与现有 UI 的关系：

- 不替代 Session Detail Header。
- 应放在 ChatInput 上方或输入框底部 status row。
- 与 `ConnectionStatus` 合并，避免重复显示“已连接”。

---

## 6. 底部交互栏：OpenCovibe 的范本

### 6.1 PromptInput 整体结构

OpenCovibe 输入区由几层组成：

1. Drag overlay
2. File toast
3. Attachment / pasted block / path refs previews
4. Quick action pills + git branch
5. Unified input container
6. Textarea
7. SlashMenu / AtMentionMenu / mode dropdown
8. Bottom action bar
9. Export modal

### 6.2 输入框行为

输入框支持：

- 自动高度，最大约 4 行
- Enter 发送
- Shift+Enter 换行
- IME 组合输入保护
- 输入历史：
  - 空输入时 ↑ 回上一条
  - ↓ 恢复草稿
  - 多行输入时尊重光标视觉位置
- 双击 Esc 清空输入
- `?` 打开快捷键帮助
- stash / restore draft
- 粘贴大段文本自动压缩成 chip
- 文件拖拽/粘贴
- PDF 大小分级处理
- `@` 文件/目录 mention
- slash command

### 6.3 运行中交互

OpenCovibe 运行中不是简单“停止按钮替代发送按钮”。

运行中：

- 如果输入框为空：
  - 显示 stop 按钮
  - 可切 BTW side question
- 如果输入框有内容：
  - 显示 send 按钮，允许 mid-turn 发送进入后端队列
  - 同时仍显示 stop 按钮
- pending permission 时：
  - input disabled 或提示 pending permission
  - permission panel 浮在上方

Agent Panel 当前问题：

- running 时发送按钮被停止按钮替代。
- 用户输入新内容时没有明确 mid-turn send 能力。
- Esc 只绑定在 textarea，focus 不对就不好使。

### 6.4 Quick action pills

OpenCovibe 输入框上方有 quick actions：

- 常用 slash command 快捷入口
- `More...` 打开 slash menu
- 根据 CLI command 和 virtual commands 动态生成
- 点击 enum command（如 model/fast）会打开子视图
- 点击 immediate command 可直接执行

Agent Panel 应该：

- 在输入框上方增加快捷项：
  - `/status`
  - `/context`
  - `/model`
  - `/permission-mode`
  - More
- 后续从 `SessionInit.slash_commands` 动态生成。

### 6.5 Git branch 展示

OpenCovibe：

- 输入栏上方右侧展示当前 git branch。
- 根据分支名 hash 分配颜色。
- 每 10 秒从 cwd poll git branch。
- 远程模式禁用本地 poll。

Agent Panel 应该：

- 在 ChatInput 上方显示当前 session cwd 的 git branch。
- 可以复用已有 `summary.gitBranch` 作为初始值。
- 后续补后台 polling。

### 6.6 底部 action bar

OpenCovibe 左侧：

- Agent selector
- Permission mode button
- Rules button
- Auth badge
- Skill selector
- Stash badge

OpenCovibe 右侧：

- Share
- Slash button
- Attach file
- Screenshot
- Send / Stop
- BTW toggle

Agent Panel 需要的最低可用版：

- 左侧：
  - permission mode
  - rules
  - skills
  - git branch
- 右侧：
  - slash
  - attach
  - screenshot
  - send
  - stop

### 6.7 对应 Claude Code 的含义

- permission mode：
  - 对应 Claude Code 的 `--permission-mode`
  - 也可通过 control protocol 动态切换

- rules：
  - 对应 Claude Code settings permission rules
  - P0 不直接写 rules，但 UI 要预留入口

- skills：
  - 对应 CLI slash commands / skills
  - OpenCovibe 从 session_init + filesystem 合并

- slash：
  - 对应 Claude Code `/status`、`/context`、`/model` 等命令

- attach：
  - 对应 stdin user message content 中的 image/document/base64 或 path refs

- screenshot：
  - OpenCovibe 依赖 Tauri 截图能力
  - Agent Panel 是 Web/Vite，需要判断是否能支持；不能直接照搬 Tauri API

- preview：
  - OpenCovibe 有 preview window 和元素选择
  - Agent Panel 当前没有独立 preview runtime，不能直接做同款，需要后置


### 6.8 附件与粘贴：OpenCovibe 的完整处理链路

这一块之前不能只写“支持附件”。OpenCovibe 的附件系统不是一个 `input type=file`，而是一套输入内容归一机制。它把用户输入分成四类：

1. 普通文本 `inputText`
2. 二进制附件 `pendingAttachments`
3. 大段文本 / 文档转换结果 `pastedBlocks`
4. 本地路径引用 `pendingPathRefs`

最终发送时，OpenCovibe 会把这些内容合并成一个 user message：

```text
finalText = pastedBlocks[].text + pathRefs + typedText
attachments = pendingAttachments[].contentBase64
onSend(finalText, attachments)
```

#### 6.8.1 文件类型分类

参考文件：

- `src/lib/utils/file-types.ts`
- `src/lib/components/PromptInput.svelte`

OpenCovibe 的分类：

| 分类 | 判断 | 处理方式 |
|------|------|----------|
| image | `image/png`, `image/jpeg`, `image/webp`, `image/gif` | 作为二进制 base64 附件发送 |
| pdf <= 20MB | `application/pdf` 或 `.pdf` | 作为二进制 base64 附件发送 |
| pdf 20MB~100MB | PDF 且超过 inline 上限 | 存临时文件，只把 file path 写进 prompt |
| text | `text/*` 或白名单扩展 | 读取为文本，作为 pasted block |
| docx/xlsx | 可转换扩展 | 前端转换成 markdown，作为 pasted block |
| unsupported | 其他 | toast 提示不支持 |

关键常量：

```text
MAX_ATTACHMENTS = 8
MAX_PASTE_BLOCKS = 4
MAX_FILE_SIZE = 10MB
PDF_MAX_BINARY_SIZE = 20MB
PDF_MAX_PATH_SIZE = 100MB
MAX_IMAGE_SIZE = 0 // 图片不做 app-side 限制，交给 CLI 压缩
```

Agent Panel 应该照搬这套分类，但要注意依赖差异：

- 当前 Agent Panel 还没有 `mammoth`、`turndown`、`exceljs`。
- 如果 P0 不加依赖，docx/xlsx 转换应标记为 P1。
- P0 必须先支持 image、pdf <= 20MB、text 文件。

#### 6.8.2 二进制附件如何进入 Claude stdin

OpenCovibe 前端传给后端的 attachment 结构：

```ts
interface Attachment {
  name: string;
  type: string;
  size: number;
  contentBase64: string;
}
```

后端 `session_actor.rs` 的 `build_user_payload()` 会把 attachment 转成 Claude user message content block：

```json
{
  "type": "user",
  "uuid": "...",
  "message": {
    "role": "user",
    "content": [
      { "type": "text", "text": "用户输入" },
      { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "..." } },
      { "type": "document", "source": { "type": "base64", "media_type": "application/pdf", "data": "..." } }
    ]
  }
}
```

Agent Panel 当前后端 `build_user_message(uuid, text)` 只支持纯字符串 content。要支持附件，必须改成：

```rust
pub enum UserContent {
    Text(String),
    Blocks(Vec<Value>),
}

pub struct AttachmentData {
    filename: String,
    media_type: String,
    content_base64: String,
}

build_user_message(uuid, text, attachments) -> Value
```

规则：

- 无附件：保持 `content: string`，兼容简单路径。
- 有附件：`content: [{type:"text", text}, ...attachmentBlocks]`。
- PDF 用 `type: "document"`。
- 图片用 `type: "image"`。

#### 6.8.3 大 PDF path-reference

OpenCovibe 对 20MB~100MB PDF 不直接 base64 inline，而是：

1. 前端读取文件。
2. 调后端 `saveTempAttachment`。
3. 后端保存到临时目录。
4. 前端把返回的 path 保存为 `filePath`。
5. 发送时把路径写进 text：

```text
[PDF: /tmp/xxx.pdf]
```

Agent Panel 是 Web + Rust server，没有 Tauri，但可以做等价后端 API：

```http
POST /api/conversation/attachments/temp
body: { filename, content_base64 }
response: { path }
```

安全要求：

- 只能写入 Agent Panel 自己的数据目录，例如：`~/Library/Application Support/agent-panel/attachments/`。
- 文件名必须 sanitize。
- 返回路径仅供本地 Claude Read/工具使用。
- 定期清理临时附件。

P0 可不支持大 PDF path-ref，但文档和架构要预留，否则后面 attachment 设计会返工。

#### 6.8.4 Text 文件和 pastedBlocks

OpenCovibe 对 text 文件不是 attachment，而是变成 pasted block。

pasted block 结构：

```ts
interface PastedBlock {
  id: string;
  text: string;
  lineCount: number;
  charCount: number;
  preview: string;
  ext?: string;
}
```

UI：

- 输入框上方显示 chip。
- chip 展示文件名 / 首行摘要。
- 展示行数和字符数。
- 可移除。

发送时：

```text
[pasted block 1 text]

[pasted block 2 text]

[typed text]
```

Agent Panel 应该：

- 不把 text 文件作为 binary attachment。
- 读取为文本并加入 `pastedBlocks`。
- P0 支持 `.txt/.md/.json/.ts/.tsx/.js/.py/.rs/.yaml/.toml/.sql/.go/.java/.log/.env` 等常见文本扩展。
- 过大文本要截断或提示。

#### 6.8.5 长文本粘贴压缩

OpenCovibe 处理 paste：

- 如果文本少于 5 行且少于 500 字符：让浏览器正常插入。
- 如果文本较长：阻止默认粘贴，压缩成 pasted block。
- pasted block 最多 4 个。

好处：

- 输入框不会被大段文本撑爆。
- 用户能看到“我粘贴了一段内容”。
- 发送时仍保留完整文本。

Agent Panel 当前输入框直接塞文本，体验会很差。应该按 OpenCovibe 实现：

```text
if pastedText.lines < 5 && pastedText.length < 500:
    default paste
else:
    create pastedBlock chip
```

#### 6.8.6 docx / xlsx 转 markdown

OpenCovibe 用：

- `mammoth`：docx -> html
- `turndown`：html -> markdown
- `exceljs`：xlsx -> workbook -> markdown table

输出限制：

```text
MAX_CONVERTED_CHARS = 200_000
```

Agent Panel 当前依赖里没有这些包。建议：

- P0 不引入 office 转换，先提示“不支持 docx/xlsx”。
- P1 加依赖并实现同款转换。
- 如果加依赖，必须按 OpenCovibe 一样截断，防止 context 爆炸。

#### 6.8.7 附件 UI chip

OpenCovibe 的 `FileAttachment.svelte` 根据类型展示不同 icon 和颜色：

- folder
- image
- pdf/document
- generic file
- path ref 使用 dashed border
- 显示文件名、大小、remove 按钮

Agent Panel 应该实现 `AttachmentChip.tsx`：

```ts
interface AttachmentChipProps {
  name: string;
  size?: number;
  mimeType?: string;
  isPathRef?: boolean;
  onRemove: () => void;
}
```

注意：颜色不能直接照 OpenCovibe 的 `blue/red/amber` Tailwind 硬编码。Agent Panel 要使用 design tokens：

- `border-border`
- `bg-secondary`
- `text-muted-foreground`
- 强调色用 `text-primary` / `text-warning` / `text-destructive`。

### 6.9 @ Mention：文件/目录引用

OpenCovibe 的 @ mention 是输入栏的重要能力。

相关文件：

- `PromptInput.svelte`
- `AtMentionMenu.svelte`
- 后端 API：`api.listDirectory`

行为：

1. 用户输入 `@`。
2. 向前扫描光标，确认 `@` 是 token 开始。
3. 根据 cwd + query 解析目录。
4. debounce 150ms 调后端 listDirectory。
5. 菜单固定在 textarea 上方。
6. ↑/↓ 选择，Enter/Tab 确认。
7. 如果选中目录：补 `/`，继续打开子目录。
8. 如果选中文件：插入路径，关闭菜单。

Agent Panel 当前没有 `listDirectory` API。需要补：

```http
GET /api/fs/list?path=...&dirs_first=true
```

安全策略：

- 仅允许列出本地路径。
- P0 可限制在当前 session cwd 下。
- 返回：`{ name, path, isDir, size }`。

前端实现：

- `AtMentionMenu.tsx`
- `pendingPathRefs` 或直接把 `@path` 保留在输入文本里。
- 更推荐路径 chip 化：选择后生成 `pendingPathRefs`，发送时转成 fenced path。

### 6.10 截图能力

OpenCovibe 截图依赖 Tauri：

- `api.captureScreenshot()`
- 全局 `screenshot-taken` event
- 转成 File 注入 PromptInput attachments

Agent Panel 是浏览器 SPA，不能直接调用系统截图。

可选方案：

#### 方案 A：P0 不支持截图

- UI 显示 disabled screenshot 按钮。
- tooltip：“Web 版暂不支持截图”。

#### 方案 B：后端截图 API

- macOS 用系统命令或截图库。
- 风险：权限、沙盒、安全提示。

#### 方案 C：浏览器 Screen Capture API

- `navigator.mediaDevices.getDisplayMedia()`。
- 用户选择窗口/屏幕后截帧生成图片。
- 优点：Web 原生。
- 缺点：交互较重，不是系统快捷截图。

建议：

- P0：保留按钮但 disabled。
- P1：实现 Screen Capture API。
- 不要直接承诺 Tauri 风格截图。

### 6.11 输入历史与 stash

OpenCovibe 支持：

- userHistory
- ↑/↓ 历史导航
- 多行视觉边界判断
- draft restore
- stash prompt

Agent Panel 应该至少实现：

- 发送成功后把文本放入 local in-memory history。
- 输入为空时 ↑ 取上一条。
- ↓ 返回下一条或恢复 draft。
- 运行中不丢 draft。

P1 再实现 stash：

```ts
interface PromptInputSnapshot {
  text: string;
  attachments: AttachmentDraft[];
  pastedBlocks: PastedBlock[];
  pathRefs: PathRef[];
}
```

### 6.12 Slash 子交互细节

OpenCovibe 的 slash 不是简单列表。

它有 phase：

- `commands`
- `sub-model`
- `sub-fast`

命令有 interaction 类型：

- immediate：Enter 直接执行，Tab 只填充
- free-text：填充 `/cmd ` 等用户继续输入
- enum：进入子视图，例如 `/model`、`/fast`

Agent Panel 现在只需要 P0：

- `/status` immediate
- `/context` immediate
- `/model` enum，占位子视图
- `/permission-mode` enum，占位子视图
- unknown command 作为普通文本发给 CLI

后续 P1：

- 完整分组：session / coding / config / skills / other
- aliases badge
- argument hint
- model 子视图
- permission 子视图
- fast mode 子视图（如果支持）


---

## 7. 权限交互

### 7.1 OpenCovibe 怎么做

权限事件路径：

1. 后端收到 `control_request` subtype `can_use_tool`
2. 发 `permission_prompt` event
3. store reducer 找到对应 tool
4. tool 状态变成 `permission_prompt`
5. pending tool permissions 派生出列表
6. `PermissionPanel` 浮在输入栏上方

单个权限：

- 显示工具 icon
- 工具名
- 工具详情
- Allow
- Deny
- Deny and Stop
- suggestion buttons

多个权限：

- 合并面板
- 工具列表
- 每行 allow / deny
- batch allow all / deny all
- suggestions 缩进显示

提交保护：

- `submittingIds`
- `submittingAll`
- Promise.allSettled
- 失败时解锁

### 7.2 Agent Panel 当前差距

当前权限卡：

- 作为普通 block 在消息流里。
- 用户可能看不到。
- 没有 deny and stop。
- 没有 batch。
- 没有 suggestion rules。
- 没有 optimistic resolve。

### 7.3 Agent Panel 应该怎么做

改为 `PermissionPanel`：

- 位置：ChatInput 上方。
- 输入区 disabled 或显示 pending permission 提示。
- 支持：
  - allow
  - deny
  - deny and stop
  - allow all
  - deny all
  - suggestions
- reducer 中 tool 状态必须变成 `permission_prompt`，permission panel 从 store 派生。

---

## 8. Tool Activity / 侧栏

### 8.1 OpenCovibe 怎么做

`ToolActivity.svelte`：

- 使用 timeline 中的 tool entries 构建工具树。
- 支持 subTimeline 层级。
- 按 turn 聚合工具。
- 能跳转到对应消息/工具。
- tabs：
  - tools
  - context
  - files
  - info
  - tasks

### 8.2 Agent Panel 当前差距

Agent Panel 已有右侧栏和 ToolCard 历史渲染，但实时工具：

- 没进入右侧 ToolActivity。
- 没按当前 turn 更新。
- 没有 context/files/tasks 的实时侧栏。

### 8.3 Agent Panel 应该怎么做

短期：

- 实时 tool entries 进入 unified timeline。
- 右侧栏使用 `history + liveTimeline` 派生工具列表。

中期：

- 增加当前会话 Tool Activity tab。
- 支持点击工具滚动到 active/history 中对应工具。

---

## 9. Context / 上下文快照

### 9.1 OpenCovibe 怎么做

OpenCovibe 支持 context snapshot：

- 后端发 `context-snapshot`
- 前端用 `parseContextMarkdown`
- 保存到 `contextHistoryMap`
- 侧栏 `ContextHistoryPanel` 展示历史
- inline 内容中如果包含 `## Context Usage`，用 `ContextUsageGrid` 渲染

状态栏 context：

- 使用 usage 中的 modelUsage context_window。
- 展示 context 占比。

### 9.2 Agent Panel 当前差距

Agent Panel 没有实时 context snapshot。

可以先做：

- StatusBar context bar。
- `/context` 输出作为 command output 渲染。

后续做：

- context history 面板。
- context usage grid。

---

## 10. 回退检查点 / Rewind Files

### 10.1 为什么这是对话功能的重要组成

对话一旦从“只读浏览”变成“可执行 Claude Code”，就不只是消息 UI 问题，还会产生真实文件修改。

用户在 GUI 里继续对话时，Claude 可能：

- 编辑代码
- 创建文件
- 删除文件
- 执行脚本生成产物
- 多轮修改同一批文件

如果没有“回退检查点”，用户会缺少安全感。CLI 里可以手动 git diff / git checkout，但 GUI 场景必须提供一个可见、可理解、可撤销的安全能力。

OpenCovibe 把“每条用户消息”视为一个潜在 checkpoint。用户可以选择回到某一条 user message 之前的文件状态，并预览会影响哪些文件。

Agent Panel 如果要承接 Claude Code 对话能力，也应该把 rewind 作为 P0.5 / P1 的核心安全功能，而不是远期锦上添花。

### 10.2 OpenCovibe 的入口

OpenCovibe 有三个入口：

1. StatusBar 顶栏按钮
   - 文件：`src/lib/components/SessionStatusBar.svelte`
   - 条件：
     - session 还活着
     - 当前不 running
     - `persistedFiles.length > 0`
   - 点击触发 `onRewind`

2. 单条 user message 上的回退按钮
   - 文件：`src/lib/components/ChatMessage.svelte`
   - chat 页传入：
     - `onRewind={entry.cliUuid && store.sessionAlive && !store.isRunning ? () => handleRewindToMessage(entry) : undefined}`
   - 也就是说，只对有 `cliUuid` 的 user message 开放“回退到这里”。

3. Slash virtual command
   - 文件：`src/lib/utils/slash-commands.ts`
   - `/rewind` 是 virtual command。
   - 在 chat 页 virtual command 分支里判断：
     - 没 session：提示不可用
     - session 已结束：提示不可用
     - 正在 running：提示忙
     - 否则打开 rewind modal

### 10.3 OpenCovibe 如何生成候选 checkpoint

OpenCovibe 不单独维护 checkpoint 列表，而是从 timeline 中派生。

位置：`src/routes/chat/+page.svelte`

核心逻辑：

```text
rewindCandidates =
  rewindModalOpen
    ? store.timeline
        .map((entry, idx) => ({ entry, idx }))
        .filter(entry.kind === "user" && !!entry.cliUuid)
        .reverse()
        .map(({ entry, idx }) => ({
          cliUuid: entry.cliUuid,
          content: entry.content,
          ts: entry.ts,
          timelineIndex: idx
        }))
    : []
```

关键点：

- 候选 checkpoint 来自 `user` timeline entry。
- 必须有 `cliUuid`，因为 CLI rewind 依赖 user message uuid。
- 倒序展示，最近的 checkpoint 在上面。
- 只有 modal 打开时才计算，避免每次 timeline 变动都做数组遍历。

Agent Panel 应该借鉴这个“派生而不是存储”的方式。只要我们把历史和实时 user message 都统一进 timeline，并保留 Claude JSONL 里的 uuid，就可以得到 checkpoint 候选。

### 10.4 OpenCovibe 的 RewindModal 三阶段

文件：`src/lib/components/RewindModal.svelte`

Modal 有三个 phase：

1. `select`
   - 展示可回退的 user message 列表。
   - 每项显示：
     - 倒序编号
     - user prompt 摘要
     - 时间

2. `preview`
   - 用户选择 checkpoint 后，先执行 dryRun：
     - `api.rewindFiles(runId, { userMessageId: c.cliUuid, dryRun: true })`
   - dryRun 返回：
     - `canRewind`
     - `filesChanged`
     - `error`
   - 如果可回退，展示受影响文件列表。
   - 支持勾选部分文件。

3. `executing`
   - 用户确认后执行真正回退：
     - `api.rewindFiles(runId, { userMessageId, files })`
   - 成功后调用 `onSuccess`
   - 失败则回到 preview 并显示错误。

### 10.5 dryRun / execute 响应兼容

文件：`src/lib/utils/rewind.ts`

OpenCovibe 对 CLI 响应做了很多兼容：

- `unwrapControlPayload`
  - 支持标准 control response：
    - `{ response: { canRewind, filesChanged } }`
  - 也支持 payload 直接在顶层。

- `parseDryRunResult`
  - strict 模式。
  - dryRun 必须明确 `canRewind === true` 或存在文件列表。
  - 如果 `canRewind === false` 或 error，则认为不可回退。

- `parseExecuteResult`
  - lenient 模式。
  - 只要没有明确 `canRewind === false` 或 error，就认为成功。

- 同时兼容：
  - `filesChanged`
  - `files_changed`

这说明 rewind 是一个 CLI 兼容风险高的能力，不能按理想 schema 写死。

### 10.6 CLI 能力降级策略

OpenCovibe 处理了两个降级场景：

#### dryRun 不支持

如果 dryRun 返回：

- unsupported control subtype
- unknown subtype
- unknown command
- dry_run 相关错误

则：

- 不硬失败。
- 设置 `dryRunSkipped = true`。
- 允许用户在没有预览的情况下执行回退。
- UI 文案提示“预览不可用”。

#### files 参数不支持

如果用户选择了部分文件，但 CLI 不支持 `files` 参数：

- 先尝试带 files 执行。
- 如果返回 files unsupported：
  - 降级为不带 files 的全量回退。
  - 标记 `degradedToFull = true`。
  - 成功后 toast 提醒用户“已降级为完整回退”。

Agent Panel 必须学习这个降级策略，否则 rewind 很容易因为 CLI 版本差异不可用。

### 10.7 成功后的 UI 表达：Rewind Marker

OpenCovibe 没有把 rewind marker 写进 store.timeline，而是在 chat 页维护单独数组：

```text
rewindMarkers: RewindMarker[]
```

成功后追加：

- id
- ts
- targetContent
- filesReverted

渲染位置：

- 消息流底部。
- 作为蓝色分隔线。
- 显示“回退了 N 个文件”。
- 显示目标 user prompt 摘要。
- 可以展开查看 filesReverted 列表。
- 成功后滚动到最新 marker。

为什么不写进 timeline：

- rewind 是 UI 操作事件，不是 Claude 对话事件。
- 不应该污染 Claude session JSONL 的语义。
- 但用户需要在当前页面看到操作结果。

Agent Panel 也应该采用“UI marker 独立于 Claude 历史”的策略。

### 10.8 Agent Panel 应该怎么做：数据模型

Agent Panel 需要新增这些前端类型：

```ts
interface RewindCandidate {
  cliUuid: string;
  content: string;
  ts: string;
  timelineIndex: number;
}

interface RewindDryRunResult {
  canRewind: boolean;
  filesChanged?: string[];
  error?: string;
}

interface RewindMarker {
  id: string;
  ts: string;
  targetContent: string;
  targetUuid: string;
  filesReverted: string[];
  degraded: boolean;
}
```

`ChatSessionStore` 中新增：

```ts
rewindModalOpen: boolean
rewindDirectTarget: RewindCandidate | null
rewindMarkers: RewindMarker[]
```

候选派生：

```text
rewindCandidates =
  unifiedTimeline
    .filter(entry.kind === "user" && entry.cliUuid)
    .reverse()
```

### 10.9 Agent Panel 应该怎么做：后端协议

Agent Panel 后端现在没有 OpenCovibe 的 run_id / control IPC，但我们有 WebSocket 和 Claude CLI stdin。

建议后端新增 WebSocket client message：

```json
{
  "type": "rewind_files",
  "request_id": "rw_...",
  "user_message_id": "uuid",
  "dry_run": true,
  "files": ["src/a.ts"]
}
```

后端写入 Claude CLI stdin：

```json
{
  "type": "control_request",
  "request_id": "rw_...",
  "request": {
    "subtype": "rewind_files",
    "userMessageId": "uuid",
    "dryRun": true,
    "files": ["src/a.ts"]
  }
}
```

注意字段名需要实测：

- OpenCovibe 的前端 API 是 `userMessageId`、`dryRun`、`files`。
- 但 CLI control protocol 可能接受 camelCase，也可能是 snake_case。
- Agent Panel 必须在协议层封装，不允许 UI 直接拼 raw JSON。

后端收到 CLI `control_response` 后，返回前端：

```json
{
  "type": "rewind_response",
  "request_id": "rw_...",
  "response": {
    "canRewind": true,
    "filesChanged": ["src/a.ts"]
  }
}
```

如果 CLI 版本不支持：

- 返回 error 给前端。
- 前端用 `isDryRunUnsupported` / `isFilesParamUnsupported` 决定是否降级。

### 10.10 Agent Panel 应该怎么做：组件

新增：

- `web/src/components/conversation/RewindModal.tsx`
- `web/src/lib/rewind.ts`

`RewindModal` 阶段：

1. select
2. preview
3. executing

功能：

- 候选列表。
- dryRun loading。
- 文件勾选。
- select all / deselect all。
- preview unavailable 时允许继续。
- execute 失败展示错误。
- execute 成功回调。

消息流：

- 在 unified timeline 渲染后方插入 rewind markers。
- marker 样式用设计 token：
  - `border-border`
  - `text-primary`
  - `bg-secondary`
  - 不硬编码 blue。

### 10.11 Agent Panel 应该怎么做：入口

入口分三类：

#### StatusBar 入口

条件：

- session connected
- not running
- 当前 session 曾有文件修改

“曾有文件修改”判断方式：

- P0 简化：timeline 中存在 Write/Edit/MultiEdit/NotebookEdit 等工具。
- P1 精确：从 tool_result / file entries 中提取 persisted files。

#### User message 入口

每个 user message hover 时显示“回退到这里”。

条件：

- 有 `cliUuid`
- 当前 session alive
- not running
- 不是当前正在 streaming 的临时 user

#### Slash 入口

支持 `/rewind`：

- 不直接发给 Claude。
- 作为 Agent Panel virtual command 打开 modal。
- 与 OpenCovibe 的 virtual command 模型一致。

### 10.12 Agent Panel 与现有架构的冲突

#### 冲突 1：Agent Panel 没有 run event bus

OpenCovibe 的 rewind 操作依赖 `runId` 和 actor control channel。

Agent Panel 当前是直接连接 Claude session。

解决：

- 对已连接的 WebSocket session 暴露 rewind。
- 不支持离线 rewind。
- 不创建额外 run id。
- request/response 都走当前 WebSocket。

#### 冲突 2：历史消息不一定有 cliUuid

Agent Panel 当前历史 loader 的 `Message` 可能只暴露 `id`，不一定暴露 Claude 原始 uuid。

解决：

- 更新 session loader，把 Claude user message 的 `uuid` 或 raw uuid 映射出来。
- 前端 `Message` 增加：
  - `cliUuid?: string`
- 没有 cliUuid 的 user message 不展示 rewind。

#### 冲突 3：工具文件修改提取不完整

OpenCovibe 有 persistedFiles / file entries。

Agent Panel 当前对 tool_result 的文件修改识别不完整。

解决：

- P0 只依赖 dryRun 返回 filesChanged。
- P1 再补 file entries。

#### 冲突 4：CLI 版本能力不稳定

不同 Claude CLI 版本对 rewind_files、dryRun、files 参数支持可能不同。

解决：

- 所有 rewind response 解析必须兼容：
  - wrapped response
  - unwrapped response
  - camelCase
  - snake_case
  - subtype error
  - thrown string
- dryRun 不支持时允许跳过预览。
- files 不支持时降级全量。

### 10.13 Agent Panel 实现优先级

#### P0.5：安全可用版

- 从 unified timeline 派生 rewind candidates。
- 支持打开 modal。
- 支持 dryRun。
- 支持 execute full rewind。
- 成功后显示 marker。
- 不支持选择文件。

#### P1：OpenCovibe 对齐版

- 支持文件列表预览。
- 支持选择部分文件。
- 支持 files unsupported 降级。
- 支持 user message hover 入口。
- 支持 `/rewind` virtual command。

#### P2：体验增强版

- StatusBar 回退按钮。
- ToolActivity files tab 联动。
- marker 可点击展开 diff。
- 与 git diff 状态联动。
- 回退后自动 refresh history + file entries。

### 10.14 验收标准

必须满足：

1. 当前 session running 时，不能打开 rewind。
2. 没有 user cliUuid 时，不展示 rewind。
3. 选择 checkpoint 后先 dryRun。
4. dryRun 成功展示文件列表。
5. dryRun 不支持时展示“无法预览，但可以继续”。
6. execute 成功后显示 rewind marker。
7. execute 后刷新 session 历史。
8. 选择部分文件失败时自动降级全量，并提示用户。
9. 回退操作不写入 Claude session JSONL。
10. 刷新页面后 rewind marker 可丢失，但文件状态必须已经真实回退。

---


## 11. 导出会话 / Export Conversation

### 11.1 为什么导出也是对话体验的一部分

对话 GUI 不只是“继续聊”，还要让用户把一次会话作为产出交付出去。OpenCovibe 把导出放在 PromptInput 右侧 Share 按钮里，而不是只放在历史详情页。原因是：用户常常在对话刚结束时立刻需要分享结果、保存记录或沉淀文档。

Agent Panel 当前已有 `/api/sessions/{id}/export.md`，但这是一个静态历史导出：

- 只能导出 Markdown。
- 不能预览。
- 不能选择范围。
- 不能导出当前 live timeline 中尚未 refetch 的内容。
- 不能导出 HTML / PDF。
- 没有和输入栏/对话状态联动。

如果 Agent Panel 要做到 OpenCovibe 级体验，导出必须接入 unified timeline，而不是只读 JSONL 文件。

### 11.2 OpenCovibe 的导出入口

OpenCovibe 的入口在 `PromptInput.svelte` 底部 action bar 的 Share 按钮：

```text
Share button -> shareOpen = true -> <ExportModal bind:open={shareOpen} runId runName timeline />
```

关键点：

- 导出入口在输入栏右侧，和发送、slash、附件属于同一控制区。
- 导出传入的是当前 `timeline`，不是重新从后端拉取一份历史。
- 这保证了导出 UI 能知道当前 timeline 中有哪些 message 可选择。

### 11.3 ExportModal 的格式选择

文件：`src/lib/components/ExportModal.svelte`

格式类型：

```ts
type Format = "html" | "markdown" | "pdf";
```

三种导出方式：

1. Markdown
   - 调 `api.exportConversationMarkdown(runId, range)` 得到 md。
   - 用 Tauri dialog `save()` 选择 `.md` 路径。
   - 调后端 `writeExportFile(path, md)` 写文件。

2. HTML
   - 先拿 markdown。
   - 用 `buildExportHtml(title, md, generatedAt)` 转成完整 HTML。
   - 保存 `.html` 文件。

3. PDF
   - 先构造 HTML。
   - 创建隐藏 iframe。
   - 写入 HTML。
   - 调 `iframe.contentWindow.print()`。
   - 让系统打印对话框导出 PDF。

Agent Panel 是 Web，不是 Tauri，所以保存策略要改：

- Markdown/HTML：浏览器 Blob 下载。
- PDF：仍可用 iframe print。
- 不要依赖本地 save dialog 或 `writeExportFile`。

### 11.4 ExportModal 的范围选择

OpenCovibe 设计了三类范围：

```ts
type RangeMode = "full" | "messages" | "time";
```

UI 已经有：

1. full
   - 导出完整会话。

2. messages
   - 从 timeline 中筛选 `kind === "user" || kind === "assistant"`。
   - 支持多选。
   - 支持 shift range select。
   - 支持 select all / deselect all。

3. time
   - UI 有 dateFrom / dateTo。
   - 当前 OpenCovibe 的 `buildRange()` 仍返回 `{ type: "full" }`，说明范围功能 UI 先行，后端尚未完全实现。

这点对 Agent Panel 很重要：不能盲目以为 OpenCovibe 已完整实现所有范围逻辑。我们应该借鉴 UI 和数据结构，但实现时要把 range 真正打通。

### 11.5 OpenCovibe 后端 export command

文件：`src-tauri/src/commands/export.rs`

导出 range 类型：

```rust
pub enum ExportRange {
    Full,
    Range { from_seq: u64, to_seq: u64 },
    Messages { seqs: Vec<u64> },
}
```

后端逻辑：

1. 根据 `run_id` 读取 run meta。
2. 先尝试读取 bus events：`storage::events::list_bus_events(run_id, None)`。
3. 遍历 events，按 range 过滤。
4. 支持：
   - `user_message` -> `## User`
   - `message_complete` -> `## Assistant`
   - `tool_start` 记录 pending tool name
   - `tool_end` 输出 tool output preview
5. 如果没有 bus events，则 fallback 到 legacy events。
6. 返回 Markdown 字符串。

写文件：

- `write_export_file(path, content)` 只允许 `.html/.htm/.md`。
- 自动创建 parent dir。

### 11.6 HTML 构造

文件：`src/lib/utils/export-html.ts`

`buildExportHtml(title, markdownBody, generatedAt)`：

- 内联 CSS。
- 使用 `renderMarkdown` 把 markdown 转 HTML。
- 对 `## User`、`## Assistant`、`## Tool:*` 做 heading class 替换。
- 支持代码高亮样式。
- 输出完整 HTML document。

Agent Panel 应该借鉴：

- HTML 导出不要只包 `<pre>`。
- 应使用和现有 Markdown 渲染一致的 markdown renderer。
- 需要专门 export CSS，不能直接引用 app runtime CSS。
- 导出 HTML 应可离线打开。

### 11.7 Agent Panel 应该怎么做：数据源

Agent Panel 有两个可能数据源：

1. 历史 JSONL 加载出的 `SessionContext.messages`
2. 当前 live `ChatSessionStore.timeline + streamingText + thinkingText`

导出必须支持两种场景：

#### 离线历史导出

用户没有连接会话，只打开历史详情页：

```text
source = SessionContext.messages
```

#### 在线当前对话导出

用户正在对话，当前 turn 可能还没写入 JSONL 或 refetch：

```text
source = unifiedTimeline = historyTimeline + liveTimeline + streaming blocks
```

因此 Agent Panel 不能只依赖 `/api/sessions/{id}/export.md`。需要前端有一个统一导出模型：

```ts
interface ExportableMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "thinking" | "system";
  text?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  thinkingText?: string;
  timestamp?: string;
}
```

由以下来源统一转换：

- `RustMessage[]` -> `ExportableMessage[]`
- `ChatTimelineEntry[]` -> `ExportableMessage[]`

### 11.8 Agent Panel 应该怎么做：前端组件

新增：

```text
web/src/components/conversation/ExportConversationModal.tsx
web/src/lib/conversation-export.ts
```

`ExportConversationModal` 状态：

```ts
type ExportFormat = "markdown" | "html" | "pdf";
type ExportRangeMode = "full" | "messages" | "time";
type ExportPhase = "configure" | "preview" | "exporting";
```

功能：

- 格式选择：Markdown / HTML / PDF。
- 范围选择：full / messages / time。
- messages 范围支持多选和 shift range。
- preview 阶段展示 iframe HTML。
- export 阶段下载文件或 print。

### 11.9 Agent Panel 应该怎么做：导出转换逻辑

`conversation-export.ts` 需要提供：

```ts
function buildConversationMarkdown(messages: ExportableMessage[], meta: ExportMeta): string
function buildConversationHtml(markdown: string, meta: ExportMeta): string
function downloadTextFile(filename: string, content: string, mime: string): void
function printHtmlAsPdf(html: string): Promise<void>
```

Markdown 建议格式：

```md
# {title}

**Source:** Claude Code
**Model:** {model}
**Project:** `{cwd}`
**Started:** {startedAt}
**Exported:** {exportedAt}

---

## User

{text}

---

## Assistant

{thinking block optional}

{text}

---

### Tool: Bash

Input:
```json
...
```

Output:
```
...
```
```

Thinking 建议格式：

```md
<details>
<summary>Thinking</summary>

...

</details>
```

工具输出需要截断，避免导出巨大文件。可以沿用现有 `EXPORT_TOOL_OUTPUT_MAX_LEN`。

### 11.10 Agent Panel 应该怎么做：后端接口

P0 推荐前端完成导出，不新增后端写文件接口：

- Markdown/HTML：Blob download。
- PDF：iframe print。

现有后端 `/api/sessions/{id}/export.md` 保留，作为离线导出 API。

P1 可以新增：

```http
POST /api/sessions/{id}/export
body: { format, range, includeThinking, includeTools }
```

但由于在线 live timeline 在前端，后端并不知道未 refetch 的实时内容，所以 P0 前端导出反而更准确。

### 11.11 Agent Panel 导出入口设计

入口应有两个：

1. Session Detail Header 的“导出 .md”保留
   - 用于快速离线导出。

2. Conversation Prompt action bar 的 Share/Export 按钮
   - 打开 `ExportConversationModal`。
   - 使用 unifiedTimeline。
   - 支持 HTML/Markdown/PDF/范围选择。

和 OpenCovibe 对齐：

- 输入栏右侧 Share 按钮是主要入口。
- Header 导出是传统入口。

### 11.12 与现有 Agent Panel 冲突点

#### 冲突 1：当前历史消息类型和 timeline 类型不同

现有 `RustMessage` 是 role-based。
未来 `ChatTimelineEntry` 是 conversation-state-based。

解决：

- 做 `toExportableMessages()` 适配层。
- 不让 ExportModal 直接依赖任一内部类型。

#### 冲突 2：当前后端 export 只支持 Markdown

解决：

- 不动现有 API。
- 前端新增增强导出。
- 后续再考虑后端统一导出。

#### 冲突 3：PDF 导出在 Web 中不能直接保存

解决：

- 用浏览器 print。
- UI 文案写明“将打开系统打印对话框，可选择另存为 PDF”。

#### 冲突 4：live streaming 未完成时导出

解决：

- 如果 `isRunning`，导出按钮仍可用，但 modal 显示提示：
  - “当前回复仍在生成，导出内容包含已生成部分”。
- 或 P0 禁用导出直到 idle。
- 推荐 P0 禁用，P1 支持 partial export。

### 11.13 Agent Panel 导出优先级

#### P0：可用导出

- 从 unified timeline 导出完整 Markdown。
- 支持 HTML preview。
- 支持下载 Markdown / HTML。
- running 时禁用。

#### P1：OpenCovibe 对齐

- message range 选择。
- time range 选择。
- PDF print。
- include/exclude tools。
- include/exclude thinking。

#### P2：产物级导出

- 导出附件索引。
- 导出工具文件变更列表。
- 导出 context usage 图。
- 导出为 zip。

### 11.14 导出验收标准

1. 未连接历史会话也能导出 Markdown。
2. 正在连接的 live 会话 idle 后能导出最新一轮内容。
3. 导出的 user/assistant 顺序与 UI 一致。
4. thinking 可折叠展示或可选择包含。
5. tool input/output 可读且有截断。
6. HTML 可离线打开。
7. PDF 能通过浏览器 print 生成。
8. message range 选择不会漏选/错选。
9. 导出不依赖 Tauri API。
10. 大会话导出不会卡死主 UI。

---

## 12. 与 Agent Panel 冲突的点

### 12.1 Tauri 能力不能直接照搬

OpenCovibe 是 Tauri/Svelte。

以下能力不能直接照搬：

- macOS screenshot capture
- Tauri drag-drop
- native clipboard file path
- preview window selection
- local file temp save 的部分能力

Agent Panel 是 Web + Rust server：

- 可以通过后端 API 做文件读取/截图，但需要安全策略。
- 截图能力不应作为 P0 阻塞。
- 文件上传可先做 input file + base64，后续做 path ref。

### 12.2 OpenCovibe 的 run model 与 Agent Panel 的 session model 不同

OpenCovibe：

- 有 `run_id`
- 有 event bus JSONL
- 有 meta.json
- 所有 live event 都持久化成 BusEvent

Agent Panel：

- 当前以 Claude Code session JSONL 为历史来源
- 没有独立 run event bus

冲突：

- OpenCovibe 的 replay/snapshot 不能原样搬。
- Agent Panel 需要轻量版本：
  - liveTimeline 在内存中
  - turn complete 后通过 Claude session JSONL refetch 对齐
  - 不额外创建 run event bus

### 12.3 权限 rules 持久化

OpenCovibe 支持 suggestion rules 和 settings 写入。

Agent Panel P0 不做独立 settings 写入，因此：

- P0 只做单次 allow/deny。
- suggestion 可以展示，但“始终允许”要标记为后续。

---

## 13. Agent Panel 需要补的功能清单

### P0：必须补，否则体验不可用

1. `ChatSessionStore`
   - phase
   - timeline
   - streamingText
   - thinkingText
   - pendingPermissions
   - usage
   - turnUsages

2. timeline reducer
   - user_message
   - text_delta
   - thinking_delta
   - assistant_message
   - tool_use_start
   - tool_input_delta
   - tool_result
   - permission_request
   - turn_complete

3. 统一消息列表
   - 历史和实时使用同一 MessageBlock/ToolCard 风格。
   - 用户发送后立即出现在列表。
   - assistant token 立即出现。

4. thinking panel
   - 展示思考过程。
   - 支持折叠。
   - 记录 thinking duration。

5. 运行中输入栏
   - 输入内容时可 mid-turn send。
   - stop 按钮始终可用。
   - Esc 全局 interrupt。

6. PermissionPanel
   - 浮在输入框上方。
   - allow/deny/deny and stop。

7. StatusBar
   - model
   - input/output/cache read/cache write
   - context bar
   - permission mode

8. 附件基础能力
   - image / pdf <= 20MB base64 block
   - text 文件转 pastedBlock
   - 长文本 paste chip
   - attachment chip remove

9. @ Mention 基础能力
   - 当前 cwd 下目录/文件搜索
   - 选中文件生成 path ref
   - 选中目录继续下钻

10. Rewind 安全能力基础版
   - user message 派生 checkpoint
   - dryRun / execute full rewind
   - 成功后显示 rewind marker

### P1：提升到 OpenCovibe 级别

1. quick actions
2. slash 子视图
3. permission mode 切换
4. rules entry
5. skill selector
6. git branch poll
7. attachment 高级能力：大 PDF path-ref、docx/xlsx 转 markdown、拖拽目录
8. screenshot / screen capture
9. context history panel
10. tool activity side panel
11. rewind 选择部分文件 + files 参数降级

### P2：高级能力

1. preview window
2. BTW side question
3. rewind
4. fork
5. background tasks
6. MCP elicitation

---

## 14. 推荐改造顺序

### Commit 1：重做前端 Store

新增：

- `chat-session-store.ts`
- reducer
- timeline types

替换：

- `useChatConnection` 不再暴露 raw events 作为 UI 主数据源。
- 改为暴露 store snapshot。

### Commit 2：重做消息流渲染

改造：

- `ActiveMessageArea`
- `StreamingMessage`
- 实时 user/assistant/tool/thinking 使用统一 timeline。

### Commit 3：重做输入栏

改造：

- `ChatInput`
- running 状态下 send + stop 并存
- global Esc interrupt
- input history 基础版

### Commit 4：权限面板

新增：

- `PermissionPanel`
- pending permission derivation
- optimistic resolve

### Commit 5：StatusBar / cc-hud

新增：

- `ConversationStatusBar`
- model / token / cache / context / permission mode

### Commit 6：底部工具栏

新增：

- quick actions
- slash button
- rules
- skills
- attach
- screenshot placeholder
- git branch

---

## 15. 验收标准

重构完成后必须满足：

1. 点击连接后立即进入可输入状态。
2. 用户发送消息后，user 气泡立刻进入列表，样式与历史一致。
3. assistant token 逐步显示，不等待 turn complete。
4. thinking 过程实时显示。
5. 工具调用实时显示 input delta 和 result。
6. 权限请求浮在输入框上方。
7. Esc 在输入框 focus 时和非 focus 时都能停止。
8. 运行中输入新消息可以发送并排队。
9. StatusBar 显示 input/output/cache/context。
10. turn complete 后历史 refetch 不造成重复消息或闪烁。

---

## 16. 当前实现应废弃/保留的部分

### 保留

- 后端 Claude stream parser 基础。
- stdin JSON 构造。
- LocalTransport spawn 参数。
- SessionActor 队列方向。
- WebSocket resume/new 基础。

### 重写

- 前端 `useChatConnection` 的 raw events UI 模型。
- `ActiveMessageArea` 的 groupEvents。
- `ChatInput` 的运行态交互。
- `PermissionCard` 的 inline 模式。
- 简单 `ConnectionStatus` 替代完整 status bar 的设计。

### 谨慎保留

- turn complete 后 refetch 历史。
  - 可以保留作为后台对齐。
  - 不能作为主渲染路径。

---


---

## 18. OpenCovibe 能力覆盖矩阵与 Agent Panel 落地规格

这张表用于自检：每个 OpenCovibe 对话能力都必须明确“是否借鉴、如何做、落在哪个模块、优先级”。后续实现不能只写一个粗糙组件，需要按表逐项落地。

| OpenCovibe 能力 | OpenCovibe 关键实现 | Agent Panel 落地模块 | 优先级 | Agent Panel 具体做法 |
|-----------------|---------------------|----------------------|--------|----------------------|
| timeline reducer | `SessionStore._reduce` | `web/src/lib/chat-session-store.ts` | P0 | 用 reducer 管理 `timeline/streamingText/thinkingText/tools/permissions/usage`，UI 不直接消费 raw events |
| 用户消息立即入列 | `_pushOptimisticUser` + `user_message` 合并 uuid | `chat-session-store.ts` + `MessageStream` | P0 | 发送时立即 append user entry；后端确认后用 uuid 合并，样式复用历史 `MessageBlock` |
| assistant token 流式 | `message_delta -> streamingText` | `chat-session-store.ts` + `StreamingAssistantBlock` | P0 | delta 追加到 `streamingText`，不等 refetch；complete 后固化到 timeline |
| thinking 展示 | `thinking_delta -> thinkingText` | `ThinkingPanel.tsx` | P0 | 展示“思考过程”、elapsed、折叠；complete 后写入 assistant entry |
| tool start / input delta / result | `tool_start/tool_input_delta/tool_end` | `ToolTimelineBlock.tsx` | P0 | tool entry 进入统一 timeline；input delta 实时 patch；result 更新 status/output |
| permission prompt | `permission_prompt -> pendingToolPermissions` | `PermissionPanel.tsx` | P0 | 面板浮在输入栏上方；支持 allow/deny/deny+stop；提交中禁用 |
| running 输入栏 | `PromptInput running + canSend` | `ConversationPrompt.tsx` | P0 | running 时 stop 常驻；有输入时 send 也显示；发送进入后端队列 |
| 全局 Esc 停止 | keybinding `chat:interrupt` | `ChatSessionProvider` | P0 | window keydown 捕获 Esc；菜单打开时先关闭菜单，否则 interrupt |
| Status HUD | `SessionStatusBar` | `ConversationStatusBar.tsx` | P0 | model、tokens、cache、context、permissionMode、CLI version、cwd、duration |
| turn usage | `turnUsages` | `ConversationStatusBar` + timeline divider | P0 | 每个 `usage_update` append TurnUsage；turn 后显示 input/output/cache 小分隔 |
| context bar | `contextUtilization` | `ConversationStatusBar` | P0 | `used = input + cacheRead + cacheWrite`；contextWindow 从 modelUsage 取最大值 |
| quick actions | `getQuickActions` | `PromptQuickActions.tsx` | P1 | `/status /context /model /permission-mode /rewind /help` 常驻快捷入口 |
| slash menu | `SlashMenu` phases | `SlashMenu.tsx` | P1 | commands / sub-model / sub-permission；分组、hint、aliases、Tab 填充 |
| rules | `ocv:open-permissions` | `RulesEntryButton.tsx` | P1 | P0 只入口占位；P1 接 settings permission rules |
| skills | `SkillSelector` | `SkillSelector` / existing Skills data | P1 | 从 session_init slash + 本地 skills 扫描合并，点击填入 `/${skill} ` |
| git branch | `createGitBranchPoller` | `GitBranchBadge.tsx` | P1 | 初始用 session summary gitBranch；连接后按 cwd 轮询 |
| image/pdf 附件 | file-types + `build_user_payload` | `AttachmentManager` + backend payload builder | P0 | image/pdf<=20MB 生成 base64 content blocks |
| text 文件 / 长文本 paste | `pastedBlocks` | `PastedBlockChip.tsx` | P0 | 文本文件和长 paste 转 chip，发送时拼入 prompt |
| docx/xlsx 转 markdown | `file-convert.ts` | `file-convert.ts` | P1 | 引入 mammoth/turndown/exceljs，最大 200k chars |
| 大 PDF path-ref | `saveTempAttachment` | `/api/conversation/attachments/temp` | P1 | 后端保存临时文件，prompt 注入 `[PDF: path]` |
| @ mention | `AtMentionMenu` + listDirectory | `/api/fs/list` + `AtMentionMenu.tsx` | P1 | 限制 cwd 范围，目录下钻，文件转 path ref |
| 截图 | Tauri screenshot | `ScreenCaptureButton.tsx` | P1/P2 | Web 版先 disabled；后续用 Screen Capture API |
| Rewind checkpoint | `RewindModal` + `rewindFiles` | `RewindModal.tsx` + WS control request | P0.5 | 从 user cliUuid 派生 checkpoint，dryRun/execute，成功 marker |
| Export conversation | `ExportModal` + `export_conversation_markdown` + `buildExportHtml` | `ExportConversationModal.tsx` + `conversation-export.ts` | P0/P1 | P0 导出 unified timeline 为 MD/HTML；P1 message/time range + PDF print |
| ToolActivity 侧栏 | `ToolActivity` | `RightSidebar` extension | P1 | live timeline 派生 tools/context/files/tasks tabs |
| context history | `ContextHistoryPanel` | `ContextHistoryPanel.tsx` | P1 | 先支持 `/context` output grid，再做 snapshot history |
| BTW side question | BTW drawer | 暂不做 | P2 | 与当前产品目标冲突，后置 |
| preview window | Tauri preview | 暂不做 | P2 | Web 环境缺原生窗口，后置 |

### 18.1 必须立即修正的当前实现方向

当前实现中以下做法应该废弃：

1. **废弃 `events[] -> groupEvents()` 作为主渲染路径**
   - 原因：无法做到历史和实时 UI 一致，thinking/tool/permission/usage 也无法形成稳定状态。
   - 替代：`ChatSessionStore.reducer`。

2. **废弃 turn complete 后再靠 refetch 展示回复**
   - 原因：用户看到的是延迟结果，不是流式。
   - 替代：`text_delta` 实时进 `streamingText`。

3. **废弃 inline permission card 作为唯一权限入口**
   - 原因：用户会看不到，也无法批量处理。
   - 替代：浮动 `PermissionPanel` + 特殊 tool 内联。

4. **废弃 running 时 send/stop 二选一**
   - 原因：OpenCovibe 支持运行中插队发送，同时保留停止。
   - 替代：有输入时显示 send + stop；无输入时只显示 stop。

5. **废弃把附件当成普通文件 input 传给后端**
   - 原因：Claude stdin content block 有 image/document/text/path-ref 多种形态。
   - 替代：AttachmentManager 分类归一。

### 18.2 Agent Panel P0 组件拆分建议

```text
web/src/lib/chat-session-store.ts
web/src/lib/chat-reducer.ts
web/src/lib/chat-timeline-types.ts
web/src/lib/attachment-manager.ts
web/src/lib/rewind.ts
web/src/lib/conversation-export.ts

web/src/components/conversation/ConversationPanel.tsx
web/src/components/conversation/ConversationStatusBar.tsx
web/src/components/conversation/ConversationPrompt.tsx
web/src/components/conversation/PromptQuickActions.tsx
web/src/components/conversation/AttachmentChip.tsx
web/src/components/conversation/PastedBlockChip.tsx
web/src/components/conversation/ThinkingPanel.tsx
web/src/components/conversation/PermissionPanel.tsx
web/src/components/conversation/RewindModal.tsx
web/src/components/conversation/ExportConversationModal.tsx
```

后端 P0 需要扩展：

```text
src-server/src/conversation/types.rs
  - AttachmentData
  - RewindRequest / RewindResponse
  - UsageUpdate

src-server/src/conversation/protocol.rs
  - build_user_message(uuid, text, attachments)
  - build_rewind_request(...)

src-server/src/router/chat.rs
  - client message: rewind_files
  - server message: rewind_response

src-server/src/router/fs.rs
  - list directory for @ mention（P1）
  - temp attachment save（P1）
```

### 18.3 P0 实现完成定义

P0 不要求做到 OpenCovibe 全量，但必须做到：

- 用户消息立即进入主消息列表。
- assistant delta 实时出现。
- thinking 实时出现。
- running 时 stop 可用，Esc 全局可用。
- running 时可继续输入并发送排队。
- PermissionPanel 浮动显示。
- StatusBar 显示 model/tokens/cache/context。
- image/pdf/text 基础附件可发送。
- `/rewind` 或按钮能打开回退检查点 modal，并能完成 full rewind。
- 当前会话 idle 后可以从 unified timeline 导出 Markdown/HTML。

这些不满足，就不能宣称“对话体验可用”。


## 19. 最终原则

如果 Agent Panel 要让用户愿意替代 Claude Code CLI，它不能只是“把 stdout 放到网页里”。

必须做到：

- 输入像 Claude Code。
- 状态像 Claude Code。
- 工具和权限像 Claude Code。
- 实时反馈比 CLI 更清楚。
- 历史和实时是同一个对话，而不是两个拼接区域。

OpenCovibe 的关键价值不是 UI 漂亮，而是它把 Claude Code 的交互协议变成了一个完整、可回放、可恢复、可操作的 session state machine。

Agent Panel 后续实现也必须围绕这个 state machine 重构。
