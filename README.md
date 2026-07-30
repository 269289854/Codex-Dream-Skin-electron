# Codex Dream Skin Studio

Codex Dream Skin Studio 是一款支持 Windows x64 与 macOS 12+ Universal（Intel + Apple Silicon）的 Codex 桌面主题编辑器。它面向经过平台签名身份验证的官方 Codex 桌面应用，提供本地主题制作、实时预览、跨平台主题分享，以及通过受验证的本机连接将主题应用到 Codex 的完整工作流。

本项目使用 Electron、React、Vite 和 TypeScript 构建，是从 [Fei-Away/Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin) 迁移并继续开发的独立开源项目，不是 OpenAI 官方产品，也不修改 Codex 安装包本身。

## 功能

### 主题管理

- 创建、复制、切换、删除多个本地主题。
- 内置系统主题可编辑、复制和导出，但不会被删除；自定义主题可以正常管理。
- 主题保存后可直接重新注入运行中的 Codex，也可以导出为分享文件。
- 恢复系统默认主题时，会重新载入完整的主视觉、拍立得和装饰预设。

### 主视觉和媒体

- 为 Codex 首页选择图片、GIF 或视频作为主视觉。
- 支持 PNG、WebP、JPEG、SVG、原生 GIF、MP4 和 WebM；SVG 会先进行安全检查并转换为 PNG。
- 调整主视觉的缩放、水平位置、垂直位置和水平/垂直翻转。
- 为 GIF 和视频设置自动播放、循环、静音、音量等播放行为；浏览器阻止自动播放时会保留画面并提供播放入口。
- 媒体会复制到应用数据目录，删除原始文件不会影响已经保存的主题。

### 拍立得组件

- 在原图上依次选择四个角点，定义拍立得的透视裁切区域。
- 在预览中拖动角点修正围栏，并阻止围栏自交或超出图片范围。
- 调整拍立得宽度、旋转角度、位置、隐藏阈值、阴影、图钉和图片翻转。
- 在 Studio 预览和实际 Codex 页面中拖动拍立得；运行时拖动位置只对当前页面生命周期生效，不会覆盖主题中的初始位置。
- 拍立得可以使用图片、GIF 或视频，并拥有独立的播放设置。

### 首页文案和布局

- 自定义首页标题和副标题。
- 标题支持唯一的 `{project}` 占位符，注入后会显示为 Codex 原生项目选择器。
- 预览中的项目栏、标题、装饰、四张快捷操作卡片、输入框和拍立得使用与运行时一致的布局规则。
- 支持首页和会话页面两种预览视图，点击预览元素即可打开对应的快速编辑入口。

### 外观、图标和字体

- 调整背景、正文、强调、粉色、淡紫、边框、成功、危险和其他界面令牌的颜色与渐变。
- 配置品牌标识、首页装饰、输入框、项目栏、快捷卡片、拍立得图钉和其他图标槽位。
- 图标可以使用内置 Lucide 图标，也可以导入 PNG、WebP、JPG 或 SVG；SVG 会先检查外部引用和脚本。
- 使用系统界面字体、内置中文字体和等宽字体，或导入自己的字体文件并为不同文本槽位分别选择。
- 配置雨落、闪烁和其他粒子装饰的显示、样式、数量、颜色、不透明度和动画参数。
- 为 Codex 完整应用视口配置独立的“整个窗口背景”，覆盖顶部工具栏、侧栏和主区域，并固定在窗口中，不随页面切换或内容滚动。
- 窗口背景支持纯色、线性渐变、径向渐变、图片、GIF 和视频；媒体可调整透明度、焦点、缩放及水平/垂直翻转，视频固定静音、自动播放和循环。
- 窗口背景最多叠加 8 层独立遮罩。每层均可使用纯色或渐变，选择全屏、椭圆或圆角矩形，并单独调整透明度、位置、宽高、柔化和圆角；图层列表按前景到背景排列，也可以删除全部图层实现无遮罩。
- 启用窗口背景后，顶部工具栏、侧栏、主区域和品牌栏的结构背景会自动透明，卡片、消息、输入框、边框和装饰仍保留主题样式；关闭后恢复原有结构背景。
- 为会话页面配置纯色、图片、GIF 或视频背景；遮罩支持纯色、线性渐变、径向渐变和 2–8 个自定义色标。
- 将会话遮罩设为全屏、椭圆或圆角矩形，并调整局部遮罩的位置、宽高、边缘柔化和圆角。
- 窗口背景与会话背景互相独立；会话背景启用时显示在窗口背景上方，关闭后会透出窗口背景。
- 可为实际 Codex 会话开启聊天气泡，并分别设置“我的消息”和“Codex 回复”的纯色、线性渐变或径向渐变背景；命令结果、工具卡片和文件差异保持原有布局，不会被包进气泡。

