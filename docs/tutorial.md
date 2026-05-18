# agent-panel 打包与分发教程

> 这份教程告诉你怎么把 agent-panel **打包**给别人、别人怎么**安装**、以及可以从哪些**渠道分发**（内网/外网/离线都说）。上传的动作本教程不做，只列选项。
>
> **改名说明**：v0.1.x 叫 `skill-panel`。从 v0.2 起改名为 `agent-panel`，因为加了会话详情、用量统计、hooks/agents 等一堆远超 "skills 看板" 的能力。`bin/skill-panel.mjs` 仍保留为兼容 alias，老命令 `npx skill-panel` 仍可正常运行；本教程下文统一用新命令 `agent-panel`。

---

## 先搞清楚约束

agent-panel 是一个 **Bun 原生**的程序：

- 读 Cursor 的 sqlite 数据库用了 `bun:sqlite` —— 这是 Bun 独有的 API，Node 上没有
- 所以 **任何运行它的机器都必须先装 Bun**，绕不过去

| 对方机器要有 | 版本要求 | 为什么 |
|---|---|---|
| **Bun** | ≥ 1.0 | 运行时必须（`bun:sqlite`） |
| Node.js | ≥ 18 | `bin/skill-panel.mjs` 入口是 `.mjs`，会 `spawn` bun |
| npm | 随 Node | 安装用 |

> Bun 安装：
> - Linux/macOS: `curl -fsSL https://bun.sh/install | bash`
> - macOS: `brew install oven-sh/bun/bun`
> - Windows: `powershell -c "irm bun.sh/install.ps1 | iex"`

这也决定了下面几种打包路线的取舍。

---

## 方案对比

| 方案 | 产物 | 对方前置 | 体积 | 推荐场景 |
|---|---|---|---|---|
| **A. `npm pack` tarball** ⭐ | `skill-panel-x.y.z.tgz` | Node + Bun | ~260 KB | 团队里能装 Bun 的同事 |
| B. 内网 npm registry 发布 | registry 上的 `skill-panel@x.y.z` | Node + Bun + 能连内网 registry | 同上 | 公司内部多人长期用 |
| C. 内网 git repo 分发 | git tag / 直接 clone | Node + Bun + 能 clone | 仓库全量 | 愿意给同事代码权的团队 |
| D. Bun compile 单文件 | `skill-panel`（单 binary） | **无** | ~90-100 MB/架构 | 给完全不懂开发的人用 |

**v1 推荐方案 A**。方案 B/C 是 A 的扩展（把 tgz 放到仓库或 registry）。方案 D 是高级路线，本教程末尾给个指路。

---

## 方案 A：一键打 tgz（推荐）

### 打包

在项目根目录执行：

```bash
./scripts/pack.sh
```

就这一行。脚本会自动：

1. 清空 `web/dist` 和 `pkg/`
2. 跑 `bun run typecheck`
3. 跑 `bun run build`（产 `web/dist/`）
4. 跑 `npm pack`，把结果落到 `pkg/skill-panel-<版本>.tgz`

产出示例：

```
[pack] ✓ done

产物：
  pkg/skill-panel-0.1.0.tgz  (256K, 61 个文件)

让别人安装：
  npm install -g pkg/skill-panel-0.1.0.tgz
  skill-panel
```

额外参数：

```bash
./scripts/pack.sh --skip-tsc     # 不跑类型检查，急着出包用
./scripts/pack.sh --no-clean     # 不清 pkg/，增量打包
./scripts/pack.sh --help
```

### 分发

把 `pkg/skill-panel-0.1.0.tgz` 这一个文件发出去。方式见后文"上传选项"。

### 对方安装

```bash
# 装完就得到一个叫 skill-panel 的命令
npm install -g ./skill-panel-0.1.0.tgz

# 跑一下
skill-panel
# 浏览器会自动打开 http://127.0.0.1:7788
```

不想全局安装、只想跑一次：

```bash
npx ./skill-panel-0.1.0.tgz
```

### 对方卸载

```bash
npm uninstall -g skill-panel
```

数据目录（`./logs/`）是在**运行时**的工作目录下产生的，卸载不会动它。如果要连数据也清，手动删。

---

## 方案 B：发到内网 npm registry

前提：你公司已经有一个内网 npm registry（例如自建的 Verdaccio，或公司统一部署的）。

### 一次性配置

```bash
# 给 skill-panel 包指定 registry（不改动全局 ~/.npmrc）
npm config set --location=project @your-scope:registry https://your-internal-registry.example.com
# 登录（按 registry 规则，一般是 npm login 或 yarn auth）
npm login --registry https://your-internal-registry.example.com
```

如果 registry 要求加 scope，改一下 `package.json`：

```json
{ "name": "@your-scope/skill-panel" }
```

### 发布

```bash
./scripts/pack.sh          # 先本地打包，验证 tgz 能用
npm publish                # 或 npm publish --access=restricted
```

### 对方安装

```bash
npm install -g @your-scope/skill-panel
# 或直接跑
npx @your-scope/skill-panel
```

**注意**：公开的 npmjs.com 不要发。本教程明确不做这一步；你需要时手动 `npm publish --registry=<公共>`。

---

## 方案 C：直接给代码仓库

适合"对方能 clone 你的 git 仓库"的场景：

```bash
# 对方机器上
git clone ssh://git@你的内网git/path/skill-panel.git
cd skill-panel
bun install
bun run build
bun link            # 建一个全局命令
skill-panel
```

