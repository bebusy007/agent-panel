# UI 设计系统升级

> 分支：`feat/design-system`
> 状态：规划中
> 优先级：高 — 定义项目的长期 UI 基调

## 目标

将 agent-panel 从"手写 Tailwind 组件"升级为**具备设计系统底座的产品级 UI**。

核心交付：
1. 完整的 Design Token 系统（CSS 变量，OKLCH 色彩空间）
2. shadcn/ui 基础组件库
3. Light / Dark 双主题支持
4. 设置页面（主题切换入口）

## 文档索引

| 文件 | 内容 |
|---|---|
| [plan.md](./plan.md) | 完整实施计划（分阶段、文件清单、色彩体系设计） |
| [research.md](./research.md) | 调研笔记：CCHV 的 UI 做了什么让它看起来"高级" |

## 一句话方案

**shadcn/ui (New York style) + OKLCH Design Token + Light/Dark 双主题**。渐进式迁移，新旧组件通过 CSS 变量兼容层共存。

## 时间估算

约 5-7 天工作量，分 4 个 Phase：
1. 基础设施搭建（token + shadcn 骨架）
2. 核心组件迁移（Dashboard、Cards、Dialog、Buttons）
3. Settings 页面 + 主题切换
4. 细节打磨（skeleton、tooltip、animation）
