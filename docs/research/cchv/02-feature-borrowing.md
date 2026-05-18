# 02 - 值得借鉴的功能点

## 1. 工具结果分类渲染器 (toolResultRenderer)

### CCHV 实现

20 个专门的渲染器，每种工具类型有针对性的 UI：

| 渲染器 | 展示方式 |
|---|---|
| FileEditRenderer | 带行号的 diff view，展示修改前后对比 |
| TerminalStreamRenderer | ANSI 转 HTML，真实终端着色 |
| WebSearchRenderer | 搜索结果卡片（标题+摘要+链接） |
| MCPRenderer | MCP 工具调用的结构化展示 |
| AgentTaskGroupRenderer | Sub-agent 的任务卡片组 |
| TodoUpdateRenderer | 任务状态变更可视化 |
| GitWorkflowRenderer | Git 操作的专门展示 |
| StructuredPatchRenderer | 结构化 patch 格式 |
| FallbackRenderer | 兜底：原始 JSON |

### 我们可以借鉴什么

我们已有 ToolCard 体系，但颗粒度不够。可以参考：
- **FileEdit**：用 `diff` 库或 `react-diff-viewer-continued` 做真正的 diff 渲染
- **Terminal/Bash**：用 `ansi-to-html` 做终端色彩还原
- **WebSearch**：结构化卡片而非原始 JSON dump
- **Agent/SubAgent**：嵌套会话的折叠展示

### 优先级：中

我们当前的工具卡已经能用，这块是锦上添花。

---

## 2. 全局搜索

### CCHV 实现

- 后端 (Rust)：`aho-corasick` 多模式匹配，按 mtime 增量更新索引
- 前端：`flexsearch` 做客户端全文搜索
- 支持按 provider / project / 日期 / 工具类型 过滤
- 搜索结果高亮 + 跳转到消息位置

### 我们可以借鉴什么

我们目前的搜索是简单的字符串匹配，没有索引。可以：
1. 在 Bun 端维护一个 `sessions-index.jsonl`（已经有雏形）
2. 前端引入 `flexsearch` 做即时搜索
3. 支持 faceted search（按来源、日期、工具过滤）

### 优先级：高

搜索是高频需求，目前体验确实不够好。

---

## 3. Session Board 多会话可视化

### CCHV 实现

- 像素级 session 时间线：每个 session 一行像素条，颜色编码活跃度
- Attribute brushing：选中一组 session 高亮其共同属性
- Activity timeline：跨 session 的时间轴重叠展示

### 我们可以借鉴什么

我们的 Dashboard 目前是统计卡片 + heatmap。可以增加：
- Session 时间线视图（像素条形式）
- 多 session 并排对比

### 优先级：低

用户量级还不需要这么强的可视化分析。

---

## 4. Message Navigator（消息导航器）

### CCHV 实现

右侧可折叠的 TOC，列出所有 turn 的摘要（human 消息前几个字 + assistant 工具调用摘要）。点击跳转到对应位置。

### 我们可以借鉴什么

我们的 session 详情页左侧已经有 turn 列表。思路一致，但可以优化：
- 增加工具调用图标标识
- 长会话支持虚拟滚动

### 优先级：低（已有类似实现）

---

## 5. Sub-agent 过滤开关

### CCHV 实现

Header 下拉菜单里有 toggle，可以隐藏/显示 sub-agent 消息。对于有大量 Agent tool 调用的会话很实用。

### 我们可以借鉴什么

我们已有 sub-agent 会话的独立查看功能（点击进入子会话详情）。可以额外加一个"在父会话中折叠/展开 sub-agent 内容"的开关。

### 优先级：中

---

## 6. Recent Edits Viewer

### CCHV 实现

汇总所有 session 中的文件编辑操作，按文件/时间聚合展示。可以看到"最近哪些文件被 AI 改过"。

### 我们可以借鉴什么

这是个有意思的视角——跨 session 的文件维度聚合。可以作为 Dashboard 的一个新 tab。

### 优先级：中低

---

## 7. Settings Manager

### CCHV 实现

Scope-aware 的 Claude Code 设置编辑器 + MCP server 管理 UI。可以查看和修改 `~/.claude/settings.json`。

### 我们可以借鉴什么

我们目前对 settings 是只读展示。CCHV 能编辑设置，但这会打破我们"只读看板"的定位。不建议照搬。

如果要做，最多做到"查看各 scope 的设置合并结果"——帮用户理解最终生效的配置。

### 优先级：不推荐

---

## 8. Provider 过滤 + 统一视图

### CCHV 实现

顶部有 provider 筛选器（chip 样式），可以只看某个 provider 的会话，也可以混合查看。Analytics 页面也支持按 provider 分组统计。

### 我们可以借鉴什么

我们的 sessions 页面有来源 badge 但没有 provider 筛选器。可以加一个过滤栏。

### 优先级：中

---

## 总结：借鉴优先级排序

| 优先级 | 功能 | 原因 |
|---|---|---|
| **高** | 全局搜索增强 | 高频需求，体验差距明显 |
| **中** | 工具结果渲染器细化 | 提升会话详情页的展示质量 |
| **中** | Sub-agent 过滤开关 | 低成本高收益 |
| **中** | Provider 过滤器 | 会话多了之后筛选需求强 |
| **中低** | Recent Edits 视图 | 有意思但非刚需 |
| **低** | Session Board 可视化 | 用户量级不需要 |
| **低** | Message Navigator 优化 | 已有类似实现 |
| **不推荐** | Settings 编辑 | 打破只读定位 |
