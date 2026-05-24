# Agent Panel — PRD

## 产品定位

Agent Panel 是一个本地只读看板，聚合 AI 编程 Agent（Claude Code、Cursor、Codex）的会话记录、Skills、MCP、用量数据。不上传、不遥测、不改用户文件。

**当前形态：查看器（Viewer）** — 只读，不做编辑/创作。

---

## 目标用户

使用 AI 编程 Agent 的开发者。核心场景：

- 日常用 Claude Code / Cursor / Codex 写代码，会话记录散落各处
- 需要回溯历史对话、查找某次操作、对比不同 agent 的表现
- 需要了解自己的 token 消耗、使用热力图
- 需要查看和管理本机的 Skills、MCP、Hooks、Agents 配置

---

## 核心功能（当前已实现）

| 模块 | 说明 |
|------|------|
| 概览 | 统计卡 + 来源分布 + 活动热力图 |
| 会话 | 按项目分组浏览，三栏详情（轮次/消息流/工具-文件-信息面板） |
| 搜索 | 跨会话全文搜索，多维筛选，点击锚定 |
| 用量 | 概览卡 + 365 天热力图 + 30 天趋势 + 按来源/模型统计 |
| 扩展 | Skills / MCP / Hooks / 自定义 Agents 全局扫描浏览 |
| 收藏 | 消息收藏，集中查看，跳回原会话定位 |

---

## 性能基准

基于 579 个会话文件、277MB 数据的实测：

| 指标 | 数值 |
|------|------|
| 全量扫描 | 271ms |
| 缓存命中响应 | <1ms |
| 全文搜索（3349 条） | 185ms |
| 大会话加载（2425 条消息，10MB） | 61ms |
| 内存占用 | 41MB |
| 桌面 App 体积 | 8.3MB |

---

## 数据源

| 来源 | 路径 | 数据 |
|------|------|------|
| Claude Code | `~/.claude/projects/` | 完整对话 + 工具调用 + token |
| Cursor Agent | `~/.cursor/projects/*/agent-transcripts/` | 完整对话 + 工具调用 |
| Codex | `~/.codex/sessions/` | 完整对话 + 工具调用 |
| Skills | `~/.claude/skills/`、`~/.cursor/skills-cursor/` | Skill 定义 + 触发词 |
| MCP | `~/.claude/settings.json`、`~/.cursor/mcp.json` | Server 配置 + 工具列表 |
| Hooks & Agents | `~/.claude/settings.json`、`~/.claude/agents/` | Hook 规则 + Agent 定义 |

---

## 非目标（当前不做）

- 在线/云端同步（保持本地）
- 编辑/修改 agent 配置文件（保持只读）
- 在 Panel 内直接与 agent 交互（保持查看器定位）
- 多用户/团队功能

---

## 未来方向（待规划）

见 `ROADMAP.md`。
