// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 화면 분할, 영상 동기화, 미리보기·오버레이·타임라인 그리기
import type { Clip, VideoItem } from './types';
import { actx, audioOut, projDur } from './audio';
import { cv, cx, strip, sx } from './dom';
import { rotSize } from './itemTypes';
import { audioAt } from './songs';
import { S } from './state';
import { AUD_H, LANE_H, WAVE_H, activeIdx, nextItem, viewStart } from './timeline';
import { $, fmtShort, lowerBound, upperBound } from './util';

/* ---------- 화면 분할 레이아웃 ---------- */
export const LAYOUTS: Record<string, { name: string; r: number[][]; pip?: boolean }> = {
  '1':  { name: '1화면', r: [[0, 0, 1, 1]] },
  '2h': { name: '좌우 2분할', r: [[0, 0, .5, 1], [.5, 0, .5, 1]] },
  '2v': { name: '상하 2분할', r: [[0, 0, 1, .5], [0, .5, 1, .5]] },
  '3h': { name: '세로 3분할', r: [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]] },
  '3v': { name: '가로 3분할', r: [[0, 0, 1, 1 / 3], [0, 1 / 3, 1, 1 / 3], [0, 2 / 3, 1, 1 / 3]] },
  '3L': { name: '큰 화면 + 2', r: [[0, 0, 2 / 3, 1], [2 / 3, 0, 1 / 3, .5], [2 / 3, .5, 1 / 3, .5]] },
  '3T': { name: '위 1 + 아래 2', r: [[0, 0, 1, .5], [0, .5, .5, .5], [.5, .5, .5, .5]] },
  '4':  { name: '4분할', r: [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]] },
  'pip': { name: '화면 속 화면', r: [[0, 0, 1, 1], [.66, .06, .3, .3]], pip: true }
};
/** 화면 하나의 자리 (출력 캔버스 픽셀). pip: 화면 속 작은 화면, g: 틈 두께 */
export interface PanelRect { x: number; y: number; w: number; h: number; pip?: boolean; g?: number }
/** 클립 소리 연결 (연결에 실패하면 broken: 소리 조절만 무시) */
type ClipGain = { gain: { value: number; setTargetAtTime(v: number, t: number, c: number): unknown }; broken?: boolean; disconnect?(): void };
export type MediaVid = HTMLVideoElement & { _gain?: ClipGain; _src?: MediaElementAudioSourceNode };
/** 화면마다 마지막 프레임을 보관하는 캔버스 */
type PanelCanvas = HTMLCanvasElement & { _has: boolean };
export interface Panel { v: MediaVid | null; g: VideoItem | null }
/** 타임라인 글꼴 (style.css와 같게) */
const FONT = '"Pretendard Variable", Pretendard, "Segoe UI Variable Text", "Segoe UI", "Malgun Gothic", system-ui, sans-serif';
/** 화면 색 (style.css의 :root와 맞춤) */
export const TH = { acc: '#14b8a6', accRgb: '20,184,166', bg: '#0d0e12', lane: '#0f1014', laneSel: '#131d20', line: '#1e2128', wave: '#2d4a52', tick: '#596072', missing: '#3a2326', beat: '#f5c451', beatRgb: '245,196,81' };
/** 타임라인 조각의 '클립 소리 켬' 표시 (작은 스피커 그림) */
function speaker(x: number, cy: number, s: number) {
  sx.save(); sx.fillStyle = 'rgba(255,255,255,.85)'; sx.strokeStyle = 'rgba(255,255,255,.85)'; sx.lineWidth = Math.max(1, s * 0.12); sx.lineCap = 'round';
  sx.beginPath(); sx.moveTo(x, cy - s * 0.18); sx.lineTo(x + s * 0.22, cy - s * 0.18); sx.lineTo(x + s * 0.5, cy - s * 0.42); sx.lineTo(x + s * 0.5, cy + s * 0.42); sx.lineTo(x + s * 0.22, cy + s * 0.18); sx.lineTo(x, cy + s * 0.18); sx.closePath(); sx.fill();
  sx.beginPath(); sx.arc(x + s * 0.55, cy, s * 0.3, -0.9, 0.9); sx.stroke();
  sx.restore();
}
export const panelCount = () => (LAYOUTS[S.set.layout] || LAYOUTS['1']).r.length;
export function layoutRects(): PanelRect[] {
  const L = LAYOUTS[S.set.layout] || LAYOUTS['1'], W = cv.width, H = cv.height;
  const g = L.r.length > 1 ? Math.max(0, +S.set.gap || 0) * (Math.min(W, H) / 1080) : 0;
  return L.r.map(([x, y, w, h], k) => {
    if (L.pip && k > 0) return { x: x * W, y: y * H, w: w * W, h: h * H, pip: true, g };
    const l = x > 0 ? g / 2 : 0, r = x + w < 0.999 ? g / 2 : 0, t = y > 0 ? g / 2 : 0, b = y + h < 0.999 ? g / 2 : 0;
    return { x: x * W + l, y: y * H + t, w: w * W - l - r, h: h * H - t - b };
  });
}

