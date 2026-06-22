import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

const h = React.createElement;

const palettes = [
  ['#f5efe7', '#f3a25e', '#f5d06f', '#76d1c3', '#143f46'],
  ['#f7f3ee', '#df8e64', '#c9bedf', '#95cfd0', '#29323a'],
  ['#166ed1', '#56d3df', '#4961dc', '#d2f5f2', '#203060'],
  ['#6b55d8', '#40bfe8', '#b16ef0', '#84f2eb', '#1f2370'],
  ['#f55d9e', '#ff9c54', '#ffe8a8', '#c5d6ff', '#5f43c8'],
  ['#15a8d8', '#7bdd74', '#0089d6', '#d4f8cf', '#145c9f'],
  ['#ffb100', '#f87635', '#f7e178', '#9ed8cc', '#fff1c6'],
  ['#8d65ff', '#d97af5', '#a8c9ff', '#f2d5ff', '#6941bf'],
  ['#f0f4ff', '#ff66d0', '#1730ff', '#15181d', '#fff7fd'],
];

const presetDefaults = {
  article: { colorMix: 8, softness: 86, texture: 28, materialDepth: 18, bands: 34, brush: 22, vignette: 14 },
  warmflow: { colorMix: 0, softness: 92, texture: 18, materialDepth: 10, bands: 58, brush: 34, vignette: 8 },
  diffusion: { colorMix: 30, softness: 78, texture: 36, materialDepth: 28, bands: 6, brush: 24, vignette: 20 },
  horizon: { colorMix: 66, softness: 84, texture: 52, materialDepth: 22, bands: 76, brush: 18, vignette: 42 },
  aurora: { colorMix: 94, softness: 86, texture: 56, materialDepth: 30, bands: 28, brush: 18, vignette: 38 },
  prism: { colorMix: 16, softness: 88, texture: 34, materialDepth: 46, bands: 18, brush: 12, vignette: 18 },
  watercolor: { colorMix: 78, softness: 42, texture: 68, materialDepth: 14, bands: 4, brush: 88, vignette: 14 },
  material: { colorMix: 18, softness: 54, texture: 34, materialDepth: 82, bands: 14, brush: 42, vignette: 38 },
  warp_lavender: { colorMix: 25, softness: 75, texture: 15, materialDepth: 90, bands: 0, brush: 50, vignette: 10 },
};

const presets = [
  { id: 'article', label: '封面' },
  { id: 'diffusion', label: '柔光' },
  { id: 'horizon', label: '日落' },
  { id: 'aurora', label: '極光' },
  { id: 'prism', label: '彩虹' },
  { id: 'watercolor', label: '水彩' },
  { id: 'material', label: '質感' },
  { id: 'warmflow', label: '暖綠' },
];

const sizes = [
  { label: '正方形', width: 1600, height: 1600 },
  { label: '分享圖', width: 1200, height: 630 },
  { label: '橫式封面', width: 1600, height: 900 },
  { label: '直式圖', width: 1080, height: 1350 },
  { label: '封面圖', width: 1023, height: 600 },
];

