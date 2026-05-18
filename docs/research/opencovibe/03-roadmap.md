# 03 · 升级路线图

> 这份路线图把"借鉴方案"拆成可执行的阶段任务。每个阶段都是**独立可发布版本**，做完一个就有新东西能用，不是一定要全做完才看效果。

## 阶段总览

| 阶段 | 主题 | 估时 | 风险 | 可独立交付 |
|---|---|---|---|---|
| **P0** | 基础重构：双层 sidebar + 项目文件夹树 | 3-4 天 | 低 | ✅ |
| **P1** | 会话详情整页 + 工具卡片美化 | 5-7 天 | 中 | ✅ |
| **P2** | 持久化索引 + 高级搜索 | 3-4 天 | 中 | ✅ |
| **P3** | 用量统计页 | 3-4 天 | 中 | ✅ |
| **P4** | 扩展面板（Skills + MCP + Hooks + Plugins + Agents） | 4-5 天 | 中 | ✅ |
| **P5** | 改名 agent-panel + 文档 + CLI 别名 | 1 天 | 低 | ✅ |

合计 **~20 工作日**（一个人，按熟悉度估）。可以并行做 P3 + P4。

---

## P0 · 基础重构

### 目标

把 `Layout.tsx` 从单层 nav 改成 **44px 图标栏 + 220px 内容栏** 的双层 sidebar，左侧栏永久存在；引入"按 cwd 分组"的项目文件夹树，给后面的页面做铺垫。

### 任务

| # | 任务 | 涉及文件 |
|---|---|---|
| 1 | 翻译 `sidebar-groups.ts` (TS, 纯函数 + 单测) | 🆕 `web/src/lib/sidebar-groups.ts` |
| 2 | 重构 Layout 为双层 | ♻️ `web/src/components/Layout.tsx` |
| 3 | `IconRail` 组件（44px 图标列） | 🆕 `web/src/components/sidebar/IconRail.tsx` |
| 4 | `SidebarPanel` 组件（220px，按当前路由切换内容） | 🆕 `web/src/components/sidebar/SidebarPanel.tsx` |
| 5 | `ProjectFolderTree` + `ProjectFolderItem` | 🆕 `web/src/components/sidebar/Project*.tsx` |
| 6 | localStorage 状态：expanded/pinned/removed cwds | 🆕 `web/src/lib/sidebar-state.ts` |
| 7 | sidebar 宽度可拖拽 + 折叠（抄 OpenCovibe）| ♻️ Layout |
| 8 | 把 SessionsView 从内联 source filter 改成"sidebar 顶部搜索 + 树" | ♻️ `web/src/pages/SessionsView.tsx` |

### 验收

- 进入 `/sessions`，左栏是项目文件夹树；点击文件夹展开 conversations；点 conversation 仍打开 drawer（先保留，P1 改）；
- localStorage 持久化展开/pinned 状态；
- 浏览器刷新后状态恢复；
- 其他页面（概览/Skills/MCPs/收藏）左栏内容根据当前路由切换。

---

## P1 · 会话详情整页 + 工具卡片美化

### 目标

把详情从 drawer 改成整页 `/sessions/:id`；引入三栏布局（左轮次 / 中消息 / 右工具栏）；按工具类型美化卡片。

### 任务

#### 路由 / 页面

| # | 任务 | 涉及文件 |
|---|---|---|
| 1 | 新路由 `/sessions/:id` | ♻️ `web/src/main.tsx` |
| 2 | `SessionDetailView.tsx` 三栏布局 | 🆕 page |
| 3 | `TurnSidebar.tsx` 左侧轮次栏（含定位 + 当前 turn 高亮 IntersectionObserver） | 🆕 component |
| 4 | 把 `SessionDetail.tsx` 拆出"消息流"部分，剥离 drawer 套子 | ♻️ component |
| 5 | 顶部 toolbar：标题 + 来源 + cwd + Resume + 删除 | 🆕 `SessionDetailHeader.tsx` |

#### 右侧栏

