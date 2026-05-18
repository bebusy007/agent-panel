# Routing & Navigation 设计

> 作为 agent-panel 路由 / 页面层级 / 状态保留 / 跳转交互的总纲。
> 后续做新页面、改导航、加按钮跳转，先看这里再动手。

---

## 0. 设计原则

agent-panel 是**本机离线看板**——不是 SaaS。这个前提决定了几个非常重要的取舍：

1. **不为分享而设计 URL**。URL 只用来支撑浏览器前进/后退和路由匹配，不需要把 search/filter 都同步过去。
2. **状态优先存内存**。用户体验的核心是"我刚才在的地方还在"，最快的实现就是组件不卸载，state 不重建——比 sessionStorage 恢复快、比 URL 重建准。
3. **详情页是"覆盖"在列表页之上**（Activity 模型），不是"替换"。返回 = 揭开覆盖层，不是重新生成列表。
4. **二级 SidebarPanel（项目文件夹树）只在和"会话"相关的视图出现**（`/sessions`、`/favorites`、`/sessions/:id`）。其他 tab 不需要它，避免 260px 的视觉负担。
5. **唯一的真 modal**：删除确认 (`ConfirmDialog`)。这是阻断式 UX（要求用户键入"删除"二字），必须用 modal。其他所有"打开看一眼"都用路由 overlay。

---

## 1. 路由清单

### 1.1 一级路由（IconRail 入口，5 个 tab）

| 路由 | 组件 | 显示 SidebarPanel? | 备注 |
|-----|------|------------------|------|
| `/` | `Dashboard` | 否 | 概览 |
| `/sessions` | `SessionsView` | **是**（项目文件夹树） | 会话列表 + 双模式搜索（详见 §1.4） |
| `/usage` | `UsageView` | 否 | Token / 成本 / 活跃度 |
| `/extensions` | `ExtensionsView` | 否 | 扩展（含 6 个 sub-section） |
| `/favorites` | `FavoritesView` | **是**（沿用 Sessions 的） | 收藏 |

> **`/history` 已并入 `/sessions`**。原 History 的两个 tab——会话筛选（Runs）和消息全文搜索（Prompts）——是 SessionsView 能力的扩展而不是独立页，单独存在反而割裂体验。详见 §1.4。

### 1.2 二级详情路由（**Overlay 模式**，列表保持挂载）

| 路由 | 组件 | 入口（列表页） | Deep-link fallback "返回" |
|-----|------|--------------|------------------------|
| `/sessions/:id` | `SessionDetailView` | `/sessions`、`/favorites`、Sidebar、Dashboard | → `/sessions` |
| `/skills/:id` | `SkillDetailView` | `/extensions?section=skills`、Dashboard | → `/extensions?section=skills` |
| `/mcps/:id` | `MCPDetailView` | `/extensions?section=mcp` | → `/extensions?section=mcp` |
| `/agents/:id` | `AgentDetailView` | `/extensions?section=agents` | → `/extensions?section=agents` |

### 1.3 子路由 / 旁路

| 路由 | 组件 | 类型 | 备注 |
|-----|------|------|------|
| `/sessions/trash` | `SessionsTrashView` | 列表（不是 detail） | Sessions 的回收站 |
| `/skills` | `SkillsView` | 列表 | 兼容直链；现在主要靠 `/extensions?section=skills` 进入 |
| `/mcps` | `MCPsView` | 列表 | 同上 |
| `/extensions?section=<key>` | `ExtensionsView` | tab 切换 | section ∈ {skills, mcp, hooks, agents, commands, plugins} |
| `*` | `NotFound` | 兜底 | 404 |

> **`/skills` `/mcps` 的角色**：技术上是独立路由，但产品上已被 `/extensions` 收编为内嵌 section。保留独立路由的唯一理由是兼容老书签，UI 上不再从 IconRail 直接暴露入口。

### 1.4 SessionsView 的双模式搜索

合并 History 后，SessionsView 的搜索框右侧新增一个 mode toggle：

```
┌──────────────────────────────────────────┬──[ 会话 │ 消息 ]──┐
│ 🔍 搜索…                                  │  toggle           │
└──────────────────────────────────────────┴───────────────────┘
```

