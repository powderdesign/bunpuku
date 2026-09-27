// Bunpuku おみくじ — Web 版
// オリジナル（2011, POWDER DESIGN）の iOS アプリを Canvas で再実装したもの。
// 金属面（上の canvas）を筆先 brush で destination-out して削り、下のおみくじを見せる。

'use strict';

const DESIGN = { w: 320, h: 480 };      // オリジナルの画面サイズ（pt）
const ABOUT_DESIGN = { w: 320, h: 436 };
const BRUSH = { w: 56, h: 34 };          // 320pt 幅基準の筆先サイズ
const FORTUNE_COUNT = 20;
const FADE = 20;                         // 素材の端をぼかす幅（CSS px）

const $ = (id) => document.getElementById(id);
const metalCanvas = $('metal');
const fortuneCanvas = $('fortune');
const aboutCanvas = $('about');

// ---------------------------------------------------------------- 画像

const imageCache = new Map();
function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    }));
  }
  return imageCache.get(src);
}
const fortuneSrc = (n) => `img/contents${String(n).padStart(3, '0')}.jpg`;

// ---------------------------------------------------------------- レイアウト

/** 素材を縦横比を保って中央に収める矩形 */
function designRect(W, H, d) {
  const s = Math.min(W / d.w, H / d.h);
  const w = Math.round(d.w * s), h = Math.round(d.h * s);
  return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, s };
}

/** canvas を表示サイズ × devicePixelRatio に合わせ、CSS px で描ける ctx を返す */
function prepareCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  return { ctx, W, H, dpr };
}

/** 帯の平均色を 16 分割の 1px 画像にする（縦帯なら 1×16） */
function averagedStrip(img, sx, sy, sw, sh, vertical) {
  const c = document.createElement('canvas');
  c.width = vertical ? 1 : 16;
  c.height = vertical ? 16 : 1;
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/**
 * 320×480 前提の素材を全画面に敷く。
 * style 'tiled' : 上下端の絵柄のない帯を鏡像で敷き詰める（金属）
 * style 'edge'  : 端の平均色の帯で埋める（紙）
 */
function drawLetterboxed(ctx, W, H, dpr, img, design, style) {
  const r = designRect(W, H, design);
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const vMargin = r.h < H - 1, hMargin = r.w < W - 1;

  // 左右の余白（横長画面）は左右端の平均色
  if (hMargin) {
    const band = Math.max(1, Math.round(iw / 60));
    ctx.drawImage(averagedStrip(img, 0, 0, band, ih, true), 0, 0, r.x + FADE, H);
    ctx.drawImage(averagedStrip(img, iw - band, 0, band, ih, true), r.x + r.w - FADE, 0, W - r.x - r.w + FADE, H);
  }

  if (vMargin) {
    const inset = Math.max(1, Math.round(ih / 200));
    if (style === 'tiled') {
      const band = Math.round(ih * 0.06) - inset;
      const bandH = Math.max(1, Math.round(band * r.w / iw));
      const drawBand = (sy, y, flipped) => {
        ctx.save();
        if (flipped) { ctx.translate(0, y + bandH); ctx.scale(1, -1); y = 0; }
        ctx.drawImage(img, 0, sy, iw, band, 0, y, W, bandH);
        ctx.restore();
      };
      // 上：素材の上端から上へ（隣接する帯を反転させて継ぎ目をなくす）
      for (let k = -1, y = r.y; y + bandH > 0; k++) {
        const top = r.y - (k + 1) * bandH;
        drawBand(inset, top, k % 2 === 0);
        y = top;
      }
      // 下：素材の下端から下へ
      for (let k = -1, y = r.y + r.h; y < H; k++) {
        const top = r.y + r.h + k * bandH;
        drawBand(ih - inset - band, top, k % 2 === 0);
        y = top + bandH;
      }
    } else {
      const band = Math.max(1, Math.round(ih / 60));
      ctx.drawImage(averagedStrip(img, 0, 0, iw, band, false), 0, 0, W, r.y + FADE);
      ctx.drawImage(averagedStrip(img, 0, ih - band, iw, band, false), 0, r.y + r.h - FADE, W, H - r.y - r.h + FADE);
    }
  }

  // 本体：余白のある辺をフェード
  const off = document.createElement('canvas');
  off.width = Math.round(r.w * dpr);
  off.height = Math.round(r.h * dpr);
  const o = off.getContext('2d');
  o.imageSmoothingQuality = 'high';
  o.drawImage(img, 0, 0, off.width, off.height);
  if (vMargin || hMargin) {
    const f = FADE * dpr;
    const g = vMargin ? o.createLinearGradient(0, 0, 0, off.height) : o.createLinearGradient(0, 0, off.width, 0);
    const len = vMargin ? off.height : off.width;
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(f / len, 'rgba(0,0,0,1)');
    g.addColorStop(1 - f / len, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    o.globalCompositeOperation = 'destination-in';
    o.fillStyle = g;
    o.fillRect(0, 0, off.width, off.height);
  }
  ctx.drawImage(off, r.x, r.y, r.w, r.h);
  return r;
}

// ---------------------------------------------------------------- 音

const sound = {
  ctx: null, buffers: {}, scratchPlaying: false,
  async unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    // ambient：他のアプリの音楽を止めない（オリジナルの System Sound と同じ振る舞い）
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch {}
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // 無音を 1 回鳴らして iOS の再生制限を解除
    const b = this.ctx.createBuffer(1, 1, 22050);
    const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0);
    await Promise.all(['coin', 'scratch'].map(async (name) => {
      try {
        const res = await fetch(`sound/${name}.m4a`);
        this.buffers[name] = await this.ctx.decodeAudioData(await res.arrayBuffer());
      } catch (e) { console.warn('sound load failed', name, e); }
    }));
  },
  play(name, onEnded) {
    const buf = this.buffers[name];
    if (!this.ctx || !buf) { onEnded && onEnded(); return false; }
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.connect(this.ctx.destination);
    if (onEnded) s.onended = onEnded;
    s.start(0);
    return true;
  },
  coin() { this.play('coin'); },
  scratch() {
    if (this.scratchPlaying) return;
    this.scratchPlaying = true;
    if (!this.play('scratch', () => { this.scratchPlaying = false; })) this.scratchPlaying = false;
  },
};

