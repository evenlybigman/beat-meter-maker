// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 타임라인·미리보기 마우스 조작
import { afterEdit, record, redo, undo } from './history';
import { ITEM_TYPES } from './itemTypes';
import { now, projDur, seek, setDuration, updateDurUI } from './audio';
import { R, addBeat, hit, nearestBeat, removeBeatAt, setA, setB, startRec, stopRec, tap } from './beats';
import { cv, strip } from './dom';
import { randomFill } from './fill';
import { togglePlay } from './player';
import { layoutRects, panelCount, type PanelRect } from './render';
import type { Item, VideoItem } from './types';
import { S } from './state';
import { AUD_H, LANE_H, WAVE_H, activeIdx, listOf, addItemAt, addSelectedClip, allItems, appendSelectedClip, delItem, dupItem, prependSelectedClip, refreshItemEditor, renderTrackBtns, selectItem, selectTrack, sortTrack, splitAt, tlSnap, trackOf, updateSegInfo, viewStart } from './timeline';
import { $, lowerBound, toast } from './util';

// 편집기 마우스: 위쪽(파형) = 비트, 아래쪽(트랙) = 영상 조각
type Lane = number | 'a';   // -1 = 파형, 'a' = 음악 줄, 0~ = 화면 트랙
type ItemMode = 'move' | 'trimL' | 'trimR';
/** 편집기에서 누르고 있는 동작: 영상 길이 끌기 / 조각 옮기기·길이 조절 / 재생 위치 끌기 */
type StripDrag =
  | { type: 'dur' }
  | { type: 'item'; g: Item; mode: ItemMode; x: number; lane: Lane; moved: boolean; orig: { start: number; end: number; off: number }; pts: number[] }
  | { type: 'scrub'; x: number; t0: number; drag: boolean; lane: Lane };
