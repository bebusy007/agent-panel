# 阶段 3：控制台化输入区

> **状态**：设计确认中  
> **前置依赖**：Phase 2 全部完成（MessageTimeline + ConnectBar + StreamingBlock 已可用）

---

## 核心目标

> 输入区从 Phase 2 的简单 ConnectBar（textarea + 发送/停止）升级为**组合式对话控制台**——每个子功能是独立组件，逐个添加，不做上帝组件。用户的操控体验对标 CLI 中使用 Claude Code 的感受。

---

## 阶段 3 目标与基石意义

### 关键设计交付物

| # | 交付 | 说明 |
|---|------|------|
| 1 | **ConversationConsole 容器** | 布局容器，组合 Input + StatusBar + Overlays |
| 2 | **StatusBar（输入框下方）** | model / tokens / cost / context 进度 / permission mode |
| 3 | **SlashMenu（预取式）** | 从 SessionInit 预获取命令列表 + 描述，本地渲染，无 CLI round-trip |
| 4 | **AttachmentManager** | 图片/文件拖拽 + 粘贴 + 模型能力检测（多模态判断） |
| 5 | **ModelSelector** | 下拉切换模型 |
| 6 | **PermissionModeSelector** | 切换权限模式 |
| 7 | **GitBranchBadge** | 当前分支标识 |
| 8 | **InputHistory** | 方向键浏览历史 |
| 9 | **KeyboardShortcuts** | 全局快捷键 |

### 基石意义

**Phase 3 让用户在 GUI 中拥有 CLI 同等的操控能力**，而不只是"能打字发消息"。具体：

- CLI 中 `/model` → GUI 中 ModelSelector 或 Slash → model 子视图
- CLI 中 `/permission-mode` → GUI 中 PermissionModeSelector
- CLI 中拖文件到终端 → GUI 中拖文件到输入区
- CLI 中看 cc-hud → GUI 中看 StatusBar
- CLI 中 Esc 停止 → GUI 中 Esc 停止
- CLI 中 ↑ 历史 → GUI 中 ↑ 历史

### 后端依赖

Phase 3 **绝大部分是前端**，仅需一个新后端端点：

| 端点 | 用途 | 归属 Step |
|------|------|----------|
| `GET /api/git/branch?cwd=...` | GitBranchBadge 轮询当前分支名 | Step 3.6 |

其余数据全部来自 Phase 1 已有的 ChatSessionStore（model、usage、slashCommands、permissionMode 等均已在 store 中）。

---

## 基于 agent-panel 现有能力

### 复用

| 现有模块 | 文件 | Phase 3 中如何复用 |
|---------|------|-------------------|
| CSS 变量体系 | `index.css` 的 design tokens | StatusBar 颜色从 `--muted-foreground`、`--warning`、`--destructive` 取；SlashMenu 浮层复用 `--popover`/`--border` 变量 |
| ConnectBar | Phase 2 产出的 `ConnectBar.tsx` | 扩展为 ConversationConsole 容器，保留四态状态机 |
| ChatSessionStore | Phase 1 产出的 `chat-session-store.ts` | 所有子组件从 store 读自己关心的字段（model、usage、slashCommands、permissionMode） |
| use-chat-connection | Phase 1 产出的 `use-chat-connection.ts` | sendMessage、interrupt、respondPermission 等 API |
| ToolCard 的 pretty/raw 切换 | `ToolCardHeader.tsx` 的 `ViewMode` | SlashMenu 子视图复用相同切换模式 |
| 文件选择器 | 无现有组件 | 使用浏览器原生 `<input type="file">`，不引入新依赖 |
| lucide-react 图标 | 已有依赖 | 状态图标、发送/停止/附件按钮 |

### 新建

| 新建文件 | 说明 |
|---------|------|
| `web/src/components/conversation/ConversationConsole.tsx` | 布局容器，替换 Phase 2 ConnectBar |
| `web/src/components/conversation/StatusBar.tsx` | 输入框下方的状态行（model、tokens、cost、context、permission mode） |
| `web/src/components/conversation/StatusBarExpanded.tsx` | StatusBar 展开面板（per-turn details） |
| `web/src/components/conversation/SlashMenu.tsx` | 预取式命令菜单（分组 + 模糊搜索 + 键盘） |
| `web/src/components/conversation/ModelPicker.tsx` | /model 子视图选择器 |
| `web/src/components/conversation/PermissionModePicker.tsx` | /permission-mode 子视图选择器 |
| `web/src/components/conversation/AttachmentManager.tsx` | 拖拽/粘贴/选择 + 模型能力检测 |
| `web/src/components/conversation/AttachmentChip.tsx` | 单个附件 chip（文件名 + 大小 + 预览 + 删除） |
| `web/src/components/conversation/GitBranchBadge.tsx` | Git 分支名 + 颜色标识 |
| `web/src/lib/conversation/model-capabilities.ts` | supportsVision() 函数 + 模型能力映射表等常量 |
| `web/src/lib/conversation/input-history.ts` | 输入历史持久化（localStorage）+ 方向键导航 |