const defaultState = {
  preset: 'article',
  seed: 1209,
  colorMix: 8,
  softness: 86,
  texture: 28,
  materialDepth: 18,
  bands: 34,
  brush: 22,
  vignette: 14,
  width: 1200,
  height: 630,
  text: 'Building useful AI together',
  textColor: '#ffffff',
  textSize: 118,
  textWeight: 760,
  textX: 50,
  textY: 52,
  textAlign: 'center',
  textShadow: true,
  exportFormat: 'png',
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgba(color, alpha = 1) {
  const rgb = typeof color === 'string' ? hexToRgb(color) : color;
  return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${alpha})`;
}

function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return {
    r: lerp(ca.r, cb.r, t),
    g: lerp(ca.g, cb.g, t),
    b: lerp(ca.b, cb.b, t),
  };
}

function paletteAt(progress) {
  const scaled = (progress / 100) * (palettes.length - 1);
  const index = Math.floor(scaled);
  const next = Math.min(index + 1, palettes.length - 1);
  const local = scaled - index;
  return palettes[index].map((color, i) => mixHex(color, palettes[next][i], local));
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawNoise(ctx, width, height, amount, seed) {
  if (amount <= 0) return;
  const random = mulberry32(seed + 404);
  const scale = Math.max(1, Math.floor(Math.min(width, height) / 520));
  const noise = document.createElement('canvas');
  noise.width = Math.ceil(width / scale);
  noise.height = Math.ceil(height / scale);
  const nctx = noise.getContext('2d');
  const image = nctx.createImageData(noise.width, noise.height);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = 116 + random() * 92;
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = amount;
  }
  nctx.putImageData(image, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(noise, 0, 0, width, height);
  ctx.restore();
}

function drawBackground(ctx, settings) {
  const { width, height } = ctx.canvas;
  const random = mulberry32(settings.seed);
  const p = paletteAt(settings.colorMix);
  const softness = settings.softness / 100;
  const radius = Math.max(width, height) * lerp(0.42, 0.82, softness);

  ctx.clearRect(0, 0, width, height);

  if (settings.preset === 'warp_lavender') {
    ctx.save();

    // --- 色彩 (colorMix): shift hue family cool-blue-lavender ↔ neutral-lavender ↔ warm-rose-lavender ---
    const cmT = settings.colorMix / 100;
    const topColor   = cmT < 0.5 ? rgba(mixHex('#e8eaf6', '#f2eefa', cmT * 2), 1)   : rgba(mixHex('#f2eefa', '#f5e8f5', (cmT - 0.5) * 2), 1);
    const midColor   = cmT < 0.5 ? rgba(mixHex('#dbd8f0', '#e4daf0', cmT * 2), 1)   : rgba(mixHex('#e4daf0', '#edd5ed', (cmT - 0.5) * 2), 1);
    const botColor   = cmT < 0.5 ? rgba(mixHex('#c8c0e8', '#d0c3e3', cmT * 2), 1)   : rgba(mixHex('#d0c3e3', '#dfc0e0', (cmT - 0.5) * 2), 1);
    // stroke dark tint also shifts with hue
    const darkR = Math.round(lerp(110, 145, cmT));
    const darkG = Math.round(lerp(100, 100, cmT));
    const darkB = Math.round(lerp(160, 130, cmT));

    // 1. Base Lavender Gradient (色彩 connected)
    const baseGrad = ctx.createLinearGradient(0, 0, width, height);
    baseGrad.addColorStop(0,   topColor);
    baseGrad.addColorStop(0.5, midColor);
    baseGrad.addColorStop(1,   botColor);
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Diffused Glow (柔和度 connected: radius & intensity)
    const softnessT   = settings.softness / 100;
    const glowRadius  = Math.max(width, height) * lerp(0.4, 0.85, softnessT);
    const glowPeak    = lerp(0.62, 0.32, softnessT);  // high softness → gentler centre
    const glowGrad = ctx.createRadialGradient(
      width * 0.5, height * 0.45, 0,
      width * 0.5, height * 0.45, glowRadius
    );
    glowGrad.addColorStop(0,   `rgba(255,255,255,${glowPeak})`);
    glowGrad.addColorStop(0.5, `rgba(255,255,255,${glowPeak * 0.3})`);
    glowGrad.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, width, height);

    // 3. Diagonal Brushed Metal / Painted Canvas Texture
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-Math.PI / 6); // -30 degrees diagonal
    const diag = Math.sqrt(width * width + height * height) * 1.2;

    // Fine brushed lines
    const lineCount = Math.round(1000 + (settings.brush * 5));
    for (let i = 0; i < lineCount; i++) {
      const y      = (random() - 0.5) * diag;
      const isDark = random() > 0.55;
      ctx.lineWidth = random() * 1.2 + 0.3;
      const opacity = random() * 0.08 * (settings.materialDepth / 100);
      ctx.strokeStyle = isDark
        ? `rgba(${darkR},${darkG},${darkB},${opacity * 0.35})`
        : `rgba(255,255,255,${opacity * 0.95})`;
      ctx.beginPath();
      ctx.moveTo(-diag / 2, y);
      ctx.lineTo( diag / 2, y);
      ctx.stroke();
    }

    // Wider organic canvas brush strokes
    for (let i = 0; i < 24; i++) {
      const y      = (random() - 0.5) * diag;
      const isDark = random() > 0.5;
      ctx.lineWidth = random() * 15 + 4;
      const opacity = random() * 0.015 * (settings.brush / 100);
      ctx.strokeStyle = isDark
        ? `rgba(${darkR - 25},${darkG - 10},${darkB - 20},${opacity})`
        : `rgba(255,255,255,${opacity * 1.5})`;
      ctx.beginPath();
      ctx.moveTo(-diag / 2, y);
      ctx.lineTo( diag / 2, y);
      ctx.stroke();
    }

    ctx.restore();

    // 4. 色帶 (bands): subtle horizontal metallic light bands
    if (settings.bands > 5) {
      const bandCount    = Math.round(lerp(2, 8, settings.bands / 100));
      const bandAlpha    = settings.bands / 1800;
      for (let i = 0; i < bandCount; i++) {
        const bandCenterY = ((i + 0.5) / bandCount) * height;
        const bandH       = height * lerp(0.06, 0.18, random());
        const bGrad = ctx.createLinearGradient(0, bandCenterY - bandH, 0, bandCenterY + bandH);
        bGrad.addColorStop(0,   'rgba(255,255,255,0)');
        bGrad.addColorStop(0.5, `rgba(255,255,255,${bandAlpha})`);
        bGrad.addColorStop(1,   'rgba(255,255,255,0)');
        ctx.fillStyle = bGrad;
        ctx.fillRect(0, 0, width, height);
      }
    }

    // Final polish: soft top-left shine
    const warpShine = ctx.createLinearGradient(0, 0, width * 0.7, height * 0.55);
    warpShine.addColorStop(0,   'rgba(255,255,255,0.38)');
    warpShine.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    warpShine.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = warpShine;
    ctx.fillRect(0, 0, width, height);

    // 邊緣暗角 (vignette): connected to slider
    const warpVignette = ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.3,
      width / 2, height / 2, Math.max(width, height) * 0.78
    );
    warpVignette.addColorStop(0, 'rgba(0,0,0,0)');
    warpVignette.addColorStop(1, `rgba(${darkR - 10},${darkG - 8},${darkB},${settings.vignette / 185})`);
    ctx.fillStyle = warpVignette;
    ctx.fillRect(0, 0, width, height);

    drawNoise(ctx, width, height, Math.round(settings.texture * 0.6), settings.seed);
    return;
  } else {
    const base = ctx.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, rgba(p[3], 1));
    base.addColorStop(0.48, rgba(p[1], 1));
    base.addColorStop(1, rgba(p[4], 1));
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    const blobCount = settings.preset === 'watercolor' ? 18 : 12;
    for (let i = 0; i < blobCount; i += 1) {
      const x = (0.08 + random() * 0.84) * width;
      const y = (0.04 + random() * 0.92) * height;
      const size = radius * lerp(0.45, 1.08, random());
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
      gradient.addColorStop(0, rgba(p[i % p.length], lerp(0.42, 0.78, softness)));
      gradient.addColorStop(0.58, rgba(p[(i + 2) % p.length], lerp(0.12, 0.26, softness)));
      gradient.addColorStop(1, rgba(p[(i + 3) % p.length], 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
  }

  if (settings.preset === 'article' || settings.preset === 'warmflow' || settings.preset === 'horizon' || settings.bands > 18) {
    const horizon = ctx.createLinearGradient(0, 0, 0, height);
    horizon.addColorStop(0, rgba(p[3], 0));
    horizon.addColorStop(0.44, rgba(p[2], settings.bands / 210));
    horizon.addColorStop(0.56, rgba(p[0], settings.bands / 135));
    horizon.addColorStop(1, rgba(p[4], settings.bands / 120));
    ctx.fillStyle = horizon;
    ctx.fillRect(0, 0, width, height);
  }

  if (settings.preset === 'warmflow') {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const amber = ctx.createRadialGradient(width * 0.2, height * 0.38, 0, width * 0.2, height * 0.38, width * 0.72);
    amber.addColorStop(0, 'rgba(255, 179, 88, 0.7)');
    amber.addColorStop(0.5, 'rgba(246, 219, 116, 0.28)');
    amber.addColorStop(1, 'rgba(255, 179, 88, 0)');
    ctx.fillStyle = amber;
    ctx.fillRect(0, 0, width, height);

    const teal = ctx.createRadialGradient(width * 0.78, height * 0.58, 0, width * 0.78, height * 0.58, width * 0.68);
    teal.addColorStop(0, 'rgba(82, 205, 185, 0.62)');
    teal.addColorStop(0.5, 'rgba(53, 151, 144, 0.26)');
    teal.addColorStop(1, 'rgba(82, 205, 185, 0)');
    ctx.fillStyle = teal;
    ctx.fillRect(0, 0, width, height);

    const soft = ctx.createLinearGradient(0, height * 0.15, width, height * 0.88);
    soft.addColorStop(0, 'rgba(255,255,255,0.34)');
    soft.addColorStop(0.48, 'rgba(255,231,169,0.16)');
    soft.addColorStop(1, 'rgba(18,80,77,0.18)');
    ctx.fillStyle = soft;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  if (settings.preset === 'article') {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const wash = ctx.createLinearGradient(width * 0.08, height * 0.18, width * 0.92, height * 0.86);
    wash.addColorStop(0, 'rgba(255,255,255,0.18)');
    wash.addColorStop(0.42, rgba(p[2], 0.26));
    wash.addColorStop(1, rgba(p[3], 0.2));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'soft-light';
    for (let i = 0; i < 4; i += 1) {
      const x = width * (0.16 + i * 0.22);
      const y = height * (0.24 + random() * 0.48);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(width, height) * 0.34);
      gradient.addColorStop(0, rgba(p[(i + 1) % p.length], 0.2));
      gradient.addColorStop(1, rgba(p[(i + 3) % p.length], 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }

  if (settings.preset === 'aurora' || settings.preset === 'prism') {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      const y = height * (0.24 + i * 0.11);
      ctx.moveTo(-width * 0.1, y);
      for (let x = -width * 0.1; x <= width * 1.1; x += width / 6) {
        ctx.quadraticCurveTo(x + width / 10, y - height * (0.14 + random() * 0.16), x + width / 5, y + height * (random() * 0.1));
      }
      ctx.lineWidth = Math.max(width, height) * (0.08 + random() * 0.08);
      ctx.strokeStyle = rgba(p[(i + 1) % p.length], 0.22);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (settings.preset === 'material') {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    for (let i = 0; i < 7; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const w = width * lerp(0.24, 0.5, random());
      const h = height * lerp(0.18, 0.44, random());
      ctx.translate(x, y);
      ctx.rotate((random() - 0.5) * 1.4);
      roundedRect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.16);
      ctx.fillStyle = rgba(p[i % p.length], settings.materialDepth / 165);
      ctx.fill();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.restore();
  }

  if (settings.preset === 'watercolor' || settings.brush > 55) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 18; i += 1) {
      ctx.beginPath();
      ctx.ellipse(
        random() * width,
        random() * height,
        width * lerp(0.08, 0.24, random()),
        height * lerp(0.025, 0.09, random()),
        random() * Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = rgba(p[i % p.length], settings.brush / 850);
      ctx.fill();
    }
    ctx.restore();
  }

  // Generic shine / vignette / noise (skipped for warp_lavender which returns early)
  const shine = ctx.createLinearGradient(0, 0, width, height * 0.7);
  shine.addColorStop(0, 'rgba(255,255,255,0.54)');
  shine.addColorStop(0.36, 'rgba(255,255,255,0.15)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.18, width / 2, height / 2, Math.max(width, height) * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, `rgba(3,7,18,${settings.vignette / 185})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  drawNoise(ctx, width, height, Math.round(settings.texture * 0.9), settings.seed);
}

