/**
 * GLSL ES 3.00 shaders. Conventions used everywhere:
 * - textures hold PREMULTIPLIED alpha;
 * - in offscreen passes, gl_FragCoord.xy is used directly as pixel coordinates and texture
 *   row 0 is the TOP row of the image, so no Y flips are needed until the final on-screen pass.
 */

/** Full-screen triangle, no vertex buffers needed. */
export const VS_FULLSCREEN = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const COMMON = /* glsl */ `
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 unpremul(vec4 c) { return c.a > 0.0 ? c.rgb / c.a : vec3(0.0); }
vec3 toLinear(vec3 c) {
  c = max(c, 0.0);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 toSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`

/** All colour adjustments, looks, vignette and grain in one pass. */
export const FS_COLOR = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uSize;
uniform float uExposure, uBrightness, uContrast, uHighlights, uShadows;
uniform float uTemperature, uTint, uHue, uSaturation, uVibrance;
uniform float uFade, uMono, uSplitAmount, uVignette, uGrain;
uniform vec3 uSplitShadow, uSplitHighlight;
out vec4 outColor;
${COMMON}
vec3 hueRotate(vec3 c, float a) {
  // Rotation around the grey axis.
  float cs = cos(a), sn = sin(a);
  vec3 k = vec3(0.57735);
  return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec4 src = texture(uSrc, uv);
  float a = src.a;
  if (a <= 0.0) { outColor = vec4(0.0); return; }
  vec3 c = src.rgb / a;

  // Exposure + white balance in linear light.
  vec3 lin = toLinear(c) * exp2(uExposure);
  lin *= vec3(1.0 + 0.30 * uTemperature + 0.08 * uTint, 1.0 - 0.18 * uTint, 1.0 - 0.30 * uTemperature + 0.08 * uTint);
  c = toSrgb(lin);

  // Highlights / shadows: luminance-masked, colour-ratio preserving.
  float L = luma(c);
  float sm = 1.0 - smoothstep(0.0, 0.6, L);
  float hm = smoothstep(0.4, 1.0, L);
  float dL = uShadows * 0.45 * sm * (uShadows > 0.0 ? (1.0 - L) : L)
           + uHighlights * 0.45 * hm * (uHighlights > 0.0 ? (1.0 - L) : L);
  c = mix(c + dL, c * (L + dL) / max(L, 1e-3), smoothstep(0.0, 0.06, L));

  // Brightness: midtone gamma, keeps pure black and white.
  c = pow(max(c, 0.0), vec3(exp2(-uBrightness * 1.2)));

  // Contrast: S-curve for positive values, flattening for negative ones.
  c = clamp(c, 0.0, 1.0);
  if (uContrast >= 0.0) {
    c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
    c = (c - 0.5) * (1.0 + 0.35 * uContrast) + 0.5;
  } else {
    c = mix(c, vec3(0.5), -uContrast * 0.55);
  }

  if (uHue != 0.0) c = hueRotate(c, uHue * 3.14159265);

  // Vibrance boosts muted colours more than saturated ones; saturation is uniform.
  float g = luma(c);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = mix(vec3(g), c, 1.0 + uVibrance * (1.0 - sat) * 1.2);
  c = mix(vec3(luma(c)), c, 1.0 + uSaturation);

  // Looks: split toning, black & white, faded blacks.
  if (uSplitAmount > 0.0) {
    float l2 = clamp(luma(c), 0.0, 1.0);
    vec3 ts = uSplitShadow - luma(uSplitShadow);
    vec3 th = uSplitHighlight - luma(uSplitHighlight);
    c += uSplitAmount * 0.7 * ((1.0 - l2) * (1.0 - l2) * ts + l2 * l2 * th);
  }
  c = mix(c, vec3(luma(c)), uMono);
  c = mix(c, vec3(0.075) + c * 0.86, uFade);

  // Vignette follows the layer's own frame.
  if (uVignette != 0.0) {
    float d = length((uv - 0.5) * 2.0) / 1.41421;
    float m = smoothstep(0.35, 1.05, d);
    c = uVignette > 0.0 ? c * (1.0 - uVignette * 0.85 * m) : mix(c, vec3(1.0), -uVignette * 0.8 * m);
  }

  if (uGrain > 0.0) {
    float n = hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + 17.17) - 1.0;
    float lg = luma(c);
    c += n * uGrain * 0.16 * (0.4 + 0.6 * (1.0 - abs(lg * 2.0 - 1.0)));
  }

  c = clamp(c, 0.0, 1.0);
  outColor = vec4(c * a, a);
}`

/** Separable gaussian blur (one direction per pass). */
export const FS_BLUR = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uOut;
uniform vec2 uStep;
uniform float uSigma;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uOut;
  int r = int(min(ceil(uSigma * 3.0), 24.0));
  float s2 = 2.0 * uSigma * uSigma;
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = -24; i <= 24; i++) {
    if (i < -r || i > r) continue;
    float w = exp(-float(i * i) / s2);
    acc += texture(uSrc, uv + uStep * float(i)) * w;
    wsum += w;
  }
  outColor = acc / wsum;
}`

