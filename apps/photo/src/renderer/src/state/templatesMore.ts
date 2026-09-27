import { bokeh, dots, frame, glow, gradient, layered, rays, solid, stripes, type Template } from './templateKit'

/** The designs added in 1.2 (all Pro). Texts are i18n keys under `tpl.`. */
export const MORE_TEMPLATES: Template[] = [
  /* ------------------------------ social ------------------------------ */
  {
    id: 'motivation',
    category: 'social',
    w: 1080,
    h: 1350,
    background: layered(gradient('down', '#0f0c29', '#302b63', '#24243e'), glow(0.5, 0.35, 0.6, 'rgba(255,140,90,0.35)')),
    items: [
      { kind: 'text', text: 'tpl.motivTop', size: 44, preset: 'styleSubtitle', style: { color: '#ffb088' }, cx: 540, cy: 360 },
      { kind: 'text', text: 'tpl.motivTitle', size: 150, preset: 'styleTitle', cx: 540, cy: 600 },
      { kind: 'shape', name: 'Line', shape: { kind: 'rect', fill: '#ff8c5a', radius: 4 }, x: 440, y: 800, w: 200, h: 8 },
      { kind: 'text', text: 'tpl.motivSub', size: 46, style: { font: 'Poppins', weight: 400, color: '#e6e3ff' }, cx: 540, cy: 900 }
    ]
  },
  {
    id: 'giveaway',
    category: 'social',
    w: 1080,
    h: 1080,
    background: layered(gradient('diag', '#ff9a9e', '#fad0c4', '#fbc2eb'), bokeh(['#ffffff', '#ff6b9d', '#ffd166'], 26, 10, 34, 0.55)),
    items: [
      { kind: 'shape', name: 'Gift', shape: { kind: 'rect', fill: '#e11d74', radius: 26 }, x: 400, y: 150, w: 280, h: 240 },
      { kind: 'shape', name: 'Ribbon', shape: { kind: 'rect', fill: '#ffd166' }, x: 522, y: 150, w: 36, h: 240 },
      { kind: 'shape', name: 'Bow', shape: { kind: 'star', fill: '#ffd166' }, x: 470, y: 90, w: 140, h: 120 },
      { kind: 'text', text: 'tpl.giveTitle', size: 170, style: { font: 'Anton', weight: 400, color: '#ffffff', uppercase: true, strokeColor: '#e11d74', strokeWidth: 10 }, cx: 540, cy: 560 },
      { kind: 'text', text: 'tpl.giveSteps', size: 44, preset: 'styleLabel', style: { bgColor: '#e11d74' }, cx: 540, cy: 780 },
      { kind: 'text', text: 'tpl.giveEnd', size: 38, style: { font: 'Poppins', weight: 700, color: '#7a1144' }, cx: 540, cy: 900 }
    ]
  },
  {
    id: 'tips',
    category: 'social',
    w: 1080,
    h: 1350,
    background: layered(solid('#fff8ec'), dots('rgba(0,0,0,0.06)', 36, 3)),
    items: [
      { kind: 'text', text: 'tpl.tipsTitle', size: 96, style: { font: 'Montserrat', weight: 900, color: '#1f2937' }, cx: 540, cy: 200 },
      ...[0, 1, 2].flatMap((i) => [
        { kind: 'shape' as const, name: 'Card', shape: { kind: 'rect' as const, fill: '#ffffff', radius: 28, stroke: '#f1e4cc', strokeWidth: 3 }, x: 110, y: 340 + i * 280, w: 860, h: 230 },
        { kind: 'shape' as const, name: 'Number', shape: { kind: 'ellipse' as const, fill: ['#f97316', '#10b981', '#6366f1'][i] }, x: 150, y: 395 + i * 280, w: 120, h: 120 },
        { kind: 'text' as const, text: String(i + 1), size: 70, style: { font: 'Montserrat', weight: 900, color: '#ffffff' }, cx: 210, cy: 455 + i * 280 },
        { kind: 'text' as const, text: `tpl.tip${i + 1}`, size: 42, style: { font: 'Poppins', weight: 700, color: '#1f2937', align: 'left' as const }, cx: 625, cy: 455 + i * 280, maxW: 640 }
      ]),
      { kind: 'text', text: 'tpl.tipsSave', size: 36, style: { font: 'Poppins', weight: 400, color: '#6b7280' }, cx: 540, cy: 1250 }
    ]
  },
  {
    id: 'announce',
    category: 'social',
    w: 1080,
    h: 1920,
    background: layered(gradient('down', '#fceabb', '#f8b500'), rays('rgba(255,255,255,0.18)', 24, 0.5, 0.42)),
    items: [
      { kind: 'text', text: 'tpl.annTop', size: 60, preset: 'styleLabel', style: { bgColor: '#1f2937' }, cx: 540, cy: 520 },
      { kind: 'text', text: 'tpl.annTitle', size: 200, style: { font: 'Anton', weight: 400, color: '#1f2937', uppercase: true }, cx: 540, cy: 820 },
      { kind: 'text', text: 'tpl.annSub', size: 56, style: { font: 'Poppins', weight: 700, color: '#1f2937' }, cx: 540, cy: 1100 },
      { kind: 'shape', name: 'Arrow', shape: { kind: 'arrow', fill: '#1f2937', stroke: '#1f2937', strokeWidth: 12 }, x: 470, y: 1400, w: 140, h: 160, rot: 90 },
      { kind: 'text', text: 'tpl.annSwipe', size: 40, preset: 'styleSubtitle', style: { color: '#1f2937', shadowBlur: 0, shadowY: 0 }, cx: 540, cy: 1660 }
    ]
  },
  {
    id: 'poll',
    category: 'social',
    w: 1080,
    h: 1920,
    background: gradient('diag', '#4facfe', '#00f2fe'),
    items: [
      { kind: 'text', text: 'tpl.pollTitle', size: 120, preset: 'styleTitle', cx: 540, cy: 330 },
      { kind: 'shape', name: 'Option A', shape: { kind: 'rect', fill: '#ffffff', radius: 40 }, x: 90, y: 560, w: 900, h: 520, opacity: 92 },
      { kind: 'text', text: 'tpl.pollA', size: 90, style: { font: 'Montserrat', weight: 900, color: '#0ea5e9' }, cx: 540, cy: 820 },
      { kind: 'text', text: 'tpl.pollOr', size: 70, preset: 'styleLabel', style: { bgColor: '#f43f5e' }, cx: 540, cy: 1180 },
      { kind: 'shape', name: 'Option B', shape: { kind: 'rect', fill: '#ffffff', radius: 40 }, x: 90, y: 1290, w: 900, h: 520, opacity: 92 },
      { kind: 'text', text: 'tpl.pollB', size: 90, style: { font: 'Montserrat', weight: 900, color: '#f43f5e' }, cx: 540, cy: 1550 }
    ]
  },

  /* ------------------------------ video ------------------------------ */
  {
    id: 'ytReaction',
    category: 'video',
    w: 1280,
    h: 720,
    background: layered(gradient('diag', '#000000', '#3b0000'), rays('rgba(255,40,40,0.16)', 18, 0.78, 0.5)),
    items: [
      { kind: 'shape', name: 'Circle', shape: { kind: 'ellipse', fill: '#ff2d2d', stroke: '#ffffff', strokeWidth: 16 }, x: 820, y: 130, w: 400, h: 400 },
      { kind: 'text', text: '?!', size: 230, style: { font: 'Anton', weight: 400, color: '#ffffff' }, cx: 1020, cy: 330, rot: 8 },
      { kind: 'text', text: 'tpl.reactTitle', size: 118, preset: 'styleMeme', style: { color: '#ffffff', align: 'left' }, cx: 410, cy: 360, rot: -3 },
      { kind: 'shape', name: 'Arrow', shape: { kind: 'arrow', fill: '#ffd400', stroke: '#ffd400', strokeWidth: 16 }, x: 660, y: 520, w: 190, h: 110, rot: -25 }
    ]
  },
  {
    id: 'ytTutorial',
    category: 'video',
    w: 1280,
    h: 720,
    background: layered(solid('#f5f7fb'), dots('rgba(37,99,235,0.12)', 40, 4)),
    items: [
      { kind: 'shape', name: 'Panel', shape: { kind: 'rect', fill: '#2563eb', radius: 36 }, x: 790, y: 130, w: 430, h: 460, rot: 4 },
      { kind: 'text', text: '1 · 2 · 3', size: 96, style: { font: 'Montserrat', weight: 900, color: '#ffffff' }, cx: 1005, cy: 360, rot: 4 },
      { kind: 'text', text: 'tpl.tutTop', size: 50, preset: 'styleLabel', style: { bgColor: '#f59e0b' }, cx: 300, cy: 150 },
      { kind: 'text', text: 'tpl.tutTitle', size: 100, style: { font: 'Montserrat', weight: 900, color: '#0f172a', align: 'left' }, cx: 380, cy: 380, maxW: 660 },
      { kind: 'text', text: 'tpl.tutSub', size: 44, style: { font: 'Poppins', weight: 700, color: '#2563eb', align: 'left' }, cx: 380, cy: 580, maxW: 660 }
    ]
  },
  {
    id: 'ytGaming',
    category: 'video',
    w: 1280,
    h: 720,
    background: layered(gradient('diag', '#050510', '#111133'), stripes('rgba(57,255,20,0.07)', 70, 18), glow(0.5, 0.5, 0.5, 'rgba(57,255,20,0.18)')),
    items: [
      { kind: 'text', text: 'tpl.gameTitle', size: 190, preset: 'styleOutline', style: { strokeColor: '#39ff14', shadowColor: '#39ff14', shadowBlur: 40 }, cx: 640, cy: 330 },
      { kind: 'text', text: 'tpl.gameSub', size: 56, preset: 'styleNeon', style: { shadowColor: '#39ff14', color: '#eaffe3' }, cx: 640, cy: 560 },
      { kind: 'shape', name: 'Star', shape: { kind: 'star', fill: '#ffd400' }, x: 60, y: 60, w: 130, h: 130, rot: -12 },
      { kind: 'shape', name: 'Star', shape: { kind: 'star', fill: '#ffd400' }, x: 1100, y: 520, w: 110, h: 110, rot: 14 }
    ]
  },
  {
    id: 'podcast',
    category: 'video',
    w: 1080,
    h: 1080,
    background: layered(gradient('diag', '#141e30', '#243b55'), glow(0.25, 0.2, 0.5, 'rgba(255,94,98,0.35)')),
    items: [
      { kind: 'shape', name: 'Ring', shape: { kind: 'ellipse', fill: '#ff5e62', fillEnabled: false, stroke: '#ff5e62', strokeWidth: 18 }, x: 340, y: 150, w: 400, h: 400 },
      { kind: 'shape', name: 'Mic', shape: { kind: 'rect', fill: '#ffffff', radius: 70 }, x: 480, y: 220, w: 120, h: 220 },
      { kind: 'shape', name: 'Stand', shape: { kind: 'rect', fill: '#ffffff' }, x: 530, y: 440, w: 20, h: 70 },
      { kind: 'text', text: 'tpl.podTitle', size: 110, preset: 'styleTitle', cx: 540, cy: 700 },
      { kind: 'text', text: 'tpl.podEp', size: 44, preset: 'styleLabel', style: { bgColor: '#ff5e62' }, cx: 540, cy: 870 }
    ]
  },

  /* ------------------------------ business ------------------------------ */
  {
    id: 'product',
    category: 'business',
    w: 1080,
    h: 1080,
    background: layered(solid('#f4efe9'), glow(0.5, 0.45, 0.45, 'rgba(255,255,255,0.9)')),
    items: [
      { kind: 'shape', name: 'Stage', shape: { kind: 'ellipse', fill: '#e2d6c8' }, x: 240, y: 640, w: 600, h: 120 },
      { kind: 'shape', name: 'Product (replace me)', shape: { kind: 'rect', fill: '#c9b8a6', radius: 40 }, x: 390, y: 280, w: 300, h: 420 },
      { kind: 'text', text: 'tpl.prodTop', size: 44, preset: 'styleSubtitle', style: { color: '#7c6552', shadowBlur: 0, shadowY: 0 }, cx: 540, cy: 130 },
      { kind: 'text', text: 'tpl.prodName', size: 84, style: { font: 'Playfair Display', weight: 700, color: '#3f2e22' }, cx: 540, cy: 860 },
      { kind: 'shape', name: 'Price tag', shape: { kind: 'ellipse', fill: '#3f2e22' }, x: 770, y: 180, w: 220, h: 220 },
      { kind: 'text', text: '49 €', size: 70, style: { font: 'Montserrat', weight: 900, color: '#ffffff' }, cx: 880, cy: 290, rot: -8 },
      { kind: 'text', text: 'tpl.prodCta', size: 36, preset: 'styleLabel', style: { bgColor: '#7c6552' }, cx: 540, cy: 980 }
    ]
  },
  {
    id: 'hiring',
    category: 'business',
    w: 1080,
    h: 1350,
    background: layered(solid('#0b1220'), dots('rgba(99,102,241,0.25)', 44, 3), glow(0.8, 0.1, 0.5, 'rgba(99,102,241,0.4)')),
    items: [
      { kind: 'text', text: 'tpl.hireTop', size: 190, style: { font: 'Anton', weight: 400, color: '#ffffff', uppercase: true }, cx: 540, cy: 380 },
      { kind: 'text', text: 'tpl.hireRole', size: 64, preset: 'styleLabel', style: { bgColor: '#6366f1' }, cx: 540, cy: 620 },
      { kind: 'text', text: 'tpl.hirePerks', size: 44, style: { font: 'Poppins', weight: 400, color: '#cbd5e1', lineHeight: 1.6 }, cx: 540, cy: 860 },
      { kind: 'text', text: 'tpl.hireCta', size: 44, style: { font: 'Poppins', weight: 700, color: '#a5b4fc' }, cx: 540, cy: 1170 }
    ]
  },
  {
    id: 'openHouse',
    category: 'business',
    w: 1080,
    h: 1080,
    background: layered(gradient('down', '#e0eafc', '#cfdef3')),
    items: [
      { kind: 'shape', name: 'Roof', shape: { kind: 'triangle', fill: '#1e3a8a' }, x: 290, y: 150, w: 500, h: 240 },
      { kind: 'shape', name: 'House', shape: { kind: 'rect', fill: '#ffffff' }, x: 350, y: 380, w: 380, h: 300 },
      { kind: 'shape', name: 'Door', shape: { kind: 'rect', fill: '#f59e0b', radius: 10 }, x: 500, y: 510, w: 90, h: 170 },
      { kind: 'text', text: 'tpl.houseTitle', size: 120, style: { font: 'Montserrat', weight: 900, color: '#1e3a8a', uppercase: true }, cx: 540, cy: 800 },
      { kind: 'text', text: 'tpl.houseSub', size: 42, style: { font: 'Poppins', weight: 400, color: '#334155' }, cx: 540, cy: 930 }
    ]
  },
  {
    id: 'menu',
    category: 'business',
    w: 1240,
    h: 1754,
    background: layered(solid('#1c1917'), frame('rgba(214,180,120,0.8)', 50, 4), frame('rgba(214,180,120,0.4)', 70, 2)),
    items: [
      { kind: 'text', text: 'tpl.menuTitle', size: 150, style: { font: 'Playfair Display', weight: 700, color: '#d6b478', italic: true }, cx: 620, cy: 250 },
      { kind: 'text', text: 'tpl.menuSub', size: 40, preset: 'styleSubtitle', style: { color: '#e7e5e4', shadowBlur: 0, shadowY: 0 }, cx: 620, cy: 390 },
      ...[0, 1, 2, 3, 4].flatMap((i) => [
        { kind: 'text' as const, text: `tpl.menuItem${i + 1}`, size: 52, style: { font: 'Playfair Display', weight: 700, color: '#fafaf9', align: 'left' as const }, cx: 470, cy: 560 + i * 210 },
        { kind: 'text' as const, text: ['24', '32', '19', '28', '14'][i], size: 52, style: { font: 'Montserrat', weight: 700, color: '#d6b478' }, cx: 1020, cy: 560 + i * 210 },
        { kind: 'shape' as const, name: 'Line', shape: { kind: 'rect' as const, fill: 'rgba(214,180,120,0.35)' }, x: 180, y: 620 + i * 210, w: 880, h: 2 }
      ]),
      { kind: 'text', text: 'tpl.menuFoot', size: 34, style: { font: 'Poppins', weight: 400, color: '#a8a29e' }, cx: 620, cy: 1620 }
    ]
  },
  {
    id: 'businessCard',
    category: 'business',
    w: 1050,
    h: 600,
    background: layered(solid('#ffffff'), (ctx, w, h) => {
      ctx.fillStyle = '#0f766e'
      ctx.fillRect(0, 0, w * 0.34, h)
    }),
    items: [
      { kind: 'text', text: 'AB', size: 130, style: { font: 'Playfair Display', weight: 700, color: '#ffffff' }, cx: 178, cy: 300 },
      { kind: 'text', text: 'tpl.cardName', size: 64, style: { font: 'Montserrat', weight: 900, color: '#0f172a', align: 'left' }, cx: 640, cy: 190 },
      { kind: 'text', text: 'tpl.cardRole', size: 34, preset: 'styleSubtitle', style: { color: '#0f766e', shadowBlur: 0, shadowY: 0, align: 'left' }, cx: 610, cy: 260 },
      { kind: 'text', text: 'tpl.cardContact', size: 30, style: { font: 'Poppins', weight: 400, color: '#334155', align: 'left', lineHeight: 1.7 }, cx: 640, cy: 430 }
    ]
  },
  {
    id: 'webinar',
    category: 'business',
    w: 1920,
    h: 1080,
    background: layered(gradient('diag', '#312e81', '#7c3aed', '#db2777'), glow(0.85, 0.3, 0.45, 'rgba(255,255,255,0.25)')),
    items: [
      { kind: 'text', text: 'tpl.webTop', size: 56, preset: 'styleLabel', style: { bgColor: '#ffffff', color: '#6d28d9' }, cx: 420, cy: 250 },
      { kind: 'text', text: 'tpl.webTitle', size: 130, preset: 'styleTitle', style: { align: 'left' }, cx: 700, cy: 500 },
      { kind: 'text', text: 'tpl.webWhen', size: 56, style: { font: 'Poppins', weight: 700, color: '#fde68a', align: 'left' }, cx: 520, cy: 760 },
      { kind: 'shape', name: 'Speaker photo (replace me)', shape: { kind: 'ellipse', fill: '#ffffff', stroke: '#fde68a', strokeWidth: 14 }, x: 1380, y: 300, w: 420, h: 420, opacity: 85 },
      { kind: 'text', text: 'tpl.webSpeaker', size: 40, style: { font: 'Poppins', weight: 700, color: '#ffffff' }, cx: 1590, cy: 800 }
    ]
  },

  /* ------------------------------ cards and events ------------------------------ */
  {
    id: 'wedding',
    category: 'cards',
    w: 1500,
    h: 2100,
    background: layered(solid('#fbf7f2'), frame('#c8a97e', 70, 3), frame('#c8a97e', 90, 1)),
    items: [
      { kind: 'text', text: 'tpl.wedTop', size: 70, preset: 'styleSubtitle', style: { color: '#8a6d46', shadowBlur: 0, shadowY: 0 }, cx: 750, cy: 520 },
      { kind: 'text', text: 'tpl.wedNames', size: 190, style: { font: 'Dancing Script', weight: 700, color: '#5b4630' }, cx: 750, cy: 880 },
      { kind: 'shape', name: 'Heart', shape: { kind: 'star', fill: '#c8a97e' }, x: 710, y: 1080, w: 80, h: 80 },
      { kind: 'text', text: 'tpl.wedDate', size: 80, style: { font: 'Playfair Display', weight: 400, color: '#5b4630' }, cx: 750, cy: 1330 },
      { kind: 'text', text: 'tpl.wedPlace', size: 50, style: { font: 'Poppins', weight: 400, color: '#8a6d46' }, cx: 750, cy: 1490 }
    ]
  },
  {
    id: 'thankyou',
    category: 'cards',
    w: 1500,
    h: 1050,
    background: layered(gradient('diag', '#d4fc79', '#96e6a1'), bokeh(['#ffffff'], 18, 14, 60, 0.35)),
    items: [
      { kind: 'text', text: 'tpl.thanksTitle', size: 220, preset: 'styleHand', style: { color: '#14532d', shadowBlur: 0, shadowY: 0 }, cx: 750, cy: 470 },
      { kind: 'text', text: 'tpl.thanksSub', size: 56, preset: 'styleSubtitle', style: { color: '#166534', shadowBlur: 0, shadowY: 0 }, cx: 750, cy: 720 }
    ]
  },
  {
    id: 'christmas',
    category: 'cards',
    w: 1080,
    h: 1350,
    background: layered(gradient('down', '#7f1d1d', '#450a0a'), bokeh(['#ffffff'], 60, 3, 9, 0.8)),
    items: [
      { kind: 'shape', name: 'Tree', shape: { kind: 'triangle', fill: '#166534' }, x: 360, y: 170, w: 360, h: 420 },
      { kind: 'shape', name: 'Star', shape: { kind: 'star', fill: '#facc15' }, x: 490, y: 110, w: 100, h: 100 },
      { kind: 'text', text: 'tpl.xmasTitle', size: 150, style: { font: 'Dancing Script', weight: 700, color: '#ffffff', shadowColor: '#000000', shadowBlur: 20, shadowY: 4 }, cx: 540, cy: 800 },
      { kind: 'text', text: 'tpl.xmasSub', size: 44, preset: 'styleSubtitle', style: { color: '#fde68a' }, cx: 540, cy: 1040 }
    ]
  },
  {
    id: 'party',
    category: 'cards',
    w: 1080,
    h: 1350,
    background: layered(solid('#0a0014'), glow(0.2, 0.2, 0.5, 'rgba(236,72,153,0.45)'), glow(0.85, 0.85, 0.5, 'rgba(56,189,248,0.45)'), bokeh(['#ec4899', '#38bdf8', '#facc15'], 30, 6, 16, 0.9)),
    items: [
      { kind: 'text', text: 'tpl.partyTitle', size: 190, preset: 'styleNeon', cx: 540, cy: 520 },
      { kind: 'text', text: 'tpl.partyWhen', size: 60, preset: 'styleLabel', style: { bgColor: '#ec4899' }, cx: 540, cy: 820 },
      { kind: 'text', text: 'tpl.partyWhere', size: 44, preset: 'styleSubtitle', style: { color: '#bae6fd' }, cx: 540, cy: 990 }
    ]
  },
  {
    id: 'certificate',
    category: 'cards',
    w: 1754,
    h: 1240,
    background: layered(solid('#fffdf7'), frame('#1e3a8a', 50, 10), frame('#c8a24a', 80, 3)),
    items: [
      { kind: 'text', text: 'tpl.certTitle', size: 110, style: { font: 'Playfair Display', weight: 700, color: '#1e3a8a', uppercase: true, letterSpacing: 8 }, cx: 877, cy: 260 },
      { kind: 'text', text: 'tpl.certSub', size: 44, preset: 'styleSubtitle', style: { color: '#6b7280', shadowBlur: 0, shadowY: 0 }, cx: 877, cy: 400 },
      { kind: 'text', text: 'tpl.certName', size: 140, style: { font: 'Dancing Script', weight: 700, color: '#111827' }, cx: 877, cy: 580 },
      { kind: 'shape', name: 'Line', shape: { kind: 'rect', fill: '#c8a24a' }, x: 477, y: 680, w: 800, h: 3 },
      { kind: 'text', text: 'tpl.certFor', size: 40, style: { font: 'Poppins', weight: 400, color: '#374151' }, cx: 877, cy: 770 },
      { kind: 'shape', name: 'Seal', shape: { kind: 'star', fill: '#c8a24a' }, x: 1380, y: 880, w: 200, h: 200 },
      { kind: 'text', text: 'tpl.certSign', size: 34, style: { font: 'Poppins', weight: 400, color: '#6b7280' }, cx: 520, cy: 1030 }
    ]
  }
]