| 模式 | 搜索范围 | 结果列表 | 点击行为 |
|------|---------|---------|---------|
| `runs`（默认）| 会话标题 / cwd / 首条消息 | 会话卡片（同当前 SessionsView） | overlay 打开 `/sessions/:id` |
| `prompts` | 每条消息正文（全文索引） | 消息片段卡片（带关键词高亮） | overlay 打开 `/sessions/:id?msg=:msgId` |

**runs 模式**沿用现有的 `/api/sessions` + 客户端排序 + 折叠的"高级筛选"区域：
- 高级区原有：来源 chips、项目 cwd chips、显示已隐藏
- **新增**：日期范围 from/to、"仅实时"复选框（从 History 搬过来）
- **新增**：搜索结果摘要条（总匹配数、总 token、实时 N 个）

**prompts 模式**沿用 `/api/prompts/search`：
- 显示索引状态（已索引 N 条 + "重建"按钮）
- 列表项是消息片段，带 `<mark>` 高亮
- 点击 → `/sessions/:sessionId?msg=:messageId` overlay，详情页自动 scroll 到 / 高亮该消息

**为什么这样设计**：
- History 的 runs tab 和 SessionsView 列表本质是同一份数据 + 同一类操作（查看 / 删除 / 隐藏 / 收藏），独立页造成"我搜会话要去 history，看会话列表去 sessions"的认知割裂
- prompts 模式作为 toggle 而非独立页，让用户在同一个搜索框里轻松切换"按会话搜" vs "按消息搜"，比跳到另一个 tab 自然
- 保留了 History 的所有能力（包括 prompt-index 的全文搜索），只是入口归一

---

## 2. UI 层级（z-index 从下往上）

```
┌──────────────────────────────────────────────────────────────┐
│  IconRail (44px, 始终可见)                                   │
├──────────┬───────────────────────────────────────────────────┤
│          │                                                   │
│ Sidebar  │  Main Route (列表 / Dashboard / Usage 等)         │
│ Panel    │                                                   │
│ (260px,  │       ┌──────────────────────────────────────┐    │
│  仅      │       │  Detail Overlay (z-30)               │    │
│ /sessions│       │  仅当 backgroundLocation 存在时叠加  │    │
│ /favs)   │       │  完全覆盖 Main Route 区域            │    │
│          │       └──────────────────────────────────────┘    │
└──────────┴───────────────────────────────────────────────────┘

Toast (z-50, fixed bottom-right, 操作反馈)
ConfirmDialog (z-50, modal centered, 删除确认)
```

**关键点**：
- 详情 overlay 渲染在 Main Route 同一个区域，**不覆盖** IconRail 和 SidebarPanel
- 当 `/sessions/:id` overlay 打开时，**SidebarPanel 仍然可见**——你可以从 sidebar 直接点别的会话切换 detail（类似 cursor / vscode 同时开多文件的体验）
- 详情**完全覆盖**它下面的列表（不是半透明的"模态"，那是给小弹窗用的视觉风格）

---

## 3. Overlay 模式工作原理

### 3.1 Navigation 调用约定

任何"列表 → 详情"的跳转：

```ts
import { useLocation, useNavigate } from "react-router-dom";

const location = useLocation();
const navigate = useNavigate();

// 列表行点击 / 卡片点击 / sidebar 点击
const openDetail = (id: string) => {
  navigate(`/sessions/${encodeURIComponent(id)}`, {
    state: { backgroundLocation: location },
  });
};
```

### 3.2 App 层渲染

```tsx
function App() {
  const location = useLocation();
  const state = location.state as { backgroundLocation?: Location } | null;
  const background = state?.backgroundLocation;

  return (
    <Layout>
      {/* 第一套 Routes：用 background location（如果有），否则用真实 location */}
      <Routes location={background || location}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sessions" element={<SessionsView />} />
        <Route path="/sessions/:id" element={<SessionDetailView />} />
        <Route path="/skills" element={<SkillsView />} />
        <Route path="/skills/:id" element={<SkillDetailView />} />
        ...所有路由都列出（确保 deep link 直访也 work）
      </Routes>

      {/* 第二套 Routes：仅当存在 background 时叠加 */}
      {background && (
        <Routes>
          <Route path="/sessions/:id" element={<SessionDetailView overlay />} />
          <Route path="/skills/:id" element={<SkillDetailView overlay />} />
          <Route path="/mcps/:id" element={<MCPDetailView overlay />} />
          <Route path="/agents/:id" element={<AgentDetailView overlay />} />
        </Routes>
      )}
    </Layout>
  );
}
```