// ---------------------------------------------------------------- おみくじ本体

const state = {
  fortune: 1,
  strokes: [],        // 削った軌跡（素材座標）。リサイズ時に再生する
  rect: null,         // 現在の designRect（おみくじ基準）
  metal: null, brush: null,
  metalCtx: null,
};

function drawFortuneLayer(img) {
  const { ctx, W, H, dpr } = prepareCanvas(fortuneCanvas);
  drawLetterboxed(ctx, W, H, dpr, img, DESIGN, 'edge');
}

function drawMetalLayer() {
  const { ctx, W, H, dpr } = prepareCanvas(metalCanvas);
  drawLetterboxed(ctx, W, H, dpr, state.metal, DESIGN, 'tiled');
  state.metalCtx = ctx;
  state.rect = designRect(W, H, DESIGN);
  ctx.globalCompositeOperation = 'destination-out';
}

/** 素材座標 → 画面座標 */
const toScreen = (p) => ({ x: state.rect.x + p.x * state.rect.s, y: state.rect.y + p.y * state.rect.s });
const toDesign = (x, y) => ({ x: (x - state.rect.x) / state.rect.s, y: (y - state.rect.y) / state.rect.s });

function stampSegment(a, b) {
  const ctx = state.metalCtx;
  const bw = BRUSH.w * state.rect.s, bh = BRUSH.h * state.rect.s;
  const A = toScreen(a), B = toScreen(b);
  const dist = Math.hypot(B.x - A.x, B.y - A.y);
  const steps = Math.max(1, Math.round(dist)); // オリジナル同様 1px ごと
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ctx.drawImage(state.brush, A.x + (B.x - A.x) * t - bw / 2, A.y + (B.y - A.y) * t - bh / 2, bw, bh);
  }
}

function replayStrokes() {
  for (const s of state.strokes) {
    for (let i = 1; i < s.length; i++) stampSegment(s[i - 1], s[i]);
  }
}

let drawing = false;
async function newFortune({ withSound = true } = {}) {
  if (drawing) return;
  drawing = true;
  const n = 1 + Math.floor(Math.random() * FORTUNE_COUNT); // オリジナル同様、等確率
  const img = await loadImage(fortuneSrc(n));
  state.fortune = n;
  state.strokes = [];
  drawMetalLayer();          // 先に金属面で覆ってから
  drawFortuneLayer(img);     // 下のおみくじを差し替える
  metalCanvas.setAttribute('aria-label', 'Bunpuku おみくじ。画面をこするとおみくじが現れます。' + shakeHint());
  if (withSound) sound.coin();
  if (withSound && navigator.vibrate) navigator.vibrate(30);
  drawing = false;
}

function revealAll() {
  const ctx = state.metalCtx;
  ctx.fillRect(0, 0, metalCanvas.clientWidth, metalCanvas.clientHeight);
}

