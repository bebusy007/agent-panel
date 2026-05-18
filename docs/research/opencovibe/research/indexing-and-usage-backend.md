下面是基于 `OpenCovibe` 源码（你列出的路径）整理后的 **Bun + TypeScript 施工方案**，按 8 个 section 组织。算法与数据结构按源码行为抽取；Rust 错误处理略去。

---

# 1. 索引文件 + 缓存策略

**数据目录（与 Rust 一致）**

- `DATA_DIR = join(homedir, ".opencovibe")`（Rust：`storage/mod.rs` 的 `data_dir()`）
- `RUNS_DIR = join(DATA_DIR, "runs")`
- 单 run：`join(RUNS_DIR, runId)`，内含 `events.jsonl`、`meta.json`

**Prompt 索引**

| 项 | 值 |
|----|-----|
| 索引文件 | `DATA_DIR/prompt-index.jsonl` |
| Manifest | `DATA_DIR/prompt-index-manifest.json` |
| 每行 | 一个 JSON 对象 = `PromptEntry`（见 §2） |
| Manifest 结构 | `{ version: number, runs: Record<runId, [mtimeNs, size]>` } |

**Run 摘要索引**

| 项 | 值 |
|----|-----|
| 索引文件 | `DATA_DIR/run-index.jsonl` |
| Manifest | `DATA_DIR/run-index-manifest.json` |
| 每行 | 一个 `RunIndexEntry`（见 §3） |
| Manifest 结构 | `{ version: number, runs: Record<runId, [evMtimeNs, evSize, metaMtimeNs, metaSize]>` } |

**增量比较（指纹）**

```ts
// 伪代码：单文件指纹（Rust 用 ns；TS 可用 mtimeMs + size）
type Fingerprint = { mtime: number; size: number }; // 或 bigint for ns

function fileFingerprint(path: string): Fingerprint | null {
  const st = statSync(path); // 或 fs.promises.stat
  return { mtime: st.mtimeMs, size: st.size };
}

// Prompt：manifest.runs[runId] === fingerprint(events.jsonl) 且磁盘上已有该 run 的旧索引行 → 复用
// Run：双指纹相等且 manifest 有记录且索引里已有该 run → 复用
```

**Manifest 版本号**

- `prompt_index`: `MANIFEST_VERSION = 3`，读入后若 `version !== 3` → 清空 `runs`，全量重扫。
- `run_index`: `MANIFEST_VERSION = 1`，同理。

**内存缓存**

- TTL：**120 秒**（`CACHE_TTL_SECS`）。
- 结构：`{ computedAt: number /* ms epoch */, entries: T[] }`，模块级单例 + `Mutex` 等价物（见 §8）。
- **失效**：`prompt_index` 无单独 `invalidate`；仅靠 TTL + 下次 `build_or_update` 时 manifest 比对。`run_index` 提供 `invalidate_cache()` 将缓存置 `null`（源码中**未**被其它模块调用，但实现上可在「run 结束」时调用以立即刷新）。
- **重建触发**：缓存过期，或 manifest/指纹不匹配，或新 run / 删除 run。

**COMPUTE_LOCK**

- 第二个 `Mutex<()>`：`build_or_update_index` 在 TTL 快路径之后、`double-check` 之后 **持有**，直到写完磁盘并更新内存缓存。
- 避免并发两次全量扫描/写盘。

**Atomic write（与 Rust 一致）**

```ts
async function writeAtomic(path: string, content: string) {
  const tmp = path.replace(/(\.[^/.]+)?$/, "") + ".tmp"; // Rust: path.with_extension("tmp")
  await Bun.write(tmp, content);
  await chmod(tmp, 0o600); // Unix
  await rename(tmp, path);
}
```

- `prompt`/`run` manifest 与 index：先写 `.tmp`，`chmod 0o600`，`rename` 覆盖目标。

**Claude 全局用量磁盘缓存（§5）**

- `DATA_DIR/usage-scan-cache.json`，版本字段 `DISK_CACHE_VERSION = 1`。
- 写法：`path.withExtension('json.tmp')` 再 `rename`（**无** chmod，与 Rust `write_disk_cache` 一致）。

---

# 2. PromptIndex 详解

