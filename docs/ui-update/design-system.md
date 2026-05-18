# Agent Panel 设计规范

> 映射自「小美生活小秘书 · 移动端设计规范」，适配 Web 端。
> 本文档定义所有 UI 决策的规则；代码必须遵循此规范，不可自由发挥。

---

## 1. 色彩系统

### 1.1 中性色 · 灰阶关系

**Light Mode**（亮色主题，默认参考白色承载面）

| Token | 色值 | 用途 |
|-------|------|------|
| **N1** | `#111111` | 标题文字、主要正文 |
| **N2** | `#555555` | 次要文字（副标题、说明） |
| **N3** | `#888888` | 辅助文字（时间戳、placeholder） |
| **B1** | `#FFFFFF` | 页面背景 |
| **B2** | `#FAFAFA` | 卡片背景 |
| **B3** | `#F3F4F5` | 嵌套面板、输入框底色 |
| **B4** | `#E8E9EB` | 分割线、最深的浅灰底色 |

规律：文字从深到浅（#111 → #555 → #888），背景从浅到深（#FFF → #FAFAFA → #F3F4F5 → #E8E9EB）。两者不交叉。

**Dark Mode**（暗色主题，深底 + 透明白叠加）

| Token | 色值 | 用途 |
|-------|------|------|
| **N1** | `#F5F5FA` | 标题文字、主要正文 |
| **N2** | `#A8A8B8` | 次要文字（副标题、说明） |
| **N3** | `#78788A` | 辅助文字（时间戳、placeholder） |
| **N4** | `#55556A` | 极弱文字（disabled、极低优先级） |
| **B-page** | `#0D0D14` | 页面背景 |
| **B-card** | `rgba(255,255,255, 0.05)` | 卡片背景 |
| **B-nested** | `rgba(255,255,255, 0.08)` | 嵌套面板、输入框底色 |
| **B-border** | `rgba(255,255,255, 0.10)` | 分割线、边框 |
| **B-hover** | `rgba(255,255,255, 0.12)` | Hover 态背景加深 |

规律：暗色模式用**一个深底色 + 递增透明度的白色覆盖**建立层次，不用多个独立灰色。

### 1.2 品牌色 / 强调色

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| **Primary** | `#059669` (emerald-600) | `#34D399` (emerald-400) | 主按钮、选中态、focus ring |
| **Primary-fg** | `#FFFFFF` | `#FFFFFF` | Primary 上的文字 |

### 1.3 语义色

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| **Success** | `#16A34A` | `#34D399` | 成功状态 |
| **Warning** | `#D97706` | `#FBBF24` | 警告状态 |
| **Error** | `#E53935` | `#FF4444` | 错误 / 危险操作 |
| **Info / Link** | `#2563EB` | `#60A5FA` | 可点击文字、信息提示 |

### 1.4 Metric / 图表色

用于 Dashboard 统计卡片和图表系列：

| Token | Light | Dark |
|-------|-------|------|
| **Purple** | `#7C3AED` | `#A78BFA` |
| **Blue** | `#2563EB` | `#60A5FA` |
| **Green** | `#16A34A` | `#34D399` |
| **Amber** | `#D97706` | `#FBBF24` |
| **Pink** | `#DB2777` | `#F472B6` |
| **Teal** | `#0D9488` | `#2DD4BF` |

---

## 2. 文本系统

### 2.1 字体

- **正文**：系统默认 sans-serif（-apple-system、PingFang SC、Segoe UI）
- **代码**：系统默认 monospace（SF Mono、Menlo、Consolas）
- **不引入外部字体文件**

### 2.2 字号层级（Web 适配）

原移动端规范基于 750px 2x，以下是 Web 端映射：

| 级别 | 移动端 | Web 适配 | 字重 | 行高 | 用途 |
|------|--------|----------|------|------|------|
| **Display** | — | 28px | 700 | 1.2 | 页面大标题（极少使用） |
| **H1** | 34px/2x=17pt | 20px | 600 | 1.3 | Section 标题 |
| **H2** | 30px/2x=15pt | 16px | 600 | 1.4 | 卡片标题、列表项主文字 |
| **Body** | 26px/2x=13pt | 14px | 400 | 1.5 | 正文、描述 |
| **Caption** | 22px/2x=11pt | 12px | 400 | 1.4 | 辅助信息、时间戳、badge |
| **Tiny** | — | 11px | 500 | 1.3 | 大写标签（UPPERCASE tracking-wider） |

