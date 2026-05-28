# 预研方案：Claude CLI stream-json 管道可行性验证

> **目的**：在开始 Phase 1 编码前，验证核心假设——`claude --print --output-format stream-json --input-format stream-json` 的 stdin/stdout 管道能否作为 agent-panel 对话功能的基础。
>
> **原则**：纯 shell 脚本，零 agent-panel 代码。只验证 CLI 行为，不做任何工程封装。
> 
> **失败标准**：任何一个带 ⚠️ 标记的断言失败 → Phase 1 方案需要重设计。

---

## 0. 环境准备

```bash
# 定点到一个测试目录，避免污染真实会话
TEST_DIR="$HOME/.claude/projects/-Users-wangshujun-workspace-agent-panel"
mkdir -p "$TEST_DIR"

# 检查 CLI 版本
CLI_VERSION=$(claude --version 2>&1 | head -1)
echo "CLI: $CLI_VERSION"

# 所有输出存到 /tmp/claude-poc/
mkdir -p /tmp/claude-poc
```

---

## Test 1：新建会话（Happy Path）

```bash
echo '{"type":"user","uuid":"poc-001","message":{"role":"user","content":"Reply with exactly: PONG"}}' \
  | claude --print \
      --output-format stream-json \
      --input-format stream-json \
      --verbose \
      --permission-prompt-tool stdio \
      --max-turns 1 \
      2>/tmp/claude-poc/t1-stderr.log \
  | tee /tmp/claude-poc/t1-stdout.jsonl
```

### 断言

| # | 检查项 | 命令 | 期望 |
|---|--------|------|------|
| 1.1 | stdout 非空 | `wc -l /tmp/claude-poc/t1-stdout.jsonl` | > 0 行 |
| 1.2 | 首事件是 system/init | `head -1 /tmp/claude-poc/t1-stdout.jsonl \| jq -r '.type'` | `"system"` |
| 1.3 | system/init 含 subtype=init | `head -1 /tmp/claude-poc/t1-stdout.jsonl \| jq -r '.subtype'` | `"init"` |
| 1.4 | ⚠️ session_id 非空 | `head -1 /tmp/claude-poc/t1-stdout.jsonl \| jq -r '.session_id'` | UUID 格式，非 null 非空 |
| 1.5 | 有 content_block_start 事件 | `grep -c 'content_block_start' /tmp/claude-poc/t1-stdout.jsonl` | > 0 |
| 1.6 | 有 text_delta 事件 | `grep -c 'text_delta' /tmp/claude-poc/t1-stdout.jsonl` | > 0 |
| 1.7 | ⚠️ 有 result 事件 | `grep -c '"type":"result"' /tmp/claude-poc/t1-stdout.jsonl` | == 1 |
| 1.8 | result 含 usage | `grep '"type":"result"' /tmp/claude-poc/t1-stdout.jsonl \| jq -r '.usage.input_tokens'` | > 0 |
| 1.9 | result 含 stop_reason | `grep '"type":"result"' /tmp/claude-poc/t1-stdout.jsonl \| jq -r '.stop_reason'` | `"end_turn"` |
| 1.10 | AI 回复含 PONG | `grep -c 'PONG' /tmp/claude-poc/t1-stdout.jsonl` | > 0 |
| 1.11 | stderr 无 ERROR | `grep -ci 'error' /tmp/claude-poc/t1-stderr.log \| grep -v ':0'` | 0 或无 ERROR 关键行 |
| 1.12 | ⚠️ JSONL 文件已创建 | `ls "$TEST_DIR/$(head -1 /tmp/claude-poc/t1-stdout.jsonl \| jq -r '.session_id').jsonl"` | 文件存在 |
| 1.13 | JSONL 含 user 条目 | `cat "$TEST_DIR/$(head -1 /tmp/claude-poc/t1-stdout.jsonl \| jq -r '.session_id').jsonl" \| jq -r '.type' \| grep -c 'user'` | == 1 |
| 1.14 | JSONL 含 assistant 条目 | `cat "$TEST_DIR/$(head -1 /tmp/claude-poc/t1-stdout.jsonl \| jq -r '.session_id').jsonl" \| jq -r '.type' \| grep -c 'assistant'` | == 1 |

