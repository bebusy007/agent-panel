# 技术方案: Session 图片消息展示

> 配套产品方案：`product-spec.md`

---

## 1. 架构总览

```
JSONL (磁盘)
  │ parse
  ▼
session_loader.rs :: extract_blocks()
  新增 ContentBlock::Image → 附加到父 Text Message 的 images 字段
  │ serialize
  ▼
GET /api/sessions/{id} → { messages: [{ id, role, text, images: [ImageMeta] }] }
  │ fetch
  ▼
MessageBlock.tsx → ImageThumbnailStrip → <img src="/api/.../images/{mid}/{idx}">
  │ click
  ▼
ImageLightbox.tsx (Radix Dialog portal) → 缩放/平移/翻页/下载


GET /api/sessions/{sid}/images/{messageId}/{index}
  → 解析链: image-cache 文件 → JSONL base64 解码 → Cursor 本地文件
  → 返回 binary + Content-Type + Cache-Control
```

---

## 2. 技术决策

### 2.1 图片 API 路径设计

**路径**: `GET /api/sessions/{sessionId}/images/{messageId}/{index}`

- `sessionId`: session 列表返回的 id（file path hash）
- `messageId`: Message.id（格式 `{uuid}-{idx}`，session_loader 生成）
- `index`: 消息内图片的 0-based 序号

**为什么不用 session 级全局序号？** 全局序号在 filter 后失效，且前端无法从 Message 数据直接推导，需要额外映射。messageId+index 可直接从 `m.id` + `m.images[i].index` 构造。

**响应头**:
- `Content-Type`: 从存储的 media_type 取值
- `Cache-Control: public, max-age=86400`
- `Content-Disposition: inline`

### 2.2 后端图片解析链

三级 fallback，按成本从低到高：

1. **image-cache 文件**（O(1) 磁盘读取）
   - 路径: `~/.claude/image-cache/{session_id_raw}/{global_number}.png`
   - `session_id_raw` 从 `SessionSummary.session_id_raw` 获取
   - `global_number` 是 session 内所有图片的 1-based 全局编号。需扫描 JSONL 计算：从头遍历，遇到 image block 就 +1，到目标 message+index 时的值即为全局编号
   - 存在则直接读文件返回

2. **JSONL base64 解码**（需扫描文件 + 解码）
   - 从 messageId 提取 uuid 前缀（`{uuid}-{idx}` 中的 uuid 部分）
   - 逐行扫描 JSONL，匹配 `entry.uuid == target_uuid`
   - 解析该行的 content 数组，找到第 index 个 image block
   - base64 decode `source.data` 字段
   - 需要新增 `base64` crate 依赖

3. **Cursor 本地文件路径**（直接读）
   - 如果 ImageMeta.source_type == "file_ref"，直接读 `file_path` 
   - 安全校验：只允许读取 image 扩展名文件（.png/.jpg/.jpeg/.gif/.webp），且文件存在

**所有步骤失败 → 返回 404**

### 2.3 Message struct 修改

在现有 `Message` struct 上新增 `images` 字段，**不**为图片创建独立 Message：

```
Message {
  ...existing fields...
  images: Option<Vec<ImageMeta>>  // skip_serializing_if = None
}

ImageMeta {
  index: u32,              // 消息内 0-based 序号
  media_type: String,      // "image/png" 等
  source_type: String,     // "base64" | "file_ref"
  cache_path: Option<String>,   // image-cache 路径（信息栏展示用）
  file_path: Option<String>,    // Cursor 文件路径（信息栏展示用）
}
```

**为什么不创建独立 Message？** 图片是 user 消息的内嵌内容，不是独立消息。拆分会破坏语义分组，`[Image #N]` 文本引用也会和图片分离。

**extract_blocks 改动逻辑**:
- 新增 `ContentBlock::Image(ImageMeta)` 枚举变体
- match 中增加 `"image"` 分支，提取 source 信息，构造 ImageMeta
- 发射循环中：遇到 Image block 时不创建 Message，而是累积到 `pending_images: Vec<ImageMeta>`
- 遇到下一个 Text block 或循环结束时，将 pending_images 附加到最近发射的 Message 的 images 字段
- 如果整条消息只有图片没有文本：发射一个 `text: Some("")` 的空文本 Message 携带 images

### 2.4 Cursor `<image_files>` 解析

在 `extract_blocks` 处理 Text block 时，额外检查文本是否包含 `<image_files>` 标签：

