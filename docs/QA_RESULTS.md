# Windows 验收结果

## 验收环境

- 日期：2026-07-17。
- 系统：Windows x64。
- Codex：Microsoft Store `OpenAI.Codex_26.715.2236.0_x64__2p2nqsd0c76g0`。
- Studio：`0.1.0` Windows x64 unpacked 和 NSIS 构建。

## 自动检查

以下命令均通过：

```powershell
npm run typecheck
npm test
npm run test:config
npm run package:win
```

Vitest 共运行 5 个测试文件、8 项核心测试，覆盖主题配置和编译、素材访问边界、围栏几何、CDP 安全及 preload 载荷。PowerShell 配置测试额外覆盖中文路径、严格 UTF-8、原子安装/恢复，以及 `[desktop.open-in-target-preferences]` 和 `[desktop.open-in-target-preferences.perPath]` 子表的逐字节保留。

## 真实 Codex 验收

- 从系统文件选择器导入 `dream-reference.png` 成功，四点围栏、裁切预览、拖动、宽度和 `3` 度旋转均正常。
- GUI 检测到 Store Codex `26.715.2236.0`，以回环地址 `127.0.0.1:9335` 启动并向 2 个 `app://` 页面注入主题。
- “验证主题”和“重新注入”均通过，两个页面持续保有主题标记。
- 当前宽屏视口 `1346 x 902` 下，真实首页包含 Hero、4 张功能卡片、输入区和独立拍立得。
- CDP 模拟 `1280 x 820` 时，Hero 为 `930 x 390`，4 张卡片等宽排列，页面无横向溢出；拍立得位于右下且不遮挡输入区。
- 任务页面保留主题颜色和装饰，但按设计隐藏首页 Hero、卡片和拍立得，不改变任务内容结构。
- 活动主题下关闭窗口后 Studio 进程继续驻留；强制结束 Studio 模拟异常退出后，重新启动能够从 `session.json` 自动恢复为 `active`，重新连接 2 个 Codex 页面。
- “恢复并重启 Codex”完成后，`9335` 调试端口关闭，主题外观键被清除，配置备份被归档。
- 恢复前后 `[desktop]`、`[desktop.open-in-target-preferences]`、`[desktop.open-in-target-preferences.perPath]` 及中文路径内容一致。仅 Codex/Computer Use 自身运行期间更新的时间戳和临时管道值发生变化。

## 已知限制

- 第一版仅支持 Windows x64 和 Microsoft Store Codex。
- 拍立得区域由用户选择四个角点，不提供自动图像识别。
- 不包含自动更新、在线主题商店或 macOS/Linux 支持。
- 当前安装包未配置发行者代码签名证书，Windows SmartScreen 可能显示未知发布者提示。
