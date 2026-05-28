# 阶段 4：深度工具 & 交互渲染

> **状态**：轮廓，Phase 3 完成后细化  
> **前置依赖**：Phase 2（ToolCard 通用版已可用）+ Phase 3（StatusBar + Console 已可用）

---

## 核心目标

> 每种工具类型有**定制化渲染**（不再只是通用 ToolCard），权限/Hook/Elicitation 有完整交互面板，工具调用从"日志"变成"可操作面板"。

**对标 OpenCovibe 的 InlineToolCard + PermissionPanel + ToolActivity 侧栏**。

---

## 关键设计交付物

| # | 交付 | 说明 |
|---|------|------|
| 1 | **ToolCard 分发器** | 按 `tool_name` 分发到定制子组件 |
| 2 | **BashCard** | 显示 description + command + output（ANSI 着色） |
| 3 | **EditCard** | 显示 file path + diff 预览 |
| 4 | **ReadCard** | 显示 file path + 内容摘要 |
| 5 | **WriteCard** | 显示 file path + 创建/覆盖标识 |
| 6 | **AgentCard** | 显示 subagent type + 嵌套 subTimeline |
| 7 | **AskUserQuestionCard** | 交互式：单选/多选/Other，直接在卡片内回答 |
| 8 | **PermissionPanel** | 浮动面板：Allow/Deny/Deny&Stop + 批量 Allow All |
| 9 | **HookReviewCard** | Hook 审核请求卡片 |
| 10 | **ToolActivity 侧栏** | 工具调用树形列表 + 文件列表 + 按 turn 分组 |
| 11 | **Tool Burst 折叠** | 连续多个同类工具调用折叠为一组 |

---

## 基石意义

### 3 级渲染层级

对标 OpenCovibe 的 `getToolRenderLevel()`：

| Level | 规则 | 显示 |
|-------|------|------|
| 0 | 工具已完成 + 无错误 + 输出短 | 折叠：一行（名称 + 状态图标 + detail） |
| 1 | 默认 | 摘要：名称 + input 预览 + status + 可展开 |
| 2 | 正在运行 / 有错误 / 用户展开 | 完整：input + output + duration + 操作按钮 |

### 定制渲染 vs 通用渲染

```typescript
function renderToolCard(entry: ToolTimelineEntry) {
  switch (entry.toolName) {
    case "Bash":               return <BashCard entry={entry} />;
    case "Edit":               return <EditCard entry={entry} />;
    case "Read":               return <ReadCard entry={entry} />;
    case "Write":              return <WriteCard entry={entry} />;
    case "Agent":
    case "Task":               return <AgentCard entry={entry} />;
    case "AskUserQuestion":    return <AskUserQuestionCard entry={entry} />;
    case "WebSearch":
    case "WebFetch":           return <WebCard entry={entry} />;
    default:                   return <GenericToolCard entry={entry} />;
  }
}
```

### PermissionPanel = 对话的"门禁"

- 浮动在输入区上方（不在 timeline 内）
- 管理所有 `store.pendingPermissions`
- Allow → ActorCommand::SendPermission → CLI 继续
- Deny → 同上 → CLI 报告 denied
- Deny & Stop → deny + interrupt
- 批量 Allow All（多个权限同时到达时）

---

## Phase 4 完成后的功能影响

| 功能 | 说明 |
|------|------|
| Bash 命令可视化 | 显示 description/command，output 带 ANSI 颜色 |
| 文件编辑 diff | Edit 卡片显示变更内容 |
| 权限审批 UI | GUI 中点击 Allow/Deny，替代 CLI 的 [Y/n] |
| Hook 审核 | Hook 事件的 approve/deny 卡片 |
| AskUserQuestion 交互 | 直接在卡片中选择选项，无需输入框 |
| 子 Agent 嵌套 | Agent 卡片展开后显示 subTimeline |
| 工具侧栏 | 右侧栏显示工具调用树、文件变更列表 |
| 连续工具折叠 | 多次 Read 或 Bash 折叠为"5 个工具调用" |

---

## 粗略 Steps

| Step | 内容 | 依赖 |
|------|------|------|
| 4.1 | ToolCard 分发器 + Level 0/1/2 通用逻辑 | Phase 2 ToolCard |
| 4.2 | BashCard（description + command + ANSI output） | 4.1 |
| 4.3 | EditCard + ReadCard + WriteCard（文件操作族） | 4.1 |
| 4.4 | PermissionPanel（浮动面板 + Allow/Deny/批量） | Phase 2 store |
| 4.5 | HookReviewCard + ElicitationDialog | 4.4 |
| 4.6 | AskUserQuestionCard（交互式选项卡片） | 4.1 |
| 4.7 | AgentCard + SubTimeline 嵌套渲染 | 4.1 |
| 4.8 | ToolActivity 侧栏（工具树 + 文件列表） | 4.1 |
| 4.9 | Tool Burst 折叠（连续同类合并） | 4.1 |

---

## 完成标准

- [ ] Bash/Edit/Read/Write/Agent 各有定制渲染
- [ ] 权限请求弹出 PermissionPanel，点击后 CLI 继续
- [ ] AskUserQuestion 可在卡片内选择答案
- [ ] 子 Agent 卡片展开显示嵌套 timeline
- [ ] 工具侧栏正常工作（树形 + 文件列表）
- [ ] Tool Burst 折叠/展开正常
- [ ] 所有卡片有 Level 0/1/2 三种渲染深度
- [ ] ANSI 输出正确着色

---

*Phase 5 预览：Rewind + Export + Context 可视化 + 新建会话 + @ mention + 高级附件 + Fork + SSH。*
