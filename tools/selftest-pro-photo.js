// Runs inside EasyStudio Photo (Electron --selftest). Checks the Free / Pro rules.
// Run it twice: with `--license free` and with `--license pro`.
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__es; i++) await wait(100)
const { actions: A, store: S, templates: T, license: L, ai: AI } = window.__es
const res = {}
const auto = setInterval(() => S.useEditor.getState().question?.resolve(true), 100)
const dialog = () => L.useLicense.getState().dialog
const closeDialog = () => L.useLicense.setState({ dialog: null })

res.status = await window.easyStudio.license.status()
await wait(300)
res.proButton = !!document.querySelector('.es-pro-btn')
res.proActive = !!document.querySelector('.es-pro-active')
res.templateBadges = document.querySelectorAll('.template-pro').length

// Templates: the first three are free.
await A.openTemplate(T.TEMPLATES[0])
res.freeTemplateOpens = !!S.getDoc()
await A.openTemplate(T.TEMPLATES[4])
res.template5 = { dialog: dialog(), opened: S.getDoc()?.name }
closeDialog()

// Clone stamp
S.setTool('clone')
res.clone = { tool: S.useEditor.getState().tool, dialog: dialog() }
closeDialog()
S.setTool('move')

// PSD
await A.openBytes('x.psd', new Uint8Array(4))
res.psd = { dialog: dialog() }
closeDialog()

// Export dialog on a 3000 px picture: Free stops at 1920 px and has no WebP.
const c = new OffscreenCanvas(3000, 2000)
c.getContext('2d').fillRect(0, 0, 3000, 2000)
await A.openBytes('big.png', await c.convertToBlob())
await wait(400)
// AI: 3 free tries a day. Pretend 3 were used today, then ask for "Remove background".
localStorage.setItem('easystudio.free.ai', JSON.stringify({ day: new Date().toISOString().slice(0, 10), n: 3 }))
res.aiLeft = L.freeUsesLeft('ai', 3)
await AI.removeBackground()
res.aiUsedUp = { dialog: dialog(), busy: S.useEditor.getState().busy }
closeDialog()
localStorage.removeItem('easystudio.free.ai')

S.useEditor.setState({ dialog: 'export' })
await wait(600)
res.export = {
  result: document.querySelector('.export-result strong')?.textContent,
  options: [...document.querySelectorAll('.export-form select option')].map((o) => o.textContent),
  webpBadge: !!document.querySelector('.export-form .es-pro-badge')
}
const webp = [...document.querySelectorAll('.export-form .es-seg button, .export-form button')].find((b) => b.textContent.startsWith('WebP'))
webp?.click()
await wait(200)
res.export.webpClick = { dialog: dialog(), hint: document.querySelector('.export-form .field-hint')?.textContent }
closeDialog()
S.useEditor.setState({ dialog: null })
await wait(200)
// The Pro dialog itself
L.requirePro('Test feature')
await wait(300)
res.dialogShown = {
  title: document.querySelector('.es-modal h2')?.textContent,
  needs: document.querySelector('.es-pro-needs')?.textContent,
  benefits: document.querySelectorAll('.es-pro-list li').length,
  buy: document.querySelector('.es-pro-buy')?.textContent,
  note: document.querySelector('.es-pro-note')?.textContent
}
clearInterval(auto)
return res
