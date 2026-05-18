# skill-panel 操作手册

## 当前状态

服务已经在跑：

- 进程：`bun` PID 通过 `lsof -iTCP:7788 -sTCP:LISTEN` 查
- 监听：`http://127.0.0.1:7788`
- 日志：`./logs/skill-panel.log`（项目目录下，重启电脑也不丢）
- 数据：83 个 Skill、27 个 MCP server、9 个数据源、10 个异常项

## 一、立即验证

直接在浏览器打开：

```
http://127.0.0.1:7788
```

四个页面都试一下：

| URL | 看什么 |
|---|---|
| `http://127.0.0.1:7788/` | 概览：4 张统计卡 + 来源分布柱状条 + 最近改动 + 异常列表 |
| `http://127.0.0.1:7788/skills` | 83 个 Skill 瀑布流卡片，可搜索、按来源/触发词过滤，点卡片右侧抽屉看 SKILL.md 全文 |
| `http://127.0.0.1:7788/mcps` | 27 个 MCP server 瀑布流卡片，点开看每个 tool 的描述和 JSON schema |
| `http://127.0.0.1:7788/sessions` | 505+ 个 agent 对话历史聚合（Claude Code / Claude prompts / Cursor agent / Cursor composer / Codex），按 cwd/项目/来源/时间过滤，详情看完整对话+按 role 筛选 |
| `http://127.0.0.1:7788/sessions/trash` | Sessions 回收站：恢复或永久删除 |

### 重点验证项

**Skills/MCPs 页**

- [ ] 概览页 4 张卡数字非 0
- [ ] 概览页能看到 6 个 BROKEN 软链（红色边框 + BROKEN badge）
- [ ] Skills 页搜索 "电影" → 过滤到 `movie` skill
- [ ] Skills 页点 `movie` 卡 → 抽屉显示完整 SKILL.md
- [ ] MCPs 页点 `pr-mcp` 卡 → 抽屉显示 8 个 tool 的 JSON schema
- [ ] 浏览器地址栏带 `?id=xxx` → 直接打开对应详情抽屉（可分享链接）

**Sessions 页（新增）**

- [ ] 列表显示 505+ 会话，每行展示 `cwd`（mono 字体 + 复制图标 hover 显示）+ git branch + 模型 + 消息数 + 时间
- [ ] 来源 chip 多选过滤（Claude Code 162 / Claude prompts 181 / Cursor agent 39 / Cursor composer 116 / Codex 7）
- [ ] 项目 cwd chip 点击过滤，按数量排序
- [ ] 搜索框搜 "skill" → 过滤到含此关键词的会话
- [ ] 点击 Resume 下拉 → 三按钮（复制命令 / 在终端打开 / 在 IDE 打开）
- [ ] 点击会话行 → 右侧 drawer 打开
  - 顶部：source badge + cwd（mono + 复制）+ Resume 三按钮 + 「导出 .md」+「移到回收站」
  - role chip 默认全选；只点 "User" → 只显示用户 query（"筛选用户 query 后只展示 query"）
  - 点「内搜」（Cmd+F）→ 在当前对话内文本搜索，关键词高亮
  - 消息支持选区复制 + 每条右上角「复制全文」按钮
  - tool_use / tool_result 默认折叠，点开看 JSON schema 或工具输出
- [ ] 单条删除：行内 ⋯ 菜单 → 「移到回收站」→ 弹二次确认 dialog → 文件实际移动到 `./logs/sessions-trash/<id>/`
- [ ] 多选批量：勾选多条 checkbox → 顶部冒出操作栏 → 「移到回收站」批量软删
- [ ] 永久删除（在回收站页）：必须输入"删除"二字才能 commit
- [ ] 「重新扫描」按钮：手动重新扫所有 source（约 1-3 秒）
- [ ] Cursor agent 类的对话有 "我想做一个 skill 的面板" → 点开能看到本次开发的 167 条消息全文

### 命令行验证

### 命令行验证

```bash
# 健康检查
curl http://127.0.0.1:7788/api/health

# 总览
curl http://127.0.0.1:7788/api/stats | python3 -m json.tool | head -30

# Skill 列表
curl -s http://127.0.0.1:7788/api/skills | python3 -c "import sys,json; print(len(json.load(sys.stdin)['skills']))"

# Sessions 列表
curl -s "http://127.0.0.1:7788/api/sessions?limit=5" | python3 -m json.tool | head -50

# 按 cwd 聚合
curl -s http://127.0.0.1:7788/api/sessions/projects | python3 -m json.tool | head -40

# 全文搜索
curl -s "http://127.0.0.1:7788/api/sessions/search?q=skill&limit=10" | python3 -m json.tool

# 单个会话详情（按 role 过滤）
curl -s "http://127.0.0.1:7788/api/sessions/<id>?roles=user" | python3 -m json.tool | head -40

# 导出会话为 markdown
curl http://127.0.0.1:7788/api/sessions/<id>/export.md > session.md

# 强制重新扫描
curl -X POST http://127.0.0.1:7788/api/sessions/refresh
curl http://127.0.0.1:7788/api/sessions/refresh/status

# 软删除（移到回收站）
curl -X POST http://127.0.0.1:7788/api/sessions/trash \
  -H "Content-Type: application/json" \
  -d '{"ids":["<id1>","<id2>"]}'

# 查看回收站
curl http://127.0.0.1:7788/api/sessions/trash

# 恢复
curl -X POST http://127.0.0.1:7788/api/sessions/restore \
  -H "Content-Type: application/json" \
  -d '{"ids":["<id>"]}'

# 永久删除（必须带 confirmText）
curl -X DELETE http://127.0.0.1:7788/api/sessions/permanent \
  -H "Content-Type: application/json" \
  -d '{"ids":["<id>"], "confirmText":"删除"}'
```