### Codex 运行控制

“运行设置”提供完整的应用与恢复流程：

- **检测 Codex**：检查 Windows Microsoft Store 身份，或 macOS 的 bundle ID、OpenAI Team ID、签名、版本和当前运行状态。
- **安装配置**：先备份 Codex 配置，再设置启用本地主题所需的浅色基础配置。
- **启动并应用**：必要时重启 Codex，开启仅监听回环地址的 CDP 端点，并注入当前主题。
- **重新注入**：将保存后的主题重新编译并刷新到已连接的 Codex 页面。
- **验证主题**：检查所有目标页面是否仍存在主题标记和样式。
- **停止注入**：移除当前页面的主题注入，但保留已安装的基础配置。
- **恢复并重启 Codex**：停止注入、恢复安装前的原始配置、归档备份，并以普通模式重启 Codex。
- 主题注入成功后可在“运行设置”中直接退出 Studio 并保留当前已注入主题；Studio 退出后不再负责后续重新注入。
- 主题运行期间直接关闭窗口会隐藏到系统托盘；托盘可选择保留当前主题退出 Studio，或恢复 Codex 后退出。
- Studio 意外退出后，重新启动会尝试从会话记录恢复活动主题连接。

### 主题分享

- 将当前预览中的主题（包括尚未保存的修改）导出为单个 `.cdstheme` 文件。
- 导出包是自包含的 ZIP64 文件，包含主题配置、实际引用的图片、GIF、视频、图标和字体，接收方不需要原始素材。
- 可以通过文件选择器导入，也可以将 `.cdstheme` 文件拖入 Studio 窗口；导入会创建新的主题，不会覆盖已有主题。
- Windows 与 macOS 使用同一主题 schema 和分享格式；任一平台导出的 `.cdstheme` 都可以在另一平台导入。
- 分享包内部固定使用 `/` 路径，不写入盘符、反斜杠、本机数据根目录或其他绝对路径。
- 导入前会校验文件清单、路径、主题结构、素材大小、媒体头部和 SHA-256，并拒绝脚本或可执行文件。
- 导入或复制失败时会清理临时数据并保持当前主题不变。

## 快速开始

### 使用已发布安装包

支持环境：

- Windows 10/11 x64，以及 Microsoft Store 安装的官方 Codex 桌面应用。
- macOS 12 或更新版本，支持 Intel 与 Apple Silicon；Codex 必须通过 `com.openai.codex` bundle ID 和 OpenAI Team ID `2DC432GLL2` 验证。
- 安装包不要求单独安装 Node.js。

Windows 安装：

1. 安装并打开 Microsoft Store 版本 Codex。
2. 安装并启动 `Codex Dream Skin Studio Setup.exe`。

macOS 安装：

1. 从 DMG 将 `Codex Dream Skin Studio.app` 拖入“应用程序”，或解压 ZIP 后移动到“应用程序”。
2. 首次打开未签名构建时，在 Finder 中右键应用并选择“打开”；如果仍被阻止，在“系统设置 → 隐私与安全性”中确认“仍要打开”。
3. 不要全局关闭 Gatekeeper，也不需要修改官方 Codex 应用的隔离属性、签名或应用包。

两个平台的使用步骤相同：创建或选择主题，导入素材并调整外观；打开“运行设置”检测 Codex，再执行“启动并应用”；保存修改后使用“重新注入”，停用主题时使用“恢复并重启 Codex”。

详细的媒体限制、拍立得围栏、跨平台分享、故障排查和数据目录说明见 [使用指南](docs/USER_GUIDE.md)。

## 数据与安全

Studio 数据目录：