### 新增后端

| 端点 | 用途 | 归属 Step |
|------|------|----------|
| `GET /api/git/branch?cwd=...` | GitBranchBadge 10s 轮询当前分支名 | Step 3.6 |

### 修改

| 文件 | 改动 | 风险 |
|------|------|------|
| `SessionDetailView.tsx` | ConnectBar 替换为 ConversationConsole | 低——增量替换 |
| `SessionContext.tsx` | 无需改动（数据从 ChatSessionStore 取） | 无 |

---

## 已确认的设计决策

### 决策 1：StatusBar 位于输入框下方

```
┌─ MessageTimeline ────────────────────────────────────┐
│ ...messages...                                        │
├───────────────────────────────────────────────────────┤
│ [ 输入框（支持多行，自动增高）        ] [发送/停止]    │
│ Sonnet · 5.2k↓ 1.2k↑ · $0.03 · ctx 45%/200K · ask  │
└───────────────────────────────────────────────────────┘
```

**多行输入的交互处理**：
- textarea 默认 1 行高（36px），Shift+Enter 换行时自动增高
- 最大高度：不超过 viewport 的 30%（约 6 行），超出后内部滚动
- StatusBar 始终在 textarea 下方，不会被遮挡
- 输入区整体高度 = textarea 动态高度 + StatusBar 固定高度（24px）
- MessageTimeline 的 bottom padding 跟随输入区高度变化（用 CSS 或 ResizeObserver）

**未连接时的 StatusBar 行为**：
- 未连接（离线态）：StatusBar **不显示**（只有"连接并继续对话"按钮）
- 连接中：StatusBar **不显示**（spinner 状态）
- 已连接但无 usage 数据（刚连上还没发消息）：显示 `model` + `permission mode`，其余项为 `--`
- 有 usage 后：完整显示所有项

**为什么选 B**：更贴近 CLI + cc-hud 的体验——输入在最底部，状态信息是"脚注"式辅助，不抢视觉焦点。

### 决策 2：Slash 命令预取，无 CLI round-trip

```
数据来源：ChatEvent::SessionInit.slash_commands → store.slashCommands

slash_commands: [
  { name: "model", description: "Change model", aliases: [] },
  { name: "permission-mode", description: "Change permission mode", aliases: [] },
  { name: "status", description: "Show session status", aliases: [] },
  { name: "review", description: "Review code", aliases: [], is_skill: true },
  ...
]
```

**交互流程**：
1. 用户输入 `/` → 弹出 SlashMenu（命令来自 `store.slashCommands`）
2. 模糊搜索过滤（按 name + description + aliases 匹配）
3. 方向键/鼠标选择 → Enter 确认
4. 普通命令：选中后直接作为消息发送给 CLI（CLI 处理并返回结果）
5. 特殊命令（model / permission-mode）：选中后**弹出子视图**（本地处理，不发给 CLI）

**子视图**：
- `/model` → ModelPicker 子面板（模型列表来自 SessionInit 或独立 API）
- `/permission-mode` → PermissionModePicker 子面板（5 种模式选择）
- 选择后发送对应的 slash 命令给 CLI（如 `/model claude-sonnet-4-20250514`）

**未连接时**：使用 fallback 命令列表（硬编码常用命令），连接后替换为 CLI 实际返回的列表。

### 决策 3：附件支持文本 + 图片，模型能力检测

**Phase 3 范围**：图片 + 纯文本文件。PDF 和 Office 转换留 Phase 5。

**模型能力检测**：
```typescript
// 从 store.model 判断是否支持多模态
function supportsVision(model: string): boolean {
  // Claude 系列全部支持 vision
  if (model.includes("claude")) return true;
  // 其他模型需要查配置
  return modelCapabilities[model]?.vision ?? false;
}

// UI 行为：
// - 支持 vision → 显示图片附件入口（📎 按钮、拖拽区域）
// - 不支持 vision → 隐藏图片入口，只保留文本文件
// - 能力未知 → 显示入口但加 tooltip "当前模型可能不支持图片"
```

