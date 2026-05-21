# 对话集成实施计划

> 本文是干净的实施计划。  
> 产品范围见 `product-spec.md`，技术方案见 `tech-spec.md`，OpenCovibe 调研、交互细节和踩坑记录见 `opencovibe-interaction-study.md`。  
> 本文只列计划、依赖、输入、交付和验收，不展开源码细节。

---

## 0. 全局要求

### 0.1 执行原则

- 先做协议和状态模型，再做 UI。
- 后端事件必须稳定，前端 UI 只能消费 reducer 派生状态。
- 历史消息和实时消息必须合成同一条 timeline。
- 用户消息必须立即进入消息列表。
- assistant、thinking、tool、permission、usage 必须实时更新。
- refetch 只用于持久化对齐，不能作为主渲染路径。

### 0.2 每个计划的公共交付

每个计划完成时，必须同步检查：

- 后端关键路径有日志，且不泄露 token、key、完整大文件内容。
- 前端关键用户动作有可追踪日志。
- 后端稳定错误码，前端有可见错误文案。
- 有对应单元测试、集成测试或明确手测用例。
- 至少运行相关 `cargo check`、Rust tests、`npm run typecheck`。
- UI 遵守设计系统，不随意硬编码颜色。
- 每个 commit 聚焦单一能力，不混入无关重构。

---

## 1. 功能覆盖矩阵

| ID | 功能 | 来源 | 优先级 | 计划 |
|----|------|------|--------|------|
| F01 | 协议类型 | 技术方案 | P0 | Plan 1 |
| F02 | Claude stream-json parser | 技术方案 / OpenCovibe | P0 | Plan 2 |
| F03 | stdin 消息构造 | 技术方案 / OpenCovibe | P0 | Plan 3 |
| F04 | 本地 Claude 进程管理 | 产品 P0 | P0 | Plan 4 |
| F05 | SessionActor turn engine | 产品 P0 / OpenCovibe | P0 | Plan 5 |
| F06 | SessionManager 多会话管理 | 技术方案 | P0 | Plan 6 |
| F07 | WebSocket resume/new | 产品 P0 | P0 | Plan 7 |
| F08 | CLI 检查 | 产品 P0 | P0 | Plan 8 |
| F09 | ChatSessionStore reducer | OpenCovibe | P0 | Plan 9 |
| F10 | 历史与实时统一 timeline | 产品 P0 / OpenCovibe | P0 | Plan 10 |
| F11 | assistant 流式渲染 | 产品 P0 | P0 | Plan 11 |
| F12 | thinking 思考过程 | OpenCovibe | P0 | Plan 12 |
| F13 | tool use/result | 产品 P0 | P0 | Plan 13 |
| F14 | 自动滚动与新消息提示 | 产品 P0 | P0 | Plan 14 |
| F15 | Prompt Console 输入栏 | 产品 P0 / OpenCovibe | P0 | Plan 15 |
| F16 | 全局 Esc 中断 | 产品 P0 / OpenCovibe | P0 | Plan 16 |
| F17 | 运行中续输 | 产品 P0 | P0 | Plan 17 |
| F18 | PermissionPanel | 产品 P0 / OpenCovibe | P0 | Plan 18 |
| F19 | Slash 基础菜单 | 产品 P0 | P0 | Plan 19 |
| F20 | Status HUD / context / usage | OpenCovibe | P0 | Plan 20 |
| F21 | 基础附件和 pasted block | 产品 P1 / OpenCovibe | P0 | Plan 21 |
| F22 | Session Detail 集成 | 产品 P0 | P0 | Plan 22 |
| F23 | 新建会话入口 | 产品 P0 | P0 | Plan 23 |
| F24 | ResumeMenu 改造 | 产品 P0 | P0 | Plan 24 |
| F25 | 自动化测试矩阵 | 全局 | P0 | Plan 25 |
| F26 | 真实 CLI smoke test | 全局 | P0 | Plan 26 |
| F27 | Rewind 基础版 | OpenCovibe | P0.5 | Plan 27 |
| F28 | Export Markdown/HTML | OpenCovibe / 现有能力 | P0.5 | Plan 28 |
| F29 | Quick actions / Git branch | OpenCovibe | P1 | Plan 29 |
| F30 | Slash 子交互 | OpenCovibe | P1 | Plan 30 |
| F31 | Permission suggestions / Rules | 产品 P1 | P1 | Plan 31 |
| F32 | @ mention 文件引用 | OpenCovibe | P1 | Plan 32 |
| F33 | 大 PDF / Office 转换 | OpenCovibe | P1 | Plan 33 |
| F34 | 截图 | OpenCovibe | P1/P2 | Plan 34 |
| F35 | ContextUsageGrid / Compact | 产品 P1 / OpenCovibe | P1 | Plan 35 |
| F36 | ToolActivity 侧栏 | OpenCovibe | P1 | Plan 36 |
| F37 | Tool burst 折叠 | 产品 P1 | P1 | Plan 37 |
| F38 | Rewind 文件选择 | OpenCovibe | P1 | Plan 38 |
| F39 | Export 范围选择 / PDF | OpenCovibe | P1 | Plan 39 |
| F40 | API Key / Base URL 配置 | 产品 P1 | P1 | Plan 40 |
| F41 | 自定义输入拦截 | 产品 P1 | P1 | Plan 41 |
| F42 | 输出增强 | 产品 P1 | P1 | Plan 42 |
| F43 | 会话分叉 | 产品 P1 | P1 | Plan 43 |
| F44 | SSH Transport | 产品 P2 | P2 | Plan 44 |
| F45 | 多 Provider | 产品 P2 | P2 | Plan 45 |
| F46 | 协作模式 | 产品 P2 | P2 | Plan 46 |

