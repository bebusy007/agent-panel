# 工程优化产品方案

> 本文定义工程优化的目标和意义。技术方案见 `tech-spec.md`，竞品研究见 `competitor-study.md`，实施计划见 `implementation-plan.md`。

---

## 1. 问题陈述

agent-panel 是一个长期迭代的开源项目，当前存在以下工程债务：

1. **没有 CI/CD**：所有质量检查依赖手动运行 `scripts/check.sh`，合并代码靠开发者自觉
2. **没有代码格式化**：没有 Prettier、没有 rustfmt 配置，代码风格不一致
3. **没有 ESLint**：前端 TypeScript/React 代码没有任何静态分析
4. **前后端类型靠手写对齐**：后端 Rust 类型改了字段名，前端不会报编译错误
5. **前端零组件测试**：24 个测试文件全在 `lib/__tests__/` 测纯函数，没有任何组件渲染测试
6. **后端没有集成测试**：只有 inline unit tests，没有测试过端到端的 API 流程
7. **没有 API Mock 层**：前端无法在没有后端的情况下测试组件
8. **没有 pre-commit hook**：提交前没有自动检查
9. **错误处理不完善**：没有错误码体系、没有 crash 日志
10. **没有依赖自动更新**：手动管理依赖版本

这些问题在项目早期可以接受，但随着功能增加（特别是即将到来的对话集成），工程债务会指数级增长。

---

## 2. 目标

### 2.1 总目标

建立完整的工程基座，使得：
- **任何代码变更都有自动化质量保障**（CI 跑完才能 merge）
- **前后端类型变更能在编译期发现问题**（不是运行时 undefined）
- **关键路径有测试覆盖**（改了代码不怕坏）
- **出了问题能快速定位**（结构化日志 + 错误码 + crash 日志）
- **新贡献者能快速上手**（pre-commit 自动格式化，CI 自动检查）

### 2.2 六个维度

| 维度 | 目标 | 衡量标准 |
|------|------|---------|
| 代码一致性 | 所有代码看起来像一个人写的 | CI 跑 format:check 和 lint 都通过 |
| 类型安全 | 前后端类型变更不产生运行时错误 | ts-rs 生成类型 + zod 校验，typecheck 通过 |
| 测试覆盖 | 核心路径有测试保护 | 组件测试覆盖 SessionDetail、ToolCard 等关键组件；后端集成测试覆盖 session CRUD、search、resume |
| 错误处理 | 出了问题 5 分钟内定位 | 结构化错误码 + crash.log + 请求级日志 |
| 开发体验 | 提交代码自动检查 | pre-commit 跑 prettier + rustfmt + typecheck |
| 持续集成 | 质量门禁自动化 | CI workflow 跑 typecheck + format + lint + test |

---

## 3. 非目标

以下不在本次工程优化范围内：

1. **不改业务功能**：工程优化不涉及任何用户可见的功能变更
2. **不做性能优化**：当前性能已经足够（131 sessions 扫描 271ms）
3. **不做 E2E 测试**：E2E 测试需要完整的 Tauri 运行时，成本过高，留到后续
4. **不做 i18n**：当前只有中文，国际化是独立议题
5. **不做 Windows/Linux 构建**：当前只支持 macOS，但工程基建要设计为跨平台兼容

---

## 4. 影响范围

### 4.1 新增文件

| 文件 | 用途 |
|------|------|
| `.prettierrc` | 前端格式化配置 |
| `rustfmt.toml` | 后端格式化配置 |
| `.editorconfig` | 跨编辑器一致性 |
| `.gitattributes` | 换行符规则 |
| `lefthook.yml` | Pre-commit hook |
| `web/eslint.config.js` | 前端 lint |
| `.github/workflows/ci.yml` | CI workflow |
| `.github/workflows/release.yml` | Release workflow |
| `.github/dependabot.yml` | 依赖自动更新 |
| `.github/pull_request_template.md` | PR 模板 |
| `.github/ISSUE_TEMPLATE/` | Issue 模板 |
| `web/src/lib/schemas/` | zod 校验 schema |
| `src-server/tests/support.rs` | 后端测试工具 |
| `src-server/src/panic_hook.rs` | Crash 日志 |
| `src-server/src/error_codes.rs` | 错误码体系 |
| `tests/msw/` | 前端 API Mock 层 |
| `web/src/components/__tests__/` | 前端组件测试 |

### 4.2 修改文件

| 文件 | 改动 |
|------|------|
| `package.json` | 加 scripts（format, format:check, lint, lint:fix） |
| `src-server/Cargo.toml` | 加 dev-dependencies（ts-rs, axum-test 等） |
| `src-server/src/main.rs` | 加 panic_hook 初始化 |
| `src-server/src/logging.rs` | 加运行时日志级别切换 |
| `web/vite.config.ts` | 加 MSW setup |
| `web/tsconfig.json` | 加 generated types 路径 |
| `scripts/check.sh` | 更新为新的检查步骤 |
| `CHANGELOG.md` | 新建 |

### 4.3 不变文件

所有业务组件、页面、路由、API 端点保持不变。工程优化是"基础设施层"改动，不触及"业务逻辑层"。

---

## 5. 成功标准

工程优化完成后，以下场景应该能自动工作：

1. **开发者提交代码**：pre-commit 自动格式化 → CI 自动跑 typecheck + lint + test → PR 模板引导描述
2. **后端改了 Rust 类型**：ts-rs 自动重新生成 TypeScript 类型 → 前端 typecheck 报错 → 开发者在编译期修复
3. **前端改了组件**：组件测试失败 → 开发者在本地发现问题，不是在线上
4. **线上 crash**：crash.log 记录 backtrace + 系统信息 → 日志里有错误码 → grep 定位
5. **依赖有安全漏洞**：Dependabot 自动提 PR → CI 自动跑测试验证兼容性

---

## 6. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 格式化大量文件导致 git blame 失效 | 中 | 用 `.git-blame-ignore-revs` 排除格式化 commit |
| ts-rs 生成的类型与现有手写类型冲突 | 低 | 渐进迁移，先覆盖核心类型（Session, Message） |
| MSW Mock 层维护成本 | 中 | 只 mock 核心 Tauri commands，不 mock 全部 |
| ESLint 规则过于严格阻塞开发 | 低 | 从 warning 开始，逐步升级为 error |

---

## 7. 跨平台兼容性说明

当前 agent-panel 只支持 macOS，但工程基建设计为跨平台兼容：

- **Prettier / rustfmt / ESLint**：纯开发工具，不依赖平台
- **ts-rs**：编译期代码生成，不依赖平台
- **MSW**：浏览器/Node.js 环境，不依赖平台
- **tracing**：Rust 标准日志框架，跨平台
- **lefthook**：Git hook 管理，跨平台
- **CI workflow**：GitHub Actions 支持多平台矩阵
- **panic_hook**：`std::backtrace` 跨平台，文件路径用 `app_config_dir`

后续扩展到 Windows/Linux 时，工程基建不需要改动。
