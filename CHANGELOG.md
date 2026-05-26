# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.0.1] - 2026-05-26

### Added

#### 工程基础设施
- Prettier 前端 + rustfmt 后端代码格式化
- ESLint 前端静态分析
- .gitattributes + .editorconfig 跨平台一致性
- lefthook pre-commit/pre-push hooks

#### CI/CD
- CI workflow：前端 typecheck + format + lint + test，后端 fmt + clippy + test
- Release workflow：tag 驱动 macOS DMG 构建
- Dependabot：npm + Cargo 周更，GitHub Actions 月更
- PR 模板 + Issue 模板

#### 类型安全
- ts-rs 自动生成 TypeScript 类型（SessionSummary, SkillSummary）
- zod 运行时 schema 校验

#### 测试
- MSW API Mock 层（~20 个端点）
- 前端组件测试 + Hook 测试
- 后端集成测试基座 + 16 个 API 集成测试
- 总计：前端 355 + 后端 351 测试

#### 错误处理
- 结构化错误码体系（SCAN-*, LOAD-*, WS-* 等）
- Panic Hook → crash.log

#### 可观测性
- 运行时日志级别切换
- tracing reload layer

## [Unreleased]
