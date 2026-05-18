# UI 设计系统升级 — 实施计划

## Context

agent-panel 当前的 UI 是纯手写 Tailwind 组件，虽然功能完备但缺乏"产品化"品质。对比 CCHV 项目发现差距不在功能上，而在视觉系统层面：缺少统一的 design token、组件品质参差不齐、没有层次感（blur/glow/shadow 等）。

本次升级的目标是：**建立一套完善的设计系统底座，引入 shadcn/ui，支持 Light/Dark 双主题，为项目定下长期的 UI 基调。**

---

## 技术方案

### 核心决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 组件库 | shadcn/ui (New York style) | 基于 Radix、Tailwind 原生、源码可控、CCHV 验证 |
| 色彩体系 | CSS 变量 + OKLCH 色彩空间 | 感知均匀、主题切换成本低 |
| 主题 | Light + Dark，跟随系统或手动切换 | 用户需求 |
| 图标 | lucide-react（已有） | 无需改动 |
| 字体 | 保持系统字体栈，代码部分强制 mono | 零网络请求 |

### 目录结构变化

```
web/src/
├── components/
│   ├── ui/              ← NEW: shadcn/ui 基础组件
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── tooltip.tsx
│   │   ├── tabs.tsx
│   │   ├── input.tsx
│   │   ├── separator.tsx
│   │   ├── skeleton.tsx
│   │   ├── switch.tsx
│   │   └── sheet.tsx
│   ├── ... (existing components, gradually refactored)
├── lib/
│   ├── utils.ts         ← 已有 cn()，保持
│   └── ...
├── index.css            ← 重写：完整 design token 系统
└── ...
```

---

## 分阶段实施

### Phase 1: 基础设施搭建 (Design Token + shadcn/ui 骨架)

**新增依赖：**
```
@radix-ui/react-dialog
@radix-ui/react-dropdown-menu
@radix-ui/react-tooltip
@radix-ui/react-tabs
@radix-ui/react-separator
@radix-ui/react-slot
@radix-ui/react-switch
class-variance-authority  (已有)
tailwind-merge           (已有)
clsx                     (已有)
```

**重写 `web/src/index.css`：**
- 建立完整的 CSS 变量体系（background、foreground、card、popover、primary、secondary、muted、accent、destructive、border、input、ring）
- Dark theme 为默认（`:root`），Light theme 为 `.light` class
- 添加 semantic 色彩变量：success、warning、info
- 添加工具专属色彩变量（从现有 tool-colors.ts 的硬编码迁移到 CSS 变量）
- 添加 shadow 层级（xs → 2xl + glow）
- 添加动画 timing 变量

**更新 `web/tailwind.config.cjs`：**
- colors 迁移到 shadcn/ui 的 OKLCH 变量命名约定
- 添加 `container`、`radius` 等 shadcn 需要的 extend
- 保持现有的 animation keyframes

**创建 `components.json`：**
- shadcn/ui 配置文件，指定 style、aliases、tailwind config 路径

**创建 `web/src/components/ui/` 基础组件（约 12 个）：**
- Button（variant: default/destructive/outline/secondary/ghost/link, size: sm/default/lg/icon）
- Card（Card/CardHeader/CardTitle/CardDescription/CardContent/CardFooter）
- Badge（variant: default/secondary/destructive/outline）
- Dialog（从现有 ConfirmDialog 抽象）
- DropdownMenu
- Tooltip
- Tabs
- Input
- Separator
- Skeleton（loading 占位）
- Switch（用于设置页的主题切换）
- Sheet（侧滑面板）

**创建 `web/src/components/ThemeProvider.tsx`：**
- Context provider 管理 light/dark/system 三种模式
- localStorage 持久化选择
- 监听 `prefers-color-scheme` 变化

**关键文件：**
- `web/src/index.css` — 完全重写
- `web/tailwind.config.cjs` — 重写 colors/extend 部分
- `web/src/components/ui/*.tsx` — 新建 ~12 个文件
- `web/src/components/ThemeProvider.tsx` — 新建
- `web/src/main.tsx` — 包裹 ThemeProvider
- `web/index.html` — 添加 dark class 初始化脚本（防闪烁）
- `package.json` — 添加 @radix-ui 依赖

### Phase 2: 核心组件迁移

将现有组件逐步迁移到新的设计系统之上：