### 3.3 详情组件的两种模式

详情组件接收 `overlay?: boolean` prop：

| Prop | 场景 | 行为 |
|-----|------|------|
| `overlay={true}` | 从列表点进来（带 backgroundLocation） | 用 `position: absolute` 覆盖 main 区域；返回按钮 = `navigate(-1)` |
| `overlay` 缺省 | Deep link 直访 | 普通 full-bleed 渲染；返回按钮 = `navigate(fallbackList)` |

> 小逻辑细节：详情自己探测 `useLocation().state?.backgroundLocation` 决定上面两种模式，App 不需要把 prop 传下去。

### 3.4 浏览器前进/后退

| 用户操作 | 实际发生 |
|---------|---------|
| 列表 → 点详情 | `pushState` 一条新历史；列表组件**不卸载**；overlay 出现 |
| 浏览器后退 | `popState` 回到上一条历史（即列表）；overlay 撤下；列表 state 完全保留 |
| 浏览器前进 | 重新拿到 detail location；overlay 又叠回来 |
| 详情里点"返回" | `navigate(-1)` 等价于浏览器后退 |
| 详情里点 sidebar 别的会话 | `navigate(/sessions/<other>, { state: backgroundLocation })`，overlay 切换 detail，列表仍不动 |

### 3.5 Deep link 兜底

| URL | 第一次直接访问 | 返回行为 |
|-----|--------------|---------|
| `/sessions/abc` | 第一套 Routes 命中，渲染 `SessionDetailView`（standalone 模式） | 返回 → `navigate("/sessions")` |
| `/skills/abc` | 渲染 `SkillDetailView`（standalone） | 返回 → `navigate("/extensions?section=skills")` |
| `/agents/abc` | 渲染 `AgentDetailView`（standalone） | 返回 → `navigate("/extensions?section=agents")` |
| `/mcps/abc` | 渲染 `MCPDetailView`（standalone） | 返回 → `navigate("/extensions?section=mcp")` |

---

## 4. 状态层次 & 保留策略

### 4.1 状态分层

| 层 | 例子 | 存储位置 | 生命周期 |
|---|------|---------|---------|
| L0 路由 state | 当前 URL、backgroundLocation | History API | 浏览器会话 |
| L1 组件 useState | 列表 query、filter pills、selected ids | React 内存 | **组件 mount 期间**（overlay 后整个浏览会话） |
| L2 ref / virtualizer | scrollTop、virtualizer measure cache | React 内存 | 同 L1 |
| L3 数据缓存 | API 响应数据 | `useCachedAsync` 模块级 Map | 浏览器会话 |
| L4 长期偏好 | sidebar 宽度、折叠状态、pinned 项目 | localStorage | 跨会话 |
| L5 服务端 | 收藏、隐藏、回收站 | server JSON | 永久 |

### 4.2 Overlay 模式带来的简化

**之前要为状态保留写一堆代码：**
- search query 同步到 URL params
- filter pills 同步到 URL params
- sort/dir 同步到 URL params
- sidebar query 写 sessionStorage
- sidebar source pills 写 sessionStorage
- VirtualSessionList 用 sessionStorage 保存 scrollTop + 复杂 restore 时序

**Overlay 之后：**
- 上面几乎全删——组件不卸载，useState 自然保留
- **保留**：`useCachedAsync` 仍然有用（mutation 后 invalidate / 后台 revalidate），sidebar 长期偏好（宽度、pinned）仍走 localStorage
- **可选保留**：search query 仍可同步到 URL，但**只是为了浏览器前进/后退能精确定位某次搜索状态**——这是 nice-to-have，不再是关键路径

### 4.3 数据缓存策略（不变）