function wrapText(ctx, text, maxWidth) {
  const paragraphs = text.split('\n');
  const lines = [];
  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      return;
    }
    let line = '';
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !line) {
        line = next;
      } else {
        lines.push(line);
        line = word;
      }
    });
    lines.push(line);
  });
  return lines;
}

function drawText(ctx, settings) {
  if (!settings.text.trim()) return;
  const { width, height } = ctx.canvas;
  const fontSize = Math.max(16, (settings.textSize / 900) * Math.min(width, height));
  const lineHeight = fontSize * 1.08;
  const maxWidth = width * 0.78;
  const x = (settings.textX / 100) * width;
  const y = (settings.textY / 100) * height;

  ctx.save();
  ctx.font = `${settings.textWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif`;
  ctx.textAlign = settings.textAlign;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = settings.textColor;
  if (settings.textShadow) {
    ctx.shadowColor = settings.textColor === '#000000' ? 'rgba(255,255,255,0.34)' : 'rgba(0,0,0,0.36)';
    ctx.shadowBlur = fontSize * 0.22;
    ctx.shadowOffsetY = fontSize * 0.05;
  }
  const lines = wrapText(ctx, settings.text, maxWidth);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    ctx.fillText(line, x, startY + index * lineHeight);
  });
  ctx.restore();
}