## 二、停止 / 重启

### 停止

```bash
lsof -t -iTCP:7788 | xargs kill -9
```

### 重新启动

```bash
cd /Users/wangshujun/workspace/skill-panel
mkdir -p logs
nohup node bin/skill-panel.mjs --no-open --port 7788 > logs/skill-panel.log 2>&1 &
disown
```

### 看日志

```bash
cd /Users/wangshujun/workspace/skill-panel
tail -f logs/skill-panel.log
```

### 启动时自动开浏览器

去掉 `--no-open`：

```bash
node bin/skill-panel.mjs --port 7788
```

### 换端口

```bash
node bin/skill-panel.mjs --port 9999
```

被占时会自动 +1 找下一个可用端口。

## 三、开发模式（如果你想改代码看效果）

```bash
cd /Users/wangshujun/workspace/skill-panel

# 一条命令同时起后端和前端 hot reload
bun run dev
```

- 后端 `:7788`（bun --watch，改 server/*.ts 自动重启）
- 前端 `:5173`（vite，改 web/src/* 即时刷新）
- 访问 `http://localhost:5173`，前端会通过 vite proxy 把 `/api/*` 转到 7788

只起其中一个：

```bash
bun run dev:server   # 只起后端
bun run dev:web      # 只起前端（需后端已跑）
```

## 四、扫描会动态刷新

服务启动后会在后台用 chokidar 监听两批目录：

**Skills/MCP 数据源**（节流 600ms）

- `~/.claude/skills` `~/.claude/plugins/cache` `~/.claude/plugins/marketplaces` `~/.claude/plugins/installed_plugins.json`
- `~/.cursor/skills-cursor` `~/.cursor/projects` `~/.cursor/mcp.json`
- `~/.codex/skills` `~/.beam`

**Sessions 数据源**（节流 1500ms）

- `~/.claude/projects/` 所有 jsonl
- `~/.claude/history.jsonl`
- `~/.cursor/projects/` 全部 agent-transcripts
- `~/.codex/sessions/`
- `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`（887MB SQLite）
- `~/Library/Application Support/Cursor/User/workspaceStorage/` 全部 vscdb

任何对话/SKILL.md/配置文件改动 → 节流后内存缓存自动重建，**无需重启服务**。第一次启动时也读 `./logs/sessions-index.cache.json` 实现秒开。

## 五、Sessions 删除/回收站机制（重要）

| 操作 | 物理行为 | 是否可恢复 |
|---|---|---|
| 隐藏（仅面板） | 在 `./logs/sessions-state.json` 里加 `hidden:true`，原文件不动 | 勾选「显示已隐藏」即可恢复 |
| 移到回收站（软删） | jsonl 文件实际 mv 到 `./logs/sessions-trash/<id>/`；sqlite blob 先 dump 成 `composerData.bin` 再 DELETE row | 在 `/sessions/trash` 页恢复 |
| 永久删除 | `rm -rf ./logs/sessions-trash/<id>` | **不可恢复** |

**安全**：所有删除路径必须以 `~/.claude` / `~/.cursor` / `~/.codex` / `~/Library/Application Support/Cursor` 开头，否则后端 422。永久删除必须前端传 `confirmText: "删除"`。

## 六、Resume 三种方式（按 source 适配）

| Source | 复制命令 | 在终端打开 | 在 IDE 打开 |
|---|---|---|---|
| Claude Code | `cd <cwd> && claude --resume <id>` | osascript 拉 iTerm/Ghostty/Terminal 自动跑 | `cursor <cwd>`（仅打开目录） |
| Claude prompts | 仅 `cd <cwd>` | cd 到 cwd | `cursor <cwd>` |
| Cursor agent / composer | `cursor <cwd>` | cd 到 cwd | `cursor <cwd>` |
| Codex | `cd <cwd> && codex resume --last` | 同上 | `cursor <cwd>` |

> Codex 没有 `--resume <id>` 命令，只能 `resume --last` 启动 picker 让你选。
> Cursor 没有 CLI resume composer 的能力，只能打开 cwd 然后手动 切到 chat 历史。

## 七、典型问题

| 现象 | 原因 / 解决 |
|---|---|
| 浏览器一直转圈 | 进程没起来。`tail logs/skill-panel.log` 看错误 |
| `[skill-panel] Bun is required` | 装 bun：`curl -fsSL https://bun.sh/install \| bash` |
| 端口 7788 被占 | 加 `--port 8888` 换端口；或 `lsof -t -iTCP:7788 \| xargs kill -9` |
| 改了源码但页面没变 | 你在跑生产构建。改完后 `bun run build` 再重启；或者用 `bun run dev` |
| Skills 页看不到 Beam | 因为你 `~/.beam/` 下没有 `SKILL.md`，是预期 |
| 看到一堆 figma-* 同名警告 | 这些是 `figma` 插件 2.1.3 和 2.1.7 两个版本各一份，是真同名 |

## 八、当前路径速查

| 项 | 路径 |
|---|---|
| 项目根 | `/Users/wangshujun/workspace/skill-panel` |
| CLI 入口 | `bin/skill-panel.mjs` |
| 服务入口 | `server/index.ts` |
| 前端构建产物 | `web/dist/`（已构建） |
| 实时日志 | `./logs/skill-panel.log` |
| Sessions 索引磁盘缓存 | `./logs/sessions-index.cache.json`（启动秒开） |
| Sessions 用户态 | `./logs/sessions-state.json`（hidden / trashed 标记） |
| Sessions 回收站 | `./logs/sessions-trash/<id>/`（软删后的实际文件） |
| Sessions 回收站 manifest | `./logs/sessions-trash/manifest.json`（原路径映射） |
| README（详细文档） | `README.md` |
