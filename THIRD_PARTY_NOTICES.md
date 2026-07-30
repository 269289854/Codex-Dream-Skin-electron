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

## Fontkit

Codex Dream Skin Studio uses `fontkit` to validate imported font files before
they are stored or shared.

- Fontkit version: 2.0.4
- License: MIT
- Project: https://github.com/foliojs/fontkit

Copyright (c) 2012-2024 Devon Govett

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
