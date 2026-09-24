let counter = 0

/** Short unique id, good enough for layers, bitmaps and clips inside one session/project. */
export function uid(prefix = ''): string {
  counter = (counter + 1) % 0x10000
  const rand = Math.floor(Math.random() * 0x100000000).toString(36)
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${rand}`
}