export let sDown: StripDrag | null = null;
export function stripHit(e: MouseEvent) {
  const r = strip.getBoundingClientRect(), dpr = devicePixelRatio;
  const x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
  const a = viewStart(now()), t = a + x / strip.width * S.zoom;
  let lane: Lane = -1;
  if (y >= WAVE_H() + AUD_H()) lane = Math.min(panelCount() - 1, Math.floor((y - WAVE_H() - AUD_H()) / LANE_H()));
  else if (y >= WAVE_H()) lane = 'a';
  return { x, y, t, lane };
}
export function itemAt(lane: Lane, x: number): { g: Item; mode: ItemMode } | null {
  const tr: Item[] = lane === 'a' ? S.audio : S.tracks[lane]; if (!tr) return null;
  const a = viewStart(now()), px = strip.width / S.zoom, edge = 8 * devicePixelRatio;
  for (let i = tr.length - 1; i >= 0; i--) {
    const g = tr[i], xa = (g.start - a) * px, xb = ((g.end == null ? g.start : g.end) - a) * px;
    if (x >= xa - 2 && x <= xb + 2) {
      let mode: ItemMode = 'move';
      if (xb - xa > edge * 2.5) { if (x - xa < edge) mode = 'trimL'; else if (xb - x < edge) mode = 'trimR'; }
      return { g, mode };
    }
  }
  return null;
}
export function snapPoints(except: Item | null) {
  const pts = [0, now()];
  if (S.music.dur) pts.push(S.music.dur);
  if ($('#tlSnap').checked) { for (const b of S.beats) pts.push(b); for (const g of [...allItems(), ...S.audio]) if (g !== except && g.end != null) pts.push(g.start, g.end); }
  return pts.sort((x, y) => x - y);
}
export function snapTo(v: number, pts: number[], tol: number) { const i = lowerBound(pts, v); let best = v, bd = tol; for (const j of [i - 1, i]) if (j >= 0 && j < pts.length && Math.abs(pts[j] - v) < bd) { bd = Math.abs(pts[j] - v); best = pts[j]; } return best; }
export const nearEnd = (h: { x: number }) => { const pd = projDur(); return pd > 0 && Math.abs(h.x - (pd - viewStart(now())) * strip.width / S.zoom) < 6 * devicePixelRatio; };
strip.addEventListener('mousedown', e => {
  const h = stripHit(e);
  if (nearEnd(h)) { record('영상 길이 끌기'); sDown = { type: 'dur' }; return; }
  if (h.lane !== -1) {
    const it = itemAt(h.lane, h.x);
    if (it) {
      selectItem(it.g, true);
      sDown = { type: 'item', g: it.g, mode: it.mode, x: e.clientX, lane: h.lane, moved: false, orig: { start: it.g.start, end: it.g.end, off: it.g.off }, pts: snapPoints(it.g) };
      return;
    }
    if (h.lane !== 'a') selectTrack(h.lane as number);
  }
  sDown = { type: 'scrub', x: e.clientX, t0: now(), drag: false, lane: h.lane };
});
window.addEventListener('mousemove', e => {
  if (!sDown) {
    if (e.target === strip) { const h = stripHit(e); if (nearEnd(h)) { strip.style.cursor = 'col-resize'; return; } const it = h.lane !== -1 ? itemAt(h.lane, h.x) : null; strip.style.cursor = it ? (it.mode === 'move' ? 'grab' : 'ew-resize') : (h.lane !== -1 ? 'default' : 'crosshair'); }
    return;
  }
  if (sDown.type === 'dur') { setDuration(Math.max(1, stripHit(e).t)); return; }
  const dpr = devicePixelRatio, px = strip.width / S.zoom, dpx = (e.clientX - sDown.x) * dpr;
  if (sDown.type === 'scrub') {
    if (Math.abs(dpx) > 4 * dpr) sDown.drag = true;
    if (sDown.drag) seek(sDown.t0 - dpx / px);
    return;
  }
  const d = sDown, g = d.g, o = d.orig, h = stripHit(e);
  if (!d.moved) { if (Math.abs(dpx) < 3 * dpr && h.lane === d.lane) return; record(d.mode === 'move' ? `${ITEM_TYPES[g.kind].label} 조각 옮기기` : `${ITEM_TYPES[g.kind].label} 조각 길이 조절`); d.moved = true; strip.style.cursor = d.mode === 'move' ? 'grabbing' : 'ew-resize'; }
  const dt = dpx / px, tol = 8 * dpr / px;
  if (d.mode === 'move') {
    const len = o.end - o.start; let ns = o.start + dt;
    const s1 = snapTo(ns, d.pts, tol), s2 = snapTo(ns + len, d.pts, tol) - len;
    if (s1 !== ns && (s2 === ns || Math.abs(s1 - ns) <= Math.abs(s2 - ns))) ns = s1; else if (s2 !== ns) ns = s2;
    ns = Math.max(0, ns); g.start = ns; g.end = ns + len;
    if (g.kind === 'video' && typeof h.lane === 'number' && h.lane >= 0 && h.lane !== trackOf(g)) {   // 영상 조각만 다른 화면 트랙으로 옮길 수 있음
      const from = S.tracks[trackOf(g)]; from.splice(from.indexOf(g), 1);
      S.tracks[h.lane].push(g); S.track = h.lane; renderTrackBtns();
    }
  } else if (d.mode === 'trimL') {
    let ns = snapTo(o.start + dt, d.pts, tol);
    const minS = o.start - o.off / (g.rate || 1);   // 원본 영상 맨 앞까지만
    ns = Math.max(0, minS, Math.min(o.end - 0.1, ns));
    g.start = ns; g.off = o.off + (ns - o.start) * (g.rate || 1);
  } else {
    let ne = snapTo(o.end + dt, d.pts, tol);
    g.end = Math.min(Math.max(g.start + 0.1, ne), ITEM_TYPES[g.kind].maxEnd(g));   // 종류별 한계 (음악은 원본 끝까지)
  }
  sortTrack(listOf(g)); updateDurUI();
  refreshItemEditor(); updateSegInfo();
});
window.addEventListener('mouseup', e => {
  if (!sDown) return;
  const d = sDown; sDown = null;
  if (d.type === 'dur') { afterEdit(); return; }
  if (d.type === 'item') { strip.style.cursor = 'grab'; if (d.moved) afterEdit(); return; }
  if (d.drag || !S.music.dur) return;
  const r = strip.getBoundingClientRect();
  const h = stripHit(e);
  if (h.lane !== -1) { if (S.selItem) selectItem(null); return; }   // 빈 트랙 클릭 = 선택 해제
  const nb = nearestBeat(h.t);
  const pxDist = nb.d / S.zoom * r.width;
  if (nb.i >= 0 && pxDist < 7) removeBeatAt(nb.i); else addBeat(h.t, true);
});
strip.addEventListener('dblclick', e => {
  const h = stripHit(e); if (typeof h.lane !== 'number' || h.lane < 0 || itemAt(h.lane, h.x)) return;
  const c = S.selClip || S.clips.find(x => x.dur > 0); if (!c) return toast('먼저 클립을 불러와 주세요');
  addItemAt(c, h.lane, tlSnap(h.t));
});
strip.addEventListener('dragover', e => { const dt = e.dataTransfer; if (dt && [...dt.types].includes('text/clip')) { e.preventDefault(); dt.dropEffect = 'copy'; } });
strip.addEventListener('drop', e => {
  const idx = e.dataTransfer ? e.dataTransfer.getData('text/clip') : ''; if (idx === '') return;
  e.preventDefault(); e.stopPropagation();
  const c = S.clips[+idx], h = stripHit(e);
  addItemAt(c, typeof h.lane === 'number' && h.lane >= 0 ? h.lane : S.track, tlSnap(h.t));
});
strip.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) zoomBy(e.deltaY > 0 ? 1.15 : 1 / 1.15);
  else seek(now() + (e.deltaY + e.deltaX) / 400 * S.zoom * 0.25);
}, { passive: false });
export function zoomBy(f: number) { S.zoom = Math.max(1, Math.min(Math.max(60, (S.music.dur || 0) * 1.02), S.zoom * f)); }

