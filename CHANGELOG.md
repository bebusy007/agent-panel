# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

#### 工程基础设施

- **Prettier** 前端代码格式化（`.prettierrc`，singleQuote, trailingComma, printWidth 100）
- **rustfmt** 后端代码格式化（`rustfmt.toml`，max_width 100, edition 2024）
- **ESLint** 前端静态分析（`eslint.config.js`，typescript-eslint + react-hooks）
- **.gitattributes** LF 换行统一
- **.editorconfig** 跨编辑器一致性
- **lefthook** pre-commit hook（自动格式化）+ pre-push（typecheck + test）

#### CI/CD

- **CI workflow**（`.github/workflows/ci.yml`）：前端 typecheck + format + lint + test，后端 fmt + clippy + test
- **Release workflow**（`.github/workflows/release.yml`）：tag 驱动多平台构建（macOS/Linux/Windows）
- **Dependabot**（`.github/dependabot.yml`）：npm + Cargo 周更，GitHub Actions 月更
- **PR 模板** + **Issue 模板**（bug report / feature request / question）

#### 类型安全

- **ts-rs** 自动生成 TypeScript 类型（SessionSummary, SkillSummary）
- **zod** 运行时 schema 校验（session, message）

#### 测试

- **MSW API Mock 层**：拦截 HTTP 请求，内存状态仓库，~20 个端点 handler
- **前端组件测试**：Dashboard 页面测试
- **前端 Hook 测试**：useAsync, useDebounced
- **后端集成测试基座**：test_utils.rs（create_test_server, create_test_session_file）
- **后端 API 集成测试**：Session/Search/Favorites/Usage 共 16 个测试

#### 错误处理

- **错误码体系**（`error_codes.rs`）：SCAN-*, LOAD-*, WS-*, SRCH-*, FILE-*, FAV-*, USG-*
- **Panic Hook**（`panic_hook.rs`）：crash.log 自动记录 backtrace + 系统信息

#### 可观测性

- **运行时日志级别切换**：POST /api/log-level 立即生效
- **tracing reload layer**：stdout filter 运行时可调

#### 文档

- **工程优化 spec**（`docs/engineering-improvement/`）：
  - product-spec: 目标和意义
  - tech-spec: 技术方案
  - implementation-plan: 15 Plan 依赖链 roadmap
  - competitor-study: cc-switch + OpenCovibe 工程实践分析