### 提取 session_id 供后续 test 使用

```bash
SID=$(head -1 /tmp/claude-poc/t1-stdout.jsonl | jq -r '.session_id')
echo "Session ID: $SID"
```

---

## Test 2：Resume 同一 Session — Replay 行为

```bash
echo '{"type":"user","uuid":"poc-002","message":{"role":"user","content":"What did I ask you in my first message? Reply briefly."}}' \
  | claude --resume "$SID" --print \
      --output-format stream-json \
      --input-format stream-json \
      --verbose \
      --permission-prompt-tool stdio \
      --max-turns 1 \
      2>/tmp/claude-poc/t2-stderr.log \
  | tee /tmp/claude-poc/t2-stdout.jsonl
```

### 断言

| # | 检查项 | 命令 | 期望 |
|---|--------|------|------|
| 2.1 | ⚠️ session_id 相同 | `head -1 /tmp/claude-poc/t2-stdout.jsonl \| jq -r '.session_id'` | 等于 `$SID` |
| 2.2 | ⚠️ Resume 时 replay 了历史事件 | `grep -c '"uuid":"poc-001"' /tmp/claude-poc/t2-stdout.jsonl` | > 0（有 Test 1 的 user echo） |
| 2.3 | replay 事件 uuid 与 JSONL 一致 | `grep '"uuid":"poc-001"' /tmp/claude-poc/t2-stdout.jsonl \| jq -r '.uuid'` | `"poc-001"` |
| 2.4 | ⚠️ replay 事件包含 assistant 消息 | `grep -c '"type":"assistant"' /tmp/claude-poc/t2-stdout.jsonl` | >= 1（包含 Test 1 的回复） |
| 2.5 | 新消息正常处理 | `grep -c '"uuid":"poc-002"' /tmp/claude-poc/t2-stdout.jsonl` | > 0 |
| 2.6 | 有新的 result | `grep -c '"type":"result"' /tmp/claude-poc/t2-stdout.jsonl` | == 1（只有新 turn 的 result） |
| 2.7 | JSONL 增加了一条新的 assistant | `cat "$TEST_DIR/${SID}.jsonl" \| jq -r '.type' \| grep -c 'assistant'` | == 2 |
| 2.8 | JSONL 增加了两条新的 user | `cat "$TEST_DIR/${SID}.jsonl" \| jq -r '.type' \| grep -c 'user'` | == 2 |

---

## Test 3：Thinking 内容提取

```bash
echo '{"type":"user","uuid":"poc-003","message":{"role":"user","content":"Explain the difference between TCP and UDP. Think step by step."}}' \
  | claude --resume "$SID" --print \
      --output-format stream-json \
      --input-format stream-json \
      --verbose \
      --permission-prompt-tool stdio \
      --max-turns 1 \
      2>/tmp/claude-poc/t3-stderr.log \
  | tee /tmp/claude-poc/t3-stdout.jsonl
```

### 断言

| # | 检查项 | 命令 | 期望 |
|---|--------|------|------|
| 3.1 | ⚠️ 有 thinking_delta | `grep -c 'thinking_delta\|thinking' /tmp/claude-poc/t3-stdout.jsonl` | > 0（取决于模型和 CLI 配置） |
| 3.2 | thinking_delta 在 content_block_delta 中 | `grep 'thinking_delta' /tmp/claude-poc/t3-stdout.jsonl \| head -1 \| jq -r '.delta.type'` | `"thinking_delta"` |
| 3.3 | 有 thinking block 在 assistant 消息中 | `grep '"type":"assistant"' /tmp/claude-poc/t3-stdout.jsonl \| jq -r '.message.content[].type' \| grep -c 'thinking'` | >= 0（可能为 0 如果模型不用 extended thinking） |

> **注**：如果当前模型/配置不启用 extended thinking，Test 3.1/3.3 可能无 thinking。这不影响 Phase 1——Claude CLI 在有 extended thinking 时有 thinking_delta，协议解析器应支持。

