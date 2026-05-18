下面是基于仓库源码与本地真实样本（`~/.claude`、`~/.codex`、`~/.cursor`）整理的施工指南，面向「工具卡片 + 索引 + 跨 agent 用量」。

---

# 1. 五种 source 的 Message 输出对照表

| source | `tool_use` 的 `toolName`（scanner 写入 `Message`） | `toolInput` 关键字段 | `toolOutput` 来源 | `id` 字段 | parent link |
|--------|---------------------------------------------------|----------------------|---------------------|-----------|-------------|
| **claude-code** | 有：`content[]` 里 `type:"tool_use"` 的 `name`（如 `Bash`、`Read`、`Edit`） | Anthropic 风格：`input` 对象（如 `command`+`description`、`file_path` 等） | `tool_result` 行：`content[]` 里 `type:"tool_result"` 的 `content`（字符串或 `{text}` 数组拼接） | `makeMessageId(sessionId, idx, uuid)`，`uuid` 为行级 `uuid` | **未写入 `Message`**；`parentUuid` / `sourceToolAssistantUUID` 仅在 `raw` |
| **cursor-agent** | **无**（未解析 `content` 内 `tool_use`） | **无** | **无** | `makeMessageId(sessionId, idx)`（无 hint） | **无**；工具信息只在 `raw.message.content[]` |
| **cursor-composer** | **无** | **无** | **无** | `makeMessageId(sessionId, i, bubbleId)` | **无**；`BubbleData.toolFormerData` / `toolResults` 仅在 `raw`，当前未展开 |
| **codex** | **无**（`function_call` 等行被整段跳过） | **无** | **无** | `makeMessageId(sessionId, idx)` / `…#meta` | **无**；`call_id` 在 `raw` 的 `function_call` / `function_call_output` 中 |
| **claude-history** | 无（仅 `role:"user"` + `text`） | 无 | 无 | `makeMessageId(sessionId, idx)` | 无 |

说明：`SessionSummary` 对各源一致（见 `shared/types.ts`），`tokensTotal` / `tokensByDay` **仅 claude-code 与 codex** 在 scanner 中填充；其余源注释已写明为 `undefined`（见 `shared/types.ts` 约 192–197 行）。

---

# 2. claude-code 详解

**路径**：`~/.claude/projects/<项目目录>/<sessionId>.jsonl`（见 `claude-code.ts` 中 `root = join(home, ".claude/projects")`）。

**抽取哪些行**  
- `loadClaudeCodeMessages`：跳过无 `type` 或 `type === "file-history-snapshot"`；其余经 `mapClaudeRole` 映射。  
- 计入摘要的条数：`type` 为 `user` / `assistant` / `tool_use` / `tool_result`（见 `summariseFile` 约 86–91 行）。

**角色映射要点**（`mapClaudeRole`）  
- `type:"user"`：若 `content` 含 `tool_result` → `role:"tool_result"`，否则 `user`。  
- `type:"assistant"`：若仅有 `tool_use` 块、无 `text` 块 → `tool_use`，否则 `assistant`。  
- 另有顶层 `type:"tool_use"` / `tool_result"` / `system"`。

**`tool_use_id` 与配对**  
- 工具 ID 在 **`message.content[]` 项内**：`{"type":"tool_use","id":"toolu_…","name":"Bash","input":{...}}`。  
- 结果行在 **用户侧** 行：`type:"user"`，`content` 含 `{"type":"tool_result","tool_use_id":"toolu_…","content":"..."}`。  
- **当前 scanner 不把 `id` / `tool_use_id` 写入 `Message`**；`extractToolInfo` 只取**第一个**匹配的 `tool_use` 或 `tool_result` 的 input/output（见 `claude-code.ts` 214–244 行）。  
- **真实样本**（节选，路径已脱敏）：顶层行含 `uuid`、`timestamp`、`sessionId`、`cwd`；`tool_use` 与 `tool_result` 为不同 jsonl 行；结果行还带 `toolUseResult`（如 Bash 的 `stdout`）——**富结构只在 `raw`，`toolOutput` 仅为字符串化的 `content`**。

**跨行结构**：同一会话中 `parentUuid` 链、并行多 `assistant` 行各带一个 `tool_use` 时，顺序即时间线；`extractToolInfo` 对单行只暴露**一个**工具片段。