或者不建命令：`bun run start`。

优点：零打包步骤，对方直接拿源码跑。
缺点：对方要懂一点 `bun install`；每次更新要自己 `git pull`。

---

## 方案 D：Bun compile 成单文件（高级）

**目标**：对方机器**不用装 Bun、不用装 Node**，下个二进制就能跑。

**代价**：
- 需要重写入口（当前 `bin/skill-panel.mjs` 是 Node 调 Bun 的 shim，要换成 Bun 原生入口）
- 静态资源（`web/dist/`）需要 `Bun.file()` 引用让编译器 embed
- 每个目标平台（mac-arm64 / mac-x64 / linux-x64 / linux-arm64 / win-x64）各打一份
- 单个二进制 ~90-100 MB（Bun runtime 占大头）

路线草图（本教程不代跑）：

```bash
# 1. 写 server/compiled-entry.ts：把 bin/skill-panel.mjs 的 argv 解析 +
#    server/index.ts 的启动逻辑合并，静态资源改为 `await Bun.file("./web/dist/index.html").text()` 形式
# 2. 编译
bun build server/compiled-entry.ts \
  --compile \
  --target=bun-darwin-arm64 \
  --outfile dist/skill-panel-mac-arm64

# 3. 对方直接下这个二进制，chmod +x，./skill-panel-mac-arm64
```

目前这个路线**没实现**，等你确实需要给非开发人员使用时再上。

---

## 分发 / 上传方案清单

**本教程不会帮你上传**，下面只列出可选项，你按公司/团队偏好挑：

| 方式 | 适合谁看 | 操作 |
|---|---|---|
| 🏢 公司聊天工具（大象、Slack、飞书 etc.）直接发 tgz 附件 | 一两个同事 | 拖文件发送 |
| 🏢 公司共享盘 / 对象存储（S3-like） | 同部门多人 | 上传 tgz，发下载链接 |
| 🏢 内网 npm registry（私有 Verdaccio/Nexus）| 长期维护的内部工具 | `npm publish --registry=...` |
| 🏢 内网 git repo 的 Release / Attachment | 代码也想同步的团队 | `git tag v0.1.0 && 推到远端 + 手动上传 tgz 作为 release 资产` |
| 🏢 公司的 Homebrew tap（私有，基于内网 git）| macOS 重度用户 | 写个 formula，对方 `brew install <tap>/skill-panel` |
| 💾 U 盘 / Airdrop | 离线场景 | 拷文件 |
| 📧 邮件 | 临时分享 | 把 tgz 发出去 |
| 🌍 **公开 npm**（npmjs.com）| 全世界 | `npm publish`（这次**不做**，按你要求保留） |
| 🌍 GitHub Release | 开源分发 | `gh release create ... ./pkg/*.tgz` |

> 上面几项我故意**没写公司具体产品名**（比如美团的 xxx、阿里的 yyy）—— 不同公司工具不同，选你们内部有的那个就行。

---

## 安装后对方该怎么用

这段可以直接复制给同事：

```
1. 装 Bun：curl -fsSL https://bun.sh/install | bash
2. 装 skill-panel：npm install -g ./skill-panel-0.1.0.tgz
3. 跑：skill-panel
4. 浏览器自动开 http://127.0.0.1:7788
5. 按需：
   - skill-panel --port 9999    指定端口
   - skill-panel --no-open      不自动开浏览器
   - skill-panel --help
6. 数据完全本地，绑 127.0.0.1，不联网、无遥测
7. 不想要了：npm uninstall -g skill-panel
```

---

## 常见问题

**Q: `skill-panel` 装完说 "Bun is required"？**
A: 没装 Bun 或不在 PATH 里。`curl -fsSL https://bun.sh/install | bash`，然后**新开一个终端**再跑。

**Q: 升级怎么办？**
A: 再跑一次 `./scripts/pack.sh`，把新 tgz 发出去；对方 `npm install -g ./skill-panel-0.1.1.tgz`（同名覆盖旧版）。

**Q: 版本号怎么改？**
A: 编辑 `package.json` 的 `version`，或 `npm version patch|minor|major`。

**Q: 我的某台机器没联网能装吗？**
A: 能。tgz 里已经没有外网依赖。但 `npm install -g` 会顺带装 tgz 的 `dependencies`（hono、chokidar 等），**首次安装需要能访问 npm registry**（公共或内网都行）。完全离线安装需要搭配 `npm pack` 递归打包所有依赖，比较折腾，目前不推荐。

**Q: 会污染对方的全局 npm 吗？**
A: 不会，跟任何全局 CLI 包一样，只加一个 `skill-panel` 命令。可 `npm uninstall -g skill-panel` 干净卸载。

**Q: 我能只给 tgz、不发 `scripts/pack.sh` 吗？**
A: 当然。tgz 里不包含打包脚本，对方只拿到运行所需的文件（`bin`、`server`、`shared`、`web/dist`、`README.md`）。

---

## 下一步你可能想做

- 用方案 D 打真·单文件给非开发同事试试 —— 等提需求时再动手
- 写个 `scripts/publish.sh`，把"pack → 上传到内网某处"做成一条命令 —— 先想清楚要上传到哪再做
- 加个 GitHub Actions / 内网 CI：打 tag 自动出 tgz —— 等决定了托管位置再做