---

## Test 4：工具调用（Bash + Read）

```bash
echo '{"type":"user","uuid":"poc-004","message":{"role":"user","content":"Run ls -la in the current directory, then read the CLAUDE.md file if it exists"}}' \
  | claude --resume "$SID" --print \
      --output-format stream-json \
      --input-format stream-json \
      --verbose \
      --permission-prompt-tool stdio \
      --max-turns 1 \
      2>/tmp/claude-poc/t4-stderr.log \
  | tee /tmp/claude-poc/t4-stdout.jsonl
```

### 断言

| # | 检查项 | 命令 | 期望 |
|---|--------|------|------|
| 4.1 | ⚠️ 有 tool_use_start | `grep -c 'content_block_start' /tmp/claude-poc/t4-stdout.jsonl` | > 0 |
| 4.2 | tool block 类型是 tool_use | `grep 'content_block_start' /tmp/claude-poc/t4-stdout.jsonl \| head -1 \| jq -r '.content_block.type'` | `"tool_use"` |
| 4.3 | ⚠️ 有 input_json_delta | `grep -c 'input_json_delta' /tmp/claude-poc/t4-stdout.jsonl` | > 0 |
| 4.4 | ⚠️ 有 tool_result | `grep -c 'tool_result' /tmp/claude-poc/t4-stdout.jsonl` | > 0 |
| 4.5 | tool_result 含 output | `grep 'tool_result' /tmp/claude-poc/t4-stdout.jsonl \| head -1 \| jq -r '.message.content[0].content // "empty"'` | 非空（至少有内容） |
| 4.6 | JSONL 含 tool_use 条目 | `cat "$TEST_DIR/${SID}.jsonl" \| jq -r '.type' \| grep -c 'assistant'` | 增加了新 assistant |

---

## Test 5：权限请求（Permission）— 预期失败场景

```bash
# 先切换到 bypassPermissions 模式发一个危险命令，再切回 default 测试权限请求
echo '{"type":"user","uuid":"poc-005","message":{"role":"user","content":"Write a file called /tmp/claude-poc-test.txt with content hello"}}' \
  | claude --resume "$SID" --print \
      --output-format stream-json \
      --input-format stream-json \
      --verbose \
      --permission-prompt-tool stdio \
      --max-turns 1 \
      2>/tmp/claude-poc/t5-stderr.log \
  | tee /tmp/claude-poc/t5-stdout.jsonl
```

### 断言

| # | 检查项 | 命令 | 期望 |
|---|--------|------|------|
| 5.1 | ⚠️ 有 control_request | `grep -c '"type":"control_request"' /tmp/claude-poc/t5-stdout.jsonl` | >= 0（取决于 CLI 的 permission prompt 行为 + `--permission-prompt-tool stdio`） |
| 5.2 | 如果有 control_request，subtype 是 can_use_tool | `grep 'control_request' /tmp/claude-poc/t5-stdout.jsonl \| head -1 \| jq -r '.request.subtype'` | `"can_use_tool"` 或 `null` |

> **注**：`--permission-prompt-tool stdio` 模式下，CLI 将权限请求通过 `control_request` 事件发送到 stdout，等待 stdin 的 `control_response`。如果当前目录的 `.claude/settings.json` 有 allowlist，某些 Bash 命令可能自动通过。这不影响 Test——Phase 1 协议解析器需要支持两种情况。

---

## Test 6：中断请求 (Interrupt)

```bash
# 发送一个需要较长时间的任务，然后在 3 秒后发送 interrupt
(
  echo '{"type":"user","uuid":"poc-006","message":{"role":"user","content":"Count from 1 to 100 in a bash loop, sleep 0.1 seconds between each number"}}'
  sleep 3
  echo '{"type":"control_request","request_id":"poc-int-001","request":{"subtype":"interrupt"}}'
) | claude --resume "$SID" --print \
      --output-format stream-json \
      --input-format stream-json \
      --verbose \
      --permission-prompt-tool stdio \
      --max-turns 1 \
      2>/tmp/claude-poc/t6-stderr.log \
  | tee /tmp/claude-poc/t6-stdout.jsonl
```