**解析逻辑**:
- 检测 `<image_files>` 和 `</image_files>` 标签
- 逐行扫描标签内容，匹配 `^\d+\.\s+(.+\.(png|jpg|jpeg|gif|webp))` 模式提取路径
- 每个路径生成一个 `ImageMeta { source_type: "file_ref", file_path: Some(path), media_type: 从扩展名推断 }`
- 文本本身保留不变（仍然显示完整 `<image_files>` 块文字）

### 2.5 Lightbox 组件方案

**基于现有 Radix Dialog**（`web/src/components/ui/dialog.tsx`），项目已安装 `@radix-ui/react-dialog`。

**为什么不用第三方 lightbox 库？** 功能简单（单图缩放+多图翻页），引入额外依赖不值。Radix Dialog 提供了 overlay、focus trap、portal、Esc 关闭。

**状态管理**（组件内 local state，不进 SessionContext）：
- `scale: number` — 缩放比例，默认 1.0，范围 0.25-5.0
- `position: { x: number, y: number }` — 平移偏移，仅 scale > 1 时有效
- `currentIndex: number` — 当前图片索引（多图翻页）

**缩放实现**: CSS `transform: scale(S) translate(Xpx, Ypx)` 应用于 img 元素。transform-origin 设为鼠标位置（滚轮缩放时锚定光标点）。

**平移实现**: `onPointerDown` 设置 `isDragging`，`onPointerMove` 更新 position，`onPointerUp` 结束。使用 `setPointerCapture` 避免移出元素时丢失事件。

**键盘**:
- ←/→: 翻页
- +/-: 缩放
- 0: 适应窗口
- Esc: 关闭（Radix 内置）
- 事件只绑在 DialogContent 上，不影响外层

**组件结构**:
```
ImageLightbox
├── Dialog (Radix)
│   ├── DialogOverlay (bg-black/80 backdrop-blur-sm)
│   └── DialogContent (fixed inset-0, 无 border/padding)
│       ├── Toolbar (顶部半透明条)
│       │   ├── 序号 "图片 1/3"
│       │   ├── 来源路径（点击复制）
│       │   ├── 格式+大小 "PNG"
│       │   ├── 下载按钮 (<a download>)
│       │   └── 关闭按钮
│       ├── img (居中, transform 控制缩放平移)
│       ├── 左右箭头（多图时显示）
│       ├── 底部指示器 "1 / 3"
│       └── 右下角缩放控件 [−] [fit] [+] + 比例显示
```

### 2.6 Filter 实现

**"image" 是内容维度筛选，不是 role**（类似 "subagent" 是 tool_use 的子类型）。

**组合语义**: AND 逻辑。消息可见需满足：role filter 通过 AND image filter 通过。
- image OFF → 隐藏所有含图片的消息
- image ON + user OFF → 含图片的 user 消息仍然隐藏（role 优先）
- image ON + user ON → 含图片的 user 消息显示

**实现**:
- `ALL_FILTERS` 数组末尾增加 `"image"`
- filter 逻辑中增加：`if (!selectedRoles.has("image") && (m.images?.length ?? 0) > 0) return false`
- `role-theme.ts` 增加 image 主题：图标用 `Image`(lucide)，颜色用 rose 系

### 2.7 estimateSize 调整

`MessageStream.tsx` 的 `estimateSize` 回调中，检查 `m.images?.length`：
- 有图片时，在 role 基础估算值上额外加 172px（160px 缩略图高度 + 12px 间距）
- 4 张以上图片（会换行）额外加 172px

### 2.8 sessionId 与 session_id_raw 的关系

- `sessionId`（前端 URL 参数、API 路径）: 从文件路径派生的 ID
- `session_id_raw`: JSONL 内的原始 UUID（如 `565c11cd-...`）
- image-cache 目录用 `session_id_raw`
- 图片 API 接收 `sessionId`，后端先查 session 列表获取 `session_id_raw` 和 `file_path`

现有 `sessions::scan_all_sessions()` 返回的 `SessionSummary` 已包含 `session_id_raw` 和 `file_path`，image endpoint 复用此函数。

---

## 3. API 契约

### GET /api/sessions/{sessionId}/images/{messageId}/{index}

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| sessionId | String | Session ID（列表返回的 id） |
| messageId | String | Message.id（如 `a1b2c3-5`） |
| index | u32 | 图片在消息内的 0-based 序号 |

**200 OK**:
- Body: 图片二进制
- Headers: `Content-Type: image/png`, `Cache-Control: public, max-age=86400`, `Content-Length: N`

**404 Not Found**: 图片不可解析

**400 Bad Request**: index 不是数字或超出范围

---

## 4. 文件改动清单

### 后端 (Rust)

