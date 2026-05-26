# Agent Panel 开发规范

## UI 设计规范

**所有 UI 改动必须遵循 `docs/ui-update/design-system.md`**。不允许自由发挥颜色、间距、圆角、阴影。

核心规则速查：

### 颜色
- 只使用 CSS 变量（`var(--foreground)`、`var(--border)` 等），不可硬编码色值
- Dark mode 用 `rgba(255,255,255, opacity)` 叠层建立层次，不猜灰色值
- Light mode 灰阶：#111(标题) → #555(次要) → #888(辅助)，背景：#FFF → #FAFAFA → #F3F4F5 → #E8E9EB

### 间距
- 基础单位 4px，所有间距必须是 4 的倍数
- token: xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48)

### 圆角
- 按嵌套层级递减：2xl(16px) 页面卡片 → xl(12px) 标准卡片 → lg(8px) 按钮 → md(6px) badge

### 阴影
- E1-E4 四级，面积越大阴影越淡（透明度递减）
- Light/Dark 两套值，见规范文档

### 按钮
- 5 种 variant：default / secondary / outline / ghost / link
- 3 种 size：sm(32px) / default(36px) / lg(44px)
- 状态：hover 加深、active scale(0.97)、disabled opacity 0.5、focus ring

### 选中态
- 导航选中：背景 + 文字升色 + 左侧 3px primary 竖条
- 卡片选中：border-2 primary + 背景着色 + 图标着色（三维度同时区分）

### 文本
- 字号 6 级：Display(28) H1(20) H2(16) Body(14) Caption(12) Tiny(11)
- 字重 3 种：Regular(400) Medium(500) Semibold(600)
- 字体：系统默认，不引入外部字体

## 组件库

使用 shadcn/ui (New York style) 基础组件，源码在 `web/src/components/ui/`。新增组件优先复用已有 ui 组件。

## 项目结构

前后端分离：Rust 后端 + React 前端。

```
├── src-server/              # 后端 API（Rust / Axum）
│   ├── Cargo.toml           # Rust 依赖清单
│   └── src/                 # Rust 源码
├── web/                     # 前端 SPA（React + Vite + Tailwind）
│   ├── package.json         # 前端依赖 & 脚本（dev / build / typecheck）
│   ├── vite.config.ts       # Vite 配置
│   ├── tsconfig.json        # TypeScript 配置
│   ├── src/components/ui/   # shadcn/ui 基础组件
│   ├── src/components/      # 业务组件
│   ├── src/pages/           # 页面级路由组件
│   ├── src/lib/             # 前端工具函数、hooks
│   ├── src/index.css        # Design Token（CSS 变量）
│   └── tailwind.config.cjs  # Tailwind 配置
├── docs/                    # 所有文档
│   ├── ui-update/           # 设计系统（design-system.md = 唯一 UI 规范）
│   └── research/            # 调研资料
└── logs/                    # 运行时日志（gitignored）
```

## Git 规范

- 不直接 push master，走 feature branch → PR → merge
- commit message 格式：`type(scope): description`
- 类型：feat / fix / refactor / docs / release

## 其他

- 截图放 `screenshot/`（gitignored）
- 设计规范版本号标记在 Settings 页面，每次 UI 迭代递增