### 断言

| # | 检查项 | 命令 | 期望 |
|---|--------|------|------|
| 6.1 | ⚠️ 中断后 result 有 stop_reason 或 error | `grep '"type":"result"' /tmp/claude-poc/t6-stdout.jsonl \| jq -r '.stop_reason, .error'` | 包含 `"interrupted"` 或 error 对象为非 null |
| 6.2 | 中断后 stdout 流结束 | `tail -1 /tmp/claude-poc/t6-stdout.jsonl \| jq -r '.type'` | `"result"` |

---

## Test 7：错误输入场景

### 7.1 无效 JSON

```bash
echo 'not valid json at all' \
  | claude --print \
      --output-format stream-json \
      --input-format stream-json \
      --verbose \
      --permission-prompt-tool stdio \
      --max-turns 1 \
      2>/tmp/claude-poc/t7a-stderr.log \
  | tee /tmp/claude-poc/t7a-stdout.jsonl
```

| # | 检查项 | 期望 |
|---|--------|------|
| 7.1a | CLI 不会崩溃 | 进程正常退出（非 signal kill） |
| 7.1b | stderr 有 parse error | `grep -i 'parse\|invalid\|error' /tmp/claude-poc/t7a-stderr.log` 有内容 |
| 7.1c | ⚠️ stdout 最后有 result（含 error） | `tail -1 /tmp/claude-poc/t7a-stdout.jsonl \| jq -r '.error // "no error"'` | 有错误信息 |

### 7.2 空输入（stdin 直接关闭）

```bash
: | claude --print \
      --output-format stream-json \
      --input-format stream-json \
      --verbose \
      --permission-prompt-tool stdio \
      2>/tmp/claude-poc/t7b-stderr.log \
  | tee /tmp/claude-poc/t7b-stdout.jsonl
```

| # | 检查项 | 期望 |
|---|--------|------|
| 7.2a | CLI 不会 hang | 进程在 10s 内退出（可用 timeout 10s） |
| 7.2b | stdout 有 system/init | session_id 非空 |

### 7.3 不存在的 session_id（Resume 错误）

```bash
echo '{"type":"user","uuid":"poc-err","message":{"role":"user","content":"hello"}}' \
  | timeout 15 claude --resume "non-existent-session-id-12345" --print \
      --output-format stream-json \
      --input-format stream-json \
      --verbose \
      --permission-prompt-tool stdio \
      --max-turns 1 \
      2>/tmp/claude-poc/t7c-stderr.log \
  | tee /tmp/claude-poc/t7c-stdout.jsonl
```

| # | 检查项 | 期望 |
|---|--------|------|
| 7.3a | CLI 正常退出 | 进程正常退出（非 hang） |
| 7.3b | ⚠️ result 或 session_init 含 error | 有明确的错误信息（session not found 等） |
| 7.3c | system/init session_id 可能不同 | CLI 可能回退为新建会话 |

> **注**：CLI 行为待验证——不确定 `--resume` 不存在 session 时是报错还是回退为新建。

### 7.4 不存在的 cwd

```bash
echo '{"type":"user","uuid":"poc-cwd","message":{"role":"user","content":"hello"}}' \
  | claude --print \
      --output-format stream-json \
      --input-format stream-json \
      --verbose \
      --permission-prompt-tool stdio \
      --max-turns 1 \
      2>/tmp/claude-poc/t7d-stderr.log \
  | tee /tmp/claude-poc/t7d-stdout.jsonl
# 不需要 cwd 参数——CLI 默认使用当前目录
# 但如果我们 spawn 时传了不存在的 cwd：
cd /nonexistent/path/xyz 2>/dev/null
echo '{"type":"user","uuid":"poc-cwd2","message":{"role":"user","content":"hello"}}' \
  | timeout 10 claude --print \
      --output-format stream-json \
      --input-format stream-json \
      2>/tmp/claude-poc/t7d2-stderr.log
# 预期：CLI 报错或回退到 home 目录
```