**`PromptEntry`**

```ts
type PromptEntry = {
  run_id: string;
  seq: number;       // 本文件内递增，仅用于排序/收藏键
  ts: string;        // 信封上的 ts（ISO）
  text: string;      // 截断后正文
  event_id?: string; // user_message → uuid；message_complete → message_id
};
```

**从 `events.jsonl` 抽消息**

1. 按行读；空行跳过。
2. **子串预筛**（避免整行 JSON）：至少满足其一  
   - `"user_message"`  
   - `"message_complete"`  
   - `"type":"user"` 且不含 `"_bus"`（legacy）
3. 解析 JSON。

**Bus 格式** `{"_bus":true,"seq":...,"ts":"...","event":{...}}`

- 取 `inner = event.event`，`inner.type`：
  - **`user_message`** / **`message_complete`**：取 `inner.text`（非空）。
  - **`message_complete`**：若存在 `parent_tool_use_id`（字符串）→ **跳过**（子 agent 输出）。
- `ts`：外层 `ts`。
- **event_id**：`user_message` → `inner.uuid`；`message_complete` → `inner.message_id`。

**Legacy**（非 bus）：`type === "user"`，文本在 `payload.text`，时间戳 `timestamp`。

**截断**

- `MAX_TEXT_LEN = 500`。
- 若 `text.length > 500`：`text.slice(0, floorCharBoundary(text, 500)) + "…"`（注意是 Unicode 省略号 `…`，不是 `...`）。

```ts
function floorCharBoundary(s: string, byteIdx: number): number {
  if (byteIdx >= s.length) return s.length;
  let i = byteIdx;
  // JS 用 code unit；若落在 surrogate 中间则回退 —— 与 Rust 按 char boundary 等价可改用 for...of 数「字符」再切片
  while (i > 0 && (s.charCodeAt(i) & 0xfc00) === 0xdc00) i--;
  return i;
}
```

（更稳妥：按 **Unicode 标量** 数 500 个字符再切，与 Rust `floor_char_boundary` 在 UTF-8 边界语义一致。）

**增量重建条件**

- 遍历 `RUNS_DIR` 子目录；需存在 `events.jsonl`。
- 读 `meta.json`：若 `deleted_at` 有值 → **跳过**整个 run。
- `fingerprint(events.jsonl)` 与 `manifest.runs[runId]` 一致 **且** 能从 `prompt-index.jsonl` 拆出的该 run 条目仍在 `existing_by_run` → **复用**旧条目。
- 否则：对该文件调用 `scan_events_file`，并更新 manifest 中该 run 的指纹。
- 扫描结束后：`manifest.runs` 只保留当前仍存在的 `run_id`。

**指纹格式**

- Rust：`(mtime_ns, size)`。TS 可改为 `(mtimeMs, size)`，manifest 字段名可仍用数组两项。

---

# 3. RunIndex 详解

**`RunIndexEntry` 全字段**（与 `run_index.rs` 一致）

```ts
type RunIndexEntry = {
  run_id: string;
  cwd: string;
  agent: string;                    // meta 默认 "claude"
  model: string | null;
  status: RunStatus;
  started_at: string;
  ended_at: string | null;
  name: string | null;
  prompt_preview: string;           // meta.prompt 截断 100 + "..."
  tools_used: string[];             // 去重后排序
  tool_call_count: number;
  files_touched: string[];          // 去重后排序
  total_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  num_turns: number;
  error_summary: string | null;     // run_state.error 截断 200 + "..."
  has_errors: boolean;
  permission_denied_count: number;
};
```

**`meta.json` 基线**

- `cwd, agent, model, status, started_at, ended_at, name, prompt` → `prompt_preview`（100 字符 + `floor_char_boundary` + `"..."`）。
- `source === "cli_import"` → **按轮成本** `is_per_turn_cost = true`，否则为 **累计成本**模式。

**扫描 `events.jsonl`（仅处理相关行）**

子串预筛至少含其一：`tool_start` / `tool_end` / `files_persisted` / `usage_update` / `run_state` / `permission_denied` / `user_message`。

信封：`_bus === true` → `inner = envelope.event`，否则 `inner = envelope`。

