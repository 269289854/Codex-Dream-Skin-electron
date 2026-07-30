# GitHub Actions 双平台构建与发布手册

本文档是 Codex Dream Skin Studio 的 GitHub Actions 构建与发布标准。后续维护者或自动化代理处理 Windows/macOS 发布时，应先阅读本文档，再核对当前 `package.json`、工作区状态和 GitHub 仓库设置。

本文档描述的是目标工作流。仅创建本文档不会启用 GitHub Actions；仓库中还必须存在 `.github/workflows/release.yml`。

## 发布契约

- 仓库：`269289854/Codex-Dream-Skin-electron`
- Node.js：22 或更新版本
- 依赖管理：只使用 `npm` 和已提交的 `package-lock.json`
- Windows Runner：标准 `windows-2025` x64
- macOS Runner：标准 `macos-15` arm64
- Windows 产物：x64 NSIS 安装包、对应 `.blockmap` 和 `latest.yml`
- macOS 产物：同时支持 Intel 与 Apple Silicon 的 Universal DMG 和 ZIP
- 正式 Release 标签：`v<package.json version>`，例如 `v1.0.10`
- 临时 Actions 构建产物：保留 7 天

`package.json` 中的脚本是构建行为的权威来源：

```text
npm run package:win  -> Windows x64 NSIS
npm run package:mac  -> macOS Universal DMG + ZIP，并执行 macOS 产物验证
```

Windows 的 `npm run test:config` 依赖 PowerShell，只在 Windows Job 中运行。macOS 的验证脚本依赖 `lipo`、`hdiutil`、`ditto` 和 `PlistBuddy`，不能在 Windows Runner 上替代执行。

## 一次性配置

1. 确认 GitHub 仓库的 Actions 功能已启用。
2. 新增 `.github/workflows/release.yml`，内容使用下文的标准 Workflow。
3. 如果组织策略限制 `GITHUB_TOKEN`，在 `Settings -> Actions -> General -> Workflow permissions` 中允许 Workflow 获得写入 Release 所需的 `contents: write` 权限。
4. 将 Workflow 提交到默认分支。
5. 先通过 `workflow_dispatch` 手动运行一次，确认 Windows 和 macOS 临时产物均可下载。
6. 手动构建通过后，再使用版本标签触发正式 Release。

不要把 GitHub Token、Apple 账号、证书密码或其他密钥写入 Workflow、源码、日志或本文档。

## 标准 Workflow

将以下内容保存为 `.github/workflows/release.yml`：

```yaml
name: Build and release desktop apps

on:
  workflow_dispatch:
  push:
    tags:
      - 'v*'

permissions:
  contents: read

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  version:
    runs-on: ubuntu-24.04
    outputs:
      value: ${{ steps.package.outputs.value }}
    steps:
      - uses: actions/checkout@v6

      - id: package
        shell: bash
        run: |
          version="$(node -p "require('./package.json').version")"
          echo "value=${version}" >> "${GITHUB_OUTPUT}"

          if [[ "${GITHUB_REF_TYPE}" == "tag" && "${GITHUB_REF_NAME}" != "v${version}" ]]; then
            echo "Tag ${GITHUB_REF_NAME} does not match package version ${version}." >&2
            exit 1
          fi

  windows:
    needs: version
    runs-on: windows-2025
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v7
        with:
          node-version: '22'
          cache: npm

      - run: npm ci
      - run: npm test
      - run: npm run test:config
      - run: npm run package:win

      - name: Verify Windows artifacts
        shell: pwsh
        run: |
          $version = '${{ needs.version.outputs.value }}'
          $required = @(
            "release/Codex-Dream-Skin-Studio-Setup-$version.exe",
            "release/Codex-Dream-Skin-Studio-Setup-$version.exe.blockmap",
            'release/latest.yml'
          )
          $missing = $required | Where-Object { -not (Test-Path -LiteralPath $_) }
          if ($missing) {
            throw "Missing Windows release artifacts: $($missing -join ', ')"
          }

      - uses: actions/upload-artifact@v4
        with:
          name: windows-${{ needs.version.outputs.value }}
          retention-days: 7
          if-no-files-found: error
          path: |
            release/Codex-Dream-Skin-Studio-Setup-${{ needs.version.outputs.value }}.exe
            release/Codex-Dream-Skin-Studio-Setup-${{ needs.version.outputs.value }}.exe.blockmap
            release/latest.yml

  macos:
    needs: version
    runs-on: macos-15
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v7
        with:
          node-version: '22'
          cache: npm

      - run: npm ci
      - run: npm test
      - run: npm run package:mac

      - uses: actions/upload-artifact@v4
        with:
          name: macos-${{ needs.version.outputs.value }}
          retention-days: 7
          if-no-files-found: error
          path: |
            release/Codex-Dream-Skin-Studio-${{ needs.version.outputs.value }}-mac-universal.dmg
            release/Codex-Dream-Skin-Studio-${{ needs.version.outputs.value }}-mac-universal.zip

  release:
    if: github.ref_type == 'tag'
    needs: [version, windows, macos]
    runs-on: ubuntu-24.04
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: release
          merge-multiple: true

      - name: Verify complete release
        shell: bash
        run: |
          version='${{ needs.version.outputs.value }}'
          required=(
            "release/Codex-Dream-Skin-Studio-Setup-${version}.exe"
            "release/Codex-Dream-Skin-Studio-Setup-${version}.exe.blockmap"
            "release/latest.yml"
            "release/Codex-Dream-Skin-Studio-${version}-mac-universal.dmg"
            "release/Codex-Dream-Skin-Studio-${version}-mac-universal.zip"
          )

          for artifact in "${required[@]}"; do
            if [[ ! -f "${artifact}" ]]; then
              echo "Missing release artifact: ${artifact}" >&2
              exit 1
            fi
          done

      - name: Create or update GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        shell: bash
        run: |
          if gh release view "${GITHUB_REF_NAME}" >/dev/null 2>&1; then
            gh release upload "${GITHUB_REF_NAME}" release/* --clobber
          else
            gh release create "${GITHUB_REF_NAME}" release/* \
              --verify-tag \
              --title "${GITHUB_REF_NAME}" \
              --generate-notes
          fi
```