`useCachedAsync(key, fn, deps)` 模块级 Map 缓存：
- `loading` 只在 key 第一次取数时为 true，重访不闪
- `refetch()` 不会让 `loading` 翻 true，旧数据保持可见，新数据后台到了再换
- 后端 mutation 后用 `invalidateAsyncCache({ prefix })` 精确清缓存子集
- 不要把"刷新计数"嵌到 cache key 里——那会每次都新建 key 导致 loading 闪

---

## 5. 完整跳转矩阵

### 5.1 列表 → 详情（全部用 backgroundLocation overlay）

| 起点 | 触发 | 终点 |
|------|------|------|
| `/sessions` 行点击 | `onSelect` | `/sessions/:id` overlay |
| `/sessions` 收藏图标的 sessionId | n/a | — |
| `/favorites` "跳转到会话" | 卡片按钮 | `/sessions/:sessionId?msg=:msgId` overlay |
| `SessionsSidebar` 点对话 | `ProjectFolderItem` 行点击 | `/sessions/:id` overlay |
| `Dashboard` 最近对话 | 行点击 | `/sessions/:id` overlay |
| `Dashboard` 最近 Skill | 行点击 | `/skills/:id` overlay |
| `Dashboard` 最近收藏 | 行点击 | `/sessions/:sessionId?msg=:msgId` overlay |
| `/extensions?section=skills` 卡片 | 卡片点击 | `/skills/:id` overlay |
| `/extensions?section=mcp` 卡片 | 卡片点击 | `/mcps/:id` overlay |
| `/extensions?section=agents` 卡片 | 卡片点击 | `/agents/:id` overlay |

### 5.2 横向 / 顶级跳转（普通 navigate，**不带** backgroundLocation）

| 起点 | 终点 |
|------|------|
| 任何 → IconRail | `/`, `/sessions`, `/usage`, `/extensions`, `/favorites` |
| `/sessions` → 回收站按钮 | `/sessions/trash` |
| `/sessions/trash` → 面包屑 | `/sessions` |
| 任何 detail → 顶部"扩展 / Skills"等面包屑 | `/extensions?section=...` |

### 5.3 详情内的"切换 detail"

| 起点 | 终点 |
|------|------|
| `/sessions/:id` overlay 时点 sidebar 另一会话 | `/sessions/:other-id` overlay（替换上一层） |

> 这里需要 `navigate(newPath, { state: { backgroundLocation }, replace: true })`——`replace: true` 确保历史栈里只保留一条 detail 记录，不会"按返回 5 次"才回到列表。

---

## 6. 哪些状态不保留是预期行为？

| 状态 | 行为 | 原因 |
|------|------|------|
| 详情页内部 in-pane search 关键字 | 关闭详情后丢失 | detail 是 overlay，关闭即组件 unmount；下一次打开是干净状态。符合 vscode "关掉文件，搜索关键字不延续到下一文件" 的心智 |
| 选择多条 sessions（批量操作）的勾选 | 不持久化 | 离开 `/sessions` 列表清空。批量操作是即时任务，不需要跨会话保留 |

---

## 7. 后续迭代点（TODO）

| 优先级 | 项 | 说明 |
|------|------|------|
| P0 | 合并 History → SessionsView | 删 `/history` 路由，runs/prompts 双模式做进 SessionsView |
| P0 | 实施 overlay 模式 | 见第 3 节，本次重构主体 |
| P0 | 详情组件加 `overlay` 探测 + standalone fallback | 为 deep link 兜底 |
| P0 | 清理过时的状态保留代码 | sessionStorage 的 sidebar query / sources、URL 化的 SessionsView 搜索/筛选 |
| P1 | sidebar 多 detail 间快速切换体验打磨 | 切换时不动 SidebarPanel 选中态、active row 跟随 detail id |
| P1 | 详情 overlay 关闭动画 | 可选：fade-out 100ms 让"撤去"有手感 |
| P2 | Esc 键关闭 detail | 需小心避免和 ConfirmDialog 的 Esc 冲突 |
| P3 | 持久化"上次选中过的 detail"以便启动时回到上次工作 | 仅在用户期望时（明确 toggle） |

---

## 8. 不做的事