### 2.3 字重

只使用三种：
- **Regular 400**：正文
- **Medium 500**：强调性 caption
- **Semibold 600**：标题

---

## 3. 间距系统

基础单位：**4px**。所有间距必须是 4 的倍数。

| Token | 值 | 用途 |
|-------|-----|------|
| **xs** | 4px | 紧凑间距（图标与 badge 之间） |
| **sm** | 8px | 元素间距（同行元素之间） |
| **md** | 16px | 行间距、列表项之间 |
| **lg** | 24px | 图文间距、卡片内主要分组 |
| **xl** | 32px | 卡片内边距、模块间距 |
| **2xl** | 48px | 页面级区块间距 |

### 3.1 页面布局

| 属性 | 值 |
|------|-----|
| 页面最大宽度 | 1400px，居中 |
| 页面水平边距 | 24px（小屏）/ 32px（大屏） |
| 卡片内边距 | 20px（紧凑卡片）/ 24px（标准卡片） |
| Section 间距 | 24px |

---

## 4. 容器与圆角

斐波那契递减：外层大、内层小。

| Token | 值 | 用途 |
|-------|-----|------|
| **R1** | 16px | 页面级卡片、弹窗、大面板 |
| **R2** | 12px | 标准卡片、下拉菜单 |
| **R3** | 8px | 按钮、输入框、代码块 |
| **R4** | 6px | badge、tag、小元素 |
| **full** | 9999px | 头像、胶囊按钮 |

### 4.1 嵌套规则

外层容器圆角 > 内层容器圆角。示例：
- 页面卡片(R1=16px) 内的子容器用 R2=12px
- 子容器内的元素用 R3=8px 或 R4=6px

---

## 5. 阴影系统

面积越大 → 模糊越大、透明度越低（保持轻盈感）。

**Light Mode（双层阴影 = 主阴影 + 环境阴影）：**

| 级别 | 主阴影 | 环境阴影 | 适用 |
|------|--------|----------|------|
| **E1 小** | `0 1px 3px rgba(0,0,0,0.06)` | `0 1px 2px rgba(0,0,0,0.03)` | 按钮、badge |
| **E2 中** | `0 2px 8px rgba(0,0,0,0.05)` | `0 1px 3px rgba(0,0,0,0.03)` | 卡片、输入框 |
| **E3 大** | `0 4px 16px rgba(0,0,0,0.04)` | `0 2px 6px rgba(0,0,0,0.02)` | 大卡片、浮层 |
| **E4 超大** | `0 8px 32px rgba(0,0,0,0.03)` | `0 4px 12px rgba(0,0,0,0.02)` | 弹窗、Modal |

**Dark Mode：**

| 级别 | 主阴影 | 环境阴影 |
|------|--------|----------|
| **E1** | `0 1px 3px rgba(0,0,0,0.4)` | `0 1px 2px rgba(0,0,0,0.3)` |
| **E2** | `0 2px 8px rgba(0,0,0,0.35)` | `0 1px 3px rgba(0,0,0,0.25)` |
| **E3** | `0 4px 16px rgba(0,0,0,0.3)` | `0 2px 6px rgba(0,0,0,0.2)` |
| **E4** | `0 8px 32px rgba(0,0,0,0.25)` | `0 4px 12px rgba(0,0,0,0.15)` |

---

## 6. 分割线

| 类型 | Light | Dark |
|------|-------|------|
| 实线分割 | `1px solid #E8E9EB` | `1px solid rgba(255,255,255,0.08)` |
| 虚线分割 | `1px dashed #E8E9EB` | `1px dashed rgba(255,255,255,0.08)` |
| 卡片边框 | `1px solid #E8E9EB` | `1px solid rgba(255,255,255,0.10)` |

---

## 7. 按钮

### 7.1 类型

