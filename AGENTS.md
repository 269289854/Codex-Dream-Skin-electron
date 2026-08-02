# AGENTS.md

本文件适用于仓库根目录及所有子目录。除非更深层目录另有 `AGENTS.md`，所有自动化代理都必须遵守这里的约定。

## 项目定位与边界

Codex Dream Skin Studio 是支持 Windows 10/11 x64 与 macOS 12+（Intel 和 Apple Silicon）的 Codex 桌面主题编辑器，技术栈为 Electron、React、Vite 和严格模式 TypeScript。应用负责管理本地主题、预览和编译运行时载荷，并通过平台驱动与受验证的本机 CDP 端点为官方 Codex 桌面应用应用主题。

- 这是公开仓库，不是 OpenAI 官方产品。
- 不得修改 WindowsApps 中的安装文件、macOS Codex `.app`、`app.asar`、官方签名或其他 Codex 程序文件。
- 主题应用必须可恢复：修改 Codex 配置前创建备份，写入失败时保留或恢复原内容。
- Windows 和 macOS 都是受支持平台，Linux 不在支持范围内。不要削弱任一平台的路径、安装身份、进程归属、命令执行、配置恢复或 CDP 安全检查。
- 渲染进程与外部 Codex 页面都属于不可信边界；权限、路径和数据校验必须留在主进程。

## 开始工作前

1. 先运行 `git status --short --branch`，识别并保留用户已有改动。不要回退、覆盖或格式化无关文件。
2. 若仓库根目录存在 `.codegraph/`，理解或定位代码时先使用 `codegraph explore "<问题或符号>"`，再按需使用 `rg` 和读取文件。
3. 阅读与改动直接相关的测试。跨进程、持久化、媒体、运行时或平台改动还要检查相邻契约和调用方。
4. 开发环境使用 Node.js 22 或更新版本。依赖以 `package-lock.json` 为准并使用 `npm`；不要手工编辑锁文件。
5. 文档、发布或平台相关任务先核对当前 `README.md`、`README.zh-CN.md`、`docs/`、`package.json` 和实际工作流，不要复制过时说明。

## 目录与职责

- `src/main/`：Electron 主进程和所有特权操作，包括窗口与托盘生命周期、IPC 注册、本地主题存储、主题编译、素材校验、分享包、Studio 媒体协议、视频预检/转码、应用更新、Codex 检测/启动/恢复、PowerShell 和 CDP。
- `src/preload/`：唯一的渲染进程桥接层。通过 `contextBridge` 暴露最小且有类型的 `window.studio` API。
- `src/renderer/`：React 编辑器与 Studio 内预览。不得直接使用 Node.js、Electron 主进程 API、任意文件系统路径或 CDP 地址。
- `src/shared/`：跨进程类型、Zod 模型、本地化消息、外观令牌、几何、排版、粒子、媒体与 IPC 契约的权威来源。
- `resources/shared/`：Windows 与 macOS 共用的运行时注入模板、CSS、字体和系统主题素材。
- `resources/windows/`、`resources/macos/`：平台驱动资源、脚本、图标和托盘素材；它们是源文件，不是可忽略的构建产物。
- `resources/branding/`：项目品牌源素材。提交或派生图片前同样执行隐私和许可检查。
- `scripts/`：打包准备、macOS 图标生成和产物验证。脚本必须继续使用确定性的本地输入和显式失败。
- `.github/workflows/`：持续集成和正式 Release 工作流；发布契约同时受测试与 `docs/GITHUB_ACTIONS_RELEASE.md` 约束。
- `tests/`：Vitest、happy-dom、PowerShell、平台、打包和发布契约测试。
- `docs/`：用户指南、隐私规则、验收记录、发布说明及经人工审核的可提交图片。
- `dist/`、`dist-electron/`、`release/`、`output/`、`node_modules/`：生成或本地目录，不要手工修改或提交。

## 跨进程与权限契约