| `inner.type` | 行为 |
|----------------|------|
| `tool_start` | `tools_set.add(tool_name)`；`tool_call_count++`；`input.file_path` → `files_set` |
| `tool_end` | `tool_use_result.filePath` → `files_set` |
| `files_persisted` | `files[].filename` → `files_set` |
| `usage_update` | 见下 |
| `run_state` | 若有 `error` 字符串 → `has_errors=true`，`error_summary` 截断 200 |
| `permission_denied` | `permission_denied_count++` |
| `user_message` | `num_turns++`（备用） |

**`usage_update` 成本与 token**

- **cli_import**：`total_cost_usd` **按轮相加**；`input_tokens`/`output_tokens` **累加**；`duration_ms` **累加**。
- **原生（累计）**：维护 `prev_cost`, `peak_cost`：若 `cost < prev_cost * 0.9 && prev_cost > 0` → `total_cost += peak_cost; peak_cost = 0`；若 `cost > peak_cost` → `peak_cost = cost`；`prev_cost = cost`。扫完后 **`total_cost += peak_cost`**。  
  Token：`input_tokens`/`output_tokens` **取最后一次出现的值**（覆盖）。  
  `duration_ms`：每条有则 **累加**。  
  `num_turns`：取最后一次 `num_turns`。

**收尾**

- `final_num_turns = last_num_turns > 0 ? last_num_turns : num_turns`（来自 `user_message` 计数）。
- `duration_ms`：若 `total_duration_ms > 0` 用它；否则 `calcDurationMs(started_at, ended_at)`（RFC3339 解析）。

**双指纹增量**

- 需同时存在 `events.jsonl` 与 `meta.json`。
- `current_fp = (events_fp, meta_fp)` 四元组与 manifest 一致且索引中有该 run → 复用整行 `RunIndexEntry`。
- 软删：`deleted_at` 有值 → 跳过。

---

# 4. 搜索 API（`commands/history.rs` + `search_prompts` 在 `commands/runs.rs`）

**`search_runs(filters)` → `RunSearchFilters`（camelCase 反序列化）**

```ts
type RunSearchFilters = {
  query?: string;
  projects?: string[];
  tools?: string[];
  dateFrom?: string;    // 与 started_at 字符串比较 >=
  dateTo?: string;      // 与 started_at 字符串比较 <=
  costMin?: number;
  costMax?: number;
  statuses?: RunStatus[];
  hasErrors?: boolean;
  agents?: string[];
  sortBy?: string;      // "date" | "cost" | "tokens" | "turns" | default "date"
  sortAsc?: boolean;    // default false
  limit?: number;       // default 50
  offset?: number;      // default 0
};
```

**流程**

1. `entries = buildOrUpdateRunIndex()`（阻塞线程池在 Rust；Bun 里可直接 async 或 `queueMicrotask` 里算）。
2. **`facets = computeFacets(entries)` 用全部 entries（不过滤）。**
3. `filtered = applyFilters(entries, filters)`。
4. `totalMatching = filtered.length`。
5. `sortEntries(filtered, filters)`。
6. `page = filtered.slice(offset, offset + limit)`。
7. 映射为 `RunSearchResult`（含 `files_touched_count` = `files_touched.length`）。

**`query` 过滤（无 BM25）**

- `tokens = query.split(/\s+/).map(t => t.toLowerCase()).filter(Boolean)`。
- 若 `tokens.length > 0`：要求 **`tokens.some(token => ...)`** —— 即 **任意一个 token** 在下列任一字段子串匹配即通过：  
  `prompt_preview`、`name`、`cwd`、任一 `files_touched`（均小写化）。  
  （多 token 是 **OR**，不是 AND。）

**`projects`**

- `pathMatchesProject(cwd, p)`：`normalize` 后相等，或以 `filter + "/"` 为前缀（边界匹配，避免 `/repo/ab` 匹配 `/repo/a`）。

**`tools`**

- `filters.tools` 非空时：`filters.tools.some(t => entry.tools_used.includes(t))`。

**`sort_by`**

- `cost`：`total_cost_usd`  
- `tokens`：`input_tokens + output_tokens`  
- `turns`：`num_turns`  
- 默认 `date`：`started_at` 字符串比较  
- `sortAsc === false`（默认）→ 降序。

