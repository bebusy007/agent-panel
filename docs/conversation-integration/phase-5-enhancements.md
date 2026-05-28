# 阶段 5：增强 & 打磨

> **状态**：轮廓，Phase 4 完成后细化  
> **前置依赖**：Phase 1~4 全部完成

---

## 核心目标

> 在核心对话体验已完整的基础上，补齐**高级能力**——Rewind、Export、Context 可视化、新建会话、文件引用、高级附件、会话分叉、SSH 远程。这些功能锦上添花，每个独立成 feature，可单独规划优先级。

---

## 功能矩阵与优先级

| 功能 | 优先级 | 依赖的 Phase 1~4 基石 | 复杂度 |
|------|--------|---------------------|--------|
| **Rewind（回退到检查点）** | P0.5 | file-history-snapshot + parentUuid 链 + ActorCommand::Rewind | 高 |
| **Export（Markdown/HTML）** | P0.5 | 完整 timeline（TimelineEntry[]） | 中 |
| **Context 可视化** | P1 | /context 命令输出 + ContextUsageGrid 组件 | 中 |
| **新建会话入口** | P1 | WebSocket new 路由 + CWD 选择 UI | 低 |
| **@ Mention 文件引用** | P1 | 后端文件列表 API + AtMentionMenu 浮层 | 中 |
| **高级附件（大 PDF / Office）** | P1 | path-ref 策略 + 文件转换 | 中 |
| **会话分叉（Fork）** | P1 | parentUuid 树 + 新 session 创建 | 高 |
| **SSH Remote Transport** | P2 | Transport trait 抽象 + SSH 通道 | 很高 |

---

## 各功能关键设计

### Rewind（回退到检查点）

**原理**：Claude CLI 支持 `rewind_files` 控制命令。用户选择一个历史 user 消息作为 checkpoint，CLI 恢复文件到该时刻的状态并清除后续对话。

**数据基础**（Phase 1 已解析）：
- `file-history-snapshot.snapshot.trackedFileBackups`：文件版本快照
- `parentUuid` 链：定位历史 user 消息
- `ActorCommand::Rewind`：发送 rewind 命令给 CLI

**交互流程**：
1. 用户在 timeline 中某条 User 消息上点击"回退到这里"
2. 弹出 RewindModal：显示回退后会丢失的内容 + 变更的文件列表
3. Dry run：先查询影响范围（不执行）
4. 确认后执行：CLI 恢复文件 + 清除后续消息
5. Timeline 更新：被清除的消息标记为 "rewound"

### Export（Markdown / HTML）

**数据基础**：Phase 2 的 `mergedTimeline: TimelineEntry[]`

**导出格式**：
- Markdown：user/assistant 文本 + tool 摘要 + thinking 可选
- HTML：带样式的完整渲染（可选包含 thinking、tool output）
- 范围选择：全部 / 某个 turn 范围 / 手动选择

### Context 可视化

**数据基础**：CLI 的 `/context` 命令输出（通过 slash 命令执行后得到结果）

**渲染**：对标 OpenCovibe 的 `ContextUsageGrid`——10×10 方格 + 分类图例 + 模型信息

### 新建会话入口

**数据基础**：Phase 1 的 WebSocket `/api/ws/chat/new?cwd=...`

**交互**：
- Sessions 页面新增"新建对话"按钮
- 选择工作目录（最近使用 / 手动输入 / 文件夹选择器）
- 创建后跳转到 Session Detail（空 timeline + 输入框就绪）

### @ Mention 文件引用

**交互**：输入框中键入 `@` → 弹出文件列表（当前 cwd 下的文件树）→ 选择后作为 path reference 附加到消息

**后端**：新增 `/api/conversation/files?cwd=...&query=...` 端点

### 高级附件

| 场景 | 策略 |
|------|------|
| 小文件（< 1MB image/PDF） | base64 inline 发送（Phase 3 已支持） |
| 大 PDF（> 1MB） | path-ref 模式：只发文件路径，CLI 自己读取 |
| Office 文件（docx/xlsx） | 前端转 markdown → 作为 text 发送 |
| 文件夹拖入 | 递归列出文件列表 → 用户选择 → path-ref |

### 会话分叉（Fork）

**原理**：从对话树某节点创建新的 session，共享之前的历史但独立演化。

**数据基础**：`parentUuid` 对话树 + CLI 的 fork 能力（如果 CLI 支持）

### SSH Remote Transport

**原理**：Transport 层已在 Phase 1 设计为 enum（目前只有 Local），SSH 模式新增一个变体。

```rust
enum Transport {
    Local(LocalTransport),   // Phase 1 已实现
    Ssh(SshTransport),       // Phase 5 新增
}
```

通过 SSH 在远程机器上 spawn Claude CLI，stdin/stdout 通过 SSH 通道传输。

---

## 完成标准（全部功能完成时）

- [ ] 可从 timeline 中选择检查点 rewind
- [ ] 可导出对话为 Markdown / HTML
- [ ] /context 命令结果有可视化展示
- [ ] 可从 GUI 新建对话（选择 cwd）
- [ ] @ mention 可引用项目文件
- [ ] 大文件以 path-ref 模式发送
- [ ] 可从历史节点 fork 新会话
- [ ] （可选）SSH 远程对话可用

---

*五个阶段全部完成后，Agent Panel 的对话能力对标 OpenCovibe，同时在架构上更优（组合式组件、Rust 后端性能、统一 TimelineEntry 模型）。*
