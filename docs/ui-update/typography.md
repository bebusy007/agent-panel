# Agent Panel 文字规范

> 本文档定义全项目的文字 UI 规范。所有文字相关样式必须遵循此规范。

---

## 1. 字号层级

所有字号通过 CSS 变量收口，用户可在"设置 → 字号"中分级调整。

| 级别 | CSS 变量 | 默认值 | 字重 | 行高 | Utility class | 用途 |
|------|----------|--------|------|------|---------------|------|
| **H1** | `--text-h1` | 24px | 600 (semibold) | 1.3 | `typo-h1` | 页面标题（概览、用量、会话…） |
| **H2** | `--text-h2` | 16px | 600 (semibold) | 1.4 | `typo-h2` | 卡片标题、对话框标题 |
| **Body** | `--text-body` | 14px | 400 (regular) | 1.5 | `typo-body` | 正文、描述、列表项主文字 |
| **Caption** | `--text-caption` | 12px | 400 (regular) | 1.4 | `typo-caption` | 辅助文字、时间戳、badge 文字 |
| **Label** | `--text-label` | 11px | 500 (medium) | 1.3 | `typo-label` | Section 大写标签（自带 UPPERCASE + tracking-wider + muted 色） |
| **Sub** | `--text-sub` | 10px | 400 (regular) | 1.3 | `typo-sub` | 极辅助（表头、链接、微标注） |

### 用法示例

```html
<!-- Section 大写标签 -->
<h2 class="typo-label">对话来源分布</h2>

<!-- 需要额外 class 时，typo-label 后追加 -->
<h2 class="typo-label mb-3">按模型</h2>
```

---

## 2. 字体

| 类型 | 字体栈 | Tailwind class | 使用场景 |
|------|--------|----------------|----------|
| **正文** | -apple-system, PingFang SC, Segoe UI, sans-serif | （默认） | 所有中英文正文 |
| **代码** | SF Mono, Menlo, Consolas, monospace | `font-mono` | 数值、文件路径、Session ID、代码块、Token 数值 |

**不引入外部字体文件。**

### Mono 字体使用规则

以下场景必须使用 `font-mono`：
- 统计数字（57、18、130 等）
- Token 数值（222M、3.2M）
- 文件路径（~/workspace/skill-panel）
- Session ID、Message ID
- 代码片段、命令行
- 表格中的数值列（配合 `tabular-nums`）

---

## 3. 字重

只使用三种字重，**不使用 font-bold (700)**：

| 字重 | Tailwind class | 用途 |
|------|----------------|------|
| **400 Regular** | `font-normal`（默认） | 正文、描述、辅助文字 |
| **500 Medium** | `font-medium` | 强调性 caption、Label 标签、列表项名称 |
| **600 Semibold** | `font-semibold` | 标题（H1/H2）、统计卡片数值 |

---

## 4. 字间距

| 场景 | Tailwind class | 值 |
|------|----------------|-----|
| 大写标签（Label） | `tracking-wider` | 0.05em（已内含在 `typo-label`） |
| 页面标题（H1） | `tracking-tight` | -0.025em |
| 其他 | 默认 | 0 |

---

## 5. 文字颜色

全部使用 CSS 变量，自动适配 light/dark 模式：

| 语义 | CSS 变量 | Tailwind class | Dark 值 | Light 值 |
|------|----------|----------------|---------|----------|
| 主要文字 | `--foreground` | `text-foreground` | #F5F5FA | #111111 |
| 次要/辅助 | `--muted-foreground` | `text-muted-foreground` | #78788A | #888888 |
| 卡片文字 | `--card-foreground` | `text-card-foreground` | #F5F5FA | #111111 |
| 主色文字 | `--primary` | `text-primary` | #34D399 | #059669 |

**禁止硬编码灰色值**（如 `text-gray-500`）。语义状态色（`text-red-300`、`text-emerald-400`）允许使用。

---

## 6. 用户自定义

### 设置入口

设置页 → 字号区块，每个层级可独立调整（步进 1px）。

### 持久化

- localStorage key: `agent-panel:typography`
- 格式: `{"h1": 24, "h2": 16, "body": 14, "caption": 12, "label": 11, "sub": 10}`
- 页面加载时通过 `applyTypography()` 读取并设置 CSS 变量
- "恢复默认"按钮重置所有值

### 代码入口

- CSS 变量定义: `web/src/index.css` `:root`
- Utility class 定义: `web/src/index.css` 底部
- 读写逻辑: `web/src/lib/typography.ts`
- 设置 UI: `web/src/pages/SettingsView.tsx`
- 初始化: `web/src/main.tsx` → `applyTypography()`