---

# 3. cursor-agent 详解

**路径**：`~/.cursor/projects/<projId>/agent-transcripts/<dirId>/<file>.jsonl`（`cursor-agent.ts` 约 30–38 行）。  
**cwd**：`projId` 以 `Users-` 开头时解码为 `/Users/...`（`decodeProjectId`，约 118–121 行）。

**读取方式**：整文件 `streamJsonl`，逐行 JSON。

**消息逻辑**：仅保留 `role` 为 `user` | `assistant` | `system`（来自顶层 `role` 或 `message.role`）；`text` 从 `message.content` 数组里拼 `type:"text"` 的 `text` 字段（约 105–116、132–138 行）。

**工具调用**：`assistant` 行常见 `content: [{type:"text",...},{type:"tool_use",name:"Shell",input:{...}}]`（真实样本：`/Users/wangshujun/.cursor/projects/Users-wangshujun-workspace-skill-panel/agent-transcripts/38bde359-b68d-43f3-b008-3d9dca89c435/38bde359-b68d-43f3-b008-3d9dca89c435.jsonl`）。**Scanner 不拆分 `tool_use`、不填 `toolName`/`toolInput`**，故归一化层必须从 `raw` 解析。

**时间戳**：jsonl **无**每消息时间戳；`SessionSummary.lastActivity` / `startedAt` 用文件 `mtime` / `birthtime`（约 85–87 行）。

---

# 4. cursor-composer 详解

**SQLite 路径**（macOS）  
1. `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`  
2. `~/Library/Application Support/Cursor/User/workspaceStorage/<wsHash>/state.vscdb`（`cursor-composer.ts` 约 57–98 行）

**表名**：`cursorDiskKV`（约 125–127 行）。

**Key**  
- 会话主体：`composerData:<composerId>`（`value` 为 UTF-8 JSON，见 `__probe.md`）。  
- 可选气泡详情：`bubbleId:<composerId>:<bubbleId>`（约 272–274 行）。

**相关字段（解析后 `ComposerData`）**  
- `composerId`、`createdAt`、`conversation[]`（`type` 1=user，2=assistant）、`text` / `richText`、`bubbleId`、`timingInfo.clientStartTime` 等（约 13–36 行）。  
- `BubbleData` 含 `toolFormerData?: { name?, params?, result? }`、`toolResults?`（约 39–50 行），**但 `loadCursorComposerMessages` 未映射到 `Message.tool*`**，只把 `conversation[i]` 放进 `raw: c`（约 290–296 行）。

**Blob**：`toBuffer` 支持 `Buffer` / `Uint8Array` / `string`（约 191–197 行）；与 `__probe.md` 一致，主路径为 JSON 而非 protobuf。

**`SessionSummary.filePath`**：`sqlite://<dbPath>?key=composerData:<composerId>`（约 164、238–242 行）。

---

# 5. codex 详解

**路径**：`~/.codex/sessions/YYYY/MM/DD/*.jsonl`（`codex.ts` `walkJsonl`）。

**行类型**（样本与源码一致）  
- `session_meta`：首行元数据 → 单条 `role:"meta"` 消息（约 165–172 行）。  
- `response_item`：**仅当** `payload.role` 存在时才落库（约 175–177 行）→ `user` / `assistant` / `system`；`payload.type === "message"` 且 `content` 为 `{type:"input_text"|"output_text",text}` 数组时，`extractText` 只取 `text`（147–157 行）。  
- `event_msg`：如 `token_count` 用于 `tokensTotal` / `tokensByDay`（约 111–123 行），**不产生 `Message`**。  
- **`response_item` 且 `payload.type === "function_call"`**：无 `role`，**`loadCodexMessages` 直接 `return`（被丢弃）**。  
- **`function_call_output`**：同样无 `role`，**丢弃**。  
- `turn_context`、`event_msg` 等非 `response_item`：多数不进 `Message[]`。

**工具命名**（真实样本）：`exec_command`；配对键为 **`call_id`**（`function_call` 与 `function_call_output` 对应），不是 Anthropic 的 `tool_use_id`。

**与用量**：按行 `event_msg` + `payload.type === "token_count"` 累加 `last_token_usage.total_tokens`（delta）（约 111–123 行）。

---

# 6. claude-history 详解