`workflow_dispatch` 只生成可下载的临时 Actions 产物，不创建 GitHub Release。只有推送 `v*` 标签时才执行 `release` Job。

## 标准发布流程

发布必须从干净且已同步的默认分支开始。不要覆盖或混入无关工作区改动。

```powershell
git status --short --branch
git pull --ff-only
git fetch --tags
```

更新版本号时使用 `npm version --no-git-tag-version`，让版本提交和标签创建保持显式可审查：

```powershell
npm version 1.0.10 --no-git-tag-version
```

同步更新 `CHANGELOG.md`，然后在 Windows 本地完成提交前检查：

```powershell
npm ci
npm run typecheck
npm test
npm run test:config
git diff --check
```

检查通过后提交版本元数据，创建与 `package.json` 完全一致的 annotated tag：

```powershell
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): 发布 v1.0.10"
git tag -a v1.0.10 -m "v1.0.10"
git push origin main
git push origin v1.0.10
```

推送标签后，GitHub Actions 会并行构建 Windows 和 macOS，只有两个平台都成功后才创建或更新正式 Release。

## Release 验收

正式 Release 必须满足以下条件：

- Release 不是 Draft。
- Release 标签与 `package.json` 版本完全一致。
- Windows 安装包、`.blockmap` 和 `latest.yml` 三个文件同时存在。
- macOS Universal DMG 和 ZIP 同时存在。
- Windows 自动更新依赖的 `.blockmap` 和 `latest.yml` 不得遗漏。
- macOS Job 中的 Universal 架构、FFmpeg、Sharp、libvips、资源目录和最低系统版本验证全部通过。
- GitHub Release 页面显示的文件大小合理，安装包不是零字节或异常小文件。

预期文件名：

```text
Codex-Dream-Skin-Studio-Setup-<version>.exe
Codex-Dream-Skin-Studio-Setup-<version>.exe.blockmap
latest.yml
Codex-Dream-Skin-Studio-<version>-mac-universal.dmg
Codex-Dream-Skin-Studio-<version>-mac-universal.zip
```

上传超时或 Workflow 重跑时，先检查现有 Release 和资产状态。不要在未核对远端状态前创建重复 Release；标准 Workflow 会对已有 Release 使用 `gh release upload --clobber`。

## 费用

截至 2026-07-30，公开仓库使用标准 GitHub 托管 Runner 免费且不限制运行分钟。本文使用的 `windows-2025`、`macos-15` 和 `ubuntu-24.04` 都属于标准 Runner。

- 不要替换为名称中带 `large`、`xlarge` 或其他 Larger Runner 的机器；Larger Runner 即使在公开仓库也收费。
- 私有仓库使用账户套餐内的免费分钟和存储额度，超出后计费。
- Actions 临时产物会占用存储额度，因此统一设置为保留 7 天。
- 计费规则可能变化，发布配置调整前应重新核对 [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) 和 [标准 Runner 列表](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job#standard-github-hosted-runners-for-public-repositories)。

## 签名与公证边界

当前 `package.json` 明确配置了 macOS `identity: null`、`notarize: false` 和 DMG `sign: false`。因此 GitHub Actions 生成的是未签名、未公证的 macOS 安装包，首次打开可能需要用户在 Finder 中右键选择“打开”。

自动构建不等于 Apple 签名或公证。正式接入 Apple Developer ID 时，应单独完成以下工作：

1. 修改并评审 Electron Builder 的签名、公证配置。
2. 将证书、证书密码、Apple ID App-Specific Password 和 Team ID 保存为 GitHub Actions Secrets。
3. 禁止在日志中输出密钥或完整身份信息。
4. 增加 `codesign`、`spctl` 和 notarization 验证。
5. 在真实 Intel Mac 和 Apple Silicon Mac 上执行安装与启动验收。

在上述工作完成前，不得将当前 macOS 产物描述为已签名或已公证。macOS 自动更新当前未启用，用户通过 DMG 或 ZIP 手动升级。

## 故障排查

- `Tag ... does not match package version`：标签和 `package.json` 版本不一致；修正版本或删除错误的远端标签后重新发布。
- Windows 缺少 `.blockmap` 或 `latest.yml`：停止发布，检查 Electron Builder 的 GitHub publish 配置；不能只上传 EXE。
- macOS Universal 验证失败：保留完整 Job 日志，在真实 macOS 环境检查 Electron、FFmpeg、Sharp 和 libvips 的 x64/arm64 内容。
- Release Job 返回权限错误：检查仓库或组织的 Actions Workflow permissions，以及 Job 的 `contents: write`。
- 上传阶段超时：先打开现有 Release 核对资产，不要直接重复创建 Release。
- 临时产物找不到：检查 Actions Run 是否超过 7 天，或重新执行 `workflow_dispatch`。

## 后续代理检查清单

后续对话只需读取本文档，并在执行前重新确认：

1. `git status --short --branch` 是否干净。
2. `package.json` 中版本、脚本、产物名称和签名配置是否变化。
3. `.github/workflows/release.yml` 是否与本文标准一致。
4. GitHub Runner 标签和计费规则是否仍有效。
5. 用户是否明确要求创建标签并发布；未明确要求时只能构建或修改配置，不能发布。
6. 发布完成后是否验证正式 Release 及全部五个资产。
