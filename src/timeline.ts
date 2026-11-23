// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 타임라인 모델과 조각 편집 (추가·자르기·복제·삭제·선택)
import type { Clip, Item, VideoItem } from './types';
import { limitDur, now, seek, updateDurUI } from './audio';
import { nearestBeat } from './beats';
import { commit } from './history';
import { ITEM_TYPES, makeItem } from './itemTypes';
import { renderClipList } from './clips';
import { strip } from './dom';
import { LAYOUTS, panelCount, resizeStrip } from './render';
import { S } from './state';
import { $, fmt, status, toast } from './util';

/* ---------- 클립 사용 구간 (소스 탭) ---------- */
export const useEnd = (c: Clip) => (c.outPt > c.inPt ? Math.min(c.outPt, c.dur) : c.dur);
export const useLen = (c: Clip) => Math.max(0.1, useEnd(c) - c.inPt);
export function selectClip(c: Clip | null) {
  S.selClip = c;
  const box = $('#trimBox');
  if (!c) { box.style.display = 'none'; renderClipList(); return; }
  box.style.display = 'block';
  $('#trimName').textContent = c.name;
  const tv = $('#trimVid'); if (tv.src !== c.url) tv.src = c.url;
  $('#trimIn').value = c.inPt.toFixed(2);
  $('#trimOut').value = useEnd(c).toFixed(2);
  renderClipList();
}
export function setTrim(which: 'in' | 'out', val: string | number) {
  const c = S.selClip; if (!c || !c.dur) return;
  val = Math.max(0, Math.min(c.dur, +val || 0));
  if (which === 'in') c.inPt = Math.min(val, useEnd(c) - 0.2);
  else { c.outPt = Math.max(val, c.inPt + 0.2); if (c.outPt >= c.dur - 0.01) c.outPt = 0; }
  $('#trimIn').value = c.inPt.toFixed(2); $('#trimOut').value = useEnd(c).toFixed(2);
  renderClipList();
}

/* ---------- 타임라인: 화면마다 트랙 1개, 트랙 안에 영상 조각을 자유롭게 배치 ---------- */
export const WAVE_H = () => Math.round(64 * devicePixelRatio);
export const LANE_H = () => Math.round(32 * devicePixelRatio);
export const AUD_H = () => Math.round(26 * devicePixelRatio);
export const allItems = () => S.tracks.flat();
export const sortTrack = <T extends { start: number }>(tr: T[]) => tr.sort((a, b) => a.start - b.start);
export const trackOf = (g: Item) => S.tracks.findIndex(tr => tr.includes(g as VideoItem));
/** 새 영상 조각 (클립 사용 구간의 시작부터, 소리는 '클립 소리' 설정을 따름) */
export const newItem = (c: Clip, start: number, len: number) => makeItem('video', c, start, len, S.set.clipSound ? 1 : 0);
/** 조각이 들어 있는 목록 (영상: 그 화면 트랙, 음악: 음악 트랙) */
export const listOf = (g: Item): Item[] => ITEM_TYPES[g.kind].list(g);
// t 시점에 보이는 조각: 시작이 가장 늦은(= 위에 놓인) 조각
export function activeIdx(tr: { start: number; end: number }[], t: number) { let best = -1; for (let i = 0; i < tr.length; i++) { const g = tr[i]; if (g.start > t) break; if (g.end > t) best = i; } return best; }
export function nextItem<T extends { start: number }>(tr: T[], t: number): T | null { for (const g of tr) if (g.start > t) return g; return null; }
export function viewStart(t: number) {
  const span = S.zoom, dur = S.music.dur || 0;
  if (!dur || span >= dur) return 0;
  return Math.max(0, Math.min(dur - span, t - span / 2));
}
export function setStripHeight() { strip.style.height = (64 + 26 + 32 * panelCount() + 2) + 'px'; resizeStrip(); }