function drawArtwork(ctx, settings) {
  drawBackground(ctx, settings);
  drawText(ctx, settings);
}

function ControlRange({ id, label, value, onChange, max = 100 }) {
  return h(
    'label',
    { className: 'range-row' },
    h('span', { className: 'range-label' }, h('span', null, label), h('output', null, value)),
    h('input', {
      type: 'range',
      min: 0,
      max,
      value,
      onChange: (event) => onChange(id, Number(event.target.value)),
    }),
  );
}

function NumberField({ label, value, onChange, min = 320, max = 4096 }) {
  return h(
    'label',
    { className: 'number-field' },
    h('span', null, label),
    h('input', {
      type: 'number',
      min,
      max,
      value,
      onChange: (event) => onChange(clamp(Number(event.target.value || min), min, max)),
    }),
  );
}

function sizeLabel(size) {
  return `${size.label} (${size.width} x ${size.height})`;
}

function App() {
  const canvasRef = useRef(null);
  const [settings, setSettings] = useState(defaultState);
  const previewSize = useMemo(() => {
    const ratio = settings.width / settings.height;
    if (ratio >= 1) return { width: 1200, height: Math.round(1200 / ratio) };
    return { width: Math.round(1200 * ratio), height: 1200 };
  }, [settings.width, settings.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = previewSize.width;
    canvas.height = previewSize.height;
    drawArtwork(ctx, { ...settings, width: previewSize.width, height: previewSize.height });
  }, [settings, previewSize]);

  function updateValue(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function choosePreset(preset) {
    setSettings((current) => ({ ...current, preset, ...presetDefaults[preset] }));
  }

  function chooseSize(size) {
    setSettings((current) => ({ ...current, width: size.width, height: size.height }));
  }

  function chooseSizeByValue(value) {
    const size = sizes.find((item) => `${item.width}x${item.height}` === value);
    if (size) chooseSize(size);
  }

  function randomize() {
    setSettings((current) => ({
      ...current,
      seed: Math.floor(Math.random() * 900000) + 1000,
      colorMix: Math.floor(Math.random() * 101),
      softness: Math.floor(46 + Math.random() * 47),
      texture: Math.floor(18 + Math.random() * 60),
      materialDepth: Math.floor(Math.random() * 85),
      bands: Math.floor(Math.random() * 90),
      brush: Math.floor(Math.random() * 92),
      vignette: Math.floor(Math.random() * 46),
    }));
  }

  function exportArtwork() {
    const output = document.createElement('canvas');
    output.width = settings.width;
    output.height = settings.height;
    const ctx = output.getContext('2d', { willReadFrequently: true });
    drawArtwork(ctx, settings);
    const mime = settings.exportFormat === 'webp' ? 'image/webp' : 'image/png';
    const link = document.createElement('a');
    link.download = `gradient-cover-${settings.width}x${settings.height}.${settings.exportFormat}`;
    link.href = output.toDataURL(mime, 0.96);
    link.click();
  }

  return h(
    'main',
    { className: 'app-shell' },
    h(
      'aside',
      { className: 'control-panel', 'aria-label': 'cover generator controls' },
      h(
        'section',
        { className: 'panel-section' },
        h('div', { className: 'section-heading' }, h('span', null, '背景')),
        h(
          'div',
          { className: 'preset-grid' },
          presets.map((preset) =>
            h(
              'button',
              {
                className: settings.preset === preset.id ? 'is-active' : '',
                key: preset.id,
                type: 'button',
                onClick: () => choosePreset(preset.id),
              },
              preset.label,
            ),
          ),
        ),
        h(
          'div',
          { className: 'preset-grid', style: { marginTop: '8px' } },
          h('button', { type: 'button', onClick: randomize }, '隨機'),
          h(
            'button',
            {
              className: settings.preset === 'warp_lavender' ? 'is-active' : '',
              type: 'button',
              onClick: () => choosePreset('warp_lavender'),
            },
            '拉絲紫',
          ),
        ),
      ),
      h(
        'details',
        { className: 'panel-section compact-section' },
        h('summary', null, '進階顏色'),
        h(ControlRange, { id: 'colorMix', label: '色彩', value: settings.colorMix, onChange: updateValue }),
        h(ControlRange, { id: 'softness', label: '柔和度', value: settings.softness, onChange: updateValue }),
        h(ControlRange, { id: 'texture', label: '顆粒感', value: settings.texture, onChange: updateValue }),
        h(ControlRange, { id: 'materialDepth', label: '質感', value: settings.materialDepth, onChange: updateValue }),
        h(ControlRange, { id: 'bands', label: '色帶', value: settings.bands, onChange: updateValue }),
        h(ControlRange, { id: 'brush', label: '流動感', value: settings.brush, onChange: updateValue }),
        h(ControlRange, { id: 'vignette', label: '邊緣暗角', value: settings.vignette, onChange: updateValue }),
      ),
      h(
        'section',
        { className: 'panel-section' },
        h('div', { className: 'section-heading' }, h('span', null, '文字')),
        h(
          'label',
          { className: 'text-field' },
          h('textarea', {
            rows: 2,
            value: settings.text,
            onChange: (event) => updateValue('text', event.target.value),
          }),
        ),
        h(
          'div',
          { className: 'swatch-row', role: 'group', 'aria-label': 'text color' },
          ['#ffffff', '#000000'].map((color) =>
            h('button', {
              key: color,
              className: settings.textColor === color ? 'swatch is-active' : 'swatch',
              style: { background: color },
              title: color === '#ffffff' ? 'White' : 'Black',
              type: 'button',
              onClick: () => updateValue('textColor', color),
            }),
          ),
          h(
            'label',
            { className: 'color-picker-swatch', title: '自訂顏色' },
            h('span', null, '自訂顏色'),
            h('input', {
              type: 'color',
              value: settings.textColor,
              onChange: (event) => updateValue('textColor', event.target.value),
            }),
          ),
        ),
        h(ControlRange, { id: 'textSize', label: '文字大小', value: settings.textSize, onChange: updateValue, max: 220 }),
        h(ControlRange, { id: 'textX', label: '左右位置', value: settings.textX, onChange: updateValue }),
        h(ControlRange, { id: 'textY', label: '上下位置', value: settings.textY, onChange: updateValue }),
        h(
          'div',
          { className: 'inline-grid' },
          h(
            'label',
            { className: 'select-field' },
            h('span', null, '對齊'),
            h(
              'select',
              { value: settings.textAlign, onChange: (event) => updateValue('textAlign', event.target.value) },
              h('option', { value: 'left' }, '靠左'),
              h('option', { value: 'center' }, '置中'),
              h('option', { value: 'right' }, '靠右'),
            ),
          ),
          h(
            'label',
            { className: 'select-field' },
            h('span', null, '粗細'),
            h(
              'select',
              { value: settings.textWeight, onChange: (event) => updateValue('textWeight', Number(event.target.value)) },
              h('option', { value: 520 }, '一般'),
              h('option', { value: 680 }, '中等'),
              h('option', { value: 760 }, '粗體'),
              h('option', { value: 860 }, '很粗'),
            ),
          ),
        ),
        h(
          'label',
          { className: 'toggle-row' },
          h('input', {
            type: 'checkbox',
            checked: settings.textShadow,
            onChange: (event) => updateValue('textShadow', event.target.checked),
          }),
          h('span', null, '柔和陰影'),
        ),
      ),
    ),
    h(
      'section',
      { className: 'preview-area', 'aria-label': 'generated cover preview' },
      h(
        'div',
        { className: 'preview-status' },
        h(
          'div',
          { className: 'stage-meta' },
          h(
            'select',
            {
              className: 'toolbar-select size-select',
              value: `${settings.width}x${settings.height}`,
              onChange: (event) => chooseSizeByValue(event.target.value),
              'aria-label': 'Output size',
            },
            sizes.map((size) => h('option', { key: size.label, value: `${size.width}x${size.height}` }, sizeLabel(size))),
          ),
          h(
            'select',
            {
              className: 'toolbar-select format-select',
              value: settings.exportFormat,
              onChange: (event) => updateValue('exportFormat', event.target.value),
              'aria-label': 'Export format',
            },
            h('option', { value: 'png' }, 'PNG'),
            h('option', { value: 'webp' }, 'WebP'),
          ),
          h('button', { className: 'primary-button toolbar-export', type: 'button', onClick: exportArtwork }, 'Export'),
        ),
      ),
      h(
        'div',
        { className: 'canvas-frame' },
        h('canvas', {
          ref: canvasRef,
          'aria-label': 'Generated gradient cover',
        }),
      ),
      h(
        'div',
        { className: 'sample-strip', 'aria-label': 'palette samples' },
        palettes.slice(0, 6).map((palette, index) =>
          h('button', {
            key: index,
            type: 'button',
            title: `Palette ${index + 1}`,
            onClick: () => updateValue('colorMix', Math.round((index / 5) * 100)),
            style: {
              background: `linear-gradient(90deg, ${palette.join(', ')})`,
            },
          }),
        ),
      ),
    ),
  );
}

createRoot(document.getElementById('root')).render(h(App));
