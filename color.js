/**
 * color.js — Color conversion & harmony engine
 * Supports: HSV ↔ RGB ↔ Hex, color harmonies, tints/shades
 */

// ─── Core Conversions ─────────────────────────────────────────────────────────

function hsvToRgb(h, s, v) {
  // h: 0–360, s: 0–100, v: 0–100
  s /= 100; v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if      (h <  60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0, s = 0, v = max;
  if (d !== 0) {
    s = d / max;
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    v: Math.round(v * 100),
  };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255),
  };
}

// ─── sRGB / Linear ────────────────────────────────────────────────────────────

function linearize(v) {
  // sRGB gamma expand
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgbToSrgbLinear(r, g, b) {
  return {
    r: parseFloat(linearize(r).toFixed(4)),
    g: parseFloat(linearize(g).toFixed(4)),
    b: parseFloat(linearize(b).toFixed(4)),
  };
}

function relativeLuminance(r, g, b) {
  const { r: lr, g: lg, b: lb } = rgbToSrgbLinear(r, g, b);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrastRatio(r1, g1, b1, r2 = 255, g2 = 255, b2 = 255) {
  const l1 = relativeLuminance(r1, g1, b1);
  const l2 = relativeLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return parseFloat(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

// ─── CMYK ─────────────────────────────────────────────────────────────────────

function rgbToCmyk(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const k = 1 - Math.max(r, g, b);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: Math.round(((1 - r - k) / (1 - k)) * 100),
    m: Math.round(((1 - g - k) / (1 - k)) * 100),
    y: Math.round(((1 - b - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  };
}

function cmykToRgb(c, m, y, k) {
  c /= 100; m /= 100; y /= 100; k /= 100;
  return {
    r: Math.round(255 * (1 - c) * (1 - k)),
    g: Math.round(255 * (1 - m) * (1 - k)),
    b: Math.round(255 * (1 - y) * (1 - k)),
  };
}

// ─── Color Harmonies ──────────────────────────────────────────────────────────

function hueShift(h, deg) { return (h + deg + 360) % 360; }

function getHarmonies(h, s, v) {
  const make = (hue, sat = s, val = v) => {
    const rgb = hsvToRgb(hue, sat, val);
    return { h: hue, s: sat, v: val, ...rgb, hex: rgbToHex(rgb.r, rgb.g, rgb.b) };
  };

  return {
    base: make(h),
    complementary: [make(h), make(hueShift(h, 180))],
    analogous: [make(hueShift(h, -30)), make(h), make(hueShift(h, 30))],
    triadic: [make(h), make(hueShift(h, 120)), make(hueShift(h, 240))],
    splitComplementary: [make(h), make(hueShift(h, 150)), make(hueShift(h, 210))],
    tetradic: [make(h), make(hueShift(h, 90)), make(hueShift(h, 180)), make(hueShift(h, 270))],
    tints: Array.from({ length: 7 }, (_, i) => {
      const factor = (i + 1) / 8;
      const rgb = hsvToRgb(h, s, v);
      return {
        r: Math.round(rgb.r + (255 - rgb.r) * factor),
        g: Math.round(rgb.g + (255 - rgb.g) * factor),
        b: Math.round(rgb.b + (255 - rgb.b) * factor),
      };
    }).map(c => ({ ...c, hex: rgbToHex(c.r, c.g, c.b) })),
    shades: Array.from({ length: 7 }, (_, i) => {
      const factor = (i + 1) / 8;
      const rgb = hsvToRgb(h, s, v);
      return {
        r: Math.round(rgb.r * (1 - factor)),
        g: Math.round(rgb.g * (1 - factor)),
        b: Math.round(rgb.b * (1 - factor)),
      };
    }).map(c => ({ ...c, hex: rgbToHex(c.r, c.g, c.b) })),
  };
}

// ─── Color Naming (CSS Named Colors) ─────────────────────────────────────────

const NAMED_COLORS = {
  'aliceblue':'#F0F8FF','antiquewhite':'#FAEBD7','aqua':'#00FFFF','aquamarine':'#7FFFD4',
  'azure':'#F0FFFF','beige':'#F5F5DC','bisque':'#FFE4C4','black':'#000000',
  'blanchedalmond':'#FFEBCD','blue':'#0000FF','blueviolet':'#8A2BE2','brown':'#A52A2A',
  'burlywood':'#DEB887','cadetblue':'#5F9EA0','chartreuse':'#7FFF00','chocolate':'#D2691E',
  'coral':'#FF7F50','cornflowerblue':'#6495ED','cornsilk':'#FFF8DC','crimson':'#DC143C',
  'cyan':'#00FFFF','darkblue':'#00008B','darkcyan':'#008B8B','darkgoldenrod':'#B8860B',
  'darkgray':'#A9A9A9','darkgreen':'#006400','darkkhaki':'#BDB76B','darkmagenta':'#8B008B',
  'darkolivegreen':'#556B2F','darkorange':'#FF8C00','darkorchid':'#9932CC','darkred':'#8B0000',
  'darksalmon':'#E9967A','darkseagreen':'#8FBC8F','darkslateblue':'#483D8B',
  'darkslategray':'#2F4F4F','darkturquoise':'#00CED1','darkviolet':'#9400D3',
  'deeppink':'#FF1493','deepskyblue':'#00BFFF','dimgray':'#696969','dodgerblue':'#1E90FF',
  'firebrick':'#B22222','floralwhite':'#FFFAF0','forestgreen':'#228B22','fuchsia':'#FF00FF',
  'gainsboro':'#DCDCDC','ghostwhite':'#F8F8FF','gold':'#FFD700','goldenrod':'#DAA520',
  'gray':'#808080','green':'#008000','greenyellow':'#ADFF2F','honeydew':'#F0FFF0',
  'hotpink':'#FF69B4','indianred':'#CD5C5C','indigo':'#4B0082','ivory':'#FFFFF0',
  'khaki':'#F0E68C','lavender':'#E6E6FA','lavenderblush':'#FFF0F5','lawngreen':'#7CFC00',
  'lemonchiffon':'#FFFACD','lightblue':'#ADD8E6','lightcoral':'#F08080','lightcyan':'#E0FFFF',
  'lightgoldenrodyellow':'#FAFAD2','lightgray':'#D3D3D3','lightgreen':'#90EE90',
  'lightpink':'#FFB6C1','lightsalmon':'#FFA07A','lightseagreen':'#20B2AA',
  'lightskyblue':'#87CEFA','lightslategray':'#778899','lightsteelblue':'#B0C4DE',
  'lightyellow':'#FFFFE0','lime':'#00FF00','limegreen':'#32CD32','linen':'#FAF0E6',
  'magenta':'#FF00FF','maroon':'#800000','mediumaquamarine':'#66CDAA','mediumblue':'#0000CD',
  'mediumorchid':'#BA55D3','mediumpurple':'#9370DB','mediumseagreen':'#3CB371',
  'mediumslateblue':'#7B68EE','mediumspringgreen':'#00FA9A','mediumturquoise':'#48D1CC',
  'mediumvioletred':'#C71585','midnightblue':'#191970','mintcream':'#F5FFFA',
  'mistyrose':'#FFE4E1','moccasin':'#FFE4B5','navajowhite':'#FFDEAD','navy':'#000080',
  'oldlace':'#FDF5E6','olive':'#808000','olivedrab':'#6B8E23','orange':'#FFA500',
  'orangered':'#FF4500','orchid':'#DA70D6','palegoldenrod':'#EEE8AA','palegreen':'#98FB98',
  'paleturquoise':'#AFEEEE','palevioletred':'#DB7093','papayawhip':'#FFEFD5',
  'peachpuff':'#FFDAB9','peru':'#CD853F','pink':'#FFC0CB','plum':'#DDA0DD',
  'powderblue':'#B0E0E6','purple':'#800080','red':'#FF0000','rosybrown':'#BC8F8F',
  'royalblue':'#4169E1','saddlebrown':'#8B4513','salmon':'#FA8072','sandybrown':'#F4A460',
  'seagreen':'#2E8B57','seashell':'#FFF5EE','sienna':'#A0522D','silver':'#C0C0C0',
  'skyblue':'#87CEEB','slateblue':'#6A5ACD','slategray':'#708090','snow':'#FFFAFA',
  'springgreen':'#00FF7F','steelblue':'#4682B4','tan':'#D2B48C','teal':'#008080',
  'thistle':'#D8BFD8','tomato':'#FF6347','turquoise':'#40E0D0','violet':'#EE82EE',
  'wheat':'#F5DEB3','white':'#FFFFFF','whitesmoke':'#F5F5F5','yellow':'#FFFF00',
  'yellowgreen':'#9ACD32',
};

const NAMED_COLOR_ENTRIES = Object.entries(NAMED_COLORS).map(([name, hex]) => {
  const rgb = hexToRgb(hex);
  return { name, hex, ...rgb };
});

function findClosestNamedColor(r, g, b) {
  let closest = null, minDist = Infinity;
  for (const entry of NAMED_COLOR_ENTRIES) {
    const d = Math.sqrt(
      (r - entry.r) ** 2 + (g - entry.g) ** 2 + (b - entry.b) ** 2
    );
    if (d < minDist) { minDist = d; closest = entry; }
  }
  return { ...closest, distance: Math.round(minDist) };
}

// ─── Full Color Info Object ───────────────────────────────────────────────────

function buildColorInfo(r, g, b) {
  const hex = rgbToHex(r, g, b);
  const hsv = rgbToHsv(r, g, b);
  const hsl = rgbToHsl(r, g, b);
  const cmyk = rgbToCmyk(r, g, b);
  const srgb = rgbToSrgbLinear(r, g, b);
  const lum = relativeLuminance(r, g, b);
  const contrastWhite = contrastRatio(r, g, b, 255, 255, 255);
  const contrastBlack = contrastRatio(r, g, b, 0, 0, 0);
  const named = findClosestNamedColor(r, g, b);
  const harmonies = getHarmonies(hsv.h, hsv.s, hsv.v);

  return { r, g, b, hex, hsv, hsl, cmyk, srgb, lum, contrastWhite, contrastBlack, named, harmonies };
}