export function selectItem(g: Item | null, toTab?: boolean) {
  S.selItem = g || null;
  if (g) { const k = trackOf(g); if (k >= 0) S.track = k; }
  if (g && toTab) document.querySelector<HTMLElement>('.tabs button[data-tab="tCut"]')?.click();
  renderTrackBtns(); refreshItemEditor();
}
export function renderTrackBtns() {
  const n = panelCount(), box = $('#trackBtns'); if (!box) return;
  $('#trackRow').style.display = n > 1 ? 'flex' : 'none';
  $('#btnCopyTrack').style.display = n > 1 && S.track > 0 ? '' : 'none';
  box.innerHTML = '';
  for (let k = 0; k < n; k++) { const b = document.createElement('button'); b.textContent = String(k + 1); b.classList.toggle('on', k === S.track); b.onclick = () => selectTrack(k); box.appendChild(b); }
}
export function selectTrack(k: number) {
  if (k >= panelCount()) return;
  if (k !== S.track) { S.track = k; if (S.selItem && trackOf(S.selItem) !== k) S.selItem = null; }
  renderTrackBtns(); refreshItemEditor(); updateSegInfo();
}
export function renderLayouts() {
  const box = $('#lays'); box.innerHTML = '';
  for (const [key, L] of Object.entries(LAYOUTS)) {
    const b = document.createElement('button');
    const rects = L.r.map(([x, y, w, h], i) => `<rect x="${x * 56 + 1}" y="${y * 32 + 1}" width="${w * 56 - 2}" height="${h * 32 - 2}" rx="2" fill="${i === 0 ? '#ff3b6b' : '#5b6170'}" ${L.pip && i ? 'stroke="#0e0f13" stroke-width="1.5"' : ''}/>`).join('');
    b.innerHTML = `<svg viewBox="0 0 56 32">${rects}</svg>${L.name}`;
    b.classList.toggle('on', S.set.layout === key);
    b.onclick = () => { S.set.layout = key; renderLayouts(); ensureTracks(); };
    box.appendChild(b);
  }
}
export function updateSegInfo() {
  if ($('#durInfo')) updateDurUI();
  const tr = S.tracks[S.track] || [], dur = S.music.dur;
  let cover = 0;
  if (dur && tr.length) { let end = 0; for (const g of tr) { const a = Math.max(g.start, end), b = Math.min(g.end, dur); if (b > a) cover += b - a; end = Math.max(end, g.end); } }
  const txt = tr.length ? `${panelCount() > 1 ? `화면 ${S.track + 1} · ` : ''}조각 ${tr.length}개${dur ? ` · 영상의 ${Math.round(cover / dur * 100)}% 채움` : ''}` : `${panelCount() > 1 ? `화면 ${S.track + 1}: ` : ''}비어 있음 — 클립을 타임라인에 끌어다 놓거나 A 키`;
  $('#segInfo').textContent = txt; $('#segInfo2').textContent = txt;
}
export function refreshTimeline() { updateSegInfo(); renderTrackBtns(); refreshItemEditor(); }
export function refreshItemEditor() {
  const sel = S.selItem, shown = ITEM_TYPES[sel ? sel.kind : 'video'].editor;   // 선택 없으면 영상 편집 패널
  for (const t of Object.values(ITEM_TYPES)) $(t.editor).style.display = t.editor === shown ? 'block' : 'none';
  if (sel && sel.kind === 'audio') {
    const g = sel;
    $('#audInfo').textContent = `${g.src ? g.src.name : g.srcName} · ${fmt(g.start)} ~ ${fmt(g.end)}${g.src ? ' · ' + g.src.bpm + ' BPM' : ''}`;
    $('#audOff').value = g.off.toFixed(2); $('#audStart').value = g.start.toFixed(3); $('#audLen').value = (g.end - g.start).toFixed(3);
    const v = Math.round((g.vol == null ? 1 : g.vol) * 100); $('#audVol').value = v; $('#vAudVol').textContent = v + '%';
    return;
  }
  const g = sel as VideoItem | null;   // 여기부터는 영상 조각(또는 선택 없음)
  $('#segClip').innerHTML = S.clips.map((c, i) => `<option value="${i}">#${i + 1} ${c.name.replace(/</g, '&lt;')}</option>`).join('');
  document.querySelectorAll<HTMLInputElement>('#segEdit select,#segEdit input,#segEdit button').forEach(el => el.disabled = !g);
  if (!g) { $('#segSelInfo').textContent = '선택 없음 — 타임라인의 조각을 클릭하세요'; return; }
  const k = trackOf(g);
  $('#segSelInfo').textContent = `${panelCount() > 1 ? `화면 ${k + 1} · ` : ''}${fmt(g.start)} ~ ${fmt(g.end)} (${(g.end - g.start).toFixed(2)}초)`;
  $('#segClip').value = g.src ? String(S.clips.indexOf(g.src)) : '';
  $('#segOff').value = g.off.toFixed(2);
  $('#segStart').value = g.start.toFixed(3);
  $('#segLen').value = (g.end - g.start).toFixed(3);
  $('#segRate').value = String(g.rate || 1);
  $('#segX').value = Math.round(g.x * 100); $('#segY').value = Math.round(g.y * 100); $('#segZoom').value = Math.round(g.zoom * 100);
  $('#vX').textContent = Math.round(g.x * 100); $('#vY').textContent = Math.round(g.y * 100); $('#vZoom').textContent = Math.round(g.zoom * 100) + '%';
  $('#segFlip').checked = !!g.flip;
  $('#segVol').value = Math.round((g.vol || 0) * 100); $('#vVol').textContent = Math.round((g.vol || 0) * 100) + '%';
}
// 선택한 조각의 속성 변경. undo=false면 슬라이더처럼 계속 바뀌는 조작 (기록은 누를 때 record로 한 번)
export function itemOp(fn: (g: Item) => void, undo = true, label = '조각 편집') {
  const g = S.selItem; if (!g) return toast('먼저 타임라인에서 조각을 선택하세요');
  const run = () => { fn(g); ITEM_TYPES[g.kind].clamp(g); };
  if (undo) commit(label, run);
  else { run(); refreshItemEditor(); updateSegInfo(); }
}
export function addItemAt(c: Clip, k: number, t: number) {
  if (!c || !c.dur) return toast('클립을 먼저 불러와 주세요');
  if (!S.tracks[k]) return;
  t = Math.max(0, t);
  let len = useLen(c);
  const L = limitDur(); if (t + len > L) len = Math.max(0.2, L - t);
  const g = newItem(c, t, len);
  commit('조각 추가', () => { S.tracks[k].push(g); S.selItem = g; S.track = k; });
  status(`${c.name}을(를) ${fmt(t)}에 추가했습니다 — 끌어서 옮기고, 양끝을 끌어서 길이를 조절하세요`);
}
export function addSelectedClip() {
  const c = S.selClip || S.clips.find(x => x.dur > 0);
  if (!c) return toast('먼저 영상 클립을 불러와 주세요');
  addItemAt(c, S.track, tlSnap(now()));
}
// 선택한 화면의 마지막 조각 바로 뒤에 이어 붙이기
export function appendSelectedClip() {
  const c = S.selClip || S.clips.find(x => x.dur > 0);
  if (!c) return toast('먼저 영상 클립을 불러와 주세요');
  const tr = S.tracks[S.track] || [];
  const end = tr.length ? Math.max(...tr.map(g => g.end)) : 0;
  if (end >= limitDur() - 0.1) return toast(`화면 ${S.track + 1}은 이미 영상 끝까지 채워져 있습니다`);
  addItemAt(c, S.track, end);
  if (!S.playing) seek(end + 0.001);
}
// 선택한 화면 맨 앞에 넣고, 기존 조각은 그만큼 뒤로 밀기
export function prependSelectedClip() {
  const c = S.selClip || S.clips.find(x => x.dur > 0);
  if (!c || !c.dur) return toast('먼저 영상 클립을 불러와 주세요');
  const tr = S.tracks[S.track]; if (!tr) return;
  const len = Math.min(useLen(c), limitDur());
  commit('맨 앞에 추가', () => {
    for (const g of tr) { g.start += len; g.end += len; }
    const g = newItem(c, 0, len); tr.push(g); S.selItem = g;
  });
  const L = limitDur(), over = isFinite(L) ? tr.filter(x => x.start >= L).length : 0;
  if (!S.playing) seek(0);
  toast(`화면 ${S.track + 1} 맨 앞에 추가하고 나머지를 ${len.toFixed(1)}초 뒤로 밀었습니다` + (over ? ` (영상 끝을 넘어간 조각 ${over}개는 보이지 않습니다)` : ''), 3500);
}
export function tlSnap(t: number) {
  if (!$('#tlSnap').checked || !S.beats.length) return t;
  const nb = nearestBeat(t); return nb.i >= 0 && nb.d < 0.15 ? S.beats[nb.i] : t;
}
/** 조각을 t에서 둘로 나눔 (뒤쪽 조각은 원본에서 그만큼 뒤부터 재생) */
function splitItem(g: Item, t: number): Item {
  const ng = { ...g, start: t, off: g.off + (t - g.start) * (g.rate || 1) } as Item;
  g.end = t; listOf(g).push(ng);
  return ng;
}
// 자르기: 선택한 조각이 t를 덮으면 그 조각(영상·음악 모두), 아니면 지금 화면 트랙에서 t에 보이는 영상 조각
export function splitAt(t: number) {
  const sel = S.selItem;
  let g: Item | null = sel && sel.start < t && sel.end > t ? sel : null;
  if (!g) { const tr = S.tracks[S.track] || []; const i = activeIdx(tr, t); g = i >= 0 ? tr[i] : null; }
  if (!g) return toast('현재 위치에 자를 조각이 없습니다');
  if (t - g.start < 0.05 || g.end - t < 0.05) return toast('조각 끝과 너무 가깝습니다');
  const target = g;
  commit(`${ITEM_TYPES[g.kind].label} 자르기`, () => { S.selItem = splitItem(target, t); });
  toast(`${fmt(t)}에서 잘랐습니다 — 필요 없는 쪽은 선택 후 Del`);
}
export function dupItem() {
  const g = S.selItem; if (!g) return toast('먼저 타임라인에서 조각을 선택하세요');
  commit(`${ITEM_TYPES[g.kind].label} 복제`, () => {
    const len = g.end - g.start, ng = { ...g, start: g.end, end: g.end + len } as Item;
    listOf(g).push(ng); S.selItem = ng;
  });
}
export function delItem() {
  const g = S.selItem; if (!g) return false;
  commit(`${ITEM_TYPES[g.kind].label} 삭제`, () => { const list = listOf(g); list.splice(list.indexOf(g), 1); S.selItem = null; });
  return true;
}
export function copyTrack() {
  if (S.track === 0) return;
  if (S.tracks[S.track].length && !confirm(`화면 ${S.track + 1}의 조각을 화면 1 배치로 바꿉니다. 계속할까요?`)) return;
  commit('화면 배치 복사', () => { S.tracks[S.track] = S.tracks[0].map(g => ({ ...g })); S.selItem = null; });
  toast(`화면 1 배치를 화면 ${S.track + 1}에 복사했습니다`);
}
export function ensureTracks() {
  const n = panelCount();
  for (let k = 0; k < n; k++) if (!S.tracks[k]) S.tracks[k] = k > 0 && S.tracks[0] ? S.tracks[0].map(g => ({ ...g })) : [];
  if (S.track >= n) S.track = 0;
  if (S.selItem && trackOf(S.selItem) >= n) S.selItem = null;
  setStripHeight(); refreshTimeline();
}