**附件类型处理**：

| 类型 | 检测方式 | 处理策略 | 大小限制 |
|------|---------|---------|---------|
| 图片（png/jpg/gif/webp） | MIME type | base64 inline | 5MB |
| 文本文件 | MIME text/* 或常见扩展名（.ts/.js/.py/.md/.json 等） | 读取内容作为 text block | 1MB |
| 其他（PDF/Office/二进制） | fallback | **Phase 3 不支持**，提示"暂不支持此文件类型" | - |

**交互**：
- 拖拽到输入区 → 识别类型 → 显示 attachment chip
- Ctrl+V / Cmd+V 粘贴图片 → 直接作为 image attachment
- 点击 📎 按钮 → 文件选择器（按模型能力过滤：支持 vision 时可选图片+文本，否则只能选文本）
- Chip 上有 × 可删除
- 不支持的文件类型 → 拖入时显示红色提示"暂不支持"

### 决策 4：Context 显示为数字 + 可选进度条

**常驻格式**：`ctx 45%/200K` 或 `ctx 10%/1M`

```
含义：context utilization% / context window 大小
计算：
  used = inputTokens + cacheReadTokens + cacheWriteTokens
  window = modelUsage.context_window（从 SessionInit 或 UsageUpdate 获取）
  percentage = Math.round(used / window * 100)
  windowDisplay = window >= 1_000_000 ? `${(window/1_000_000).toFixed(0)}M` : `${(window/1000).toFixed(0)}K`
```

**进度条**（如果空间允许）：在数字后面加一个小的 inline 进度条（宽度 40~60px）：
```
ctx 45%/200K ████████░░░░░░░░
```

颜色分级：
- < 50%：默认色（muted）
- 50~75%：warning（黄）
- 75~90%：high（橙）
- > 90%：critical（红）

---

## 组件详细设计

### ConversationConsole 布局

```tsx
<div className="conversation-console">
  {/* Overlays（浮层，输入框上方） */}
  {slashMenuOpen && <SlashMenu />}
  {attachmentChips.length > 0 && <AttachmentChipBar />}
  
  {/* 主输入行 */}
  <div className="input-row">
    <AttachmentButton />          {/* 📎 按钮（如果模型支持） */}
    <TextArea />                   {/* 自动增高 textarea */}
    <ActionButton />               {/* 发送 / 停止 按钮 */}
  </div>
  
  {/* StatusBar（输入框下方，始终可见） */}
  <StatusBar />
</div>
```

### StatusBar 内容

**常驻信息（一行内）**：

```
[ModelBadge] · [TokenCounts] · [Cost] · [ContextBar] · [PermissionMode]

例：
Sonnet · 5.2k↓ 1.2k↑ · $0.03 · ctx 45%/200K ████░░░░ · ask
```

| 项目 | 数据来源 | 点击行为 |
|------|---------|---------|
| ModelBadge | `store.model` | 点击打开 ModelPicker |
| TokenCounts | `store.usage.inputTokens` / `outputTokens` | 无 |
| Cost | `store.usage.cost` | 无（hover 显示详细 per-turn） |
| ContextBar | 计算自 usage + contextWindow | 无 |
| PermissionMode | `store.permissionMode` | 点击打开 PermissionModePicker |

**展开面板（可选，点击 StatusBar 展开）**：
- Per-turn 用量表
- Cache read/write tokens
- CLI version
- MCP servers 列表
- Compact 次数
- Session duration

### SlashMenu 设计

**数据**：`store.slashCommands: SlashCommandInfo[]`

```typescript
interface SlashCommandInfo {
  name: string;          // "model", "review", "status"
  description?: string;  // "Change model"
  aliases?: string[];    // ["m"]
  is_skill?: boolean;    // skill 命令标识
}
```

**分组**（硬编码分组规则，命令不在任何组内 → 归入"其他"）：

| 分组 | 归入规则 | 典型命令 |
|------|---------|---------|
| 会话 | 硬编码名单 | status, context, compact, clear, resume |
| 编码 | 硬编码名单 | review, test, init |
| 配置 | 硬编码名单 | model, permission-mode, config |
| Skills | `is_skill === true` | 所有标记为 skill 的命令 |
| 其他 | 以上都不匹配 | help, logout 等 |

分组配置放在前端常量中，后续可扩展为用户可配置。

**子视图切换**：

```
/ → 显示命令列表
  → 选择 "model" → 列表变为模型列表（从 CLI 已知模型或 API 获取）
  → 选择具体模型 → 自动发送 "/model claude-sonnet-4-20250514"
  → Backspace 回到上级列表