async function relayout() {
  if (!state.metal) return;
  drawMetalLayer();
  replayStrokes();
  drawFortuneLayer(await loadImage(fortuneSrc(state.fortune)));
  if (!$('back').hidden) drawAbout();
}

// ---------------------------------------------------------------- タッチ

let current = null; // 描画中のストローク
metalCanvas.addEventListener('pointerdown', (e) => {
  sound.unlock();
  metalCanvas.setPointerCapture(e.pointerId);
  const p = toDesign(e.offsetX, e.offsetY);
  current = [p];
  state.strokes.push(current);
});
metalCanvas.addEventListener('pointermove', (e) => {
  if (!current) return;
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (events.length ? events : [e])) {
    const p = toDesign(ev.offsetX, ev.offsetY);
    stampSegment(current[current.length - 1], p);
    current.push(p);
  }
  sound.scratch();
});
const endStroke = () => { current = null; };
metalCanvas.addEventListener('pointerup', (e) => { endStroke(); requestMotion(); });
metalCanvas.addEventListener('pointercancel', endStroke);
metalCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
// Safari のダブルタップ拡大などを抑止
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------------------------------------------------------------- シェイク

let motionState = 'unknown'; // unknown | granted | denied | unsupported
const shakeHint = () => motionState === 'granted' || motionState === 'unknown'
  ? '端末を振ると引き直します。' : '左下のボタンで引き直します。';

/** 振って引き直せない環境（http・PC・センサー拒否）では引き直しボタンを出す */
function updateAgainButton() {
  const noShake = !window.isSecureContext
    || matchMedia('(hover: hover) and (pointer: fine)').matches
    || motionState === 'denied' || motionState === 'unsupported';
  $('again').hidden = !noShake;
}
$('again').addEventListener('click', () => { sound.unlock().then(() => newFortune()); });

async function requestMotion() {
  if (motionState !== 'unknown') return;
  if (typeof DeviceMotionEvent === 'undefined' || !window.isSecureContext) {
    motionState = 'unsupported'; updateAgainButton(); return;
  }
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      motionState = (await DeviceMotionEvent.requestPermission()) === 'granted' ? 'granted' : 'denied';
    } catch { motionState = 'denied'; }
  } else {
    motionState = 'granted';
  }
  if (motionState === 'granted') window.addEventListener('devicemotion', onMotion);
  updateAgainButton();
}

let lastShake = 0, peaks = [];
function onMotion(e) {
  const a = e.acceleration && e.acceleration.x != null ? e.acceleration : null;
  let mag;
  if (a) {
    mag = Math.hypot(a.x, a.y, a.z);
  } else if (e.accelerationIncludingGravity) {
    const g = e.accelerationIncludingGravity;
    mag = Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81);
  } else return;
  const now = performance.now();
  if (mag > 13) {
    peaks = peaks.filter((t) => now - t < 600);
    peaks.push(now);
    if (peaks.length >= 2 && now - lastShake > 1200) {
      lastShake = now;
      peaks = [];
      newFortune();
    }
  }
}

// キーボード（デスクトップ用）：R で引き直し、Enter で全部めくる
document.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') { sound.unlock().then(() => newFortune()); }
  if (e.key === 'Enter' && document.activeElement === document.body) revealAll();
});

// ---------------------------------------------------------------- クレジット画面

function drawAbout() {
  loadImage('img/about.jpg').then((img) => {
    const { ctx, W, H, dpr } = prepareCanvas(aboutCanvas);
    drawLetterboxed(ctx, W, H, dpr, img, ABOUT_DESIGN, 'edge');
  });
}
$('info').addEventListener('click', () => {
  sound.unlock();
  $('back').hidden = false;
  drawAbout();
  $('card').classList.add('flipped');
  $('close').focus({ preventScroll: true });
});
const closeAbout = () => {
  $('card').classList.remove('flipped');
  $('info').focus({ preventScroll: true });
};
$('back').addEventListener('click', closeAbout);

// ---------------------------------------------------------------- ライフサイクル

// オリジナルは「開くたびに新しいおみくじ」だったので、復帰時に引き直す
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 1000) newFortune();
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(relayout, 80);
});

(async function init() {
  $('back').hidden = true;
  updateAgainButton();
  $('card').addEventListener('transitionend', () => {
    if (!$('card').classList.contains('flipped')) $('back').hidden = true;
  });
  [state.metal, state.brush] = await Promise.all([loadImage('img/scratch.jpg'), loadImage('img/brush.png')]);
  await newFortune({ withSound: false });
  // 残りを先読み
  for (let n = 1; n <= FORTUNE_COUNT; n++) loadImage(fortuneSrc(n)).catch(() => {});
  loadImage('img/about.jpg').catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