- 保持 `BrowserWindow` 的 `contextIsolation: true`、`nodeIntegration: false` 和 `sandbox: true`。不要通过关闭这些选项解决功能问题。
- 新增或修改 IPC 时，同步更新 `src/shared/contracts.ts`、`src/main/index.ts`、`src/preload/index.ts`，以及需要的 `src/renderer/src/env.d.ts`、调用方和测试。
- 渲染进程传来的数据不可信。主进程边界必须验证标识符、主题对象、locale、路径、素材用途、媒体类型、文件大小、选择 ID、转码设置和布尔参数，不能只依赖 TypeScript 类型。
- UI 可见的 IPC 成功与失败继续使用 `captureIpcResult`/`unwrapIpcResult`，不要让 Electron 包装后的内部异常对象直接暴露给渲染进程。
- 订阅型 IPC 必须返回取消订阅函数，React 组件卸载时必须清理监听器。长时间操作必须保持进度、取消和失败状态可序列化，并在完成后释放控制器与临时状态。
- `studio-media:` 只允许主进程解析已被当前主题引用、待保存或内置系统主题拥有的媒体；不得向渲染进程暴露真实磁盘路径或任意本地文件协议。

## 本地化与用户文案

- Studio 支持 `zh-CN` 和 `en-US`，当前中文源文案是翻译键，英文映射集中在 `src/shared/i18n.ts`。新增或修改 UI 文案、菜单、状态、确认框和错误时，必须同步英文映射与 `tests/i18n.test.ts`。
- React 和主进程菜单使用现有 `t()`/`tm()` 路径，不要在组件中维护平行的中英文条件分支。协议字段、schema 键、类型和内部符号继续使用既有英文命名。
- 跨 IPC、异步状态和组合错误使用 `LocalizedMessage`/`LocalizedError`。动态变量必须保留为结构化 `values`，在最终显示位置翻译；不要在主进程提前拼接成只能显示一种语言的字符串。
- locale 必须通过共享 schema 验证并持久化。切换语言时，同步考虑窗口菜单、托盘、更新状态、平台文案和仍在运行的异步消息。
- 主题的用户可编辑文案同时包含 `zh-CN` 与 `en-US`。创建默认值、迁移、复制、导入、编辑和保存时都不得静默丢弃或覆盖另一语言；预览内容语言与 Studio 界面语言保持独立。
- 技术标识、第三方产品名、文件格式和必须逐字匹配的系统值不要翻译。

## 主题模型、预览与运行时

- `src/shared/theme.ts` 中的 Zod schema、`ThemeProfile`、默认主题和迁移逻辑必须保持一致。持久化结构有破坏性变化时提升版本，并为旧版本提供显式迁移；不要静默丢弃已有字段。
- 新增主题字段时，逐项检查默认值、schema/迁移、双语文案、编辑器状态与控件、Studio 首页/会话预览、`src/main/theme-compiler.ts`、`src/main/codex-service.ts`、运行时注入载荷、复制/保存/分享和相应测试。
- 外观、排版、图标、首页布局、侧栏、聊天气泡或粒子改动优先复用 `src/shared/` 中的令牌和生成函数，避免 Studio 预览与 Codex 运行时各维护一套魔法值。
- `resources/shared/renderer-inject.js` 操作外部应用 DOM，必须可重复执行、可完整清理，并在 Codex DOM 不匹配预期时安全退出，不能留下半套布局或重复监听器。
- 不确定 Codex 中的元素、层级、属性或选择器时，优先连接实际运行中的 Codex 并读取 DOM。不要根据截图、类名习惯或旧结构硬猜；无法读取实际 DOM 时，明确记录假设并采用安全降级行为。
- 注入用户可编辑文案时使用文本语义，不得把文案拼成 HTML。载荷进入 JavaScript 或 CSS 前必须使用结构化序列化和现有转义逻辑。
- 修改运行时 CSS/DOM 时同时核对 Studio 预览。尤其保持 `resources/shared/dream-particle-effects.css` 与 `src/renderer/src/particle-effects.css` 中共享动画一致。