**优先迁移（视觉冲击最大的）：**

1. **StatsCard → MetricCard 升级**
   - 添加彩色图标底（color-mix 半透明背景）
   - 添加趋势指示器（可选）
   - Mono 数字 + tabular-nums
   - 分割线隔开 sub-value
   - hover 时微妙 border/shadow 变化
   - 文件：`web/src/components/StatsCard.tsx`

2. **ConfirmDialog → 使用 ui/Dialog**
   - 复用 shadcn Dialog 组件
   - 保留现有业务逻辑（cascade、requireType）
   - 文件：`web/src/components/ConfirmDialog.tsx`

3. **SkillCard / MCPCard → 使用 ui/Card**
   - 复用 Card 组件作为外壳
   - 添加 hover glow 效果
   - 文件：`web/src/components/SkillCard.tsx`, `MCPCard.tsx`

4. **Dashboard 页面刷新**
   - Section heading 统一使用 SectionCard 模式（图标底 + 大写标题）
   - 统计卡片区使用新的 MetricCard
   - 文件：`web/src/pages/Dashboard.tsx`

5. **按钮统一**
   - 所有行内 button 替换为 `<Button>` 组件
   - 散布在 ~20+ 处

**次优先迁移：**

6. **ToolCard 系列** — 保持现有架构，换皮：border/bg 用新 token
7. **Sidebar** — 替换 bg/border 变量，添加 hover 状态优化
8. **SearchBar / FilterChips** — 使用 Input + Badge 组件重写
9. **HeatmapCalendar** — 色彩用 CSS 变量替代硬编码
10. **SessionItem / VirtualSessionList** — 换皮

### Phase 3: 设置页面 + 主题切换入口

**新建 Settings 页面（`web/src/pages/SettingsView.tsx`）：**
- 路由：`/settings`
- 内容：
  - 外观：Light / Dark / 跟随系统
  - （未来扩展位：语言、数据源配置等）
- 使用 Switch 组件 + 3 选 radio 实现

**主题切换的快捷入口：**
- 在 IconRail（左侧图标栏）底部添加 Settings 齿轮图标
- 或者在页面右上角添加 sun/moon 快速切换按钮

### Phase 4: 细节打磨

- 全局过渡动画统一（transition-all duration-200）
- Loading skeleton 替代现有的"加载中…"文字
- 空状态（empty state）美化
- Tooltip 统一替换 title 属性
- 滚动条美化（CSS scrollbar styling）
- 焦点状态（focus-visible ring）统一

---

## 色彩体系设计 (Design Token)