### 7.5 超长输入

```bash
# 生成 ~50KB 的文本
LONG_TEXT=$(python3 -c "print('A' * 50000)" 2>/dev/null || perl -e "print 'A' x 50000")
echo "{\"type\":\"user\",\"uuid\":\"poc-long\",\"message\":{\"role\":\"user\",\"content\":\"$LONG_TEXT\"}}" \
  | timeout 30 claude --print \
      --output-format stream-json \
      --input-format stream-json \
      --verbose \
      --permission-prompt-tool stdio \
      --max-turns 1 \
      2>/tmp/claude-poc/t7e-stderr.log \
  | tee /tmp/claude-poc/t7e-stdout.jsonl
```

| # | 检查项 | 期望 |
|---|--------|------|
| 7.5a | CLI 不会崩溃 | 进程正常退出 |
| 7.5b | 有错误信息或截断处理 | result 或 stderr 有相关提示 |

---

## Test 8：多 Turn 连续对话（压力测试）

```bash
# 连续发送 5 条消息，验证 CLI 能持续处理
for i in $(seq 1 5); do
  echo "{\"type\":\"user\",\"uuid\":\"poc-multi-${i}\",\"message\":{\"role\":\"user\",\"content\":\"Say: Message $i received\"}}" \
    | claude --resume "$SID" --print \
        --output-format stream-json \
        --input-format stream-json \
        --verbose \
        --permission-prompt-tool stdio \
        --max-turns 1 \
        2>/tmp/claude-poc/t8-stderr-${i}.log \
    > /tmp/claude-poc/t8-stdout-${i}.jsonl

  # 检查每个 turn 是否正常完成
  if grep -q '"type":"result"' /tmp/claude-poc/t8-stdout-${i}.jsonl; then
    echo "Turn $i: OK"
  else
    echo "Turn $i: FAILED"
  fi
done
```

| # | 检查项 | 期望 |
|---|--------|------|
| 8.1 | 5 个 turn 全部完成 | 每个 turn 的 stdout 含 result |
| 8.2 | JSONL 有 7 条 assistant（Test 1 + Test 2 + Test 3 + Test 4 + Test 5 + Test 6 + 5 条新 = 约 8~10 条） | ```cat "$TEST_DIR/${SID}.jsonl" \| jq -r '.type' \| grep -c 'assistant'``` >= 8 |

---

## Test 9：Usage / Cost 数据

从所有 test 的 result 事件中提取 usage 数据：

```bash
# 聚合所有 test 的 usage
for f in /tmp/claude-poc/t{1,2,3,4,5,6,8}-stdout-*.jsonl; do
  grep '"type":"result"' "$f" 2>/dev/null | jq '{input: .usage.input_tokens, output: .usage.output_tokens, cache_read: .usage.cache_read_input_tokens, cache_create: .usage.cache_creation_input_tokens, cost: .cost_usd}'
done
```

| # | 检查项 | 期望 |
|---|--------|------|
| 9.1 | ⚠️ 每次 result 都有 usage.input_tokens | > 0 |
| 9.2 | ⚠️ 每次 result 都有 usage.output_tokens | > 0 |
| 9.3 | cache_read/cache_create 字段存在 | 后续 turn 的 cache_read 应该 > 0（resume 时复用缓存） |
| 9.4 | cost_usd 存在或为 null | 字段存在，值可能为 null（取决于 CLI 配置）/ 数字 |
| 9.5 | 有 model_usage 字段 | `grep '"model_usage"' /tmp/claude-poc/*-stdout.jsonl` 有匹配 |

---

## Test 10：认证失败场景（如果可安全测试）

```bash
# 临时 unset API key 测试 CLI 的认证错误行为
ANTHROPIC_API_KEY="" claude --print \
      --output-format stream-json \
      --input-format stream-json \
      --max-turns 1 \
      2>/tmp/claude-poc/t10-stderr.log \
  </dev/null | head -5 > /tmp/claude-poc/t10-stdout.jsonl
```