- Windows：`%LOCALAPPDATA%\\CodexDreamSkinStudio`。
- macOS：`~/Library/Application Support/CodexDreamSkinStudio`。

目录内容：

- `themes/<id>/theme.json`：主题配置。
- `themes/<id>/assets/`：主题引用的图片、视频、图标和字体。
- `backups/`：Codex 配置备份及恢复归档。
- `runtime/`：当前注入载荷和会话状态。

项目坚持以下边界：

- 修改 Codex 配置前创建首次备份；配置写入使用严格 UTF-8、并发修改检测、同目录临时文件、同步落盘、原子替换和失败回滚。macOS 只修改 `~/.codex/config.toml` 中三个外观键，并逐字节保留无关内容、换行和嵌套表。
- 只连接经过安装身份、真实路径、进程归属、启动时间、端口所有权、浏览器 ID 和 `app://` 页面目标校验的官方 Codex 实例；macOS CDP 仅允许 `127.0.0.1`。
- Windows 不修改 `WindowsApps`；macOS 不修改 Codex `.app`、`app.asar`、签名文件或其他官方程序文件。
- 渲染进程不能直接访问 Node.js、PowerShell、文件系统或任意 CDP 地址；导入素材会检查路径穿越、文件类型、文件头和大小限制。
- Studio 和渲染进程不会获取视频的真实磁盘路径，运行时媒体通过已验证的主题文件绑定生成 `blob:` 地址，也不会关闭 Codex CSP。
- 项目中的预览、测试、文档和截图只使用虚构示例数据，不同步开发者本机的项目、任务、账号或团队信息。详见 [隐私与示例数据约束](docs/PRIVACY.md)。

## 支持范围与限制

- 支持 Windows 10/11 x64 与 macOS 12+ Universal；Linux 不在首版范围内。
- Windows 只支持 Microsoft Store 官方 Codex；macOS 只支持签名验证通过的 `com.openai.codex`，应用显示名可以不同。
- Windows 正式安装版保留自动更新；macOS 构建暂不启用自动更新，需要手动下载新版本。
- macOS DMG/ZIP 与 Windows 安装包当前均未配置发行者签名；请只从可信发布页下载，不要全局关闭 Gatekeeper 或 SmartScreen。
- 拍立得区域需要用户手动选择四个角点，不提供自动图像识别。
- 视频导入要求最长边不超过 4096px；GIF 和图片有单文件大小限制，视频导入、复制和分享时还需要足够的本地磁盘空间。

## 文档

- [使用指南](docs/USER_GUIDE.md)
- [平台验收结果](docs/QA_RESULTS.md)
- [隐私与示例数据约束](docs/PRIVACY.md)
- [侧边栏预览对齐说明](docs/SIDEBAR_PREVIEW_ALIGNMENT.md)
- [拍立得拖拽与保存](docs/POLAROID_DRAGGING.md)
- [开源与第三方声明](NOTICE.md)

## 开发

开发构建需要 Node.js 22 或更新版本，并使用 `npm` 安装依赖：

```powershell
npm install
npm run dev
```

常用检查和构建命令：

```powershell
npm run typecheck
npm test
npm run test:config
npm run build
```

生成 Windows x64 目录包或 NSIS 安装包：

```powershell
npm run package:dir
npm run package:win
```

在 macOS 上生成 Universal 目录包，或未签名的 Universal DMG 和 ZIP：

```bash
npm run package:mac:dir
npm run package:mac
```

macOS 打包会为 x64/arm64 分别准备锁定版本的 FFmpeg，并同时携带 Sharp 的两套官方原生包，再由 Universal 合并阶段生成双架构主程序与 FFmpeg。`npm run test:config` 依赖 PowerShell，应在 Windows x64 环境执行。

打包结果位于 `release/`。该目录是生成产物，不应手工修改或提交。

GitHub Actions 的 Windows/macOS 自动构建、版本标签和 Release 发布标准见 [GitHub Actions 双平台构建与发布手册](docs/GITHUB_ACTIONS_RELEASE.md)。

## 许可证

本项目源代码采用 [MIT License](LICENSE)。许可证、项目来源、内置字体和第三方组件说明见 [开源与第三方声明](NOTICE.md)。