---

## 2. P0 后端计划

### Plan 1：协议类型

**聚焦功能**：定义后端、WebSocket、前端共享的数据契约。  
**依赖**：无。  
**参考输入**：产品 P0 范围、技术方案协议章节、OpenCovibe 事件模型。  
**交付结果**：Rust 类型、TypeScript 类型、字段命名对齐说明。  
**验收**：前后端类型能独立编译，序列化字段一致。

### Plan 2：Claude 事件解析

**聚焦功能**：把 Claude CLI 输出归一成内部事件。  
**依赖**：Plan 1。  
**参考输入**：技术方案 stream-json 章节、OpenCovibe parser 调研。  
**交付结果**：后端 parser、fixture、未知事件降级策略。  
**验收**：文本、thinking、工具、权限、usage、result 都能被解析并测试覆盖。

### Plan 3：stdin 消息构造

**聚焦功能**：构造写入 Claude CLI 的用户消息和控制消息。  
**依赖**：Plan 1。  
**参考输入**：技术方案 stdin 协议、OpenCovibe actor 调研。  
**交付结果**：用户消息、权限响应、中断请求、附件消息、回退请求的构造函数。  
**验收**：所有构造函数都有 JSON shape 测试。

### Plan 4：LocalTransport

**聚焦功能**：启动和管理本地 Claude CLI 进程。  
**依赖**：Plan 2、Plan 3。  
**参考输入**：产品进程管理、技术方案进程生命周期。  
**交付结果**：本地 transport、stdin writer、stdout/stderr reader、退出检测、kill。  
**验收**：能启动 CLI，持续读取 stdout，CLI 自然退出后状态正确。

### Plan 5：SessionActor

**聚焦功能**：单会话 turn engine。  
**依赖**：Plan 4。  
**参考输入**：产品消息发送/排队/中断流程、OpenCovibe turn engine 调研。  
**交付结果**：actor command loop、单 turn 状态、用户消息队列、权限响应、中断、turn complete 派发。  
**验收**：running 时消息入队，turn complete 后自动派发下一条。

### Plan 6：SessionManager

**聚焦功能**：管理多个对话进程和重连窗口。  
**依赖**：Plan 5。  
**参考输入**：产品连接状态机、技术方案 SessionManager。  
**交付结果**：resume/new、连接互斥、token 重连、30 秒窗口、shutdown all。  
**验收**：同 session 互斥、刷新可恢复、超时会清理进程。

### Plan 7：WebSocket 后端

**聚焦功能**：浏览器与 SessionActor 双向通信。  
**依赖**：Plan 6。  
**参考输入**：产品核心流程、技术方案 WebSocket 通道。  
**交付结果**：resume 路由、new 路由、客户端消息分发、服务端事件转发、错误码。  
**验收**：前端能连接、发送消息、收到事件、断线重连。