```css
:root {
  /* 基础语义色 — Dark Theme (默认) */
  --background: oklch(0.05 0.01 260);
  --foreground: oklch(0.95 0.01 260);
  --card: oklch(0.10 0.01 260);
  --card-foreground: oklch(0.95 0.01 260);
  --popover: oklch(0.10 0.01 260);
  --popover-foreground: oklch(0.95 0.01 260);
  --primary: oklch(0.65 0.15 270);      /* 紫色调，延续现有 accent */
  --primary-foreground: oklch(0.98 0 0);
  --secondary: oklch(0.15 0.01 260);
  --secondary-foreground: oklch(0.90 0.01 260);
  --muted: oklch(0.18 0.01 260);
  --muted-foreground: oklch(0.60 0.02 260);
  --accent: oklch(0.20 0.02 260);
  --accent-foreground: oklch(0.90 0.01 260);
  --destructive: oklch(0.50 0.20 25);
  --destructive-foreground: oklch(0.98 0 0);
  --border: oklch(0.20 0.01 260);
  --input: oklch(0.20 0.01 260);
  --ring: oklch(0.65 0.15 270);
  --radius: 0.5rem;

  /* 语义状态色 */
  --success: oklch(0.65 0.16 145);
  --warning: oklch(0.70 0.16 75);
  --info: oklch(0.60 0.12 240);

  /* Metric 专用色 */
  --metric-purple: oklch(0.65 0.15 285);
  --metric-blue: oklch(0.60 0.14 240);
  --metric-green: oklch(0.65 0.16 145);
  --metric-amber: oklch(0.72 0.16 75);
  --metric-pink: oklch(0.60 0.15 330);
  --metric-teal: oklch(0.60 0.12 175);

  /* Shadow 层级 */
  --shadow-xs: 0 1px 2px oklch(0.0 0 0 / 0.3);
  --shadow-sm: 0 1px 3px oklch(0.0 0 0 / 0.4);
  --shadow-md: 0 4px 6px -1px oklch(0.0 0 0 / 0.4);
  --shadow-lg: 0 10px 15px -3px oklch(0.0 0 0 / 0.4);
  --shadow-glow: 0 0 20px oklch(0.65 0.15 270 / 0.15);
}

.light {
  --background: oklch(0.98 0.005 260);
  --foreground: oklch(0.10 0.02 260);
  --card: oklch(1.00 0 0);
  --card-foreground: oklch(0.10 0.02 260);
  --popover: oklch(1.00 0 0);
  --popover-foreground: oklch(0.10 0.02 260);
  --primary: oklch(0.50 0.18 270);
  --primary-foreground: oklch(0.98 0 0);
  --secondary: oklch(0.96 0.005 260);
  --secondary-foreground: oklch(0.20 0.02 260);
  --muted: oklch(0.94 0.005 260);
  --muted-foreground: oklch(0.45 0.02 260);
  --accent: oklch(0.95 0.01 260);
  --accent-foreground: oklch(0.20 0.02 260);
  --destructive: oklch(0.50 0.20 25);
  --destructive-foreground: oklch(0.98 0 0);
  --border: oklch(0.88 0.01 260);
  --input: oklch(0.88 0.01 260);
  --ring: oklch(0.50 0.18 270);

  --success: oklch(0.50 0.14 145);
  --warning: oklch(0.55 0.14 75);
  --info: oklch(0.50 0.12 240);

  --shadow-xs: 0 1px 2px oklch(0.0 0 0 / 0.05);
  --shadow-sm: 0 1px 3px oklch(0.0 0 0 / 0.08);
  --shadow-md: 0 4px 6px -1px oklch(0.0 0 0 / 0.08);
  --shadow-lg: 0 10px 15px -3px oklch(0.0 0 0 / 0.08);
  --shadow-glow: 0 0 20px oklch(0.50 0.18 270 / 0.08);
}
```

---

## 迁移策略

**渐进式迁移，不一次性重写所有组件：**

1. Phase 1 搭完后，新旧组件可共存（CSS 变量兼容）
2. 现有的 `--bg-base`、`--fg-default` 等变量映射到新 token（保留别名，不破坏未迁移的组件）
3. 每迁移完一个组件，确认视觉效果后再进行下一个
4. 最终 Phase 4 完成后，删除旧变量别名

**兼容性映射（Phase 1 时建立）：**
```css
:root {
  /* 旧 → 新 的兼容映射，让未迁移的组件继续工作 */
  --bg-base: /* 从 --background 导出 RGB 通道 */;
  --bg-subtle: /* 从 --secondary 导出 */;
  --bg-surface: /* 从 --card 导出 */;
  --bg-elevated: /* 从 --muted 导出 */;
  --fg-default: /* 从 --foreground 导出 */;
  --fg-muted: /* 从 --muted-foreground 导出 */;
  --fg-subtle: /* lower opacity of muted */;
  --border-default: /* 从 --border 导出 */;
  --border-strong: /* slightly brighter border */;
  --accent: /* 从 --primary 导出 */;
  --accent-fg: /* 从 --primary-foreground 导出 */;
}
```

---

## 验证方式

1. `bun run dev` 启动，浏览器打开 http://localhost:5173
2. 检查 Dashboard 页面的 MetricCard 视觉效果
3. 切换 Light/Dark 主题，确认无色彩断裂
4. 检查所有页面（Sessions、Skills、MCPs、Usage）无样式异常
5. `bun run build` 确认无编译错误
6. `bun run typecheck` 通过

---

## 工作量估算

| Phase | 内容 | 估时 |
|---|---|---|
| Phase 1 | Design Token + shadcn/ui 骨架 + ThemeProvider | 1-2 天 |
| Phase 2 | 核心组件迁移（StatsCard、Dialog、Cards、Dashboard、Buttons） | 2-3 天 |
| Phase 3 | Settings 页面 + 主题切换入口 | 半天 |
| Phase 4 | 细节打磨（skeleton、tooltip、animation、scrollbar） | 1-2 天 |
| **合计** | | **5-7 天** |