| # | 任务 | 涉及文件 |
|---|---|---|
| 6 | `RightSidebar.tsx` 4 tab 容器 | 🆕 component |
| 7 | ToolsTab：抄 `ToolActivity` 的 turn 分组 + 工具树 | 🆕 |
| 8 | FilesTab：抄 `FilesPanel`（103 行直接译） | 🆕 |
| 9 | InfoTab：会话元数据 + 复制 sessionId | 🆕 |
| 10 | ContextTab（可选，先放）：per-turn token 用量 | 🆕 |

#### 工具卡片

| # | 任务 | 涉及文件 |
|---|---|---|
| 11 | `tool-colors.ts` 颜色映射（抄 OpenCovibe） | 🆕 `web/src/lib/tool-colors.ts` |
| 12 | `tool-rendering.ts` 工具函数（getToolDetail / getLanguageFromPath / canonicalTool） | 🆕 |
| 13 | `ToolCard.tsx` dispatcher | 🆕 |
| 14 | `ToolCardHeader.tsx` 头部（图标 + 名字 + detail + 视图切换 + 复制） | 🆕 |
| 15 | `cards/ReadCard.tsx` 行号渲染 | 🆕 |
| 16 | `cards/EditCard.tsx` diff table（用 `diff` 包） | 🆕 + `npm i diff` |
| 17 | `cards/BashCard.tsx` ANSI + shell colorize | 🆕 + `npm i ansi-to-html` |
| 18 | `cards/GrepCard.tsx` `WriteCard.tsx` `WebFetchCard.tsx` `TodoWriteCard.tsx` `TaskCard.tsx` | 🆕 |
| 19 | `cards/DefaultCard.tsx` JSON 美化 + fallback | 🆕 |
| 20 | `RawJsonView.tsx` 共用的"原始 JSON"切换视图 | 🆕 |
| 21 | 接到 `SessionDetail.tsx` 的消息流，把现有 tool_use/tool_result 渲染替换 | ♻️ |

#### 跨 agent 适配

| # | 任务 |
|---|---|
| 22 | `TOOL_ALIASES` 映射 cursor `read_file` → `Read` 等 |
| 23 | 同步 server 端 `loader.ts`：把 cursor/codex 工具调用归一到 `tool_use` role |

### 验收

- 点击 session 卡片进入 `/sessions/:id`；
- 左轮次栏可点击跳转，IntersectionObserver 高亮当前 turn；
- 工具调用按类型显示（Edit 是 diff、Read 是行号代码、Bash 是带 ANSI 的 shell 输出）；
- 每张工具卡右上有"美化 / 原始 JSON"切换；
- 右栏 Tools tab 工具列表 + 点击滚到对应 tool 卡。

### 风险

- Cursor / Codex 的工具调用结构跟 Claude Code 不一致——需要在 loader 层做 normalize；可能需要再小迭代一次。

---

## P2 · 持久化索引 + 高级搜索

### 目标

把 OpenCovibe 的双索引（run-index + prompt-index）模式 1:1 复刻到 Bun；前端做 history 风格的高级搜索页。

### 任务

#### 后端

| # | 任务 | 涉及文件 |
|---|---|---|
| 1 | `server/lib/index/manifest.ts` 指纹比较 + atomic write | 🆕 |
| 2 | `server/lib/index/run-index.ts` 扫描 + 增量重建 | 🆕 |
| 3 | `server/lib/index/prompt-index.ts` 扫描全部消息 | 🆕 |
| 4 | `server/lib/index/search.ts` 内存查询（filter + facets + sort + paginate） | 🆕 |
| 5 | API：`POST /api/runs/search` + `POST /api/prompts/search` + `POST /api/index/rebuild` | 🆕 `server/routes/search.ts` |
| 6 | 接入 chokidar：文件变动时 invalidate 索引 cache | ♻️ `server/lib/watcher.ts` |
| 7 | 启动时异步预热索引（不阻塞 server start） | ♻️ `server/index.ts` |

#### 前端

