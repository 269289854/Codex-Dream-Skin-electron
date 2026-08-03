# 平台验收结果

本文档分别记录当前版本的自动化检查和过去版本的真实平台验收。历史结果只证明对应日期、版本与环境下的行为，不能视为当前版本已经完成同等实机验证。

## 当前 v1.1.1 自动化检查（Windows）

### 检查环境与结果

- 日期：2026-08-03。
- 系统：Windows x64。
- Studio：`1.1.1` 源码工作区。
- `npm test`：49 个测试文件、523 项测试全部通过。
- `npm run test:config`：严格 UTF-8 配置安装和作用域恢复测试通过。
- `npm run build`：Node 与 Web TypeScript 检查、主进程、preload 和 renderer 生产构建通过。

本轮自动化测试覆盖主题模型和迁移、双语本地化与 IPC 错误、素材校验和持久化、视频预检与转码、主题分享、Studio 媒体协议、项目图标与素材库持久化、稳定优先级随机、`.cdsicons` 导入导出、包含素材库的 `.cdstheme` v3 分享及隐私排除、Codex 生命周期、Windows/macOS 平台驱动、应用更新、Studio UI 及双平台发布契约。

### 当前版本真实 Electron 视觉检查

使用隔离的 `LOCALAPPDATA` 和 Chromium user-data 目录启动生产构建，通过仅监听 `127.0.0.1` 的临时 CDP 端点检查真实 Electron 窗口。中文和英文 Studio 界面及预览内容均在 `1480 × 920` 下生成 README 截图；截图只包含仓库公开名称和虚构示例数据，已分别更新为 `docs/studio-overview-zh-CN.png` 与 `docs/studio-overview-en.png`。

将同一窗口调整到最小支持尺寸 `1120 × 720` 后，检查主题编辑、项目图标、素材库和主题导出对话框。两种语言下文档尺寸均未超过视口，新增页面和对话框没有横向溢出、文本截断、控件重叠或失效；系统素材库的导出和删除保持禁用，英文项目图标页正确显示本地化的系统库名称。

### 未执行的当前版本验收

- 未运行 `npm run package:win`，因此不声明 Windows `1.1.1` 安装包、卸载或自动更新已在本轮验证。
- 未连接真实官方 Codex 执行项目刷新、配置安装、启动、项目图标注入、停止、会话恢复或配置恢复；因此本轮不声明真实项目发现、图标替换和恢复已完成实机验证。
- 未在 macOS 上重新运行 `1.1.1` 的 Universal 打包、安装、启动或真实官方 Codex 验收。

## macOS Universal 历史验收（Studio 1.0.8）

### 验收环境

- 日期：2026-07-29。
- 系统：macOS 26.5.2，Apple Silicon arm64。
- 官方 Codex：`/Applications/ChatGPT.app`，版本 `26.721.81911`。
- 官方身份：bundle ID `com.openai.codex`，OpenAI Team ID `2DC432GLL2`。
- Studio：`1.0.8`，未签名 Universal 目录包、DMG 和 ZIP。

### 自动检查

以下检查通过：

```bash
npm run typecheck
npm test
npm run build
npm run package:mac:dir
npm run package:mac
git diff --check
```

自动测试覆盖 macOS 应用签名解析、候选过滤、进程身份、端口所有权、严格 UTF-8、嵌套 TOML 保留、原子回滚、会话 v1→v2、平台不匹配、窗口菜单、更新禁用、跨平台分享和打包契约。`.cdstheme` 回归确认包内只使用 `/` 路径，拒绝反斜杠、盘符、绝对路径和路径穿越，并且主题 JSON 不包含源数据根目录。

`tests/windows-port-selection.test.ts` 中 4 项 PowerShell 集成测试只在 Windows 执行，在本次 macOS `npm test` 中明确标记为跳过；`npm run test:config` 同样留待 Windows x64 环境执行，不将缺少 PowerShell 记作通过。

`package:mac:dir` 和 `package:mac` 的产物验证脚本确认：Studio 主程序与内置 FFmpeg 均包含 `x86_64 arm64`；Sharp 与 libvips 同时包含各自正确的 x64/arm64 原生包；DMG、ZIP 可以解包；包内含共享资源和 macOS 资源，不含 Windows 资源；最低系统版本为 macOS 12.0。

使用隔离的 HOME 和 Electron 用户数据目录启动打包后的 Universal 应用，通过仅监听本机的临时 CDP 端点将原生窗口调整为 `1120 × 720`。实测外框、内容视口和文档尺寸均为 `1120 × 720`，没有横向溢出；人工检查截图未发现控件重叠或失效，并确认只包含仓库公开名称和虚构示例数据。截图保留在忽略目录中检查后删除，未提交到仓库。

### 真实官方应用检查

- 只读检测成功找到 `/Applications/ChatGPT.app`，并验证 bundle ID、Team ID、签名、主可执行文件、真实路径、版本和当前运行状态。
- 当前官方 Codex 正在承载本次开发任务。为避免中断任务，没有执行真实停止、带调试参数重启、CDP 注入、配置写入或恢复重启。
- 因未建立真实调试会话，本轮没有读取官方 Codex 的实时 DOM/CDP 目标；共享注入逻辑保持现状，并继续由 Windows DOM、载荷和 CodexService 回归测试覆盖。

### 已知限制

- macOS 构建未签名、未公证，首次启动需要 Finder 右键“打开”或在“隐私与安全性”中确认；不建议全局关闭 Gatekeeper。
- macOS 自动更新暂不可用，需要手动下载新版本。
- 真实官方 Codex 的启动、停止、注入、会话恢复和配置作用域恢复仍需在不承载活动任务的 macOS 环境完成破坏性验收。
- Linux、Apple 开发者签名和公证不在首版范围内。

## Windows 历史验收（Studio 0.1.0）

### 验收环境

- 日期：2026-07-17。
- 系统：Windows x64。
- Codex：Microsoft Store `OpenAI.Codex_26.715.2236.0_x64__2p2nqsd0c76g0`。
- Studio：`0.1.0` Windows x64 unpacked 和 NSIS 构建。

### 自动与真实验收

当时以下命令均通过：

```powershell
npm run typecheck
npm test
npm run test:config
npm run package:win
```

- GUI 检测到 Store Codex `26.715.2236.0`，以回环地址 `127.0.0.1:9335` 启动并向 2 个 `app://` 页面注入主题。
- “验证主题”和“重新注入”通过；活动会话在 Studio 异常退出并重启后恢复。
- “恢复并重启 Codex”关闭调试端口、清除主题外观键并归档配置备份。
- 恢复前后 `[desktop]` 及其嵌套子表和中文路径内容保持一致。

该次 macOS 验收所在主机没有 PowerShell、Wine 或 NSIS，因此当时的 macOS 支持变更没有重新执行 `npm run test:config`、Windows x64 安装包或 Windows 自动更新实机回归；这些项目不能视为该轮已通过。
