# Feature: Session 图片消息展示

## 背景

用户在 AI Coding 会话中上传截图后，当前 session detail 页面只显示纯文本占位符（如 `[Image #2]`），无法预览图片内容。需要完整支持图片的展示、交互和兜底。

---

## 多源兼容

### Claude Code
- JSONL 内 content block：`{type: "image", source: {type: "base64", media_type: "image/png", data: "..."}}`
- 同时有磁盘缓存：`~/.claude/image-cache/{sessionId}/{n}.png`（约 150-470KB/张）
- 文本中出现 `[Image #N]` 或 `[Image: source: /path/to/file.png]` 占位

### Cursor
- 不使用 image content block，图片以**文件路径引用**嵌在文本中
- 格式：`<image_files>` 标签包裹，内含保存到 workspace 的本地路径
  ```
  [Image]
  <image_files>
  The following images were provdied by the user and saved to the workspace:
  1. /Users/.../Cursor/User/workspaceStorage/.../images/xxx.png
  </image_files>
  ```
- 图片文件存在用户本机，路径为绝对路径

### Codex
- 当前扫描的 Codex session 中未发现图片使用
- Codex 使用不同的 JSONL 结构（`session_meta` + `payload`），暂不需要适配
- 预留扩展：如果未来 Codex 支持图片，格式大概率与 Claude Code 一致（Anthropic API 标准）

### 统一抽象

后端将三种来源统一为 `ImageMeta` 结构：

```rust
struct ImageMeta {
    index: u32,                    // 图片在消息内的序号（0-based）
    media_type: String,            // "image/png", "image/jpeg" 等
    source_type: String,           // "base64" | "file_ref"
    cache_path: Option<String>,    // image-cache 磁盘路径（Claude Code）
    file_path: Option<String>,     // 本地文件路径（Cursor）
}
```

---

## 一、列表中的图片展示

### 1.1 数据传递策略（内存安全）

**不传 base64 data 到前端**。单张图片 base64 约 400-800KB，传到前端会导致 API 响应暴增、JS 堆内存不可控。

**方案：后端 API 按需 serve 图片二进制**

1. Message 新增轻量 `images` 元数据数组（只含序号、类型、来源，不含 data）：
   ```json
   {
     "id": "xxx-5",
     "role": "user",
     "text": "看看这个bug [Image #2]...",
     "images": [
       { "index": 0, "mediaType": "image/png", "sourceType": "base64" },
       { "index": 1, "mediaType": "image/png", "sourceType": "base64" }
     ]
   }
   ```

2. 图片 serve API：`GET /api/sessions/{sessionId}/images/{messageId}/{index}`
   - 解析优先级：image-cache 磁盘文件 → JSONL base64 解码 → Cursor 本地文件路径
   - 返回 `Content-Type: image/png` + 二进制流
   - 设置 `Cache-Control: public, max-age=86400`（图片内容不变）
   - 404 = 图片不可用

### 1.2 缩略图渲染

在 MessageBlock 的正文区域，当 `message.images` 非空时，渲染缩略图条：

- **布局**：横向排列，`flex flex-wrap gap-2`
- **单张尺寸**：`max-h-[160px] max-w-[240px]`，`object-contain`
- **样式**：`rounded-md border border-border cursor-pointer hover:opacity-90 transition-opacity`
- **加载**：`<img loading="lazy">` 延迟加载，配合虚拟列表离屏 DOM 回收
- **点击**：触发 Lightbox

### 1.3 内存控制

- 使用 `<img src="url">` 而非 base64 data URL，浏览器原生管理解码缓存
- 虚拟列表滚出 viewport 的 item DOM 被移除 → img 自动释放
- 缩略图尺寸受 max-w/max-h 约束，浏览器自动降采样渲染

---

## 二、Filter 筛选

在现有 role filter 栏（User / Assistant / Tool Use / Subagent / Tool Result / System / Meta）旁新增 **Image** 筛选标签。

### 行为定义

