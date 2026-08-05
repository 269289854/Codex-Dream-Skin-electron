# Changelog

## 1.1.22 - 2026-08-05

- Aligned the Chinese primary navigation label with current Codex: the first item is now “新对话”, while the runtime still recognizes the legacy “新建任务” label and English aliases.
- Migrated existing themes that still contain the old default navigation copy without overwriting custom labels, and synchronized the Studio preview, quick editor, icon labels, and localization entries.
- Added regression coverage for the current home DOM, including navigation recognition and mounting the composer decorations on the inner composer surface.
- Fixed large Polaroid image data URLs being embedded directly in runtime CSS by using revocable Blob URLs.

## 1.1.21 - 2026-08-05

- Added protected built-in and custom icon libraries with portable `.cdsicons` sharing.
- Added project and session marker icons, including deterministic random assignment and refreshed Codex discovery.
- Improved home preview sizing, project/session row alignment, streaming assistant bubble detection, and background layer ordering.
- Fixed particle and conversation bubble stacking so decorations remain behind readable content.
- Fixed the current Codex home composer mount so its decorative frame targets the inner input surface instead of the surrounding credit and project controls.

## 1.1.1 - 2026-08-01

- Added complete Simplified Chinese and English localization across the Studio interface, previews, status messages, errors, Codex operations, and update flows.
- Added typed, language-aware IPC messages so localized state and failures remain consistent across the main, preload, and renderer processes.
- Added theme video compatibility checks during import, export, installation, and launch, with actionable warnings before incompatible media reaches Codex.
- Added a managed Studio media protocol for safe theme-video preview streaming and coordinated media cleanup.
- Fixed video variant creation, preservation, switching, and share-package validation for original and optimized media.
- Fixed localized notification and error handling throughout asynchronous Studio operations.

## 1.1.0 - 2026-07-31

- Hardened cross-platform session recovery with installation identity validation, multi-instance safety, rollback handling, and detailed restore and restart outcomes.
- Added backup archive and availability reporting across the Windows and macOS platform drivers.
- Added cancellable, race-safe theme operations with video compatibility preflight and rollback-safe media imports.
- Added a video transcoding dialog with source inspection, output controls, progress reporting, cancellation, and pending-selection cleanup.
- Added GIF poster frames and reduced-motion previews while improving CDP cleanup and reinjection recovery.
- Fixed conversation bubble rendering, shared preview asset handling, and cancelled image, GIF, video, icon, and font imports.
- Added the tested GitHub Actions contract for unified Windows and macOS release publishing.

## 1.0.9 - 2026-07-29

- Added macOS 12+ support with Universal DMG and ZIP packages for Apple Silicon and Intel Macs.
- Added verified macOS Codex detection, launch, configuration backup, session recovery, and platform-aware Studio controls.
- Added macOS installation guidance and packaging verification for bundled native dependencies and resources.
- Fixed conversation bubble layering and separated the New Task primary and auxiliary hover/selected states.

## 1.0.8 - 2026-07-29

- Added independent planning bubbles and customizable tool activity icons.
- Added GIF icon support and improved particle animation performance.
- Added customizable brand signature media.
- Improved theme import configuration and sidebar task selection handling.
- Refactored planning bubble styling and selector logic.

## 1.0.0 - 2026-07-18

- Added the Codex Dream Skin Studio Windows application icon to the window, taskbar tray, installer, and uninstaller.
- Added a customizable-directory Windows x64 NSIS release package.

## 0.1.0 - 2026-07-17

- Added the Windows Electron theme studio and secure preload IPC bridge.
- Added named theme profiles, managed image imports, SVG normalization, colors, and icon slots.
- Added four-point polaroid fencing, crop preview, placement, resize, rotation, and responsive hiding.
- Added Store Codex detection, strict UTF-8 config transactions, loopback CDP injection, verification, restore, reconnect, and tray lifecycle.
- Added Windows x64 unpacked and NSIS packaging.