**`search_prompts(query, limit)`**（在 `runs.rs`，不是 `history.rs`）

1. `buildOrUpdatePromptIndex()`。
2. `matched = entries.filter(e => e.text.toLowerCase().includes(queryLower))` —— **整段 query 子串**，**不**拆 token。
3. Join `list_all_run_metas` → `meta_map`。
4. Join `favorites` → `(run_id, seq)` set。
5. 排序：**`matched_ts` 字符串降序**（ISO 时间字符串字典序即时间序）。
6. `limit` 默认 **100**，`truncate`。

**Facets 算法**

- **projects**：按 `cwd` 计数。
- **tools**：每个 run 的 `tools_used` 里每个 tool 计数 +1。
- **agents**：按 `agent` 计数。
- **cost_range**：`[min total_cost_usd, max]`，无条目时 `[0,0]`。
- **date_range**：`[earliest started_at, latest started_at]`，空字符串若无数。
- **total_runs**：`entries.length`。
- **total_cost**：所有 `total_cost_usd` 之和。
- 各 facet 列表按 **count 降序**。

---

# 5. `claude_usage.rs`（全局 Claude Code 用量）

**扫描路径**

- `HOME/.claude/projects/**/*.jsonl` **递归**；**跳过**名为 `memory` 的子目录。

**每文件元数据**

- 先列所有 jsonl：`(path, mtimeNs, size)`，不读内容。

**磁盘缓存 `usage-scan-cache.json`**

```ts
type DiskCache = {
  version: 1;
  manifest: Record<string, [number, number]>; // path -> [mtime, size]
  per_file: Record<string, FileData>;
};
type FileData = {
  daily_tokens: Record<string, Record<string, TokenCounts>>; // date -> model -> counts
  daily_messages: Record<string, number>; // date -> msg count
};
type TokenCounts = {
  input: number;
  output: number;
  cache_read: number;
  cache_create: number;
};
```

- 若 `manifest[path]` 与当前 `[mtime, size]` 一致且 `per_file[path]` 存在 → **复用**；否则 **scan_single_jsonl_standalone**。

**`scan_single_jsonl` 单行逻辑**

1. 若行含 `"role":"user"` 或 `"role":"assistant"` → 用 `extract_date_fast`（找 `"timestamp":"` 后 10 位 `YYYY-MM-DD`）→ `daily_messages[date]++`。
2. 若不含 `"cache_read_input_tokens"` → **跳过** token 聚合。
3. 解析为：`timestamp`, `message.model`, `message.usage`（`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`）。
4. `model` 非空；`timestamp` 至少 10 字符 → `date = timestamp.slice(0, 10)`。
5. 累加到 `daily_tokens[date][model]`。

**合并 `merge_all_file_data`**

- 按日期、模型合并 token。
- **会话数**：每个文件路径在每个日期最多算 1 次 session → `daily_sessions[date].add(file_path)`，最后 `sessions = set.size`。
- **消息数**：各文件 `daily_messages` 相加 → `daily_messages_agg`。

**`read_activity_data`**

- `~/.claude/stats-cache.json`：`totalSessions`, `dailyActivity[]` → `{ date, messageCount, sessionCount, toolCallCount }` 映射。

**`build_overview`（`read_global_usage(days)`）**

- **日期窗口**：`cutoff = today_utc - (days - 1)` 天（`days` 为 `1` 表示仅今天）；`days === undefined` → 不过滤日期。
- 合并 `daily_model` 与 `daily_activity` 的日期键（并集）。
- 对每个在范围内的日期：
  - 从 token 算 `day_cost` = 各模型 `estimate_cost(...)` 之和。
  - Activity：**优先** `stats-cache` 的 `(msg, sess, tool)`；**否则** 用 scan 的 `(msgs, sessions)`，`tool_call_count` 为 0。