| 类型 | Light | Dark | 用途 |
|------|-------|------|------|
| **Primary** | 背景 `#5B4CD6`，文字 `#FFF` | 背景 `#7C6AFF`，文字 `#FFF` | 主操作 |
| **Secondary** | 背景 `#F3F4F5`，文字 `#333` | 背景 `rgba(255,255,255,0.08)`，文字 `#E0E0EA` | 次要操作 |
| **Outline** | 背景透明，边框 `#E2E2E8`，文字 `#333` | 背景透明，边框 `rgba(255,255,255,0.15)`，文字 `#E0E0EA` | 轻量操作 |
| **Ghost** | 背景透明，无边框，文字 `#555` | 背景透明，无边框，文字 `#A8A8B8` | 图标按钮、极轻操作 |
| **Text/Link** | 无背景，文字 `#5B4CD6` | 无背景，文字 `#7C6AFF` | 链接式按钮 |

### 7.2 尺寸

| Size | 高度 | 字号 | 水平 padding | 圆角 |
|------|------|------|--------------|------|
| **sm** | 32px | 13px | 12px | R3(8px) |
| **default** | 36px | 14px | 16px | R3(8px) |
| **lg** | 44px | 15px | 24px | R3(8px) |

### 7.3 状态

- **Hover**：背景加深 5%（light）或 lighten 5%（dark）
- **Active/Pressed**：`transform: scale(0.97); opacity: 0.9`
- **Disabled**：`opacity: 0.5; cursor: not-allowed`
- **Focus**：`box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 25%, transparent)`

---

## 8. 选中态 / 激活态

这是之前做得最差的部分，需要明确规则：

### 8.1 导航项选中

- **选中**：背景 `rgba(255,255,255,0.08)`（dark）/ `#F3F4F5`（light），文字升为 N1 色，左侧 3px primary 色竖条
- **未选中**：背景透明，文字 N3 色
- **Hover（未选中）**：背景 `rgba(255,255,255,0.04)`（dark）/ `#FAFAFA`（light），文字升为 N2

### 8.2 卡片/列表项选中

- **选中**：边框变为 `primary` 色（2px），背景加入 `color-mix(in srgb, var(--primary) 5%, transparent)`
- **未选中**：边框 `var(--border)` 色
- **Hover**：边框加深一级，微弱 shadow 出现

### 8.3 Settings 主题选择器

- **选中**：边框 `primary`（2px），背景 `color-mix(in srgb, var(--primary) 8%, transparent)`，图标着 primary 色
- **未选中**：边框 `var(--border)`，背景 `var(--card)`，图标着 N3 色
- **对比度要求**：选中和未选中必须在边框粗细 + 颜色 + 背景 三个维度同时有差异

---

## 9. 背景特效（Dark 专属）

- **毛玻璃**：卡片使用 `backdrop-filter: blur(20px) saturate(150%)`（仅 dark mode）
- **辉光**：Primary 元素可加 `box-shadow: 0 0 20px color-mix(in srgb, var(--primary) 15%, transparent)`
- **注意**：Light mode 不使用 blur/glow，依靠阴影层次建立深度

---

## 10. 关键对比度要求

| 组合 | 最低对比度 |
|------|-----------|
| N1 on B1/B2 | ≥ 7:1 (AAA) |
| N2 on B1/B2 | ≥ 4.5:1 (AA) |
| N3 on B1/B2 | ≥ 3:1 (AA for large text) |
| Primary on B1 | ≥ 4.5:1 (AA) |
| Border on B2 | 肉眼清晰可辨 |

---

## 附录：CSS 变量映射表

以下是规范到代码的对应关系：

```
--background    → B1 (light) / B-page (dark)
--foreground    → N1
--card          → B2 (light) / B-card (dark)
--card-foreground → N1
--muted         → B3 (light) / B-nested (dark)
--muted-foreground → N3
--border        → B4 (light) / B-border (dark)
--primary       → Primary
--primary-foreground → Primary-fg
--secondary     → B3 (light) / B-nested (dark)
--secondary-foreground → N2
--accent        → Primary (用于强调)
--accent-foreground → Primary-fg
--destructive   → Error
--input         → B3 (light) / B-nested (dark)
```