| 文件 | 操作 | 具体改动 |
|------|------|---------|
| `src-server/Cargo.toml` | 修改 | 新增 `base64 = "0.22"` 依赖 |
| `src-server/src/scanner/session_loader.rs` | 修改 | ① `ImageMeta` struct（pub, Serialize）② Message 新增 `images` 字段 ③ `ContentBlock::Image` 变体 ④ `extract_blocks` 处理 image type ⑤ 发射循环图片累积逻辑 ⑥ `parse_cursor_image_refs()` 函数 ⑦ `resolve_image()` pub 函数供 router 调用 |
| `src-server/src/router/images.rs` | **新建** | handler 函数 + routes() 定义 |
| `src-server/src/router/mod.rs` | 修改 | 加 `mod images;` + `.merge(images::routes())` |

### 前端 (React)

| 文件 | 操作 | 具体改动 |
|------|------|---------|
| `web/src/lib/api.ts` | 修改 | `ImageMeta` 接口 + RustMessage 增加 `images?` + `imageUrl()` helper |
| `web/src/lib/use-session-search.ts` | 修改 | ALL_FILTERS 加 "image"，filter 逻辑加 image 判断 |
| `web/src/lib/role-theme.ts` | 修改 | image filter 主题配置 |
| `web/src/components/session/MessageBlock.tsx` | 修改 | 正文后渲染 ImageThumbnailStrip |
| `web/src/components/session/MessageStream.tsx` | 修改 | estimateSize 增加图片高度 |
| `web/src/components/session/ImageThumbnailStrip.tsx` | **新建** | 横排缩略图 + lightbox 状态管理 |
| `web/src/components/session/ImageThumbnail.tsx` | **新建** | 单张缩略图 + loading/error 状态 |
| `web/src/components/session/ImageLightbox.tsx` | **新建** | 全屏查看器（缩放/平移/翻页/下载/信息栏） |

---

## 5. 实施顺序

**Phase 1 — 后端数据层**:
1. Cargo.toml 加 base64 依赖
2. ImageMeta struct + Message.images 字段
3. extract_blocks 新增 image 处理 + 图片累积发射逻辑
4. Cursor `<image_files>` 解析
5. resolve_image 函数（三级 fallback）
6. images.rs 路由 + mod.rs 注册
7. 后端单测

**Phase 2 — 前端数据层**:
1. api.ts 类型更新
2. use-session-search.ts filter 逻辑
3. role-theme.ts image 主题

**Phase 3 — 前端 UI**:
1. ImageThumbnail 组件（含 error 兜底）
2. ImageThumbnailStrip 组件
3. MessageBlock 集成
4. MessageStream estimateSize 调整
5. ImageLightbox 组件
6. 前端单测

---

## 6. 测试策略

### 后端

| 测试 | 内容 |
|------|------|
| extract_blocks with image | 构造含 image block 的 JSONL 行，验证 Message.images 正确填充 |
| Cursor 解析 | 构造 `<image_files>` 文本，验证 parse_cursor_image_refs 返回正确路径 |
| resolve_image cache hit | 临时目录写入 image-cache 文件，验证优先返回 |
| resolve_image base64 fallback | 无缓存文件但有 JSONL base64，验证正确解码返回 |
| resolve_image 404 | 无缓存无 base64 无文件，验证返回 Err |
| image endpoint 集成 | axum-test 发送 GET 请求，验证 200 + 正确 Content-Type |

### 前端

| 测试 | 内容 |
|------|------|
| ImageThumbnail error | 渲染 broken src，模拟 onError，验证占位卡片出现 |
| ImageThumbnailStrip | 传入 3 张图片的 message，验证 3 个 img 元素 + 正确 src |
| filter logic | 测试 selectedRoles 不含 "image" 时，有图片的消息被过滤 |
| estimateSize | 验证有 images 的 user 消息估算值比无图片时高 172px |

---

## 7. 边界情况

| 场景 | 处理 |
|------|------|
| 消息全是图片无文本 | 发射 `text: ""` 的 Message + images |
| 同一消息文本+图片交替 | 所有图片累积到第一个（或最后一个）文本 Message |
| JSONL 中 image data 损坏（非法 base64） | base64 decode 失败 → 跳过该图片，404 |
| image-cache 目录不存在 | 跳过缓存步骤，走 JSONL 解析 |
| 并发请求同一张图片 | 各自独立打开文件，无竞争 |
| 超大图片（>5MB base64） | 正常处理，base64 decode 后流式返回 |
| session_id_raw 为 None | 跳过 image-cache 步骤，直接走 JSONL |
