# Codex Dream Skin Studio

仅支持 Windows 的 Codex 桌面主题编辑器，使用 Electron、React、Vite 和 TypeScript 构建。

主要功能：

- 管理多个本地主题并切换当前主题。
- 选择主视觉图片，调整缩放与位置。
- 在原图上使用四点围栏标记拍立得，并在 Codex 预览中拖动、缩放和旋转。
- 配置主题颜色、内置 Lucide 图标或导入 PNG、WebP、SVG 图标。
- 从 GUI 检测、启动、验证、重新注入、停止和恢复 Codex 主题。
- 严格 UTF-8、原子写入和可恢复备份，不修改 WindowsApps、`app.asar` 或官方签名。

本项目迁移自 [Fei-Away/Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin)，不是 OpenAI 官方产品。

项目中的预览数据、测试夹具、文档和截图必须遵守 [隐私与示例数据约束](docs/PRIVACY.md)，不得包含开发者本机的真实项目、任务、账号或团队信息。

## 使用

1. 安装 Microsoft Store 版本 Codex。
2. 安装并打开 `Codex Dream Skin Studio Setup.exe`。
3. 在“视觉设计”中选择图片并调整主题。
4. 在“运行设置”中点击“检测 Codex”，然后点击“启动并应用”。
5. 不再使用主题时，点击“恢复并重启 Codex”。

完整说明见 [Windows 使用指南](docs/USER_GUIDE.md)，本版本的真实环境验收记录见 [Windows 验收结果](docs/QA_RESULTS.md)，侧边栏预览改造记录见 [侧边栏预览对齐说明](docs/SIDEBAR_PREVIEW_ALIGNMENT.md)。

## 开发

```powershell
npm install
npm run dev
```

## 构建

```powershell
npm run build
npm run package:dir
```

生成结果位于 `release/`。当前只支持 Windows x64。