### Plan 8：CLI 检查

**聚焦功能**：连接前检查 Claude CLI 环境。  
**依赖**：Plan 4。  
**参考输入**：产品首次使用引导。  
**交付结果**：CLI 路径、版本、认证状态、错误提示。  
**验收**：未安装、未认证、版本过低都有明确提示。

---

## 3. P0 前端状态与消息计划

### Plan 9：ChatSessionStore

**聚焦功能**：前端对话状态机。  
**依赖**：Plan 1、Plan 7。  
**参考输入**：OpenCovibe SessionStore 调研、产品流式与状态要求。  
**交付结果**：store、reducer、phase、timeline、streamingText、thinkingText、usage、pendingPermissions。  
**验收**：UI 不直接消费 raw events，状态可单测。

### Plan 10：统一 Timeline

**聚焦功能**：历史和实时消息合成同一条时间线。  
**依赖**：Plan 9。  
**参考输入**：产品历史/活跃区要求、OpenCovibe timeline 调研。  
**交付结果**：历史适配器、live 适配器、统一 timeline、去重、乐观 user 合并。  
**验收**：用户消息立即入列，实时回复和历史样式一致，refetch 不重复。

### Plan 11：Assistant 流式渲染

**聚焦功能**：assistant token 实时显示。  
**依赖**：Plan 10。  
**参考输入**：产品 token 级流式、OpenCovibe streamingText。  
**交付结果**：streaming block、markdown 渲染、光标动画。  
**验收**：不等待 turn complete 即显示输出。

### Plan 12：Thinking 思考过程

**聚焦功能**：展示 Claude thinking。  
**依赖**：Plan 9、Plan 11。  
**参考输入**：OpenCovibe thinking panel。  
**交付结果**：ThinkingPanel、elapsed、折叠/展开、固化到 assistant entry。  
**验收**：thinking delta 到达即展示，正文开始后停止计时。

### Plan 13：Tool Timeline

**聚焦功能**：实时工具调用展示。  
**依赖**：Plan 10。  
**参考输入**：产品 tool call、OpenCovibe tool reducer。  
**交付结果**：tool start、input preview、running、success/error result。  
**验收**：工具状态完整且与历史工具卡一致。

### Plan 14：滚动体验

**聚焦功能**：自动滚动和新消息提示。  
**依赖**：Plan 10、Plan 11。  
**参考输入**：产品滚动行为、OpenCovibe auto-scroll。  
**交付结果**：底部检测、自动滚动、停止跟随、新消息提示。  
**验收**：用户上翻时不会被强拉到底部。

---

## 4. P0 输入与权限计划

### Plan 15：ConversationPrompt

**聚焦功能**：OpenCovibe 风格输入控制台。  
**依赖**：Plan 9。  
**参考输入**：产品输入区、OpenCovibe PromptInput 调研。  
**交付结果**：textarea、自动高度、Enter 发送、Shift+Enter 换行、运行中 send+stop、pending permission 提示。  
**验收**：idle、running、permission 三类状态下按钮和输入行为正确。

### Plan 16：全局中断

**聚焦功能**：停止当前响应。  
**依赖**：Plan 5、Plan 15。  
**参考输入**：产品中断流程、OpenCovibe keybinding 调研。  
**交付结果**：stop button、全局 Esc、菜单优先级、interrupted 状态。  
**验收**：输入框 focus 与非 focus 状态下 Esc 都能停止。

### Plan 17：运行中续输

**聚焦功能**：AI 回复时继续输入和排队。  
**依赖**：Plan 5、Plan 15。  
**参考输入**：产品排队要求、OpenCovibe mid-turn send。  
**交付结果**：running 时可输入、可发送排队、队列状态提示。  
**验收**：当前 turn 完成后自动发送下一条。

### Plan 18：PermissionPanel

**聚焦功能**：权限审批面板。  
**依赖**：Plan 9、Plan 13。  
**参考输入**：产品权限审批、OpenCovibe PermissionPanel。  
**交付结果**：单权限、多权限、allow、deny、deny and stop、submitting state。  
**验收**：权限请求浮在输入栏上方，响应后 CLI 继续。

