// Minimal ONNX (protobuf) reader: lists the operators with many inputs/outputs.
// Usage: node tools/onnx-inspect.mjs <model.onnx> [minEdges]
import { readFileSync } from 'node:fs'

const file = process.argv[2]
const min = Number(process.argv[3] ?? 14)
const buf = readFileSync(file)

function varint(b, p) {
  let v = 0n
  let s = 0n
  for (;;) {
    const x = b[p++]
    v |= BigInt(x & 0x7f) << s
    if (!(x & 0x80)) return [v, p]
    s += 7n
  }
}

/** Iterate the fields of a protobuf message in b[start, end). */
function* fields(b, start, end) {
  let p = start
  while (p < end) {
    let key
    ;[key, p] = varint(b, p)
    const field = Number(key >> 3n)
    const wire = Number(key & 7n)
    if (wire === 0) {
      let v
      ;[v, p] = varint(b, p)
      yield { field, wire, value: v }
    } else if (wire === 2) {
      let len
      ;[len, p] = varint(b, p)
      const s = p
      p += Number(len)
      yield { field, wire, start: s, end: p }
    } else if (wire === 1) {
      p += 8
    } else if (wire === 5) {
      p += 4
    } else throw new Error(`wire type ${wire}`)
  }
}

const str = (f) => buf.toString('utf8', f.start, f.end)
let graph
for (const f of fields(buf, 0, buf.length)) if (f.field === 7) graph = f
const counts = {}
const big = []
for (const f of fields(buf, graph.start, graph.end)) {
  if (f.field !== 1) continue // NodeProto
  const node = { inputs: [], outputs: [], name: '', op: '' }
  for (const n of fields(buf, f.start, f.end)) {
    if (n.field === 1) node.inputs.push(str(n))
    else if (n.field === 2) node.outputs.push(str(n))
    else if (n.field === 3) node.name = str(n)
    else if (n.field === 4) node.op = str(n)
  }
  counts[node.op] = (counts[node.op] ?? 0) + 1
  if (node.inputs.length + node.outputs.length >= min) big.push(`${node.op} ${node.name}: ${node.inputs.length} in / ${node.outputs.length} out`)
}
console.log('ops:', JSON.stringify(counts))
console.log(`nodes with >= ${min} edges:\n` + (big.join('\n') || '  (none)'))