/** Sharpen (unsharp mask) + clarity (large-radius local contrast on midtones). */
export const FS_DETAIL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uSrc, uSmall, uLarge;
uniform vec2 uSize;
uniform float uSharpen, uClarity;
out vec4 outColor;
${COMMON}
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec4 c = texelFetch(uSrc, ivec2(gl_FragCoord.xy), 0);
  vec3 rgb = c.rgb;
  if (uSharpen > 0.0) rgb += uSharpen * 1.6 * (c.rgb - texture(uSmall, uv).rgb);
  if (uClarity != 0.0) {
    float L = luma(unpremul(c));
    float mid = 1.0 - pow(abs(L * 2.0 - 1.0), 2.0);
    rgb += uClarity * 0.9 * mid * (c.rgb - texture(uLarge, uv).rgb);
  }
  outColor = vec4(clamp(rgb, 0.0, c.a), c.a);
}`

/** Composite one layer onto the backdrop with transform, opacity, layer mask and blend mode. */
export const FS_COMPOSITE = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uBackdrop, uLayer, uMask;
uniform mat3 uDocToLayer;
uniform float uInvScale;
uniform float uOpacity;
uniform int uBlend;
uniform int uHasMask;
out vec4 outColor;

float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
vec3 clipColor(vec3 c) {
  float l = lum(c);
  float n = min(c.r, min(c.g, c.b));
  float x = max(c.r, max(c.g, c.b));
  if (n < 0.0) c = l + (c - l) * l / max(l - n, 1e-5);
  if (x > 1.0) c = l + (c - l) * (1.0 - l) / max(x - l, 1e-5);
  return c;
}
vec3 setLum(vec3 c, float l) { return clipColor(c + (l - lum(c))); }
float sat(vec3 c) { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }
vec3 setSat(vec3 c, float s) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  return mx > mn ? (c - mn) * s / (mx - mn) : vec3(0.0);
}
float softD(float b) { return b <= 0.25 ? ((16.0 * b - 12.0) * b + 4.0) * b : sqrt(b); }
vec3 hardLight(vec3 b, vec3 s) {
  return mix(b * 2.0 * s, b + (2.0 * s - 1.0) - b * (2.0 * s - 1.0), step(0.5, s));
}
vec3 blendFn(int m, vec3 b, vec3 s) {
  if (m == 1) return b * s;
  if (m == 2) return b + s - b * s;
  if (m == 3) return hardLight(s, b);
  if (m == 4) return min(b, s);
  if (m == 5) return max(b, s);
  if (m == 6) return vec3(
    b.r == 0.0 ? 0.0 : (s.r >= 1.0 ? 1.0 : min(1.0, b.r / (1.0 - s.r))),
    b.g == 0.0 ? 0.0 : (s.g >= 1.0 ? 1.0 : min(1.0, b.g / (1.0 - s.g))),
    b.b == 0.0 ? 0.0 : (s.b >= 1.0 ? 1.0 : min(1.0, b.b / (1.0 - s.b))));
  if (m == 7) return vec3(
    b.r >= 1.0 ? 1.0 : (s.r <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - b.r) / s.r)),
    b.g >= 1.0 ? 1.0 : (s.g <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - b.g) / s.g)),
    b.b >= 1.0 ? 1.0 : (s.b <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - b.b) / s.b)));
  if (m == 8) return hardLight(b, s);
  if (m == 9) {
    vec3 r;
    for (int i = 0; i < 3; i++) {
      r[i] = s[i] <= 0.5 ? b[i] - (1.0 - 2.0 * s[i]) * b[i] * (1.0 - b[i])
                         : b[i] + (2.0 * s[i] - 1.0) * (softD(b[i]) - b[i]);
    }
    return r;
  }
  if (m == 10) return abs(b - s);
  if (m == 11) return b + s - 2.0 * b * s;
  if (m == 12) return setLum(setSat(s, sat(b)), lum(b));
  if (m == 13) return setLum(setSat(b, sat(s)), lum(b));
  if (m == 14) return setLum(s, lum(b));
  if (m == 15) return setLum(b, lum(s));
  return s;
}

void main() {
  vec4 b = texelFetch(uBackdrop, ivec2(gl_FragCoord.xy), 0);
  vec2 uv = (uDocToLayer * vec3(gl_FragCoord.xy * uInvScale, 1.0)).xy;
  // Anti-aliased layer edges (important for rotated layers).
  vec2 fw = max(fwidth(uv), vec2(1e-6));
  vec2 edge = min(uv, 1.0 - uv) / fw + 0.5;
  float cover = clamp(min(edge.x, edge.y), 0.0, 1.0);
  vec4 s = cover > 0.0 ? texture(uLayer, clamp(uv, 0.0, 1.0)) * (uOpacity * cover) : vec4(0.0);
  if (uHasMask == 1 && cover > 0.0) s *= texture(uMask, clamp(uv, 0.0, 1.0)).a;

  float ab = b.a, as_ = s.a;
  vec3 Cb = ab > 0.0 ? b.rgb / ab : vec3(0.0);
  vec3 Cs = as_ > 0.0 ? s.rgb / as_ : vec3(0.0);
  vec3 B = clamp(blendFn(uBlend, Cb, Cs), 0.0, 1.0);
  vec3 co = s.rgb * (1.0 - ab) + b.rgb * (1.0 - as_) + as_ * ab * B;
  float ao = as_ + ab * (1.0 - as_);
  outColor = vec4(co, ao);
}`

