# Third-party notices

## FFmpeg

Codex Dream Skin Studio includes FFmpeg executables provided by
`ffmpeg-static` for optional local video optimization. Windows packages use
the upstream x64 binary. macOS Universal packages combine the upstream x64
and arm64 binaries with Apple's `lipo` tool without modifying FFmpeg code.

- FFmpeg version: 6.1.1 essentials build
- `ffmpeg-static`: 5.3.0
- License: GNU General Public License version 3 or later
- Project: https://ffmpeg.org/
- Windows x64 binary provider: https://www.gyan.dev/ffmpeg/builds/
- macOS x64 binary provider: https://evermeet.cx/pub/ffmpeg/
- macOS arm64 binary provider: https://osxexperts.net/
- Wrapper source: https://github.com/eugeneware/ffmpeg-static

The FFmpeg executable is distributed separately from this application's
MIT-licensed source code. The applicable FFmpeg license terms remain in force
for that component.
