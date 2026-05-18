# 调研报告：从 OpenCovibe 学什么 / 怎么升级 skill-panel → agent-panel

> 本目录是对开源项目 [OpenCovibe](https://github.com/TwitterIsGood/OpenCovibe) 的逆向调研，目标是给 `skill-panel` 找出"应该抄什么、怎么抄、值不值得抄"。
>
> 仓库本地路径：`/Users/wangshujun/github-space/OpenCovibe`
> 我们的项目：`/Users/wangshujun/workspace/skill-panel`

---

## 一句话结论

**继续做 Web 版（Bun + Hono + React），不做桌面 app**；把 `skill-panel` 重新定位成一个 **本机所有 AI agent 资产 + 历史 + 用量 + 扩展** 的"只读统一看板"，并以 `agent-panel` 命名替代 `skill-panel`。OpenCovibe 90% 的好东西在 Web 上都做得到，唯一的代价是放弃"在面板里直接对话/启动 agent"这件事——而这本来就**不是**我们想做的事。

---

## OpenCovibe 是什么 / 我们是什么

| 维度 | OpenCovibe | skill-panel（现状） | agent-panel（目标） |
|---|---|---|---|
| **定位** | 给 Claude Code CLI 套一层 GUI、能在里面**直接发起会话** | 本机已装的 Skills/MCPs/会话 **只读看板** | 本机所有 agent 资产 + 历史 + 用量 + 扩展的**统一只读看板** |
| **形态** | Tauri 桌面 app（macOS 优先） | Web 应用（`npx skill-panel` 起 server，浏览器看） | 同左 |
| **谁是数据生产者** | OpenCovibe 自己（每条 run 都写 `~/.opencovibe/runs/<id>/events.jsonl`） | Claude Code / Cursor / Codex / Beam **自己**写的文件 | 同左 |
| **支持的 agent** | Claude Code（主），Codex（in progress） | Claude Code + Cursor agent + Cursor composer + Codex + Claude history（5 源） | 同左，再加 Claude prompts、可能加 Beam |
| **会话能不能发起** | 能（核心卖点） | 不能（只读） | **不打算做**（不与 agent 进程做交互） |

**关键差别**：OpenCovibe 自己生成数据，所以它能"在 GUI 里继续发消息"；我们消费别人生成的数据，所以我们的强项永远是 **聚合 + 检索 + 美化展示**。OpenCovibe 在它**没产出过的会话上**只能调"CliSessionBrowser → import"——这里反而是我们的天然主场。

---

## 三份子文档（按需细看）

| 文件 | 看什么 |
|---|---|
| [01-architecture-compare.md](./01-architecture-compare.md) | 技术栈、运行时、存储、扫描、搜索后端的逐项对比；为什么"网页版能做" |
| [02-feature-borrowing.md](./02-feature-borrowing.md) | 你列的 7 个功能 × OpenCovibe 怎么实现 × 我们怎么抄 × 网页版受不受限 |
| [03-roadmap.md](./03-roadmap.md) | 分阶段路线图、任务拆解、文件级改动清单、估时 |

---

## 七大借鉴点速览

| 你提的需求 | OpenCovibe 实现 | 网页版可行性 | 推荐借鉴方案 |
|---|---|---|---|
| 1. 会话详情独立页 + 左侧轮次栏 + 定位按钮 | `/chat?run=<id>` 整页路由；右侧 `ToolActivity` 按 turn 分组、点击 `onScrollToTurn(anchorId)` 滚动 | ✅ 100% 能做 | 新增 `/sessions/:id` 路由替代 Drawer；左/右各一个侧栏（左轮次、右工具/文件/信息） |
| 2. 会话右侧栏 | 5 tab：Tools / Context / Files / Info / Tasks，每 tab 都有 badge 计数 | ✅ 能做 | 全套抄过来：Tools 树状（按 turn 折叠）+ 工具调用计数 chip / Files 列表带 R/W/E 角标 / Info 元数据 / Context 用量历史 |
| 3. 工具调用块美化 UI（每块按工具类型 + 看原始数据） | `InlineToolCard` (1766 行) + `ToolDetailView` (1357 行) 按 `tool_name` 分发；diff 用 table 渲染、Read 带行号、Bash 走 ANSI/shell-colorize | ✅ 能做（OpenCovibe 没做"原始 JSON"切换是它的缺，我们顺手补上） | 抄 `ToolDetailView` 的工具分发架构；每张卡片右上角加 `美化 / 原始 JSON` 切换按钮（这是我们对原作者的增量） |
| 4. 左侧文件目录（按文件夹分类的会话） | `+layout.svelte` 用 `buildProjectFolders(runs, ...)` 把 runs 按 normalized cwd 分桶，pinned/removed 状态走 localStorage | ✅ 能做 | 抄 `sidebar-groups.ts` 的纯函数；左栏永久驻留：项目文件夹树 + 项目下挂会话；保留 skill-panel 已有的过滤/搜索 |
| 5. 搜索 | Rust 后端建 `prompt-index.jsonl` + `run-index.jsonl`，120s TTL 内存缓存，按 mtime 增量；前端给 facets（项目/agent/工具/日期/cost） | ✅ **完全能在 Bun 后端复刻**（不是 Tauri 给的） | 在 Bun 端建本地 jsonl 索引文件；`/api/runs/search` 返回 results + facets；前端做高级筛选面板 |
| 6. 用量统计（区分 Claude Code / Cursor / Codex） | `/usage` 页：4 张卡 + 52 周 heatmap + 30 天柱图 + by-model 表格 + run 列表（可按 cost/tokens/turns 排序）；自身 = `app` 范围，全局 = `global` 范围扫整个 ~/.claude | ✅ 能做（数据全在 jsonl 里；Cursor / Codex 也都有计费数据） | 改造现 Dashboard：top 切 source（all / claude-code / cursor / codex）；同一套 4 卡 + heatmap + 趋势 + by-model + run 列表；Cursor 没有 token 用消息数代替 |
| 7. 扩展面板（Skills/MCP/Hook/Plugin/Agent） | `/plugins` 页 + 左栏 5 子区导航；每个子区独立 panel；MCP 还分 Discover / Configured | ✅ 能做（hook/agent 我们目前没做，需要补扫描器） | 把现 `/skills` `/mcps` 合并到 `/extensions`，左栏 5 子区：Skills / MCP / Hooks / Plugins / Agents；UI 不抄它的 marketplace（我们做不了在线安装），只抄"分区 + 卡片 + 详情"骨架 |

> 详细方案、代码文件位置、API 改造点见 [02-feature-borrowing.md](./02-feature-borrowing.md)。

---

## 为什么不需要做桌面 app

OpenCovibe 之所以是 Tauri 桌面 app，**核心原因有 3 个**——逐个对照我们的目标：

| OpenCovibe 必须用桌面端的原因 | 我们需不需要 |
|---|---|
| 要 spawn `claude` / `codex` 子进程并接管 stdin/stdout/PTY，长期保持会话 actor | ❌ 我们不发起会话 |
| 要起 system tray、本地通知、全局快捷键、auto-update | ❌ 网页用一次开一次足够 |
| 要 native file dialog、drag-drop file path、screenshot capture、element picker | ❌ 我们不发对话，不需要把图片塞进 prompt |
| 要嵌入式 webserver 让远程浏览器访问（远程访问） | ⚠️ 我们**本身就是 webserver**，零成本就有这能力 |

**桌面 app 唯一带来的额外优势**对我们来说是：

- 更顺的字体/渲染（Tauri webview vs 系统浏览器没本质差别）
- 不用记 `npx skill-panel`（写个 `brew install` 也能解决）

**代价**：

- 维护 Rust 工具链 + Tauri 打包流程 + 跨平台签名/公证（macOS notarization 单独一坐就两小时）
- 包从 ~260KB 涨到 ~30MB（OpenCovibe macOS dmg 实测 30M+，加 webview）
- 所有"用 Bun 一行能解决"的事都要写 Rust（事件、文件读、目录扫描、SQLite 解析）

**结论**：维持当前 Web 架构。如果将来有人确实想"双击图标即开"，方案 D 单文件 binary（`bun build --compile`）就够了，不需要 Tauri。

---

## 我们要"超过" OpenCovibe 的地方（差异化）

OpenCovibe 是为 Claude Code 一个 agent 服务的，多 agent 是它的弱项；我们反过来。下面这些是 **OpenCovibe 没有 / 做得不好、我们应该当差异化卖点的**：

1. **多 agent 第一公民**：5 源会话 + 同 UUID 跨源级联删除 + 来源 badge——OpenCovibe 只能"导入" Claude Code 的历史会话
2. **Cursor composer / agent / Beam 全覆盖**：包括 sqlite blob 解析——OpenCovibe 完全不识别
3. **跨 agent 用量统一视图**：Claude Code + Cursor + Codex 一张图——OpenCovibe 只统计自己产生的 + 全局 Claude
4. **工具调用块的"看原始数据"切换**：OpenCovibe 的 `InlineToolCard` 没这个 toggle，我们顺手补上
5. **零安装门槛**：`npx skill-panel`，对方甚至不需要装 Rust/不需要 .dmg 安全例外

---

## 路线图速览

| 阶段 | 目标 | 主要交付 | 估时 |
|---|---|---|---|
| **P0** 重构基础 | 路由改版、左栏重构 | `/sessions/:id` 整页详情；左栏永久项目文件夹树 | 3-4 天 |
| **P1** 工具卡片 + 右侧栏 | 把会话详情从"一坨 markdown"升级到"分块 UI" | `ToolCard.tsx` (按工具类型分发) + `RightSidebar.tsx` (5 tab) | 5-7 天 |
| **P2** 持久化搜索 | run-index + prompt-index，前端高级筛选 | `/api/runs/search` + facets + history 风格列表页 | 3-4 天 |
| **P3** 用量页 | 重做 Dashboard / 拆出 `/usage`，按 source 切 | `usage.ts` 路由 + Heatmap + chart | 3-4 天 |
| **P4** 扩展面板 | 合并 Skills+MCPs，新增 Hooks/Plugins/Agents 扫描 | `/extensions` 5 子区 | 4-5 天 |
| **P5** 改名 + 收尾 | `skill-panel` → `agent-panel`、文档、CLI 别名 | README/教程同步、`bin/agent-panel.mjs` | 1 天 |

> 详细任务清单见 [03-roadmap.md](./03-roadmap.md)。

---

## 一些不打算抄的东西（避免被卖点带偏）

| OpenCovibe 的功能 | 为什么不抄 |
|---|---|
| Multi-Provider 切换 / API key 管理 | 我们不发请求 |
| Setup Wizard | 我们没什么要 setup 的 |
| Plan mode / Permission rules / Memory editor | 都是写 Claude Code 配置的——我们坚持只读 |
| Plugin marketplace 在线安装 | 没有桌面权限做 `git clone` 和子进程；展示已装的就够了 |
| Remote browser access via ngrok | 我们本身是 web server，重复了 |
| Element picker / Preview / Screenshot | 给 prompt 用的，跟我们无关 |
| Ralph loop / Doctor / Rewind | 都是为"发起 agent 会话"服务 |
| Team / Subagent dashboard | 有点意思但不是核心，留待将来 |
| Auto-update / System tray | 网页应用不需要 |