/** Draw the composite on screen: zoom/pan, checkerboard, drop shadow, selection "marching ants". */
export const FS_PRESENT = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTex, uSel;
uniform vec2 uDocSize, uCanvas, uPan;
uniform float uZoom, uChecker, uShadow, uTime, uDpr;
uniform int uNearest, uHasSel;
uniform vec3 uBg;
out vec4 outColor;
float selAt(vec2 dp) {
  if (dp.x < 0.0 || dp.y < 0.0 || dp.x > uDocSize.x || dp.y > uDocSize.y) return 0.0;
  return texture(uSel, dp / uDocSize).a;
}
void main() {
  vec2 sp = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y);
  vec2 dp = (sp - uPan) / uZoom;
  vec3 col;
  if (dp.x < 0.0 || dp.y < 0.0 || dp.x >= uDocSize.x || dp.y >= uDocSize.y) {
    vec2 d = max(max(-dp, dp - uDocSize), 0.0) * uZoom;
    float dist = length(d);
    float sh = exp(-dist * dist / (2.0 * uShadow * uShadow)) * 0.45;
    col = uBg * (1.0 - sh);
  } else {
    vec4 c = uNearest == 1 ? texelFetch(uTex, ivec2(dp), 0) : texture(uTex, dp / uDocSize);
    vec2 cell = floor(sp / uChecker);
    float chk = mod(cell.x + cell.y, 2.0) < 1.0 ? 0.96 : 0.84;
    col = c.rgb + vec3(chk) * (1.0 - c.a);
  }
  if (uHasSel == 1) {
    // Edge of the selection (where the mask crosses 50%), drawn as animated black/white dashes.
    float px = uDpr / uZoom;
    float m = selAt(dp) - 0.5;
    float e = step(m * (selAt(dp + vec2(px, 0.0)) - 0.5), 0.0) + step(m * (selAt(dp + vec2(0.0, px)) - 0.5), 0.0);
    if (e > 0.0 && (m != 0.0)) {
      float dash = mod(floor((sp.x + sp.y) / (4.0 * uDpr) + uTime * 8.0), 2.0);
      col = vec3(dash);
    }
  }
  outColor = vec4(col, 1.0);
}`

/** Brush dabs: one instanced quad per dab, soft round falloff, accumulated with MAX blending. */
export const VS_DAB = /* glsl */ `#version 300 es
layout(location = 0) in vec4 aDab; // x, y (texture px), radius (px), strength 0..1
uniform vec2 uSize;
out vec2 vPx;
out vec3 vDab;
void main() {
  vec2 corners[6] = vec2[6](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0));
  vec2 c = corners[gl_VertexID];
  vec2 p = aDab.xy + c * (aDab.z + 1.5);
  vPx = p;
  vDab = vec3(aDab.xy, aDab.z);
  gl_Position = vec4(p / uSize * 2.0 - 1.0, 0.0, 1.0);
}`

export const FS_DAB = /* glsl */ `#version 300 es
precision highp float;
in vec2 vPx;
in vec3 vDab;
uniform float uHardness;
out vec4 outColor;
void main() {
  float r = max(vDab.z, 0.5);
  float d = distance(vPx, vDab.xy);
  float inner = r * clamp(uHardness, 0.0, 0.98);
  float a = 1.0 - smoothstep(inner, r + 0.5, d);
  outColor = vec4(a);
}`

/** Apply an edit to a layer texture: paint / erase / clone / gradient / selection fill & clear. */
export const FS_EDIT = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uOrig, uStroke, uSel;
uniform vec2 uSize;
uniform int uMode, uHasSel;
uniform mat3 uToSel;
uniform vec3 uColor;
uniform float uOpacity;
uniform vec2 uOffset;
uniform vec2 uG0, uG1;
uniform int uGradType;
uniform vec4 uGC0, uGC1;
out vec4 outColor;
void main() {
  vec2 px = gl_FragCoord.xy;
  vec4 o = texelFetch(uOrig, ivec2(px), 0);
  float sel = 1.0;
  if (uHasSel == 1) {
    vec2 su = (uToSel * vec3(px, 1.0)).xy;
    sel = (su.x < 0.0 || su.y < 0.0 || su.x > 1.0 || su.y > 1.0) ? 0.0 : texture(uSel, su).a;
  }
  float s = texelFetch(uStroke, ivec2(px), 0).r;
  vec4 r = o;
  if (uMode == 0) {            // paint
    float a = s * uOpacity * sel;
    r = vec4(uColor, 1.0) * a + o * (1.0 - a);
  } else if (uMode == 1) {     // erase
    r = o * (1.0 - s * uOpacity * sel);
  } else if (uMode == 2) {     // clone from an offset
    float a = s * uOpacity * sel;
    vec4 c = texture(uOrig, (px + uOffset) / uSize);
    r = c * a + o * (1.0 - a);
  } else if (uMode == 3) {     // gradient
    vec2 d = uG1 - uG0;
    float t = uGradType == 0 ? dot(px - uG0, d) / max(dot(d, d), 1e-6) : length(px - uG0) / max(length(d), 1e-6);
    vec4 g = mix(uGC0, uGC1, clamp(t, 0.0, 1.0));
    float a = g.a * uOpacity * sel;
    r = vec4(g.rgb, 1.0) * a + o * (1.0 - a);
  } else if (uMode == 4) {     // clear selected pixels
    r = o * (1.0 - sel);
  } else if (uMode == 5) {     // fill the selection with a colour
    float a = sel * uOpacity;
    r = vec4(uColor, 1.0) * a + o * (1.0 - a);
  } else if (uMode == 6) {     // keep only the selected pixels
    r = o * sel;
  } else if (uMode == 7) {     // gradient that replaces pixels (used on masks to fade things out)
    vec2 d = uG1 - uG0;
    float t = uGradType == 0 ? dot(px - uG0, d) / max(dot(d, d), 1e-6) : length(px - uG0) / max(length(d), 1e-6);
    vec4 g = mix(uGC0, uGC1, clamp(t, 0.0, 1.0));
    r = mix(o, vec4(g.rgb * g.a, g.a), sel * uOpacity);
  }
  outColor = r;
}`

/** Read back a rectangle of a texture as straight (un-premultiplied) alpha. */
export const FS_READ = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uOffset;
out vec4 outColor;
void main() {
  vec4 c = texelFetch(uTex, ivec2(gl_FragCoord.xy + uOffset), 0);
  outColor = c.a > 0.0 ? vec4(c.rgb / c.a, c.a) : vec4(0.0);
}`

/** Resample a premultiplied texture into a target (keeps premultiplied alpha). */
export const FS_RESAMPLE = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uOut;
out vec4 outColor;
void main() { outColor = texture(uTex, gl_FragCoord.xy / uOut); }`

/** Final pass before reading pixels back: resample + un-premultiply (or flatten on a colour). */
export const FS_EXPORT = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uOut;
uniform vec4 uFlatten;
out vec4 outColor;
void main() {
  vec4 c = texture(uTex, gl_FragCoord.xy / uOut);
  if (uFlatten.a > 0.5) { outColor = vec4(c.rgb + uFlatten.rgb * (1.0 - c.a), 1.0); return; }
  outColor = c.a > 0.0 ? vec4(c.rgb / c.a, c.a) : vec4(0.0);
}`