- **`DailyAggregate`**：`date`, `cost_usd`, `runs`（此处字段名是 `runs`，语义为 **session 数**）, `input_tokens`, `output_tokens`, `message_count`, `session_count`, `tool_call_count`（仅当 tool>0 时设 Some）, `model_breakdown`。
- **最后 30 条** `daily_aggs`：填充 `model_breakdown`（`daily_model[date]` → `ModelTokens`）。
- **by_model**：跨日汇总 token → `estimate_cost` → `pct = cost / total_cost` → 按 cost 降序。
- **`total_runs`**：若 `days` 有值 → 用过滤后的 `filtered_sessions` 之和；否则用 `stats-cache.total_sessions`。
- **`avg_cost_per_run`**：`total_cost / total_runs`。
- **`runs`**：全局模式下恒为 **`[]`**。
- **`scan_mode`**：无磁盘缓存 → `"full"`；有缓存且有脏文件 → `"incremental"`；全净 → `"disk"`；纯内存命中 → `"memory"`（在检查内存缓存时提前返回）。

**`compute_streaks(daily, anchorDate)`**

- **活跃日**：`input_tokens + output_tokens > 0 || message_count > 0 || runs > 0`。
- `active_days` = 活跃日期集合大小。
- **current_streak**：从 `anchor` 往前：若当天活跃则 +1 并继续前一天；若 anchor 不活跃则 **仅**再试前一天（给「今天未用但昨天用了」的情况），再断则停。
- **longest_streak**：活跃日期排序后扫连续段，取最长长度。

**内存缓存**

- TTL **120s**；命中则 `build_overview(cached, days)`，`scan_mode = "memory"`。

**锁**

- `read_global_usage` **整个函数**在 `COMPUTE_LOCK` 内（与 prompt/run index 只在重建时持锁不同）。

---

# 6. `pricing.rs`

**结构**

```ts
type ModelPricing = {
  input: number;       // $ per 1M tokens
  output: number;
  cache_read: number;
  cache_write: number;
};

function claudePricing(input: number, output: number): ModelPricing {
  return {
    input,
    output,
    cache_read: input * 0.1,
    cache_write: input * 1.25,
  };
}
```

**`getPricing(model: string): ModelPricing`** —— 按 **子串** `model.contains` 顺序匹配（与源码一致），摘要：

- Opus 4.6 / 4.5 / 4.5 写法变体 → `(5, 25)`
- 其它 `opus` → `(15, 75)`
- `haiku` → `(0.8, 4)` + claude 派生 cache
- `sonnet` → `(3, 15)` + 派生
- `gpt-4o` → `(2.5, 10)`；`gpt-4` → `(10, 30)`；`o1`/`o3` → `(15, 60)`
- DeepSeek / Kimi / GLM / Qwen / DouBao / MiniMax / MiMo 等：**见源码固定表**（`glm-4.5-flash` 全 0 等）
- **默认**：`claudePricing(3, 15)`（未知模型当 Sonnet）

**`estimateCost(model, input, output, cacheRead, cacheWrite): number`**

```ts
function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): number {
  const p = getPricing(model);
  return (
    inputTokens * p.input +
    outputTokens * p.output +
    cacheReadTokens * p.cache_read +
    cacheWriteTokens * p.cache_write
  ) / 1_000_000;
}
```

---

# 7. UsageOverview API

**`getUsageOverview(days?)`**（`commands/stats.rs`）

- 输入：`days?: number`（与全局相同的 cutoff 语义）。
- 数据：**仅 OpenCovibe app runs**：`list_all_run_metas()`，对每个 run `extract_run_usage(run_id)`（读 **应用** 的 `events.jsonl`）。
- **按 run 的 `started_at` 解析为 UTC 日期** 过滤；不过滤则全收。
- 聚合：
  - `total_cost`, `total_tokens`（仅 input+output）
  - `by_model`：来自 **`usage.model_usage` 每个模型** 的 `runs++`（每 run 每模型一条计数）、token、cost_usd 累加；`pct` 相对总 cost；按 cost 降序。
  - `daily`：`BTreeMap` 按 **started_at 的日期** 桶聚合 cost/runs/tokens；**无** message/session/tool、`model_breakdown`。
  - `runs`：`RunUsageSummary[]`，按 `started_at` 降序。
- **`scan_mode`**：未设（序列化可省略）。
- **`active_days`, `current_streak`, `longest_streak`**：对 **`daily`** 调用 `compute_streaks`（注意 streak 用的是 **聚合后的 daily**，无 message 时仅靠 tokens/runs）。