## 文件、媒体、视频与分享

- 主题和素材路径必须约束在主题目录内。保留 UUID 校验、绝对路径拒绝、路径穿越检查、格式/文件头验证、SVG 安全检查、尺寸/条目限制和 MIME 一致性检查。
- 持久化配置、主题、分享导入和运行时载荷使用临时文件、同步落盘、同目录原子替换及失败回滚。磁盘密集操作继续执行可用空间保护；失败或取消时清理临时文件并保持当前主题有效。
- 媒体导入、主题复制、分享导入/导出和视频处理必须保持可取消、互斥与竞态安全。异步结果只能提交到发起操作时对应的主题和选择上下文。
- 视频导入先执行兼容性预检，再通过与主题绑定且可过期的选择 ID 提交原视频或转码决策。提交前复核源文件身份与规格，阻止重复处理，并在失败后按现有状态机恢复或作废选择。
- FFmpeg 使用参数数组和无 shell 的子进程，保留取消信号、超时/输出上限、跨平台编解码约束及产物复检。优化版本和可选原始版本必须原子发布，失败时不能留下半套媒体变体。
- `studio-media:` 只支持所需的 `GET`/`HEAD` 与受限 Range 语义。删除主题或重命名其目录前关闭该主题的活动流，删除失败时恢复可访问状态，并避免在错误中泄漏本机路径。
- `.cdstheme` 必须保持自包含和跨平台。继续校验 ZIP64 压缩/解压预算、条目数量、每类素材上限、`/` 路径、Windows 保留名、manifest、主题版本、SHA-256、媒体头和实际引用；拒绝额外文件、脚本、可执行文件、盘符、反斜杠、绝对路径和路径穿越。
- 分享导入必须创建新主题而不是覆盖现有主题；验证完成前不得激活或发布目录。跨平台分享优先使用可移植视频变体，非兼容视频不得进入运行时或再次导出。

## 平台、进程与恢复安全

- Windows 调用 PowerShell 时使用参数数组和 `-File`；macOS 调用系统工具时同样使用参数数组。不要拼接命令字符串，保留非交互模式、超时、输出大小限制和结构化结果。
- `resources/windows/config-utf8.ps1` 与 `src/main/macos-config.ts` 必须继续严格校验 UTF-8，并逐字节保留无关 TOML 内容、换行及嵌套表。
- Codex 启停和 CDP 连接必须继续验证平台安装身份、真实路径、进程归属、启动时间、端口所有权、浏览器 ID 和页面目标。Windows 保留 Microsoft Store 身份校验；macOS 保留 bundle ID、OpenAI Team ID、签名和标准安装位置校验。
- 不得连接任意调试端口，也不得终止身份未验证的进程。停止进程前重新确认保存的安装 ID、PID、路径与启动时间；Windows 保留身份复核后的受限 `Stop-Process` 流程，macOS 保留先 `SIGTERM`、超时后仅对同一进程升级为 `SIGKILL` 的流程。
- 保留操作互斥、活动会话恢复、配置备份归档和失败可见性。任何“退出”“停止”“恢复”或更新重启行为变更都要覆盖成功、失败、隐藏窗口、重复实例和应用重启场景。
- “停止注入”与“恢复配置”是不同操作；直接退出 Studio 可以保留当前已注入主题。不要为了简化生命周期而合并这些语义或自动恢复用户未要求恢复的配置。

## 更新、打包与发布

