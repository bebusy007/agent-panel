# skill-panel · 功能清单（living doc）

> **这是 agent（Claude Code）改动前必读的文件**。每次用户提需求，先打开这里确认：该需求对应哪一项、实现时不能破坏哪些项、是否需要在清单里新增一条。改动完成后如有新功能，必须把它补进这里再提交。

## 原则

- 用户的视角是"我要用得顺心"，agent 的视角是"满足用户，细节我来"
- 新增/变更功能前，先对照这份清单确认目标和边界
- 完成后把新功能补进清单，和代码一起提交
- 永远不要为了修一件事而悄悄改坏另一件

---

## 启动 / 数据扫描

| # | 作为用户我想 | 期望 |
|---|---|---|
| S1 | 一行命令启动 | `npx skill-panel` 自动开浏览器，端口被占自动 +1 |
| S2 | 数据不出本机 | 默认只绑 `127.0.0.1`，无外网请求、无遥测 |
| S3 | 扫到本机所有 Skill | 6 个来源：Claude 用户/插件/市场、Cursor、Codex、Beam（含软链） |
| S4 | 扫到本机所有 MCP | 3 个来源：Cursor 项目/全局、Claude；按 server 名去重 |
| S5 | 扫到本机所有 agent 对话 | 5 个来源：Claude Code、Claude prompts (history.jsonl)、Cursor agent、Cursor composer、Codex |
| S6 | 文件改了面板自动刷新 | chokidar 监视 `~/.claude` `~/.cursor` `~/.codex` `~/.beam`，变动触发重建；顶部"重新扫描"手动触发 |
| S7 | **扫不到时不要骗我** | 某个 source 临时不可读（Cursor 运行中锁 sqlite 等）时，UI 必须明确提示"暂不可读"，不得悄悄归零 |

## 概览页 `/`

| # | | |
|---|---|---|
| O1 | 一眼看总量 | 4 张统计卡：Skills / MCPs / 来源 / 异常 |
| O2 | 看来源分布 | 来源分布柱状条 |
| O3 | 看最近改动 | 最近 8 条 |
| O4 | 看异常 | 断链 / 同名 / trigger 冲突 / 缺 description |
| O5 | 看整体活跃度 | 活跃墙：过去 26 周 × 7 天网格，按每日 token 消耗深浅着色（自适应分位阈值），hover 显示当日 token + session 数；来源限 claude-code / codex（有 usage 数据的） |

## Skills 页 `/skills`

| # | | |
|---|---|---|
| K1 | 浏览所有 SKILL.md | 瀑布流卡片，响应式 1–4 列 |
| K2 | 列表搜索 / 过滤 | 顶部搜索按 name/description/trigger/CLI；来源多选；热门触发词多选 |
| K3 | 看 SKILL.md 全文 | drawer 渲染 markdown（含语法高亮） |
| K4 | 复制 CLI 命令 | 详情里 CLI 命令是按钮，点击复制 |
| K5 | 在 SKILL.md 里找关键词 | Cmd+F → mark 高亮 + `1/N` 计数 + ↑↓ 翻 + 居中滚动 |
| K6 | URL 直链 | `?id=xxx` 直接打开对应详情 |

## MCPs 页 `/mcps`

| # | | |
|---|---|---|
| M1 | 浏览所有 MCP server | 瀑布流卡片 |
| M2 | 看 server 在哪几处配过 | `configuredIn` + `alsoIn` |
| M3 | 看每个 tool 的 schema | 详情里 tool 列表可展开，看描述 + JSON schema |
| M4 | 在 tool 列表里找 | Cmd+F |

## Sessions 页 `/sessions`

| # | | |
|---|---|---|
| C1 | 看所有对话 | 列表：source badge + cwd + git branch + model + 消息数 + 时间，虚拟滚动 |
| C2 | 过滤 | 来源 chip 多选；项目 cwd chip；搜索框搜标题 / cwd / 首条消息 |
| C3 | 看完整对话 | drawer 按 role 筛选（user / assistant / tool / tool_result / system） |
| C4 | 收藏好回答 | 每条消息 hover ⭐ |
| C5 | 复制单条 / 全文 | 每条消息 hover「复制」 |
| C6 | 导出 .md | drawer 顶部「导出 .md」 |
| C7 | 在对话里找关键词 | Cmd+F：**文本层计数**（虚拟滚动外的命中也数得到）；全消息类型纳入；搜索时自动展开折叠的 tool 消息 |
| C8 | resume 会话 | 三模式：复制命令 / 在终端打开 cwd 跑命令 / 在 IDE 打开 cwd |
| C9 | 隐藏不想看的 | 行内菜单 → 隐藏（不物理删） |
| C10 | 换维度排序 | 顶部「排序」下拉：最近活跃 / 创建时间 / 消息数 / Token 消耗；升降序切换；URL `?sort=&dir=` 可分享/持久化；无 token 数据的 session 在按 token 排序时永远排最后 |
| C11 | 看哪个 session 最烧 token | session 卡片展示 ⚡ 12.3K（K/M 缩略）；只对有 usage 数据的来源显示（claude-code / codex）。hover 看精确数值 |

