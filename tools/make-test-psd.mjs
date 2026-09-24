// Writes a small layered Photoshop file for testing the PSD import:
//   node tools/make-test-psd.mjs  →  .cache/testimg/test.psd
import { writeFileSync, mkdirSync } from 'node:fs'
import { writePsdBuffer } from 'ag-psd'

const W = 600
const H = 400

function image(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = fn(x, y)
      const i = (y * w + x) * 4
      data.set([r, g, b, a], i)
    }
  return { width: w, height: h, data }
}

const background = image(W, H, (x) => [40 + (200 * x) / W, 90, 220 - (180 * x) / W])
const circle = image(200, 200, (x, y) => ((x - 100) ** 2 + (y - 100) ** 2 < 95 ** 2 ? [230, 30, 40, 255] : [0, 0, 0, 0]))
const square = (r, g, b) => image(200, 200, () => [r, g, b, 255])
const bar = image(400, 40, () => [250, 210, 30, 255])
// Mask: left half visible, right half hidden (grey values; ag-psd reads the red channel).
const mask = image(200, 200, (x) => (x < 100 ? [255, 255, 255, 255] : [0, 0, 0, 255]))

const psd = {
  width: W,
  height: H,
  imageData: background,
  children: [
    { name: 'Background', left: 0, top: 0, right: W, bottom: H, imageData: background },
    { name: 'Red circle', left: 80, top: 100, right: 280, bottom: 300, opacity: 0.7, blendMode: 'multiply', imageData: circle },
    { name: 'Hidden green', left: 20, top: 20, right: 220, bottom: 220, hidden: true, imageData: square(20, 200, 60) },
    {
      name: 'Group',
      opacity: 0.5,
      opened: true,
      children: [{ name: 'Yellow bar', left: 100, top: 320, right: 500, bottom: 360, imageData: bar }]
    },
    {
      name: 'Masked purple',
      left: 350,
      top: 80,
      right: 550,
      bottom: 280,
      imageData: square(150, 60, 220),
      mask: { left: 350, top: 80, right: 550, bottom: 280, defaultColor: 0, imageData: mask }
    },
    { name: 'Dodge white', left: 420, top: 300, right: 520, bottom: 380, blendMode: 'linear dodge', imageData: image(100, 80, () => [90, 90, 90, 255]) }
  ]
}

mkdirSync('.cache/testimg', { recursive: true })
writeFileSync('.cache/testimg/test.psd', writePsdBuffer(psd))
console.log('wrote .cache/testimg/test.psd')