- Windows 自动更新只在正式安装版启用；开发环境、`win-unpacked` 和 macOS 构建必须保持禁用。更新检查、下载、安装和重启继续保持串行、可重试、可本地化且不破坏活动 Codex 会话。
- 只有打包或发布相关任务才修改 electron-builder 配置、安装器脚本或 Release 工作流。版本、标签、`docs/releases/v<version>.md`、`CHANGELOG.md` 和发布资产必须按 `docs/GITHUB_ACTIONS_RELEASE.md` 保持一致。
- Windows Release 保留 x64 NSIS 安装包、对应 `.blockmap` 和 `latest.yml`。不得把 unpacked 目录或缺少更新元数据的安装包描述为正式发布。
- macOS Release 保留 Universal DMG 和 ZIP，并验证主程序、FFmpeg、Sharp/libvips、共享/平台资源和最低 macOS 版本。当前构建未签名、未公证且不支持自动更新，不得在代码或文档中声称相反状态。
- 产物写入 `release/`，不提交生成文件。没有用户明确要求时，不创建版本、标签、GitHub Release 或安装包。

## 隐私、文档与截图

严格遵守 `docs/PRIVACY.md`：

- 源码、测试、文档、日志、截图和可提交图片中不得出现真实项目、任务、分支、工作区、账号、团队、邮箱、用户目录、令牌或调试会话信息。
- 预览和夹具只使用当前公开仓库名或明显虚构的数据；不得从运行中的 Codex 同步真实内容。
- 修改 `src/renderer/src/preview-home.ts` 的固定快照时，同步更新完整允许列表，并运行隐私文档指定的预览布局测试。
- `README.md` 是默认英文项目首页，`README.zh-CN.md` 是简体中文对应页。项目能力、平台要求、安装包、命令、限制、语言跳转和文档链接必须同步维护。
- 新增或修改用户可见功能、配置项、平台行为、限制、操作命令、更新或发布流程时，必须检查并同步更新受影响文档。项目首页级变化维护双语 README；详细操作维护 `docs/USER_GUIDE.md`；验证状态维护 `docs/QA_RESULTS.md`；版本发布维护 `CHANGELOG.md` 和对应的 `docs/releases/v<version>.md`。
- 不得以代码和测试已经完成为由保留已知过时文档；若确认某项变更无需更新文档，应在完成检查中明确记录该结论。
- 英文 README 使用 `docs/studio-overview-en.png`，中文 README 使用 `docs/studio-overview-zh-CN.png`；不要用主题效果图、设计稿或另一语言界面冒充 Studio 实际页面。
- 重新生成 README 截图时，启动真实 Electron 应用并使用隔离的 `LOCALAPPDATA`/user-data 目录，窗口设为 `1480x920`。英文截图必须同时激活 English Studio UI 和 `EN` 预览内容，中文截图必须同时激活中文 UI 和中文预览内容。
- 截图临时产物先写入已忽略的 `output/`，人工检查无真实数据、路径、通知和其他桌面内容后，才能复制到 `docs/`。提交的中英文截图保持相同窗口尺寸和构图。
- 尽量避免控制用户整台电脑、鼠标、键盘和前台窗口。视觉验证优先通过 Electron、Playwright、CDP 或应用已有调试端点直接连接；只有直接连接无法完成时才使用桌面级操作。

## 代码风格

- 遵循现有 TypeScript：ES modules、2 空格缩进、单引号、无分号、严格类型和 `noUncheckedIndexedAccess`。
- 优先使用小而明确的函数、判别联合、Zod schema、共享帮助函数和结构化消息。避免 `any`、非必要类型断言和复制共享常量。
- React 使用函数组件和 hooks；副作用应可取消，异步状态必须处理失败、竞态和组件卸载。
- 用户可见文案遵循本地化章节，内部协议与符号遵循现有英文命名。不要引入只在一种语言中可用的新流程。
- 不要进行与任务无关的重构、全仓格式化或依赖升级。新增依赖必须有明确必要性，并通过 `npm` 同步更新 `package.json` 与 `package-lock.json`。
- 注释只解释不明显的约束、安全原因或跨平台差异，不复述代码。

## 验证矩阵

按改动范围先运行目标测试，再运行必要的完整检查。常用命令：