## 删除（关键，必须保守）

| # | | |
|---|---|---|
| D1 | 单条 / 批量软删到回收站 | 物理移动到 `./logs/sessions-trash/<id>/`，完全可恢复 |
| D2 | **不要弄坏 history.jsonl** | claude-history 删除走**行级**：filter 出匹配 sessionId 的行、原子写回；被删的行备份到 trash。**不能**整文件搬走 |
| D3 | 删一边时同步删另一边 | claude-code 和 claude-history 共 UUID。删除前查"另一半"，弹窗列出让用户勾选是否级联（默认勾选）|
| D4 | 有运行时风险要告诉我 | 删 claude-* 时弹窗显示"若 Claude Code 正在跑可能与写入冲突"，但不拦截 |
| D5 | 永久删除要二次确认 | 必须输入"删除"；同样支持级联 |
| D6 | 永久删除也要列出级联项 | 回收站里弹窗列出关联 trash 条目 |
| D7 | 误删能恢复 | restore 完整复原；claude-history 恢复时 append 备份行，不覆盖期间新写入 |
| D8 | **永久删除也给我一次后悔机会** | 永久删除时先把内容移到 `logs/sessions-trash/.permanently-deleted/<id>/` 保留 30 天，到期后才真删 |

## 收藏页 `/favorites`

| # | | |
|---|---|---|
| F1 | 集中看所有收藏 | 列表，按角色过滤，搜索 |
| F2 | 跳回原会话 | 点「跳转到会话」自动定位到那条消息 |

## 隐私 / 安全

| # | | |
|---|---|---|
| P1 | 改写 `history.jsonl` 要安全 | 写 `.panel-tmp` → rename 原子替换，失败不留半截文件 |
| P2 | 删除前要校验路径 | 只允许动 `~/.claude` `~/.cursor` `~/.codex` `~/Library/Application Support/Cursor` 下的文件 |
| P3 | 面板本身只读 | 不能直接在面板里编辑 SKILL.md 或改 MCP 配置（想改去编辑器） |

---

## 已知限制 / 非目标

- cursor-composer 存在 sqlite 里，Cursor 运行中可能锁库 —— 显示"暂不可读"，不强求读
- 某些 Claude Code slash command（`/resume` `/theme`）只在 history.jsonl 留一行无 transcript —— 这是 Claude Code 的行为，忠实反映
- 面板**只读**，不改源文件（除了删除走 trash 机制）

---

## Roadmap（按优先级，用户未明确排过的放下面）

- [ ] CLI 体检：`which xxx` 标记未安装
- [ ] 一键禁用 skill（移到 `.disabled/`）
- [ ] 同名 / 同 trigger 详细对比视图
- [ ] `--share` 通过 cloudflared 拉公网临时 URL
- [ ] `skill-panel export > skills.json`
- [ ] Session × Skill 交叉分析：哪些 skill 实际触发了哪些会话
- [ ] Skill → CLI → MCP 的 mermaid 依赖图
- [ ] 首次使用引导（onboarding tour / 空状态提示）
- [ ] Bun compile 单文件分发（方案 D，见 `教程.md`）—— 等有明确非开发用户时再做

## 分发 / 打包

已实现：
- `scripts/pack.sh`：一键产出 `pkg/skill-panel-<ver>.tgz`
- 对方 `npm install -g <tgz>` 即用；卸载 `npm uninstall -g skill-panel`
- 硬约束：对方机器必须有 Bun（因为 `bun:sqlite`）；教程里明确写了这条
- 教程：`教程.md` 列了方案 A/B/C/D 和各种上传渠道选项

未做（按用户意愿）：
- 上传到任何外网（npmjs.com / GitHub Release）—— 用户要求保留决策权，不主动做
- 具体内网托管（哪个内网 registry / 哪个内网 git）—— 不同公司不同，用户自选