**文件**：单文件 `~/.claude/history.jsonl`（`claude-history.ts` 约 29、94 行）。

**与 claude-code 的关系**：同一 CLI session 往往共享 **`sessionId`**（history 行里有 `sessionId`；projects 下 jsonl 有 `sessionId`）。面板用 `makeSessionId` 前缀区分来源，故 **同一 UUID 会对应两条 `SessionSummary`（不同 `source`）**。

**为何只有 user prompt**：聚合键为 `sessionId`（或 `__nosession_<project>`），每行只有 `display` + `timestamp` + `project`（约 36–55、105–111 行），**无 assistant、无 tool**。

**级联删除**（`server/lib/trash.ts`）：`claude-history` **不能**整文件移走；实现为 **按行过滤** `history.jsonl`，匹配行备份到 `prompts.jsonl`，原子写回（约 243–248、348 行及后续）。`findCascadeCandidates` 用 **`sessionIdRaw`** 在 claude-code / claude-history / 回收站之间找「同会话」条目（约 202–231 行）。

---

# 7. 跨 source 归一表

### 7.1 Canonical 工具名映射（建议）

| 标准名（示例） | Claude Code（真实出现） | Cursor Agent（真实出现） | Codex（样本） |
|----------------|-------------------------|---------------------------|---------------|
| `bash` / `shell` | `Bash` | `Shell` | `exec_command`（参数里含 `cmd`） |
| `read_file` | `Read` | `Read` | （常见还有 `read_file` 类，需在原始日志中继续扫全量） |
| `write` / `edit` | `Write`、`Edit`、… | 视 Cursor 版本而定 | `apply_patch` 等（需从全量 jsonl 统计） |
| `glob` / `file_search` | `Glob` | 可能有 `Glob` 或别名 | — |
| `grep` | `Grep`（若出现） | `Grep` | — |
| `todo` | `TodoWrite` 等 | `TodoWrite` | — |
| `mcp` | 视工具名 | 视工具名 | 可能为自定义 function 名 |

**做法**：归一化层维护 **`(source, rawName) → canonical`**；Codex 需单独处理 **`function_call.name`**（snake_case）与 **`call_id`** 链路。

### 7.2 Unified `Message` 扩展建议（在现有字段上增量）

在 `shared/types.ts` 的 `Message` 上建议增加（或并行 DTO）：

- **`toolUseId?: string`**：Claude `tool_use.id`；Codex `call_id`；Cursor 若可解析则生成稳定 id 或沿用厂商 id。  
- **`parentToolUseId?: string`**：子 agent / 嵌套调用（Claude 行级 `parentUuid`、工具 `caller` 仅作参考）。  
- **`toolCallStatus?: "pending" | "ok" | "error"`**：来自 `is_error`、exit code、或 UI 推断。  
- **`sourcePayloadType?: string`**：如 `function_call` / `tool_use` / `bubble`，便于索引与调试。  
- **保留 `raw`**：卡片「原始 JSON」与二次解析仍依赖它。

用量若要做「按消息」：`claude-code` 可把 `message.usage` 挂到最后一条 assistant 行；codex 用 `event_msg` 行级时间戳与 turn 对齐（需在 ingestion 关联 turn_id）。

---

# 8. 工具卡片渲染时要兼容的 corner case