| # | 任务 |
|---|---|
| 8 | 🆕 `web/src/pages/HistoryView.tsx` —— 抄 OpenCovibe history 页 |
| 9 | 顶部搜索 + filter 折叠面板（项目/agent/日期/cost/tool） |
| 10 | Status pills + 排序按钮 + load more 分页 |
| 11 | 决策：是用 HistoryView **替代** SessionsView，还是并存？建议替代，把项目文件夹树做主导航 |

### 验收

- 在 ~/.claude 改一个 jsonl 文件，5s 内索引自动增量重建；
- 搜索 200ms 内返回 + facets；
- 高级筛选：能按项目 + 日期 + 含 Edit 工具 + cost > $1 组合筛；
- 列表能按 cost / tokens / turns 排序。

### 风险

- 全量首次扫描可能 10+ 秒（500+ session），需要 progress UI 或 streaming（可以延后做）；
- prompt-index 文件可能上 MB，大量历史时要加大 TTL 或分片。

---

## P3 · 用量统计页

### 目标

替代 Dashboard（或拆出独立 `/usage`），实现按 source 切换的用量看板。

### 任务

| # | 任务 |
|---|---|
| 1 | `server/lib/pricing.ts` 本地 model 价格表（抄 OpenCovibe pricing.rs） |
| 2 | `server/lib/usage.ts` 聚合：从 run-index 拉数据，按 source/days 切；按日 group + by-model group |
| 3 | API：`/api/usage/overview`、`/api/usage/heatmap`、`/api/usage/by-model` |
| 4 | 🆕 `web/src/pages/UsageView.tsx` |
| 5 | 🆕 `web/src/components/usage/HeatmapCalendar.tsx`（抄 OpenCovibe） |
| 6 | 🆕 `web/src/components/usage/StackedModelChart.tsx` |
| 7 | 🆕 `web/src/components/usage/SourceBreakdown.tsx`（我们独有的多 agent 切分） |
| 8 | 概览页 Dashboard 保留为"快览"：4 卡 + 链向 /usage 的"详细"按钮 |

### 验收

- 顶部能切：全部 / Claude Code / Cursor / Codex；
- Heatmap 显示 52 周；
- 趋势图能切 cost / tokens / messages / sessions；
- By Model 表格按成本排序；
- Cursor/Codex 的 cost 标"~"前缀（估算）。

### 风险

- Cursor composer 历史版本格式可能没有 token 字段→ 检测到缺失时显示 "—"；
- 价格表过期：写在 `server/lib/pricing.ts` 里手动维护；可加个 `last_updated` 字段。

---

## P4 · 扩展面板

### 目标

合并 `/skills` `/mcps`，新增 hooks/plugins/agents 扫描，做统一 `/extensions` 5 子区。

### 任务

#### 扫描器

| # | 任务 |
|---|---|
| 1 | 🆕 `server/scanners/hook.ts`：扫 `~/.claude/settings.json` `~/.codex/settings.json` 的 hooks 字段 |
| 2 | 🆕 `server/scanners/plugin.ts`：扫 `~/.claude/plugins/cache/` 的 plugin metadata |
| 3 | 🆕 `server/scanners/agent.ts`：扫 `~/.claude/agents/*.md`（gray-matter） |
| 4 | 🆕 `shared/types.ts` 加 `HookEntry / PluginEntry / AgentEntry` |

#### API

| # | 任务 |
|---|---|
| 5 | 🆕 `server/routes/hooks.ts` `/api/hooks` |
| 6 | 🆕 `server/routes/plugins.ts` `/api/plugins/installed` |
| 7 | 🆕 `server/routes/agents.ts` `/api/agents` |

#### 前端

| # | 任务 |
|---|---|
| 8 | 🆕 `web/src/pages/ExtensionsView.tsx` 主入口 + section router |
| 9 | 🆕 5 个 section 组件 |
| 10 | sidebar 当 `/extensions` active 时显示 5 子区导航 |
| 11 | 现 `SkillsView.tsx` `MCPsView.tsx` 内容迁移到 SkillsSection / McpSection |
| 12 | 删除旧 `/skills` `/mcps` 路由（或加重定向） |

### 验收

