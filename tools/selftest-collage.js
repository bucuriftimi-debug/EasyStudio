// Runs inside EasyStudio Photo (Electron --selftest). Checks the collage: the dialog, the Pro
// limit on big layouts and the built document. Use --license free (the 6-photo layout is Pro).
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__es; i++) await wait(100)
const { actions: A, store: S, license: L, collage: C } = window.__es
const res = {}
const auto = setInterval(() => S.useEditor.getState().question?.resolve(true), 100)
// Photos made in the page: coloured pictures of different sizes with a white circle.
const files = []
const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
for (let i = 0; i < 6; i++) {
  const c = new OffscreenCanvas(800 + i * 150, 600 + (i % 2) * 500)
  const g = c.getContext('2d')
  g.fillStyle = colors[i]
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#fff'
  g.beginPath()
  g.arc(c.width / 2, c.height / 2, Math.min(c.width, c.height) / 4, 0, 7)
  g.fill()
  const data = new Uint8Array(await (await c.convertToBlob()).arrayBuffer())
  files.push({ name: `photo${i + 1}.png`, path: null, read: async () => data })
}
S.useEditor.setState({ dialog: 'collage' })
await wait(500)
res.layoutButtons = document.querySelectorAll('.collage-layout').length
res.proBadges = document.querySelectorAll('.collage-layout .es-pro-badge').length
document.querySelectorAll('.collage-layout')[7].click()
await wait(200)
res.sixLayoutDialog = L.useLicense.getState().dialog
L.useLicense.setState({ dialog: null })
S.useEditor.setState({ dialog: null })

const layout = C.COLLAGE_LAYOUTS.find((l) => l.id === '4')
res.created = await A.createCollage({ layout, width: 2160, height: 2160, gap: 48, radius: 32, background: '#ffffff' }, files.slice(0, 3))
await wait(500)
const d = S.getDoc()
res.doc = { size: `${d.width}x${d.height}`, layers: d.layers.map((l) => `${l.name} ${Math.round(l.width)}x${Math.round(l.height)} @${Math.round(l.transform.cx)},${Math.round(l.transform.cy)}`) }
res.toasts = S.useEditor.getState().toasts.map((t) => t.text)
// Pixels: a gap (white), the middle of photo 1 (white circle), and the edge of photo 1 (red)
const px = await A.renderExport(d, { format: 'png', quality: 90, width: 540, height: 540 })
const bmp = await createImageBitmap(px)
const cv = new OffscreenCanvas(540, 540)
const g = cv.getContext('2d')
g.drawImage(bmp, 0, 0)
const at = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3).join(',')
res.pixels = { gap: at(270, 100), photo1Edge: at(40, 40), photo1Middle: at(140, 140), empty4th: at(400, 400) }
clearInterval(auto)
return res
