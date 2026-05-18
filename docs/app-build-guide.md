# AgentPanel 桌面应用构建指南

## 环境要求

| 工具 | 版本 | 安装命令 |
|---|---|---|
| Rust | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Node.js | ≥18 | `brew install node` |
| pnpm | ≥8 | `npm install -g pnpm` |
| Tauri CLI | ≥2.0 | `cargo install tauri-cli --version "^2"` |
| Xcode CLI Tools | 任意 | `xcode-select --install` |

## 一键构建

```bash
bash scripts/build-app.sh
```

脚本自动完成四步：
1. `pnpm build` — 构建前端到 `web/dist/`
2. `cargo build --release -p agent-panel-server` — 编译后端
3. 复制 server 二进制到 `src-tauri/binaries/` 作为 sidecar
4. `cargo tauri build` — 打包 `.app` + `.dmg`

产物位置：`target/release/bundle/dmg/AgentPanel_0.0.1_aarch64.dmg`

## 安装使用

1. 双击 `.dmg` 文件
2. 将 `AgentPanel.app` 拖入 `Applications`
3. 从启动台打开 AgentPanel
4. 首次打开可能需要：系统设置 → 隐私与安全 → 允许打开

## 应用行为

- **启动**: app 自动启动内嵌的 server（端口 7788，如被占用则递增）
- **日志**: `~/Library/Logs/AgentPanel/`（macOS）
- **退出**: 关闭窗口即退出，server 进程自动清理

## 替换应用图标

1. 准备 1024×1024 的 PNG 图片
2. 运行：`cargo tauri icon path/to/your-icon.png --output src-tauri/icons`
3. 重新执行 `bash scripts/build-app.sh`

## 本地开发（不受影响）

桌面打包与本地开发完全独立：

```bash
# 后端开发
cd src-server && cargo run

# 前端开发（代理到后端 7788）
cd web && pnpm dev

# 运行测试
cargo test -p agent-panel-server
cd web && pnpm test
```

## 多平台构建（后续）

| 平台 | 产物 | 说明 |
|---|---|---|
| macOS | `.dmg` | 当前已支持 |
| Windows | `.exe` / `.msi` | 在 `tauri.conf.json` 的 `bundle.targets` 加 `"nsis"` 或 `"msi"`，需在 Windows 上构建 |
| Linux | `.deb` / `.AppImage` | 加 `"deb"` 或 `"appimage"`，需在 Linux 上构建 |
| Linux 服务器 | 无桌面 | 直接部署 `agent-panel-server` 二进制 + `web/dist/`，无需 Tauri |

## 故障排查

**Q: 构建报 `resource path not found`**
A: 确保先执行 `cd web && pnpm build` 生成 `web/dist/`。

**Q: 构建报 `sidecar binary not found`**
A: 确保先执行 `cargo build --release -p agent-panel-server`，或直接用 `scripts/build-app.sh`。

**Q: app 打开后白屏**
A: 检查 `~/Library/Logs/AgentPanel/` 日志。可能是端口冲突或 server 启动失败。

**Q: macOS 提示"无法验证开发者"**
A: 系统设置 → 隐私与安全 → 安全性 → 仍然打开。正式分发需 Apple Developer 签名。