---

## 5. P0 页面入口与基础交互

### Plan 19：Slash 基础菜单

**聚焦功能**：输入 `/` 弹出命令菜单。  
**依赖**：Plan 9、Plan 15。  
**参考输入**：产品 Slash、OpenCovibe SlashMenu。  
**交付结果**：命令列表、搜索、键盘选择、鼠标选择、fallback commands。  
**验收**：`/` 可打开菜单，Enter 选择，Escape 关闭。

### Plan 20：ConversationStatusBar

**聚焦功能**：对话状态 HUD。  
**依赖**：Plan 9。  
**参考输入**：OpenCovibe SessionStatusBar、产品状态栏。  
**交付结果**：状态、model、token、cache、cost、context、permission mode、cwd。  
**验收**：当前 turn input/output/cache 和 context 含量可见。

### Plan 21：基础附件与 PastedBlock

**聚焦功能**：图片、PDF、文本文件、长文本粘贴。  
**依赖**：Plan 3、Plan 15。  
**参考输入**：产品文件上传、OpenCovibe 附件调研。  
**交付结果**：attachment manager、attachment chip、pasted block chip、image/pdf base64、text pasted block。  
**验收**：图片/PDF/文本文件都能进入消息，长文本不会撑爆输入框。

### Plan 22：Session Detail 集成

**聚焦功能**：在 Session Detail 中提供完整对话能力。  
**依赖**：Plan 10、Plan 15、Plan 18、Plan 20。  
**参考输入**：产品信息架构。  
**交付结果**：ConversationPanel、统一消息流、Prompt Console、StatusBar、PermissionPanel。  
**验收**：历史详情页可直接续聊，不破坏现有功能。

### Plan 23：新建会话入口

**聚焦功能**：从项目目录新建 Claude 会话。  
**依赖**：Plan 7、Plan 15。  
**参考输入**：产品新建会话。  
**交付结果**：新建入口、目录输入/选择、连接后跳转。  
**验收**：可从空项目目录启动对话。

### Plan 24：ResumeMenu 改造

**聚焦功能**：从历史会话进入 GUI 续聊。  
**依赖**：Plan 22。  
**参考输入**：产品续接流程、现有 ResumeMenu。  
**交付结果**：GUI 续接入口、保留复制命令、保留终端打开。  
**验收**：用户能从历史详情直接续聊。

---

## 6. P0.5 / P1 安全和产出能力

### Plan 27：基础 Rewind

**聚焦功能**：回退到 user checkpoint。  
**依赖**：Plan 10、Plan 3。  
**参考输入**：OpenCovibe Rewind。  
**交付结果**：checkpoint candidates、dry run、full rewind、rewind marker。  
**验收**：能回退到某条 user 消息，成功后有 marker。

### Plan 28：导出 Markdown / HTML

**聚焦功能**：导出当前对话。  
**依赖**：Plan 10、Plan 11、Plan 13。  
**参考输入**：现有导出、OpenCovibe ExportModal。  
**交付结果**：Export modal、Markdown、HTML、preview、浏览器下载。  
**验收**：历史和在线会话都可导出，顺序与 UI 一致。

---

## 7. P1 增强计划

### Plan 29：Quick Actions 与 Git Branch

**聚焦功能**：输入框上方快捷操作和分支展示。  
**依赖**：Plan 15、Plan 19。  
**交付结果**：quick action pills、More、git branch badge、branch poll。

### Plan 30：Slash 子交互

**聚焦功能**：完善 slash 菜单。  
**依赖**：Plan 19、Plan 40。  
**交付结果**：model 子视图、permission mode 子视图、aliases、argument hints。

### Plan 31：Permission Suggestions / Rules

**聚焦功能**：处理 permission suggestions。  
**依赖**：Plan 18。  
**交付结果**：suggestion 按钮、Rules 入口、settings 持久化扩展点。

### Plan 32：@ Mention 文件引用

**聚焦功能**：输入框中引用当前项目文件/目录。  
**依赖**：Plan 21。  
**交付结果**：文件列表 API、AtMentionMenu、path ref chip。

### Plan 33：高级附件能力

