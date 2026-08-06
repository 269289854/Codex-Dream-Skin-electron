const { app, BrowserWindow } = require('electron')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

app.commandLine.appendSwitch('disable-gpu')

app.whenReady().then(async () => {
  const css = readFileSync(join(process.cwd(), 'resources', 'shared', 'dream-skin.css'), 'utf8')
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
  const html = `<!doctype html>
    <html class="codex-dream-skin" data-dream-user-bubble-frame="layered" data-dream-user-bubble-body="preset" style="
      --dream-user-bubble-content-padding: 12px;
      --dream-user-bubble-ornament-size: 72px;
      --dream-user-bubble-ornament-outset: 8px;
      --dream-user-bubble-border-width: 2px;
      --dream-user-bubble-border-color: #123456;
      --dream-user-bubble-border-radius: 18px;
      --dream-user-bubble-body-fill: #ffffff;
      --dream-user-bubble-corners: url('${pixel}'), url('${pixel}'), url('${pixel}'), url('${pixel}');
      --dream-user-bubble-corner-sizes: 72px 36px, 36px 72px, 60px 30px, 30px 60px;
    ">
      <head><style>${css}</style><style>
        body { margin: 0; }
        .probe { position: relative; margin: 20px; }
        #short { width: 220px; height: 96px; }
        #wide { width: 720px; height: 96px; }
        #narrow { width: 160px; height: 180px; }
        #high { width: 360px; height: 480px; }
      </style></head>
      <body>
        <div id="short" class="probe dream-conversation-user-bubble"><span>short</span></div>
        <div id="wide" class="probe dream-conversation-user-bubble"><span>wide</span></div>
        <div id="narrow" class="probe dream-conversation-user-bubble"><span>narrow</span></div>
        <div id="high" class="probe dream-conversation-user-bubble"><span>high</span></div>
      </body>
    </html>`
  const window = new BrowserWindow({
    show: false,
    width: 900,
    height: 1000,
    webPreferences: { offscreen: true, sandbox: true }
  })
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  const measurements = await window.webContents.executeJavaScript(`
    ['short', 'wide', 'narrow', 'high'].map((id) => {
      const element = document.getElementById(id)
      const bounds = element.getBoundingClientRect()
      const ornament = getComputedStyle(element, '::after')
      return {
        id,
        width: bounds.width,
        height: bounds.height,
        backgroundImage: ornament.backgroundImage,
        backgroundPosition: ornament.backgroundPosition,
        backgroundSize: ornament.backgroundSize,
        inset: [ornament.top, ornament.right, ornament.bottom, ornament.left]
      }
    })
  `)
  process.stdout.write(`${JSON.stringify(measurements)}\n`)
  window.destroy()
  app.quit()
}).catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`)
  app.exit(1)
})