/* 화면마다 video 요소를 몇 개만 돌려 씀 (지금 조각·다음 조각).
   예전에는 클립 × 화면마다 하나씩 계속 늘어나 메모리를 많이 썼음 → 화면당 최대 POOL_PER_PANEL개, 오래 안 쓴 것부터 정리 */
const POOL_PER_PANEL = 2;
interface PoolVid { k: number; c: Clip; v: MediaVid; used: number }
const pool: PoolVid[] = [];
let useTick = 0;
export function getVid(c: Clip, k: number) {
  let e = pool.find(x => x.k === k && x.c === c);
  if (!e) {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.loop = true; v.src = c.url;
    $('#vids').appendChild(v);
    e = { k, c, v, used: 0 }; pool.push(e);
    const mine = pool.filter(x => x.k === k);
    if (mine.length > POOL_PER_PANEL) releaseVid(mine.reduce((a, b) => (a.used <= b.used ? a : b)));
  }
  e.used = ++useTick;
  return e.v;
}
/** video 요소를 완전히 정리 (디코더·버퍼·소리 연결 해제) */
function releaseVid(e: PoolVid) {
  const i = pool.indexOf(e); if (i >= 0) pool.splice(i, 1);
  const v = e.v;
  try { v.pause(); } catch (err) {}
  if (v._gain && !v._gain.broken) { try { v._src?.disconnect(); v._gain.disconnect?.(); } catch (err) {} }
  v.removeAttribute('src'); try { v.load(); } catch (err) {}
  v.remove();
}
/** 클립을 지우거나 화면 수가 줄면 해당 video 정리 */
export function releaseVids(fn: (c: Clip, k: number) => boolean) { for (const e of pool.slice()) if (fn(e.c, e.k)) releaseVid(e); }
export const allVids = () => pool.map(e => e.v);
export const poolSize = () => pool.length;
export function wantTime(g: VideoItem, t: number) {
  const c = g.src!, rate = g.rate || 1;
  let want = g.off + Math.max(0, t - g.start) * rate;
  if (want >= c.dur - 0.02) want = want % Math.max(0.1, c.dur);   // 조각이 원본보다 길면 반복
  return want;
}
export function driveVid(v: HTMLVideoElement, rate: number, want: number) {
  if (v.playbackRate !== rate) v.playbackRate = rate;
  if (S.playing) {
    if (v.paused) v.play().catch(() => {});
    if (!v.seeking && Math.abs(v.currentTime - want) > 0.3 * Math.max(1, rate)) v.currentTime = want;
  } else {
    if (!v.paused) v.pause();
    if (!v.seeking && Math.abs(v.currentTime - want) > 0.08) v.currentTime = want;
  }
}
export function syncAll(t: number): Panel[] {
  const active = new Set<HTMLVideoElement>(), out: Panel[] = [], shared: { c: Clip; rate: number; want: number; v: MediaVid; vol: number }[] = [];
  for (let k = 0; k < panelCount(); k++) {
    const tr = S.tracks[k] || [];
    const i = activeIdx(tr, t), g = i >= 0 ? tr[i] : null;
    let v: MediaVid | null = null;
    if (g && g.src && g.src.dur) {
      const c = g.src;
      const rate = g.rate || 1, want = wantTime(g, t);
      // 같은 클립·같은 지점이면 video 하나를 같이 씀 → 화면끼리 완전히 같은 프레임
      const dup = shared.find(s => s.c === c && s.rate === rate && Math.abs(s.want - want) < 0.05);
      if (dup) { v = dup.v; dup.vol = Math.max(dup.vol, g.vol || 0); }
      else { const nv = getVid(c, k); v = nv; active.add(nv); driveVid(nv, rate, want); shared.push({ c, rate, want, v: nv, vol: g.vol || 0 }); }
    }
    out.push({ v, g });
    const nx = nextItem(tr, t);
    if (nx && nx.src && nx.src.dur && nx.start - t < 1.5) {
      const nv = getVid(nx.src, k);
      if (nv !== v && !active.has(nv)) {
        active.add(nv);
        if (!nv.paused) nv.pause();
        if (!nv.seeking && Math.abs(nv.currentTime - nx.off) > 0.05) nv.currentTime = nx.off;
      }
    }
  }
  for (const v of allVids()) if (!active.has(v) && !v.paused) v.pause();
  if (pool.some(e => e.k >= panelCount())) releaseVids((_, k) => k >= panelCount());
  // 클립 소리: 지금 화면에 나오는 조각만 볼륨대로, 나머지는 0
  const vols = new Map<HTMLVideoElement, number>(); for (const sh of shared) vols.set(sh.v, Math.max(vols.get(sh.v) || 0, sh.vol));
  for (const v of allVids()) setClipGain(v, S.playing ? (vols.get(v) || 0) : 0);
  return out;
}
/* 영상 소리를 WebAudio로 연결 → 스피커와 내보내기 녹음 둘 다로 감 (필요할 때 한 번만 연결) */
export function setClipGain(v: MediaVid, vol: number) {
  if (!actx) return;   // 소리 연결은 오디오가 시작된 뒤에만
  if (!v._gain) {
    if (vol <= 0) return;
    try { const src = actx.createMediaElementSource(v), gn = actx.createGain(); gn.gain.value = 0; src.connect(gn); gn.connect(actx.destination); gn.connect(audioOut().exportDest); v._src = src; v._gain = gn; v.muted = false; }
    catch (e) { v._gain = { gain: { value: 0, setTargetAtTime() {} }, broken: true }; return; }
  }
  if (Math.abs(v._gain.gain.value - vol) > 0.001) v._gain.gain.setTargetAtTime(vol, actx.currentTime, 0.015);
}