- **Image filter ON**：只显示 `message.images` 非空（或文本含 `[Image` / `<image_files>` 引用）的消息
- **Image filter OFF**：隐藏含图片的消息
- **默认全选**（和其他 filter 一致）
- Image 不是一种 role，而是基于消息内容的**附加维度筛选**，类似 subagent 是对 tool_use 的子类型筛选

### 实现位置

- `web/src/lib/use-session-search.ts`：`FilterRole` 类型新增 `"image"`，`ALL_FILTERS` 新增
- `web/src/components/session/MessageToolbar.tsx`：filter chip 自动跟随 `ALL_FILTERS`
- `web/src/lib/role-theme.ts`：新增 image filter 的图标和颜色

---

## 三、点击查看大图（Lightbox）

### 3.1 交互

- 点击缩略图 → 全屏遮罩 Lightbox
- 背景：`bg-black/80 backdrop-blur-sm`
- 图片居中，初始 `object-contain` 适应窗口

### 3.2 缩放

| 操作 | 行为 |
|------|------|
| 鼠标滚轮 | 步进 ±20%，范围 25%-500% |
| 双击 | 切换 fit-to-screen ↔ 100% |
| 拖拽 | 放大后平移查看 |
| 按钮组 | 右下角 `[−] [fit] [+]` |
| 显示 | 左下角当前比例（如 `150%`） |

### 3.3 多图翻页

- 当前消息有多图时，支持左右箭头切换
- 底部 `1 / 3` 指示器
- 键盘 ← → 亦可

### 3.4 顶部信息栏

半透明工具栏，左→右：
- 图片序号：`图片 1/3`
- 来源路径（可点击复制）：
  - Claude Code：`~/.claude/image-cache/xxx/2.png`
  - Cursor：`/Users/.../images/xxx.png`
- 图片格式与大小：`PNG · 463 KB`
- 另存为（下载按钮）
- 关闭（X）

### 3.5 关闭

- 点击遮罩空白
- Esc
- X 按钮

---

## 四、另存为

- 下载按钮触发浏览器原生下载
- 使用 `<a download="filename" href="...">`
- 文件名：从 cache_path/file_path 取原名，无路径时用 `image-{index}.{ext}`

---

## 五、兜底

| 场景 | 处理 |
|------|------|
| image-cache 不存在 + JSONL 解析失败 | 后端 404，前端显示占位卡片：灰色虚线框 + ImageOff 图标 + "图片不可用" |
| Cursor 文件路径不存在 | 同上 |
| 图片加载超时/网络错误 | `<img onError>` 触发，替换为占位卡片 |
| 不支持的 media_type | 显示占位卡片 + 标注格式 |
| 消息有图片但文本为空 | 只显示缩略图条 |
| 文本中有 `[Image #N]` 但 images 数组为空 | 纯文本展示，不做特殊处理 |
| base64 data 过大（>5MB） | 后端正常 serve，前端 lazy load + 浏览器原生处理 |

---

## 六、涉及文件

### 后端（Rust）

| 文件 | 改动 |
|------|------|
| `src-server/src/scanner/session_loader.rs` | `ContentBlock` 新增 `Image` 变体；`extract_blocks` 处理 image block；Message 新增 `images` 字段 |
| `src-server/src/router/images.rs` | **新建**：`GET /api/sessions/{id}/images/{messageId}/{index}` |
| `src-server/src/router/mod.rs` | 注册 image 路由 |

### 前端（React）

| 文件 | 改动 |
|------|------|
| `web/src/lib/api.ts` | Message 类型新增 `images?: ImageMeta[]`；`ImageMeta` 接口 |
| `web/src/lib/use-session-search.ts` | `FilterRole` 新增 `"image"`，filter 逻辑 |
| `web/src/lib/role-theme.ts` | image filter 图标/颜色 |
| `web/src/components/session/MessageBlock.tsx` | 渲染缩略图条 |
| `web/src/components/session/ImageThumbnail.tsx` | **新建**：单张缩略图 + 错误兜底 |
| `web/src/components/session/ImageLightbox.tsx` | **新建**：全屏查看器（缩放/平移/翻页/下载/信息栏） |
| `web/src/components/session/MessageToolbar.tsx` | 自动支持（跟随 ALL_FILTERS） |
