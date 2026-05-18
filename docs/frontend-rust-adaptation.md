# 前端全量切换 Rust 后端 — 执行计划

## 原则

- `rust-api.ts` 是唯一 API client，删除旧 `api.ts`
- `shared/types.ts` 不再被前端 import，前端类型全部来自 `rust-api.ts`
- 每个组件直接使用 Rust 类型，不做任何适配/转换层
- 旧代码归档不删除（`server/` + `shared/`），但前端不再引用

## 执行步骤

### Step 1: 删除旧 API 引用关系

- 删除 `web/src/lib/api.ts`
- 将 `rust-api.ts` 重命名为 `api.ts`（保持 import path 不变）
- 删除 `web/src/lib/types-search.ts`、`web/src/lib/types-usage.ts`（旧类型文件）
- 更新 `web/tsconfig.json` 和 `web/vite.config.ts` 去掉 `@shared` alias

### Step 2: 全局替换 import

所有组件文件的 import 变化：
```
// 旧
import { api } from "@/lib/api";
import type { SessionSummary, SkillSummary, ... } from "@shared/types";

// 新
import { rustApi as api, type RustSessionSummary, type RustSkillSummary, ... } from "@/lib/api";
```

或者更简洁——直接在 rust-api.ts 里把 `rustApi` export 为 `api`：
```ts
export { rustApi as api };
```

### Step 3: 逐个页面/组件适配类型

按页面分组，每组改完验证一次 typecheck：

**Group A: Dashboard + Stats** (3 files)
- `pages/Dashboard.tsx` — stats 返回格式变了
- `pages/UsageView.tsx` — usage overview 格式变了
- `components/usage/HeatmapCalendar.tsx` — daily entry 格式

**Group B: Sessions** (8 files)
- `pages/SessionsView.tsx` — SessionSummary 字段变化
- `pages/SessionDetailView.tsx` — session detail 响应变化
- `pages/SessionsTrashView.tsx` — trash list 格式变化
- `components/SessionItem.tsx` — SessionSummary 字段
- `components/SessionDetail.tsx` — Message 类型变化
- `components/VirtualSessionList.tsx` — SessionSummary
- `components/session/RightSidebar.tsx` — messages
- `components/session/TurnSidebar.tsx` — messages

**Group C: Skills + MCPs** (6 files)
- `pages/SkillsView.tsx` — SkillSummary 变化
- `pages/SkillDetailView.tsx` — Skill detail
- `pages/MCPsView.tsx` — McpSummary 变化
- `pages/MCPDetailView.tsx` — MCP detail
- `components/SkillCard.tsx` — SkillSummary
- `components/MCPCard.tsx` — McpSummary

**Group D: Extensions + Favorites** (4 files)
- `pages/ExtensionsView.tsx` — hooks/agents/plugins types
- `pages/FavoritesView.tsx` — FavoriteItem 变化
- `components/sidebar/SessionsSidebar.tsx` — projects 格式
- `components/sidebar/ProjectFolderItem.tsx` — project entry

**Group E: Search + Misc** (5 files)
- `components/GlobalSearch.tsx` — 切到 searchMessages
- `components/SearchBar.tsx`
- `components/SourceBadge.tsx` — source 从对象变为字符串
- `components/ResumeMenu.tsx` — resume API 变化
- `components/tool-cards/cards/TaskCard.tsx` — subagent

### Step 4: 清理

- 删除 `web/src/lib/types-search.ts`
- 删除 `web/src/lib/types-usage.ts`
- 更新 vite.config.ts 去掉 @shared alias
- typecheck 全绿
- build 通过

### Step 5: 启动脚本

- `bin/agent-panel.mjs` 改为 spawn `src-server/target/release/agent-panel-server`
- Vite dev proxy 改为指向 Rust server port

## 验证

每个 Group 完成后：
1. `bun run typecheck` 通过
2. `bun run build` 通过
3. 浏览器验证对应页面正常渲染

全部完成后：
1. Rust server + Vite dev server 联调
2. 所有页面功能验证
