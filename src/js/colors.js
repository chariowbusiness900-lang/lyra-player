// ============================================================
// Lyra — Thème adaptatif : extraction de la palette dominante
// de la pochette, génération des tons (accent, contraste WCAG),
// transition douce, retour au neutre si la pochette est absente.
// ============================================================

const NEUTRAL = { light: { accent: "#868c96", text: "#ffffff" }, dark: { accent: "#9aa0a8", text: "#101114" } };

function srgbToLin(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luminance(r, g, b) {
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}
function contrastRatio(l1, l2) {
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0, l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s, l];
}
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v);
  };
  return [f(0), f(8), f(4)];
}
const rgbHex = (r, g, b) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

/** Extraction de la couleur dominante via histogramme 4 bits/canal. */
function dominantColor(img) {
  const N = 64;
  const cv = document.createElement("canvas");
  cv.width = N; cv.height = N;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, N, N);
  const data = ctx.getImageData(0, 0, N, N).data;

  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 16) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Écarte les pixels quasi noirs/blancs purs (bords, fond) : on veut la teinte.
    const [h, s, l] = rgbToHsl(r, g, b);
    const weight = s < 0.12 ? 0.25 : 1; // les gris comptent moins
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0, w: 0 };
    e.n++; e.r += r; e.g += g; e.b += b; e.w += weight;
    buckets.set(key, e);
  }
  let best = null;
  for (const e of buckets.values()) {
    if (!best || e.w > best.w) best = e;
  }
  if (!best || best.n === 0) return null;
  return [best.r / best.n, best.g / best.n, best.b / best.n];
}

/** Construit la palette dérivée avec vérification de contraste. */
function buildPalette(dominant) {
  const [r, g, b] = dominant;
  const [h, s, l] = rgbToHsl(r, g, b);

  // Accent : teinte dominante, saturation et luminosité encadrées pour rester lisible.
  const accentL = Math.min(0.62, Math.max(0.42, l * 0.95));
  const accentS = Math.min(0.75, Math.max(0.35, s * 1.25));
  const [ar, ag, ab] = hslToRgb(h, accentS, accentL);
  const accent = rgbHex(ar, ag, ab);

  // Texte sur accent : celui des deux candidats qui atteint le meilleur contraste (WCAG).
  const lumA = luminance(ar, ag, ab);
  const white = contrastRatio(lumA, 1.0), black = contrastRatio(lumA, 0.0);
  const accentText = white >= black ? "#ffffff" : "#101114";

  // Fond dégradé de l'écran "Lecture en cours" : dominante assombrie.
  const [c1r, c1g, c1b] = hslToRgb(h, Math.min(0.6, s * 1.1), Math.max(0.16, l * 0.35));
  const [c2r, c2g, c2b] = hslToRgb((h + 28) % 360, Math.min(0.5, s), Math.max(0.1, l * 0.16));

  return {
    accent,
    accentText,
    accentSoft: `rgba(${ar}, ${ag}, ${ab}, 0.18)`,
    npC1: rgbHex(c1r, c1g, c1b),
    npC2: rgbHex(c2r, c2g, c2b),
  };
}

function applyNeutral(theme) {
  const n = NEUTRAL[theme === "dark" ? "dark" : "light"];
  setVars(n.accent, n.text, "rgba(134, 140, 150, 0.18)", "#232529", "#16171a");
}

function setVars(accent, accentText, accentSoft, npC1, npC2) {
  const rs = document.documentElement.style;
  rs.setProperty("--accent", accent);
  rs.setProperty("--accent-text", accentText);
  rs.setProperty("--accent-soft", accentSoft);
  rs.setProperty("--np-c1", npC1);
  rs.setProperty("--np-c2", npC2);
}

let currentKey = null;
const cache = new Map();

/**
 * Charge la pochette dans une image exploitable par canvas.
 * On passe par fetch + blob : l'image vient alors de la même origine que la
 * page, donc le canvas n'est pas « corrompu » (contrairement à une <img>
 * pointant directement sur le protocole asset://).
 */
async function loadCoverImage(src) {
  try {
    const res = await fetch(src);
    if (res.ok) {
      const blob = await res.blob();
      if (typeof createImageBitmap === "function") return await createImageBitmap(blob);
    }
  } catch { /* on tente le repli <img> */ }
  return await new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Applique les couleurs dérivées de la pochette (avec cache + fallback neutre). */
export async function applyCoverTheme(coverPath, theme) {
  if (!coverPath) {
    currentKey = null;
    applyNeutral(theme);
    return;
  }
  if (currentKey === coverPath) return;
  currentKey = coverPath;

  let palette = cache.get(coverPath);
  if (!palette) {
    const img = await loadCoverImage(coverPath);
    if (img) {
      try {
        const dom = dominantColor(img);
        palette = dom ? buildPalette(dom) : null;
      } catch { palette = null; }
    }
    if (palette) cache.set(coverPath, palette);
  }
  if (palette) setVars(palette.accent, palette.accentText, palette.accentSoft, palette.npC1, palette.npC2);
  else applyNeutral(theme);
}

export function resetTheme(theme) {
  currentKey = null;
  applyNeutral(theme);
}
