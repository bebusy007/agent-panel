# Plan: Session Detail UI Polish (6 需求)

## 需求概览

| # | 需求 | 涉及文件 | 复杂度 |
|---|------|---------|--------|
| 1 | 右边栏可自由拉伸宽度 | sidebar-state.ts, SessionContext.tsx, SessionDetailView.tsx | 中 |
| 2 | 轮次面板收起后展示最小UI（仅数字） | SessionDetailView.tsx, TurnSidebar.tsx（新增 MiniTurnRail） | 中 |
| 3 | 右侧功能栏去掉 icon 小亮点 | RightSidebar.tsx | 低 |
| 4 | 右侧工具栏标签最大宽度限制 | RightSidebar.tsx (ToolsPanel) | 低 |
| 5 | 工具栏与 session detail 设计风格统一 | RightSidebar.tsx (ToolsPanel) | 中 |
| 6 | 文件面板按轮次分组 + 滚动联动 | RightSidebar.tsx (FilesPanel), file-entries.ts, SessionContext/SessionDetailView | 高 |

---

## 需求 1：右边栏可自由拉伸宽度

**sidebar-state.ts** 新增：
- `RIGHT_PANEL_BOUNDS = { min: 200, max: 480, default: 280 }`
- `loadRightPanelWidth()` / `saveRightPanelWidth()`

**SessionContext.tsx**：
- 新增 `useDragResize(RIGHT_PANEL_BOUNDS, ...)` 产出 `rightPanelWidth`, `onRightPanelResizeStart`, `onRightPanelResizeDoubleClick`
- Context value 中暴露这三个值

**SessionDetailView.tsx**：
- 右侧 `<aside>` 从 `w-[280px]` 改为 `style={{ width: rightPanelWidth }}`
- 在 center 和 right 之间插入拖拽分隔条（与左侧一致的 `<div role="separator">`）

---

## 需求 2：轮次面板收起后展示最小 UI

**SessionDetailView.tsx** 中 `turnPanelCollapsed` 分支：
- 替换现有的单按钮为一个窄轨道组件 `<MiniTurnRail>`
- 轨道宽度 32px，纵向排列轮次数字按钮
- 每个按钮显示 `turn.index + 1`，active 高亮（accent 背景）
- 点击数字触发 `onSelectTurn`
- 底部放 `PanelLeftOpen` 展开按钮
- 自动将 active 数字滚入可视区域（复用 TurnSidebar 同样的 scrollIntoView 逻辑）
- `activeTurnIndex` 联动保持不变（MessageStream 的 scroll tracking 不受影响）

**新增组件**：在 `TurnSidebar.tsx` 底部导出 `MiniTurnRail`

---

## 需求 3：去掉 icon 小亮点

**RightSidebar.tsx**：
- 删除 tabs 数组中的 `dot` 字段
- 删除渲染 `dot` 的 `<span>` (第 53-61 行)

---

## 需求 4：工具栏标签最大宽度限制

**RightSidebar.tsx (ToolsPanel)**：
- 芯片容器 `<div>` 加 `overflow-hidden`
- 每个芯片按钮加 `max-w-[160px] truncate`
- 工具名 `<span>` 加 `shrink-0 max-w-[100px] truncate`
- 确保 `detail` span 的 `min-w-0 truncate` 正确生效

---

## 需求 5：工具栏与 session detail 设计风格统一

**RightSidebar.tsx (ToolsPanel)** 中每个工具条目：
- 从扁平按钮改为迷你卡片：`rounded-md border border-l-2 px-2 py-1.5 mx-1.5 my-0.5`
- 左侧 border 颜色根据工具类型着色（读=蓝、写=琥珀、其他=紫），参考 tool-colors.ts 的 getToolColor
- 状态点保留在工具名左侧
- detail 文字用 `text-muted-foreground truncate`
- hover 效果改为 `hover:border-accent/40 hover:bg-secondary/40`

---

## 需求 6：文件面板按轮次分组 + 滚动联动

**file-entries.ts**：
- `FileEntry` 新增 `turnIndex?: number` 字段
- `extractFileEntries` 新增可选参数 `turns?: TurnEntry[]`
- 通过 `turnIndexForMessage(turns, messageOriginalIndex)` 为每个 entry 标记 turnIndex

**RightSidebar.tsx**：
- `FilesPanel` 接收 `turns` 和 `activeTurnIndex` props
- 渲染时按 `turnIndex` 分组，每组前加分隔头（`轮次 N` + 分隔线，风格与 TurnSidebar 的数字 badge 一致）
- 当前活跃轮次的分组头高亮（accent 色）
- 点击分组头跳转到对应轮次的第一条消息
- 当 activeTurnIndex 变化时，自动将对应分组头滚入可视区

**SessionDetailView.tsx**：
- `RightSidebar` props 传入 `turns` 和 `activeTurnIndex`

---

## 实施顺序

1. 需求 3（最简单，先清理干扰）
2. 需求 4（工具栏宽度限制）
3. 需求 5（工具栏风格统一）
4. 需求 1（右边栏拉伸）
5. 需求 2（轮次面板最小 UI）
6. 需求 6（文件面板分组 + 联动）

## 验证

- `npx tsc --noEmit` 通过
- `npx vitest run` 通过
- 浏览器手动验证各功能