- `/extensions/skills` 等价于现 `/skills`；
- `/extensions/hooks` 列出本机所有 hook 配置（按事件分组）；
- `/extensions/plugins` 列出已装 plugin + 各 plugin 的 components 数量 badge；
- `/extensions/agents` 列出 ~/.claude/agents 下所有自定义 agent；
- 各 section 都有自己的搜索 + 详情 drawer。

---

## P5 · 改名 + 收尾

### 任务

| # | 任务 |
|---|---|
| 1 | `package.json`：`name: "agent-panel"` + `bin: { "agent-panel": ... }` |
| 2 | 保留 `skill-panel` 软链 / 在 `bin/` 下放兼容 shim |
| 3 | README.md / 教程.md / FEATURES.md / USAGE.md 全文替换 |
| 4 | UI 顶部 logo 文案 |
| 5 | localStorage key 前缀从 `skill-panel:` 改 `agent-panel:`（写迁移） |
| 6 | 写 CHANGELOG，注明 breaking changes |
| 7 | bump 到 0.2.0 或 1.0.0 |

---

## 依赖添加清单

```bash
# P1
bun add diff           # diff 计算
bun add ansi-to-html   # ANSI 转 HTML
# 已有 highlight.js

# P2 (后端)
# 不需要新依赖，Bun 内置够用

# P3
# 不需要新依赖

# P4
# 不需要新依赖（gray-matter 已有）
```

---

## 不做的事项（明确写下来避免被反向推动）

| 不做 | 原因 |
|---|---|
| 切 Svelte 5 | 投入产出比低，React 生态够 |
| 上 Tauri / Electron | 网页能做，桌面 app 维护成本高 |
| 在 panel 里发起 agent 会话 | 跟定位冲突 |
| 在 panel 里编辑 SKILL.md / MCP / hook | 坚持只读 |
| 在线安装 plugin | 没有桌面权限做（也不该） |
| Plan mode / Permission rules / Memory editor | 写 Claude Code 配置 |
| Element picker / Preview / Screenshot | 给 agent prompt 用，不相关 |
| Auto-update / system tray / 全局快捷键 | 网页应用模式 |

---

## 阶段性 milestone（如果要排日历）

```
Week 1
  P0 (双层 sidebar + 项目树)         3-4 天
  P1 开始（路由/三栏 + Tools/Files tab） 2-3 天

Week 2
  P1 完成（工具卡片 8 种 + 切换）    4-5 天
  开始 P2

Week 3
  P2 完成                            3-4 天
  P3 开始

Week 4
  P3 完成                            2-3 天
  P4 开始（扫描器 + section 框架）   2-3 天

Week 5
  P4 完成                            2 天
  P5 改名 + 文档 + 发版              1 天
  缓冲 / bug fix                     2 天
```

---

## 风险登记表

| 风险 | 严重度 | 缓解 |
|---|---|---|
| Cursor / Codex 工具调用结构跟 Claude 不一致 | 中 | loader 层做 normalize；先做 fallback DefaultCard |
| 索引文件膨胀 | 中 | 按月分片或 max entries 阈值 |
| 价格表过期导致 cost 不准 | 低 | UI 上明确标"估算"；提供刷新链接到官方价格页 |
| chokidar 在某些 Linux 发行版掉事件 | 低 | 已有手动"重新扫描"按钮 |
| 改名导致用户找不到旧 CLI | 低 | 保留 `skill-panel` 软链，提示用户迁移 |
| P1 改动很大，可能引入退化 | 中 | 拆 PR 合并；保留旧 SessionsView drawer 作 fallback；vitest 跑回归 |

---

## 给"等不及全部做完"的折中方案

如果只想先做最有感的两个：

### 套餐 A · 性价比最高（~7 天）

P0 + P1 → "感觉完全不一样的会话体验"

### 套餐 B · 数据强化（~7 天）

P2 + P3 → "能像 OpenCovibe 那样筛 + 看用量"

### 套餐 C · 全栈仪式感（~10 天）

P0 + P1 + P5 → "整个产品看上去焕然一新"

我建议按 **P0 → P1 → P2 → P3 → P4 → P5** 的顺序做，每一阶段都能独立 ship。
