# 03 - 差异化分析：我们的优势和定位

## 定位差异

```
CCHV：     "看你所有 AI 对话的历史"  （History Viewer）
agent-panel："管理你所有 AI agent 的资产 + 历史"  （Agent Asset Manager + Viewer）
```

CCHV 专注于 **会话内容的浏览和分析**。
我们覆盖 **资产管理 + 会话浏览 + 操作性**。

---

## 我们有、CCHV 没有的

### 1. Agent 资产管理

| 资产类型 | 我们的功能 | CCHV |
|---|---|---|
| Skills | 扫描、展示、搜索、详情 | 无 |
| MCP Servers | 扫描多来源、展示配置 | 无 |
| Hooks | 扫描 settings.json 展示 | 无 |
| Plugins | 已安装插件展示 | 无 |
| Agents | 自定义 agent 展示 | 无 |
| Prompts (history) | 搜索历史 prompt | 无 |

这是我们最大的差异化。CCHV 做的是"看对话"，我们做的是"看你的 AI 工具箱"。

### 2. Favorites 收藏系统

用户可以收藏任何 session、skill、MCP 等，形成个人快速访问列表。CCHV 没有收藏功能。

### 3. Resume 继续会话

从面板一键唤起终端，继续一个中断的 Claude Code 会话。这是唯一的"操作性"功能，CCHV 没有。

### 4. 轻量零安装

```bash
# 我们
npx agent-panel     # 即起即用，~260KB

# CCHV
# 下载 30MB+ .dmg 安装，或
brew install --cask jhlee0409/tap/claude-code-history-viewer
```

对开发者来说，npx 是零摩擦的。

### 5. 实时推送

我们用 WebSocket 监听文件变更实时推送到前端。CCHV 也有 file watcher，但走的是 Tauri event system（桌面 app 内部通信），headless server 模式下用 SSE。

### 6. Bun 单文件编译

`bun build --compile` 可以生成跨平台单二进制，无需 Rust 工具链。部署极简。

---

## CCHV 有、我们没有的（是否需要补）

| CCHV 功能 | 需要补吗 | 理由 |
|---|---|---|
| 9 provider 支持 | 选择性补 | 加 Gemini CLI / Aider 有价值，但不急 |
| 全局全文搜索 | 需要 | 体验差距明显 |
| Session Board 像素可视化 | 不急 | 用户量级不需要 |
| Analytics 日期范围过滤 | 可以补 | 低成本 |
| Diff viewer (react-diff-viewer) | 可以补 | 文件编辑 diff 展示确实更好 |
| i18n 多语言 | 不需要 | 当前用户群不需要 |
| Docker 部署 | 将来可以 | 作为 server 模式的补充 |
| 单二进制 headless server | 已有替代 | bun compile 效果类似 |
| Archive 导出/导入 | 不需要 | 数据就在本地，不需要搬运 |
| 键盘快捷键/Zoom | 低优先 | 锦上添花 |

---

## 用户场景差异

### CCHV 的典型用户

> "我用了 5 个 AI coding tool，想看看上周它们帮我改了哪些文件，花了多少 token"

→ 关注：历史浏览、统计分析、多 provider 聚合

### agent-panel 的典型用户

> "我装了很多 skill 和 MCP，想快速找到某个 skill 的配置、看看最近的会话、继续一个未完成的任务"

→ 关注：资产发现、快速检索、操作便利

---

## 竞争策略

不与 CCHV 在"history viewing"上正面竞争（它 85K 行代码的积累不是短期能追上的），而是：

1. **守住资产管理**：Skills/MCP/Hooks/Plugins/Agents 这块地盘是我们的
2. **会话浏览做到"够用"**：不需要像素级可视化，但基本的浏览、搜索、工具卡片渲染要做好
3. **保持轻量优势**：npx 即用是我们对"懒得装 app"的开发者的杀手锏
4. **操作性是加分项**：Resume、Favorite 等让面板从"只读"变成"可操作"，这是 CCHV 刻意不做的

---

## 如果未来做桌面 app

CCHV 的 Tauri 经验可以参考：
- 它的 `src-tauri/` 结构就是标准 Tauri 2 组织方式
- 它同时支持桌面 + headless 两种模式，通过 Cargo feature flag 切换
- 我们如果做，可以更简单：Tauri 只当壳，内嵌 Bun server 作为 sidecar

但正如之前讨论的——现在不需要做。