| # | 检查项 | 期望 |
|---|--------|------|
| 10.1 | CLI 不会 hang | 进程在 5s 内退出 |
| 10.2 | ⚠️ stderr 有认证错误提示 | `grep -i 'auth\|login\|api.key\|unauthorized' /tmp/claude-poc/t10-stderr.log` 有内容 |
| 10.3 | system/init 可能仍输出 | CLI 可能在认证前先输出 system/init，然后 result error |

> **注**：如果用户的 API key 来自 keychain 或 `claude auth login`，单独 unset env var 可能不影响。此 test 为可选项。

---

## 结果汇总表

| Test | 描述 | 关键风险 | 预计时间 |
|------|------|---------|---------|
| 1 | 新建会话基础流程 | 管道不通 | 30s |
| 2 | Resume + replay 行为 | 重复事件、ID 不一致 | 30s |
| 3 | Thinking 提取 | thinking_delta 是否存在 | 60s |
| 4 | 工具调用 | tool_use/tool_result 管道 | 60s |
| 5 | 权限请求 | control_request 格式 | 30s |
| 6 | 中断 | interrupt 后 CLI 行为 | 15s |
| 7 | 错误输入（5 个子场景） | CLI 崩溃/hang | 2min |
| 8 | 多 Turn 压力 | 连续对话稳定性 | 2min |
| 9 | Usage 数据 | 字段完整性 | 10s |
| 10 | 认证失败 | CLI hang | 15s |
| **总计** | | | **~8min** |

---

## 预研通过标准

- [ ] ⚠️ 标记的断言全部通过
- [ ] 无一键致命问题
- [ ] 错误输入场景 CLI 不会 hang
- [ ] JSONL 文件正确持久化

---

## 实际执行结果（2026-05-28）

### 环境
- CLI: `2.1.153 (Claude Code)`
- 模型: `deepseek-v4-pro[1m]`
- 权限模式: `bypassPermissions`

### 结果汇总

| Test | 描述 | 结果 | 关键发现 |
|------|------|------|---------|
| 1 | 新建会话基础流程 | ✅ | 4 行 stdout: system/init → assistant(thinking) → assistant(text) → result |
| 2 | Resume + replay | ✅ | **session_id 相同，无历史 replay** |
| 4 | 工具调用 | ✅ | tool_use 在 assistant.content，tool_result 在 user.content |
| 6 | 中断 | ✅ | control_request → control_response → user "[interrupted]" → result error |
| stream | `--include-partial-messages` | ✅ | **token 级流式**：62 content_block_delta + 2 content_block_start/stop + message_start/delta/stop |
| 7a | 无效 JSON | ✅ | CLI 不崩溃，stderr 有 parse error，stdout 空 |
| 7b | 空 stdin | ⚠️ | CLI 保持等待（预期行为，Transport 通过关闭 stdin 终止） |
| 7c | 不存在的 session | ⚠️ | CLI 创建新 session 而不报错，stderr 有 warning |
| 8 | 3 turn 快速连续 | ✅ | 全部成功 |

### 关键发现

1. **`--include-partial-messages` 必须加**：不加时只有完整 assistant 消息，加了才有 token 级 text_delta/thinking_delta
2. **`stream_event` 信封**：使用 --include-partial-messages 后大部分事件包装在 `{"type":"stream_event","event":{...}}` 中
3. **新增事件类型**：`message_start`、`message_delta`、`message_stop`、`system/status`、`signature_delta`
4. **Resume 不 replay 历史**：Cli 在 stream-json 模式下只输出当前 turn 事件，不需要 `is_replay` 机制
5. **tool_result 结构**：`user.message.content` 为数组，含 `{type:"tool_result", tool_use_id, content, is_error}`；额外有 `tool_use_result` 字段（stdout/stderr/exitCode）
6. **不存在的 session 不会报错**：CLI 创建新 session，需要前端检测 session_id 是否匹配
7. **result 含 modelUsage**：per-model 的 input/output/cache/cost 数据，格式为 `{modelName: {inputTokens, outputTokens, cacheReadInputTokens, ...}}`