**`getGlobalUsageOverview(days?)`**

- 直接 `read_global_usage(days)`；结构同 `UsageOverview`，但 `runs: []`，`scan_mode` 有值。

**`UsageOverview` 完整形状（camelCase）**

```ts
type UsageOverview = {
  totalCostUsd: number;
  totalTokens: number;
  totalRuns: number;
  avgCostPerRun: number;
  byModel: ModelAggregate[];
  daily: DailyAggregate[];
  runs: RunUsageSummary[];
  scanMode?: string;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
};
```

**`getHeatmapDaily(scope)`**

- `scope === "global"`：`read_global_usage(Some(365))` → 取 `daily`。
- `scope === "app"`：`get_app_heatmap_daily()`：cutoff = **今天 UTC − 364 天**，对每个 meta `extract_run_usage`，按 **started_at 日期** 聚合。
- 然后 **`prepare_heatmap_daily`**：每条去掉 `model_breakdown`，按 `date` 升序，若长度 **> 365** 则 **只保留最后 365 条**。

**缓存 key（概念）**

- 全局：**单例内存** `CachedData` + 磁盘 **`usage-scan-cache.json`**（整文件 manifest + per_file）。
- App 用量：**无**额外缓存，每次算（可自建 memo）。
- Prompt/Run 索引：内存 **`CachedIndex`** + 磁盘 **`prompt-index-manifest.json` / `run-index-manifest.json`**。

---

# 8. Bun TypeScript 翻译要点

**对应关系**

| Rust | TS/Bun |
|------|--------|
| `std::fs` / `BufRead::lines` | `fs.createReadStream` + `readline`；或 `Bun.file(path).stream()` 按行 |
| `Mutex<Option<C>>` | `async-mutex` 或单线程事件循环下简单 `let cache` + 自己锁；Bun 多 worker 需真正的 mutex |
| `LazyLock` | 模块顶层 `let cache: Cache \| undefined` + `function getCache()` |
| `spawn_blocking` | CPU 重活用 `Worker` 或 `setImmediate` 避免阻塞主线程 |

**性能**

- **jsonl 必须流式**，不要 `readFileSync` 整文件（除极小文件）；与 Rust `BufReader` 一致。
- `prompt_index`/`run_index` 的 on-disk 索引在实现里是一次性读入字符串再 `split('\n')` —— TS 可同样或流式写；**扫描源 events.jsonl** 应流式。

**Atomic write**

- `Bun.write(path)` 直接写目标**不一定**原子替换；生产应用应对 **`*.tmp` → rename** 与 Rust 一致。

**指纹**

- 使用 **`mtimeMs` + `size`** 即可；manifest 存 `[mtimeMs, size]`，不必 ns。

**Chokidar / 高频重建**

- 依赖 **120s TTL + manifest 指纹**，短时间多次 `build` 只会命中缓存。
- 文件监听回调里 **debounce**（例如 300–500ms）再调用 `build_or_update`；或 **合并**同一 run 的多次变更。
- 与 Rust 一样：**COMPUTE_LOCK** 合并并发重建为单次。

**`events.jsonl` 写入（`events.rs`）**

- 路径：`run_dir/events.jsonl`。
- Bus 行：`{ _bus, seq, ts, event }`；`append` 换行。
- `next_seq`：文件尾 **最多读最后 4096 字节** 找最大 `seq`+1（注意 UTF-8 边界与首行可能截断）。
- `EventWriter`：**每 run 一把锁**，seq 与 append 同事务。

**`runs.rs` 列表 API**

- `list_runs`：`list_runs()` 读各 `meta.json`，`summarize_events`：**小文件全读**；大文件只读 **最后 8192 字节**，第一行丢弃（可能半截），统计 `user_message`/`message_complete`/legacy user/assistant 子串计 **msg_count**，解析最后预览等。

---

以上内容可直接作为 Bun 后端「对照实现」清单；若你需要把 `RunStatus` / `TaskRun` 的 JSON 形状也对齐，可再打开 `models.rs` 里 `TaskRun` / `RunMeta` 做字段级对照（本次已覆盖索引、搜索、统计核心算法）。

[REDACTED]