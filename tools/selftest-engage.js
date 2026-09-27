// Runs inside EasyStudio Photo (Electron --selftest --license free). The 7-day Pro trial, the
// rating request after exports, and the "What's new" window after an update.
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__es; i++) await wait(100)
const { license: L, store: S, actions: A } = window.__es
const res = {}
const DAY = 24 * 3600 * 1000
localStorage.removeItem('easystudio.photo.trial')
// Trial
res.before = { pro: L.isPro(), available: L.trialAvailable() }
L.openProDialog()
await wait(300)
const tryBtn = [...document.querySelectorAll('.es-modal-foot button')].find((b) => /7/.test(b.textContent))
res.tryButton = tryBtn?.textContent
tryBtn?.click()
await wait(300)
res.afterStart = { pro: L.isPro(), trial: L.useLicense.getState().status.trial, msg: document.querySelector('.es-pro-msg')?.textContent, again: L.trialAvailable() }
L.useLicense.setState({ dialog: null })
await wait(200)
res.topButton = document.querySelector('.es-pro-btn')?.textContent
// The trial ends: pretend it started 8 days ago and refocus the window.
localStorage.setItem('easystudio.photo.trial', String(Date.now() - 8 * DAY))
window.dispatchEvent(new Event('focus'))
await wait(200)
res.afterEnd = { pro: L.isPro(), trial: L.useLicense.getState().status.trial, available: L.trialAvailable() }
// Rating request: not yet (new user), then yes (3 days, 3 launches, 2 exports)
localStorage.setItem('easystudio.photo.usage', JSON.stringify({ first: Date.now(), launches: 1, wins: 0, askedAt: 0, done: false }))
res.askNew = L.shouldAskReview()
localStorage.setItem('easystudio.photo.usage', JSON.stringify({ first: Date.now() - 3 * DAY, launches: 5, wins: 1, askedAt: 0, done: false }))
L.noteSuccess()
res.askReady = L.shouldAskReview()
L.maybeAskReview()
await wait(300)
res.card = document.querySelector('.es-review strong')?.textContent
;[...document.querySelectorAll('.es-review-actions button')][1]?.click() // Later
await wait(200)
res.afterLater = { card: !!document.querySelector('.es-review'), askAgainNow: L.shouldAskReview() }
return res