```powershell
npm run typecheck
npm test
npm run test:config
npm run build
```

- 纯文档改动：检查事实、内部链接、命令、图片和 `git diff`；无需运行构建。
- 主题 schema、默认值、迁移、编译、外观、排版或几何：运行 `tests/theme.test.ts`、`tests/runtime-theme.test.ts`、`tests/appearance.test.ts`、`tests/typography.test.ts`、`tests/geometry.test.ts` 及直接相关测试。
- 本地化、结构化错误或 IPC：运行 `tests/i18n.test.ts`、`tests/ipc-result.test.ts`、`tests/preload-ipc.test.ts`，并检查主进程、preload 与 renderer 契约同步。
- 素材、路径、持久化、复制或磁盘保护：运行 `tests/asset-validation.test.ts`、`tests/embedded-assets.test.ts`、`tests/profile-store.test.ts`、`tests/profile-store-cancellation.test.ts` 和 `tests/profile-store-disk-space.test.ts` 中相关用例。
- 视频预检、选择或转码：运行 `tests/pending-video-selections.test.ts`、`tests/video-transcode-settings.test.ts`、`tests/video-transcoder.test.ts`、`tests/video-output-commit.test.ts` 及受影响的 ProfileStore/分享测试。
- `.cdstheme` 分享：运行 `tests/theme-share.test.ts`，覆盖跨平台路径、预算、哈希、旧版本迁移、清理和非兼容视频。
- Studio 媒体协议或主题删除流：运行 `tests/studio-media-protocol.test.ts` 及相关 ProfileStore/UI 测试。
- Codex 生命周期、CDP 或平台驱动：运行 `tests/cdp.test.ts`、`tests/codex-service.test.ts`、`tests/windows-codex-driver.test.ts` 或 `tests/macos-codex-driver.test.ts` 及相关命令/配置测试；涉及 Windows 配置桥接时还要执行 `npm run test:config`。
- 应用更新、退出/托盘生命周期或发布工作流：运行 `tests/app-update-service.test.ts`、`tests/app-lifecycle-contract.test.ts`、`tests/github-actions-release.test.ts` 和受影响的平台/安装器契约测试。
- 注入模板、Codex DOM 或运行时样式：运行 `tests/renderer-payload.test.ts`、`tests/renderer-home-dom.test.ts`、`tests/codex-service.test.ts` 及相关预览测试。
- Studio UI：运行对应 happy-dom 测试并做实际 Electron 视觉/交互检查；至少覆盖窗口最小尺寸 `1120x720`，确认两种语言下无重叠、溢出、截断和失效控件。
- 修改预览快照、示例数据或提交截图：运行 `npm test -- --run tests/preview-layout.test.ts`，并人工执行隐私检查。
- 只有打包或安装器相关改动才执行 `npm run package:dir`、`npm run package:win`、`npm run package:mac:dir` 或 `npm run package:mac`。macOS 打包必须保留脚本内产物验证。

运行单个 Vitest 文件可使用：

```powershell
npm test -- tests/theme.test.ts
```

## 完成标准

- 行为、类型、跨进程契约、双语文案、预览和运行时实现保持一致。
- 安全、恢复、隐私、UTF-8、媒体与分享校验和双平台支持不变量未被削弱。
- 文档与当前代码、脚本、发布能力和签名/更新状态一致；双语 README 与对应截图没有漂移。
- 新功能或行为变更只有在对应文档已同步，或已明确确认无需更新文档后，才算完成。
- 已执行与风险匹配的测试和视觉检查，并如实报告未执行或受环境限制的验证。
- 最终检查 `git diff --check` 和 `git status --short`；确认没有意外生成文件、临时截图、日志或真实环境数据。
- 除非用户明确要求，不要创建提交、分支、标签、发布或安装包。用户要求提交时沿用仓库格式，例如 `feat(preview): ...` 或 `fix(runtime): ...`，摘要简洁且可用中文。