```

### AttachmentManager 设计

**状态**：

```typescript
interface AttachmentState {
  attachments: Attachment[];
  isDragging: boolean;       // 拖拽中
  error: string | null;      // 错误提示（如"文件过大"、"类型不支持"）
  modelSupportsVision: boolean;  // 当前模型是否支持图片
}

interface Attachment {
  id: string;
  filename: string;
  mediaType: string;         // "image/png" | "text/plain" | ...
  contentBase64: string;     // 图片用 base64，文本文件也 base64 编码
  size: number;              // bytes
  previewUrl?: string;       // 图片预览用（createObjectURL）
}
```

**UI 元素**：

1. **📎 按钮**：位于输入框左侧。模型不支持 vision 时只能选文本文件
2. **拖拽区域**：整个输入区可拖入文件，拖入时显示蓝色边框提示
3. **Attachment Chips**：输入框上方的横条，每个 chip 显示：图片缩略图（或文件图标）+ 文件名 + 大小 + × 删除
4. **粘贴拦截**：检测 ClipboardEvent 中的图片
5. **错误反馈**：文件过大 / 类型不支持 → chip 位置显示红色提示，3s 后消失

---

## Phase 3 完成后的功能影响

| 功能 | 现状（Phase 2） | Phase 3 后 |
|------|----------------|-----------|
| 模型切换 | 不可见 | StatusBar 显示 + 点击切换 |
| 权限模式 | 不可见 | StatusBar 显示 + 点击切换 |
| Token 用量 | 不可见 | StatusBar 实时显示 input↓ output↑ |
| 费用 | 不可见 | StatusBar 显示当前 cost |
| Context 容量 | 不可见 | 百分比 + 进度条 + 颜色警告 |
| Slash 命令 | 无（或发送纯文本 /xxx） | 弹出菜单 + 子视图 + 自动补全 |
| 附件 | 不支持 | 图片拖拽/粘贴 + 文本文件选择 + 模型能力适配 |
| Git 分支 | 不可见 | StatusBar 显示分支名 + 颜色 |
| 输入历史 | Phase 2 ConnectBar 有基础版 | 增强：↑↓ 导航 + 持久化 |
| 快捷键 | Esc 停止（Phase 2） | + Tab 补全 + 方向键菜单导航 |

---

## 粗略 Steps

| Step | 内容 | 依赖 | 复杂度 |
|------|------|------|--------|
| 3.1 | ConversationConsole 容器布局替换 ConnectBar | Phase 2 | 低 |
| 3.2 | StatusBar 常驻行（model + tokens + cost + context） | 3.1 | 中 |
| 3.3 | SlashMenu 基础版（预取命令 + 模糊搜索 + 键盘） | 3.1 | 中 |
| 3.4 | SlashMenu 子视图（ModelPicker + PermissionModePicker） | 3.3 | 中 |
| 3.5 | AttachmentManager + 模型能力检测 + Chips | 3.1 | 高 |
| 3.6 | GitBranchBadge（轮询 + 颜色） | 3.2 | 低 |
| 3.7 | InputHistory 增强 + 全局快捷键 | 3.1 | 低 |
| 3.8 | StatusBar 展开面板（per-turn details） | 3.2 | 中 |

---

## 完成标准

- [ ] StatusBar 在输入框下方显示：model、input/output tokens、cost、context%、permission mode
- [ ] 未连接时 StatusBar 不显示；已连接无数据时显示 model + permission mode + 占位
- [ ] 多行输入时 textarea 自动增高（max viewport 30%），StatusBar 不被遮挡
- [ ] Slash 命令菜单可用（预取列表、模糊搜索、分组、键盘导航）
- [ ] `/model` 和 `/permission-mode` 有子视图选择器
- [ ] 可拖拽/粘贴图片作为附件发送（模型支持 vision 时）
- [ ] 可选择文本文件作为附件发送
- [ ] 模型不支持图片时，图片入口隐藏或提示
- [ ] 不支持的文件类型（PDF/Office/二进制）给出明确拒绝提示
- [ ] Context 进度条颜色分级正确（>50% 黄, >75% 橙, >90% 红）
- [ ] Git 分支名显示正确（需后端 `GET /api/git/branch` 端点）
- [ ] ↑↓ 方向键浏览历史输入
- [ ] 所有组件可独立测试
- [ ] 视觉遵循 design-system.md

---

*Phase 4 预览：ToolCard 按工具类型定制渲染 + PermissionPanel 完整交互 + ToolActivity 侧栏。*
