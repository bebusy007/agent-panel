# UI 升级调研笔记：CCHV 为什么看起来"高级"

> 调研对象：[claude-code-history-viewer](https://github.com/jhlee0409/claude-code-history-viewer) v1.12.0
> 本地路径：`/Users/wangshujun/github-space/claude-code-history-viewer`

## 核心发现

CCHV 的"高级感"来自三个层面，跟是不是桌面 app 没有关系：

### 1. 设计系统的完整度

CCHV 的 `src/index.css` 有 **278 处** OKLCH 色彩定义，涵盖：

- **基础语义色**：background/foreground/card/popover/primary/secondary/muted/accent/destructive/border/input/ring
- **状态色**：success/warning/info
- **工具专属色**：`--tool-code`, `--tool-file`, `--tool-search` 等 10 种
- **图表色**：`--chart-1` ~ `--chart-5` + gradient stops + glow effects
- **Metric 色**：`--metric-green/purple/blue/amber/pink/teal`
- **Heatmap 色**：`--heatmap-empty/low/medium/high`
- **Shadow 层级**：xs → 2xl + inner + ring + glow + glow-accent
- **动画变量**：timing functions (expo/back/circ/spring) + duration scale

**对比我们**：只有 ~16 个变量（bg-base/subtle/surface/elevated + fg + border + accent），远不够用。

### 2. shadcn/ui 的组件品质兜底

CCHV 用了 shadcn/ui (New York style) 的 24 个组件：
- 基础交互：Button, Dialog, DropdownMenu, Tooltip, Tabs, Input
- 展示容器：Card, Badge, Sheet, Separator, Skeleton
- 高级交互：Command (cmdk), HoverCard, Collapsible, Switch, Select

**效果**：每个按钮、每个弹窗、每个下拉菜单都有一致的圆角、动画、focus 状态、accessibility。开发者不需要思考"这个 button hover 应该变成什么颜色"——组件库已经定义好了。

**对比我们**：每次写按钮都是手拼 Tailwind class (`text-sm px-3 py-1.5 rounded-md border...`)，样式不一致且冗长。

### 3. "包装感"的具体手法

以 MetricCard 为例（CCHV 的统计卡片）：

```tsx
// 1. 半透明毛玻璃背景
"bg-card/80 backdrop-blur-sm"

// 2. 彩色图标底（color-mix 半透明）
style={{ background: `color-mix(in oklch, ${colorVar} 15%, transparent)` }}

// 3. Trend badge（涨跌指示）
<ArrowUpRight className="w-3 h-3" /> <span>{Math.abs(trend)}%</span>

// 4. 大号 mono 数字
"font-mono text-xl md:text-3xl font-bold tracking-tight tabular-nums"

// 5. 大写小号标签
"text-[11px] font-medium uppercase tracking-wider"

// 6. Sub-value 分割线隔开
"mt-3 pt-3 border-t border-border/30"

// 7. 微妙的 hover 变化
"hover:bg-card hover:border-border/60"
```

**对比我们的 StatsCard**：
```tsx
// 朴素版 — 功能一样，但视觉平淡
"rounded-xl border bg-bg-surface px-5 py-4"
"text-xs text-fg-muted"           // 标签
"text-3xl font-semibold"          // 数字
"text-xs text-fg-subtle"          // hint
```

差距不在信息量上（我们也展示了 label + value + hint），而在**层次感和节奏感**：
- 缺少彩色图标底 → 没有视觉锚点
- 缺少 backdrop-blur → 没有深度感
- 缺少 trend indicator → 数据没有方向感
- 缺少 sub-value 分割线 → 信息层次扁平

### 4. SectionCard 模式

CCHV 所有"区域"都用 SectionCard 包裹：
```tsx
<SectionCard title="DAILY TREND" icon={BarChart3} colorVariant="blue">
  {/* 内容 */}
</SectionCard>
```

效果：
- 统一的卡片容器（border + bg + rounded + blur）
- 每个区域有一个带色底的图标 + 大写标题
- 视觉上形成清晰的"块"的节奏

**对比我们**：用 div + 手写 border/bg，缺少统一的 heading 模式。

---

## 可直接借鉴的 CSS 技巧

| 技巧 | 代码 | 效果 |
|---|---|---|
| 彩色半透明图标底 | `color-mix(in oklch, var(--color) 15%, transparent)` | 柔和的彩色背景 |
| 毛玻璃卡片 | `bg-card/80 backdrop-blur-sm` | 层次感 |
| 辉光效果 | `box-shadow: 0 0 20px oklch(... / 0.15)` | 高级感 |
| 微妙 hover | `hover:border-border/60`（40% → 60%） | 灵动但不吵 |
| Mono 数字 | `font-mono tabular-nums tracking-tight` | 数据对齐、专业感 |
| 大写标签 | `text-[11px] uppercase tracking-wider font-medium` | 信息层级分明 |
| 渐变图表 | `linear-gradient` + `oklch stops` | 比纯色更有质感 |

---

## 结论

CCHV 的 UI 品质来自**系统化的设计基础设施**，不是一个个组件手工打磨出来的。引入相同的基础设施（shadcn/ui + OKLCH token + shadow/glow/blur 层级），我们就能达到同样的品质水平，而且因为组件数更少（我们 ~50 个 vs CCHV ~212 个），迁移成本可控。