**聚焦功能**：大 PDF、Office 转换、目录拖拽。  
**依赖**：Plan 21、Plan 32。  
**交付结果**：大 PDF path-ref、docx/xlsx 转 markdown、临时附件存储。

### Plan 34：截图

**聚焦功能**：Web 环境截图能力。  
**依赖**：Plan 21。  
**交付结果**：截图按钮说明、Screen Capture API、截图转 image attachment。

### Plan 35：Context 和 Compact

**聚焦功能**：上下文用量和压缩标记。  
**依赖**：Plan 20、Plan 19。  
**交付结果**：ContextUsageGrid、compact marker、context history placeholder。

### Plan 36：ToolActivity 侧栏

**聚焦功能**：实时工具侧栏。  
**依赖**：Plan 13。  
**交付结果**：tools tab、files tab、info tab、tasks tab、点击滚动。

### Plan 37：Tool Burst 折叠

**聚焦功能**：连续工具调用折叠。  
**依赖**：Plan 13、Plan 36。  
**交付结果**：burst 分组、展开/折叠。

### Plan 38：Rewind 文件选择

**聚焦功能**：选择部分文件回退。  
**依赖**：Plan 27。  
**交付结果**：files preview、文件选择、降级全量提示。

### Plan 39：导出范围与 PDF

**聚焦功能**：增强导出能力。  
**依赖**：Plan 28。  
**交付结果**：message range、time range、PDF print、include/exclude thinking/tools。

### Plan 40：API Key / Base URL 配置

**聚焦功能**：独立配置 API key 和 base URL。  
**依赖**：Plan 8。  
**交付结果**：Settings 对话 tab、API key 脱敏、base URL、default model、permission mode。

### Plan 41：自定义输入拦截

**聚焦功能**：输入预处理。  
**依赖**：Plan 15、Plan 19。  
**交付结果**：中文符号转 slash、自定义 alias、输入拦截扩展点。

### Plan 42：输出增强

**聚焦功能**：输出安全和渲染增强。  
**依赖**：Plan 9、Plan 13。  
**交付结果**：输出增强 hook、安全提示、自定义渲染扩展点。

### Plan 43：会话分叉 Fork

**聚焦功能**：从历史节点分叉会话。  
**依赖**：Plan 27。  
**交付结果**：fork action、新 session id、跳转新会话。

---

## 8. P2 远期计划

### Plan 44：SSH Transport

**聚焦功能**：远程机器运行 Claude CLI。  
**依赖**：Plan 4、Plan 5。  
**交付结果**：SSH transport、remote cwd、auth forwarding 策略。

### Plan 45：多 Provider

**聚焦功能**：OpenAI/Gemini 等 provider。  
**依赖**：Plan 40。  
**交付结果**：provider abstraction、env mapping、model mapping。

### Plan 46：协作模式

**聚焦功能**：多人观看同一 session。  
**依赖**：Plan 7、Plan 10。  
**交付结果**：owner/viewer、viewer read-only、权限审批仅 owner。

---

## 9. 全局验收

### Plan 25：自动化测试矩阵

**聚焦功能**：防止回归。  
**依赖**：所有 P0。  
**交付结果**：Rust protocol tests、actor tests、WS tests、TS reducer tests、Prompt tests、Permission tests、Export/Rewind tests。

### Plan 26：真实 CLI Smoke Test

**聚焦功能**：真实端到端验证。  
**依赖**：所有 P0。  
**用例**：new、resume、streaming、thinking、tool、permission、interrupt、mid-turn send、reconnect、attachment、export、rewind。

---

## 10. 关键依赖路径

```text
Plan 1-3：协议
  -> Plan 4-8：后端进程 / Actor / WebSocket
  -> Plan 9-10：前端 Store / Unified Timeline
  -> Plan 11-14：消息、thinking、tool、滚动
  -> Plan 15-20：输入栏、权限、slash、状态栏
  -> Plan 21-24：附件、页面入口
  -> Plan 27-28：rewind、export
  -> Plan 29+：增强能力
```

关键约束：

- 没有 Plan 9，不做复杂 UI。
- 没有 Plan 10，不做导出、回退、ToolActivity。
- 没有 Plan 15，不做附件、slash、截图。
- 没有 Plan 20，不宣称对标 cc-hud。