1. **claude-history**：无工具、无 assistant；**不要**预留右侧工具时间线或空状态占位过大。  
2. **claude-code `tool_result` 行**：scanner 当前 **`toolName` 常为空**（`extractToolInfo` 对纯 `tool_result` 只填 `output`），卡片需用 **`raw` 内 `tool_use_id` 回查** 或相邻消息启发式配对。  
3. **同一 `content` 多 `tool_use`**：若出现，`extractToolInfo` **只取第一个**——需改解析或拆行。  
4. **thinking / redacted_thinking / attachment**：可能映射为 `assistant` 带空 `text` 或仅 `raw`——避免当工具卡。  
5. **cursor-agent**：一条 `assistant` 行内 **多个 `tool_use` 并列**——需按块拆分多张卡或折叠组。  
6. **cursor-agent 无时间戳**：卡片无法显示精确耗时，除非用文件级时间或后续索引写入。  
7. **cursor-composer**：主列表只有 `conversation[]` 文本；**工具细节在 `bubbleId:*` 的 JSON**，且 **`toolFormerData` 结构未统一导出**——需二次加载 bubble 或扩展 scanner。  
8. **cursor-composer `richText`**：含 HTML 标签，已 strip（约 265–266 行），**丢失结构化工具块** 的风险。  
9. **codex**：`function_call` / `reasoning` / `developer` 角色在日志里大量存在，**当前 `Message[]` 里没有**——工具卡与索引必须先 **扩展 loader** 或单独 pipeline。  
10. **Codex `call_id` vs Claude `tool_use_id`**：链接字段名不同，归一层需统一。  
11. **Codex `payload.role === "developer"`**：不计入现有 `messageCount` 与 `loadCodexMessages`，系统提示与真实用户消息混在一起时需产品决策是否展示。  
12. **跨源 cost**：仅 claude/codex 有 token 聚合；**cursor 无 token**——用量墙需按 source 分栏或「不可用」。  
13. **SQLite workspace 去重**：同一 `composerId` 可能多 DB，scanner 已按 `messageCount` 取最大（约 100–106 行）——UI 勿重复会话。

---

# 9. 真实 jsonl 样本（脱敏，可作 fixture 结构依据）

以下为**结构真实**的节选；路径、长文本、token 已截断或替换。

**① claude-code**（`~/.claude/projects/.../f7779571-....jsonl` 风格）  
```json
{"parentUuid":"…","type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_XXX","name":"Bash","input":{"command":"ls -la /path/to/project/","description":"List project root"}}]},"uuid":"…","timestamp":"2026-04-17T16:55:49.154Z","sessionId":"f7779571-…","cwd":"/path/to/project"}
```

**② cursor-agent**（`~/.cursor/projects/Users-…-skill-panel/agent-transcripts/…/….jsonl`）  
```json
{"role":"assistant","message":{"content":[{"type":"text","text":" I need to explore both repositories…"},{"type":"tool_use","name":"Shell","input":{"command":"ls -la /path/to/repo && echo \"---\"","description":"查看两个项目的根目录结构"}}]}}
```

**③ cursor-composer**（非 jsonl，为 `composerData:*` 解析后的 **conversation 片段** 结构）  
```json
{"type":2,"bubbleId":"bubble-abc","text":"帮我重构这段代码","relevantFiles":["/path/to/src/App.tsx"],"timingInfo":{"clientStartTime":1710000000000}}
```

**④ codex — session_meta**  
```json
{"timestamp":"2026-04-17T09:05:03.835Z","type":"session_meta","payload":{"id":"019d9aaf-…","cwd":"/path/to/home","model_provider":"openrouter","cli_version":"0.121.0"}}
```

**⑤ codex — function_call + output（同一文件内两行）**  
```json
{"timestamp":"2026-03-12T02:33:56.008Z","type":"response_item","payload":{"type":"function_call","name":"exec_command","arguments":"{\"cmd\":\"codex --help\",\"workdir\":\"/path/to/home\"}","call_id":"call_XXX"}}
```
```json
{"timestamp":"2026-03-12T02:33:56.266Z","type":"response_item","payload":{"type":"function_call_output","call_id":"call_XXX","output":"…stdout…"}}
```

**⑥ claude-history（补充为第 6 类数据源）**  
```json
{"display":"如何添加 workspace？","timestamp":1763000000000,"project":"/path/to/project","sessionId":"476b9a09-…"}
```

---

## 核心结论（施工优先级）

1. **要做统一工具卡**：必须在 **ingestion 层** 为 **cursor-agent**、**cursor-composer**、**codex** 增加与 Claude 对称的 **tool 抽取**（Codex 至少吃进 `function_call` / `function_call_output`）。  
2. **Claude 侧** 建议把 **`tool_use_id` / `tool_use_id` 写入 `Message`**，否则 `tool_result` 行难以稳定配对。  
3. **用量与索引**：会话级已有 `tokensTotal`（claude/codex）；消息级与工具级需额外事件流（Codex `event_msg`、Claude 行内 `usage`）。  

以上文件路径均以你本机为准：`/Users/wangshujun/workspace/skill-panel/shared/types.ts`、`server/scanners/sessions/*.ts`、`server/lib/trash.ts`、`server/scanners/sessions/__probe.md`。

[REDACTED]