- ❌ **基于 URL 的状态分享**。这是 SaaS 模式的特性，本机看板用户面向的是自己，不需要把 q=foo&sources=bar 复制给别人。删除这部分代码可以让 listing 组件代码大幅简化。
- ❌ **多 tab 同时打开 detail**（chrome tab 风格）。SPA 内一个时刻只有一个 detail overlay，符合"看一个会话"的心智。
- ❌ **第三方 keep-alive 库**。React 的 modal route pattern 已经够，引入第三方库的兼容性 / 调试成本不值。
- ❌ **真半透明 modal（能看到背景列表）**。详情内容很重，半透明视觉只对小弹窗有意义。

---

## 9. 实施 checklist（开工前 review）

按 **Phase A → Phase B** 的顺序做。两个 phase 互相独立，可以分别 commit / 验证。

### Phase A：合并 History → SessionsView

A1. [ ] `SessionsView` 加 `searchMode: "runs" | "prompts"` state，搜索框右侧加 toggle pill
A2. [ ] runs 模式：保留现有列表逻辑；新增"高级筛选"折叠区，加 dateFrom/dateTo + runningOnly + 总 token / 实时数 摘要条
A3. [ ] prompts 模式：调用 `api.promptsSearch`、显示消息片段列表带 `<mark>` 高亮、状态条（已索引 + 重建按钮），点击 → `navigate("/sessions/:id?msg=:msgId", { state: { backgroundLocation } })`
A4. [ ] 删除 `web/src/pages/HistoryView.tsx`，App.tsx 删 `/history` 路由
A5. [ ] `IconRail` 删除"历史搜索"导航项
A6. [ ] grep 全仓库剩余 `/history` 链接 → 改成 `/sessions?mode=prompts` 或删除（Dashboard 等可能没引用）
A7. [ ] 验证：原 History 所有功能在 `/sessions` 都能复现

### Phase B：实施 Overlay 模式

B1. [ ] App.tsx 拆双 Routes（base + overlay），写一个 `withOverlayLink(navigate, location)` 辅助函数避免每个 onClick 重复模板
B2. [ ] 详情组件加 `useLocation().state?.backgroundLocation` 探测；overlay 时用 `absolute inset-0 z-30 bg-bg-base` 覆盖 main 区域
B3. [ ] 详情"返回"按钮：overlay 时 `navigate(-1)`；standalone 时 fallback 到对应列表
B4. [ ] 所有列表跳转点改成带 `state: { backgroundLocation }`：
   - `SessionsView` 行点击
   - `SessionsView` prompts 模式消息片段点击
   - `SessionsSidebar` 对话点击
   - `SkillsView` / `MCPsView` 卡片点击
   - `ExtensionsView` agents section 卡片点击
   - `Dashboard` 最近会话 / 最近 Skill / 最近收藏 链接
   - `FavoritesView` "跳转到会话" 按钮
B5. [ ] Detail 内 sidebar 切换 detail（同类型 overlay 间跳转）用 `replace: true`，避免历史栈累积
B6. [ ] 删除/清理过期代码：
   - `SessionsView` 的 q/sources/project/hidden/sort/dir URL 同步代码（改回纯 useState，因列表组件不再卸载）
   - `SkillsView` / `MCPsView` 同上
   - `SessionsSidebar` 的 sessionStorage query/sources 持久化
   - `VirtualSessionList` 的 `useLayoutEffect` scroll restore + `restoringRef` 抑制逻辑
   - `useRestoreScroll` / `rememberScroll` / `readScroll` / `usePrevious` hooks 如无引用全删
   - `loadSidebarQuery` / `saveSidebarQuery` / `loadActiveSources` / `saveActiveSources` 同上
B7. [ ] Layout 的 `shouldShowSidebarPanel` 改成 detail 路由也显示 sidebar（因为现在 detail 是 overlay，layout 仍是列表的 layout）
B8. [ ] 验证 deep link：直接打 `/skills/:id` 应能 standalone 渲染 + 提供返回按钮
B9. [ ] 验证浏览器前进后退：列表→详情→后退→前进，应能精确还原
B10. [ ] 验证 sidebar 切换 detail：detail 1 → sidebar 点 detail 2，URL 变化但只占一条 history（按一次 back 就回列表）
B11. [ ] 验证全程零 loading 闪烁、列表 scroll / search / filter 完全不动
