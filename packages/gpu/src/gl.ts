export type GL = WebGL2RenderingContext

export interface TexInfo {
  tex: WebGLTexture
  w: number
  h: number
  mips: boolean
}

/** A texture you can render into. */
export interface Target extends TexInfo {
  fb: WebGLFramebuffer
}

function compile(gl: GL, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`Shader compile error: ${log}\n${src.split('\n').slice(0, 5).join('\n')}`)
  }
  return sh
}

export class Program {
  readonly program: WebGLProgram
  private locs = new Map<string, WebGLUniformLocation | null>()

  constructor(
    private gl: GL,
    vs: string,
    fs: string
  ) {
    const p = gl.createProgram()!
    const v = compile(gl, gl.VERTEX_SHADER, vs)
    const f = compile(gl, gl.FRAGMENT_SHADER, fs)
    gl.attachShader(p, v)
    gl.attachShader(p, f)
    gl.linkProgram(p)
    gl.deleteShader(v)
    gl.deleteShader(f)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(p)}`)
    }
    this.program = p
  }

  use(): this {
    this.gl.useProgram(this.program)
    return this
  }

  private loc(name: string): WebGLUniformLocation | null {
    let l = this.locs.get(name)
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.program, name)
      this.locs.set(name, l)
    }
    return l
  }

  f1(name: string, v: number): this {
    this.gl.uniform1f(this.loc(name), v)
    return this
  }
  f2(name: string, a: number, b: number): this {
    this.gl.uniform2f(this.loc(name), a, b)
    return this
  }
  f3(name: string, v: readonly number[]): this {
    this.gl.uniform3f(this.loc(name), v[0], v[1], v[2])
    return this
  }
  f4(name: string, v: readonly number[]): this {
    this.gl.uniform4f(this.loc(name), v[0], v[1], v[2], v[3])
    return this
  }
  i1(name: string, v: number): this {
    this.gl.uniform1i(this.loc(name), v)
    return this
  }
  m3(name: string, m: Float32Array): this {
    this.gl.uniformMatrix3fv(this.loc(name), false, m)
    return this
  }
  /** Bind a texture to a unit and point the sampler uniform at it. */
  tex(name: string, unit: number, tex: WebGLTexture): this {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(this.loc(name), unit)
    return this
  }
}

export function mipLevels(w: number, h: number): number {
  return Math.floor(Math.log2(Math.max(w, h))) + 1
}

export function createTexture(gl: GL, w: number, h: number, mips: boolean): WebGLTexture {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texStorage2D(gl.TEXTURE_2D, mips ? mipLevels(w, h) : 1, gl.RGBA8, w, h)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return tex
}

export function createTarget(gl: GL, w: number, h: number, mips: boolean): Target {
  const tex = createTexture(gl, w, h, mips)
  const fb = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`Framebuffer incomplete: 0x${status.toString(16)}`)
  return { tex, fb, w, h, mips }
}

export function deleteTarget(gl: GL, t: Target): void {
  gl.deleteFramebuffer(t.fb)
  gl.deleteTexture(t.tex)
}

/** Reuses render targets of the same size to avoid reallocating GPU memory every frame. */
export class TargetPool {
  private free = new Map<string, Target[]>()

  constructor(private gl: GL) {}

  private key(w: number, h: number, mips: boolean) {
    return `${w}x${h}${mips ? 'm' : ''}`
  }

  acquire(w: number, h: number, mips = false): Target {
    const list = this.free.get(this.key(w, h, mips))
    return list?.pop() ?? createTarget(this.gl, w, h, mips)
  }

  release(t: Target): void {
    const k = this.key(t.w, t.h, t.mips)
    const list = this.free.get(k) ?? []
    list.push(t)
    this.free.set(k, list)
  }

  /** Drop everything that is not currently in use (e.g. after closing a big document). */
  clear(): void {
    for (const list of this.free.values()) for (const t of list) deleteTarget(this.gl, t)
    this.free.clear()
  }
}