/* ---------- 그리기 ---------- */
// 화면마다 마지막 프레임 보관 → 탐색/로딩 중에도 검은 화면 대신 직전 프레임
export const panelCaches: PanelCanvas[] = [];
export function panelCache(k: number, w: number, h: number) {
  let c = panelCaches[k];
  if (!c) { c = panelCaches[k] = Object.assign(document.createElement('canvas'), { _has: false }); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; c._has = false; }
  return c;
}
export function drawPanel(p: Panel, r: PanelRect, k: number) {
  const { v, g } = p, ok = v && v.readyState >= 2 && v.videoWidth && !v.seeking;
  drawPanelImg(g, ok ? v : null, ok ? v.videoWidth : 0, ok ? v.videoHeight : 0, r, k);
}
/** 화면 하나 그리기. img가 null이면 직전 프레임 유지 (조각이 없으면 검은 화면) */
export function drawPanelImg(g: VideoItem | null, img: CanvasImageSource | null, vw: number, vh: number, r: PanelRect, k: number) {
  const w = Math.max(1, Math.round(r.w)), h = Math.max(1, Math.round(r.h));
  const pc = panelCache(k, w, h), pcx = pc.getContext('2d')!;
  if (!g) pc._has = false;                      // 빈 구간은 검은 화면
  else if (img && vw && vh) {
    const [bw, bh] = rotSize(g, vw, vh);   // 돌린 뒤 크기로 화면 채우기 계산
    const s = (S.set.fit === 'contain' ? Math.min(w / bw, h / bh) : Math.max(w / bw, h / bh)) * (g.zoom || 1);
    const dw = vw * s, dh = vh * s;
    pcx.setTransform(1, 0, 0, 1, 0, 0);
    pcx.fillStyle = '#000'; pcx.fillRect(0, 0, w, h);
    pcx.translate(w / 2 + (g.x || 0) * w, h / 2 + (g.y || 0) * h);
    const ang = (g.rot || 0) + (g.tilt || 0);
    if (ang) pcx.rotate(ang * Math.PI / 180);   // 시계 방향. 기울여서 생긴 귀퉁이는 위에서 칠한 검은색
    if (g.flip) pcx.scale(-1, 1);
    pcx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    pcx.setTransform(1, 0, 0, 1, 0, 0);
    pc._has = true;
  }
  const gp = r.g || 0;
  if (r.pip && gp > 0) { cx.fillStyle = S.set.gapColor; cx.fillRect(r.x - gp, r.y - gp, r.w + gp * 2, r.h + gp * 2); }
  if (pc._has) cx.drawImage(pc, r.x, r.y, r.w, r.h);
  else { cx.fillStyle = '#000'; cx.fillRect(r.x, r.y, r.w, r.h); }
}
export function drawFrame(t: number) {
  const W = cv.width, H = cv.height, rects = layoutRects(), ps = syncAll(t);
  cx.fillStyle = S.set.gapColor; cx.fillRect(0, 0, W, H);
  rects.forEach((r, k) => drawPanel(ps[k], r, k));
  if (!S.exporting && rects.length > 1) {
    const r = rects[S.track];
    if (r) { cx.save(); cx.strokeStyle = `rgba(${TH.accRgb},.9)`; cx.lineWidth = Math.max(2, W / 640); cx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4); cx.restore(); }
  }
}
export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { r = Math.min(r, h / 2, w / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
export function shapePath(x: number, y: number, size: number) {
  const sh = S.set.shape; cx.beginPath();
  if (sh === 'circle') cx.arc(x, y, size * 0.3, 0, Math.PI * 2);
  else if (sh === 'diamond') { const r = size * 0.36; cx.moveTo(x, y - r); cx.lineTo(x + r, y); cx.lineTo(x, y + r); cx.lineTo(x - r, y); cx.closePath(); }
  else { const w = Math.max(3, size * 0.16), h = size * 0.72; rr(cx, x - w / 2, y - h / 2, w, h, w / 2); }
}
export function drawOverlay(t: number) {
  const st = S.set; if (!st.showOverlay) return;
  const W = cv.width, H = cv.height, B = S.beats;
  const bh = Math.round(Math.min(W, H) * st.barSize * (W >= H ? 1 : 0.75));
  const margin = Math.round(H * 0.04);
  const y = st.pos === 'bottom' ? H - bh - margin : margin, cyy = y + bh / 2;
  const x0 = W * 0.04, x1 = W * 0.96;
  cx.save();
  cx.globalAlpha = st.barAlpha; cx.fillStyle = st.barColor; rr(cx, x0, y, x1 - x0, bh, bh / 2); cx.fill();
  cx.globalAlpha = 1;
  const j0 = upperBound(B, t);
  const dt = j0 > 0 ? t - B[j0 - 1] : 99;
  const flash = dt < 0.16 ? 1 - dt / 0.16 : 0;
  const tx = st.mode === 'single' ? x0 + bh * 0.9 : W / 2;
  cx.fillStyle = st.beatColor;
  for (let j = j0; j < B.length && B[j] <= t + st.window; j++) {
    const f = (B[j] - t) / st.window;
    cx.globalAlpha = Math.min(1, (1 - f) * 5);
    if (st.mode === 'single') { shapePath(tx + f * (x1 - bh * 0.6 - tx), cyy, bh); cx.fill(); }
    else { const d = f * (W / 2 - x0 - bh * 0.6); shapePath(tx - d, cyy, bh); cx.fill(); shapePath(tx + d, cyy, bh); cx.fill(); }
  }
  cx.globalAlpha = 1;
  const sc = 1 + flash * 0.4;
  if (flash > 0) {
    cx.globalAlpha = flash; cx.fillStyle = st.flashColor;
    cx.beginPath(); cx.arc(tx, cyy, bh * 0.55 * sc, 0, Math.PI * 2); cx.fill();
    cx.globalAlpha = 1;
  }
  cx.strokeStyle = st.targetColor; cx.lineWidth = Math.max(2, bh * 0.08);
  cx.beginPath(); cx.arc(tx, cyy, bh * 0.38 * sc, 0, Math.PI * 2); cx.stroke();
  if (st.showCounter && B.length) {
    const left = B.length - j0;
    cx.font = `700 ${Math.round(bh * 0.42)}px system-ui,sans-serif`;
    cx.textAlign = 'right'; cx.textBaseline = 'middle';
    cx.fillStyle = '#fff'; cx.globalAlpha = 0.9;
    cx.fillText(String(left), x1 - bh * 0.4, st.pos === 'bottom' ? y - bh * 0.4 : y + bh * 1.4);
  }
  cx.restore();
}
export function drawStrip(t: number) {
  const W = strip.width, H = strip.height, span = S.zoom, a = viewStart(t), px = W / span, dpr = devicePixelRatio;
  const WH = WAVE_H(), LH = LANE_H(), AH = AUD_H(), n = panelCount();
  sx.fillStyle = TH.bg; sx.fillRect(0, 0, W, H);
  const m = S.music;
  if (S.audio.length) {
    sx.fillStyle = TH.wave; const mid = WH / 2;
    for (let x = 0; x < W; x++) {
      const t = a + x / px, g = audioAt(t); if (!g || !g.src || !g.src.peaks) continue;
      const i = Math.floor((g.off + t - g.start) * g.src.pps); if (i < 0 || i >= g.src.peaks.length) continue;
      const p = g.src.peaks[i] * Math.min(1, g.vol == null ? 1 : g.vol) * mid * 0.85; sx.fillRect(x, mid - p, 1, p * 2 || 1);
    }
  }
  // 초 눈금
  sx.fillStyle = TH.tick; sx.font = `${Math.round(10 * dpr)}px ${FONT}`; sx.textBaseline = 'top';
  const stepS = span > 240 ? 30 : span > 90 ? 10 : span > 30 ? 5 : 1;
  for (let s = Math.ceil(a / stepS) * stepS; s < a + span; s += stepS) { if (s < 0) continue; const x = (s - a) * px; sx.fillRect(x, WH - 6 * dpr, 1, 6 * dpr); sx.fillText(fmtShort(s), x + 3, 3); }
  // 비트
  const j0 = lowerBound(S.beats, a);
  for (let j = j0; j < S.beats.length && S.beats[j] <= a + span; j++) {
    const x = (S.beats[j] - a) * px;
    sx.fillStyle = TH.beat; sx.fillRect(x - 1, WH * 0.16, 2 * dpr, WH * 0.7);
    sx.fillStyle = `rgba(${TH.beatRgb},.10)`; sx.fillRect(x, WH, 1, H - WH);
  }
  const ra = +$('#rA').value, rb = +$('#rB').value;
  if (rb > ra) { sx.fillStyle = `rgba(${TH.accRgb},.09)`; sx.fillRect((ra - a) * px, 0, (rb - ra) * px, WH); }
  if ($('#grabBox').style.display !== 'none') { const gs = +$('#grabStart').value || 0, gl = (+$('#grabLen').value) / 1000; sx.fillStyle = 'rgba(62,207,142,.35)'; sx.fillRect((gs - a) * px, 0, Math.max(2, gl * px), WH); sx.fillStyle = '#3ecf8e'; sx.fillRect((gs - a) * px, 0, 2 * dpr, WH); }
  if (S.musicStart > a) { sx.fillStyle = 'rgba(0,0,0,.45)'; sx.fillRect(0, 0, (S.musicStart - a) * px, WH); }
  if (m.dur && m.dur < a + span) { sx.fillStyle = 'rgba(0,0,0,.55)'; sx.fillRect((m.dur - a) * px, 0, W, H); }
  // 선택 표시: 기준 조각은 흰 테두리, 같이 고른 조각은 강조색 테두리
  const multi = S.selItems.length > 1 && !!S.selItem && S.selItems.includes(S.selItem);
  const selOf = (g: object) => (g === S.selItem ? 2 : multi && S.selItems.includes(g as never) ? 1 : 0);
  const outline = (x: number, y: number, w: number, h: number, s: number) => { sx.strokeStyle = s === 2 ? '#fff' : TH.acc; sx.lineWidth = 2 * dpr; sx.strokeRect(x, y, w, h); };
  // 음악 트랙
  sx.textBaseline = 'middle';
  sx.fillStyle = '#0a0b0f'; sx.fillRect(0, WH, W, AH); sx.fillStyle = '#24272f'; sx.fillRect(0, WH, W, 1);
  for (const g of S.audio) {
    const xa = (g.start - a) * px, xb = ((g.end == null ? g.start : g.end) - a) * px;
    if (xb < 0 || xa > W) continue;
    const sel = selOf(g);
    sx.fillStyle = g.src ? `hsl(${g.src.hue},36%,${sel ? 40 : 24}%)` : TH.missing;
    sx.fillRect(xa + 1, WH + 3, Math.max(2, xb - xa - 2), AH - 6);
    if (xb - xa > 14) { sx.fillStyle = 'rgba(255,255,255,.3)'; sx.fillRect(xa + 1, WH + 3, 3 * dpr, AH - 6); sx.fillRect(xb - 1 - 3 * dpr, WH + 3, 3 * dpr, AH - 6); }
    if (sel) outline(xa + 1, WH + 3, Math.max(2, xb - xa - 2), AH - 6, sel);
    if (xb - xa > 50) { sx.save(); sx.beginPath(); sx.rect(xa + 6 * dpr, WH, xb - xa - 12 * dpr, AH); sx.clip(); sx.fillStyle = '#fff'; sx.font = `600 ${Math.round(10.5 * dpr)}px ${FONT}`; sx.fillText(`${g.src ? g.src.name : g.srcName + ' (없음)'}${g.vol != null && g.vol !== 1 ? ' · ' + Math.round(g.vol * 100) + '%' : ''}`, Math.max(xa, 0) + 8 * dpr, WH + AH / 2); sx.restore(); }
  }
  // 화면별 트랙
  for (let k = 0; k < n; k++) {
    const y0 = WH + AH + k * LH, tr = S.tracks[k] || [];
    sx.fillStyle = k === S.track ? TH.laneSel : TH.lane; sx.fillRect(0, y0, W, LH);
    sx.fillStyle = TH.line; sx.fillRect(0, y0, W, 1);
    for (const g of tr) {
      const xa = (g.start - a) * px, xb = (g.end - a) * px;
      if (xb < 0 || xa > W) continue;
      const sel = selOf(g);
      sx.fillStyle = g.src ? `hsl(${g.src.hue},40%,${sel ? 48 : 32}%)` : TH.missing;
      sx.fillRect(xa + 1, y0 + 3, Math.max(2, xb - xa - 2), LH - 6);
      if (xb - xa > 14) { sx.fillStyle = 'rgba(255,255,255,.35)'; sx.fillRect(xa + 1, y0 + 3, 3 * dpr, LH - 6); sx.fillRect(xb - 1 - 3 * dpr, y0 + 3, 3 * dpr, LH - 6); }
      if (sel) outline(xa + 1, y0 + 3, Math.max(2, xb - xa - 2), LH - 6, sel);
      if (xb - xa > 50) {
        sx.save(); sx.beginPath(); sx.rect(xa + 6 * dpr, y0, xb - xa - 12 * dpr, LH); sx.clip();
        sx.fillStyle = '#fff'; sx.font = `600 ${Math.round(11 * dpr)}px ${FONT}`;
        const ci = g.src ? S.clips.indexOf(g.src) + 1 : '?', tx = Math.max(xa, n > 1 ? 18 * dpr : 0) + 8 * dpr;   // 화면 번호 칸 피하기
        const label = `#${ci} ${g.src ? g.src.name : g.srcName + ' (없음)'}${g.rate && g.rate !== 1 ? ' · ' + g.rate + 'x' : ''}`;
        sx.fillText(label, tx, y0 + LH / 2);
        if (g.vol > 0) speaker(tx + sx.measureText(label).width + 6 * dpr, y0 + LH / 2, 11 * dpr);
        sx.restore();
      }
    }
    if (n > 1) { sx.fillStyle = k === S.track ? TH.acc : '#2e323c'; sx.fillRect(0, y0 + 3, 16 * dpr, LH - 6); sx.fillStyle = '#fff'; sx.font = `700 ${Math.round(11 * dpr)}px ${FONT}`; sx.fillText(String(k + 1), 4 * dpr, y0 + LH / 2); }
  }
  // 영상 끝 표시 (끌어서 길이 조절)
  const pd = projDur();
  if (pd > 0 && pd >= a && pd <= a + span) { const ex = (pd - a) * px; sx.fillStyle = S.set.durMode === 'manual' ? TH.acc : '#8b91a1'; sx.fillRect(ex - 1, 0, 3 * dpr, H); sx.font = `700 ${Math.round(10 * dpr)}px ${FONT}`; sx.textBaseline = 'top'; sx.fillText('끝', ex - 16 * dpr, 2 * dpr); }
  sx.fillStyle = '#f1f3f6'; sx.fillRect((t - a) * px - 1, 0, 2 * dpr, H);
  if (TL_BOX.r) { const [bx, by, bw, bh] = TL_BOX.r; sx.fillStyle = `rgba(${TH.accRgb},.12)`; sx.fillRect(bx, by, bw, bh); sx.strokeStyle = TH.acc; sx.lineWidth = 1 * dpr; sx.strokeRect(bx + .5, by + .5, bw, bh); }
}
/** 타임라인에서 끌고 있는 선택 사각형 [x, y, w, h] (캔버스 픽셀) */
export const TL_BOX: { r: number[] | null } = { r: null };
export function resizeStrip() { const r = strip.getBoundingClientRect(); strip.width = Math.max(100, Math.round(r.width * devicePixelRatio)); strip.height = Math.round(r.height * devicePixelRatio); }