// 미리보기 화면: 화면 클릭 = 그 화면 선택, 끌기 = 영상 위치 이동, 휠 = 확대/축소
/** 미리보기에서 끌고 있는 조각 (화면 안 위치 옮기기) */
export let vDown: { g: VideoItem; q: PanelRect; x: number; y: number; ox: number; oy: number; moved: boolean } | null = null;
export function panelAt(e: MouseEvent) {
  const r = cv.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * cv.width, py = (e.clientY - r.top) / r.height * cv.height;
  const rects = layoutRects();
  for (let k = rects.length - 1; k >= 0; k--) { const q = rects[k]; if (px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h) return { k, q, px, py }; }
  return null;
}
cv.addEventListener('mousedown', e => {
  const p = panelAt(e); if (!p) return;
  selectTrack(p.k);
  const tr = S.tracks[p.k] || [], i = activeIdx(tr, now());
  if (i < 0) return;
  selectItem(tr[i], true);
  vDown = { g: tr[i], q: p.q, x: p.px, y: p.py, ox: tr[i].x || 0, oy: tr[i].y || 0, moved: false };
  e.preventDefault();
});
window.addEventListener('mousemove', e => {
  if (!vDown) return;
  const r = cv.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * cv.width, py = (e.clientY - r.top) / r.height * cv.height;
  if (!vDown.moved) { if (Math.hypot(px - vDown.x, py - vDown.y) < 4) return; record('화면 안 위치 옮기기'); vDown.moved = true; cv.style.cursor = 'grabbing'; }
  const g = vDown.g;
  g.x = Math.max(-1, Math.min(1, vDown.ox + (px - vDown.x) / vDown.q.w));
  g.y = Math.max(-1, Math.min(1, vDown.oy + (py - vDown.y) / vDown.q.h));
  refreshItemEditor();
});
window.addEventListener('mouseup', () => { if (vDown) { if (vDown.moved) afterEdit(false); vDown = null; cv.style.cursor = ''; } });
cv.addEventListener('wheel', e => {
  const p = panelAt(e); if (!p) return;
  const tr = S.tracks[p.k] || [], i = activeIdx(tr, now()); if (i < 0) return;
  e.preventDefault();
  const g = tr[i]; selectTrack(p.k); if (S.selItem !== g) selectItem(g, true);
  g.zoom = Math.max(0.3, Math.min(5, (g.zoom || 1) * (e.deltaY < 0 ? 1.06 : 1 / 1.06)));
  refreshItemEditor();
}, { passive: false });

window.addEventListener('keydown', e => {
  if (S.exporting) return;
  const tgt = e.target as HTMLInputElement;
  const tag = (tgt.tagName || '').toLowerCase();
  if (tag === 'input' && !['range', 'checkbox', 'color'].includes(tgt.type) || tag === 'select' || tag === 'textarea') return;
  const k = e.key.toLowerCase();
  if (e.repeat && (k === 'b' || k === 'r')) return;
  if (e.code === 'Space') { e.preventDefault(); R.on ? stopRec() : togglePlay(); }
  else if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) { e.preventDefault(); if (!R.on) (e.shiftKey || k === 'y' ? redo() : undo()); }
  else if (k === 'b') { hit(); }
  else if (k === 'r') { R.on ? stopRec() : startRec(); }
  else if (k === 'escape') { stopRec(); }
  else if (k === 'c' && !e.ctrlKey && !e.metaKey) { splitAt(now()); }
  else if (k === 'a' && !e.ctrlKey && !e.metaKey) { addSelectedClip(); }
  else if (k === 'e' && !e.ctrlKey && !e.metaKey) { appendSelectedClip(); }
  else if (k === 'q' && !e.ctrlKey && !e.metaKey) { prependSelectedClip(); }
  else if (k === 'f' && !e.ctrlKey && !e.metaKey) { randomFill(); }
  else if (k === 'd' && !e.ctrlKey && !e.metaKey) { dupItem(); }
  else if (k === '[') { setA(); }
  else if (k === ']') { setB(); }
  else if (k === 't') tap();
  else if (k === 'delete' || k === 'backspace') { if (!delItem()) { const nb = nearestBeat(now()); if (nb.i >= 0 && nb.d < 0.25) removeBeatAt(nb.i); } }
  else if (k === 'arrowleft') { e.preventDefault(); seek(now() - (e.shiftKey ? 5 : 1)); }
  else if (k === 'arrowright') { e.preventDefault(); seek(now() + (e.shiftKey ? 5 : 1)); }
});
