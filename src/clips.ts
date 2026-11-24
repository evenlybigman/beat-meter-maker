// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 영상 클립 불러오기와 목록
import type { Clip } from './types';
import { limitDur } from './audio';
import { refreshEmpty } from './player';
import { panelCount, releaseVids } from './render';
import { S } from './state';
import { addClipsAt, addSelectedClip, allItems, newItem, pickModeOf, refreshItemEditor, refreshTimeline, selectClip, tlSnap, useLen } from './timeline';
import { stripHit } from './timelineInput';
import { strip } from './dom';
import { $, fmtShort, toast } from './util';
import { desk, filePath, type PathFile } from './desktop';
import { ic } from './icons';

/* ---------- 클립 목록 ---------- */
export function addClips(files: (File | PathFile)[]) {
  // 타임라인이 비어 있으면 선택한 순서대로 이어 붙임.
  // 파일마다 읽기가 끝나는 순서가 달라서, 앞 파일이 다 읽힐 때까지 뒤 파일 배치를 기다림.
  const autoPlace = !allItems().length;
  const batch: Clip[] = [];
  const placeReady = () => {
    while (batch.length && (batch[0].dur > 0 || batch[0].failed)) {
      const c = batch.shift()!;
      if (c.failed || !autoPlace) continue;
      for (let k = 0; k < panelCount(); k++) {
        const tr = S.tracks[k]; const st = tr.length ? Math.max(...tr.map(g => g.end)) : 0;
        const L = limitDur(); if (st < L - 0.2) { const len = Math.min(useLen(c), L - st); tr.push(newItem(c, st, len)); }
      }
    }
    renderClipList(); refreshTimeline();
  };
  for (const f of files) {
    if (!f.type.startsWith('video/') && !/\.(mp4|webm|mov|mkv|m4v)$/i.test(f.name)) continue;
    // 길이·크기만 읽는 임시 video. 읽고 나면 바로 정리 (재생은 render.ts의 video를 씀)
    const v = document.createElement('video');
    v.muted = true; v.preload = 'metadata';
    let fin = false;
    const done = () => { fin = true; v.removeAttribute('src'); try { v.load(); } catch (e) {} v.remove(); };
    const path = filePath(f);
    v.src = path ? desk()!.mediaUrl(path) : URL.createObjectURL(f as File);   // 데스크톱: 원본 파일을 바로 읽음
    const c: Clip = { name: f.name, url: v.src, dur: 0, w: 0, h: 0, inPt: 0, outPt: 0, hue: (S.clips.length * 67 + 200) % 360, path: path || undefined };
    batch.push(c);
    v.addEventListener('loadedmetadata', () => {
      if (fin) return;
      c.dur = v.duration || 0; c.w = v.videoWidth; c.h = v.videoHeight; done();
      const pt = S.pendingTrims[c.name]; if (pt) { c.inPt = pt.inPt || 0; c.outPt = pt.outPt || 0; }
      for (const g of allItems()) if (!g.src && g.srcName === c.name) g.src = c;
      if (!S.selClip) selectClip(c);
      placeReady();
    });
    v.addEventListener('error', () => { if (fin) return; done(); toast(`재생할 수 없는 형식: ${f.name}`); c.failed = true; removeClip(c); placeReady(); });
    $('#vids').appendChild(v);
    S.clips.push(c);
  }
  renderClipList(); refreshEmpty();
  if (!autoPlace) toast('클립을 추가했습니다 — 타임라인에 끌어다 놓거나 A 키로 넣으세요', 3000);
}
export function removeClip(c: Clip) {
  const i = S.clips.indexOf(c); if (i < 0) return;
  releaseVids(x => x === c); if (c.url.startsWith('blob:')) URL.revokeObjectURL(c.url);
  S.clips.splice(i, 1);
  S.tracks = S.tracks.map(tr => tr.filter(g => g.src !== c));
  if (S.selItem && S.selItem.kind !== 'audio' && S.selItem.src === c) S.selItem = null;
  S.selItems = S.selItems.filter(g => g.kind === 'audio' || g.src !== c);
  S.selClips = S.selClips.filter(x => x !== c);
  if (S.selClip === c) selectClip(S.selClips[0] || S.clips[0] || null);
  renderClipList(); refreshTimeline(); refreshEmpty();
}
/** 고른 클립 여러 개 한꺼번에 삭제 (타임라인에 쓰인 클립이 있으면 확인) */
export function removeSelectedClips() {
  const cs = S.clips.filter(c => S.selClips.includes(c)); if (!cs.length) return;
  const used = allItems().filter(g => g.src && cs.includes(g.src)).length;
  if (cs.length > 1 && !confirm(`클립 ${cs.length}개를 목록에서 지웁니다.${used ? ` 타임라인에서 이 클립을 쓰는 조각 ${used}개도 같이 지워집니다.` : ''} 계속할까요?`)) return;
  for (const c of cs) removeClip(c);
  toast(`클립 ${cs.length}개를 지웠습니다`);
}
export function moveClip(c: Clip, d: number) {
  const i = S.clips.indexOf(c), j = i + d; if (j < 0 || j >= S.clips.length) return;
  [S.clips[i], S.clips[j]] = [S.clips[j], S.clips[i]]; renderClipList(); refreshItemEditor();
}
/* ---------- 클립 목록 끌기 ----------
   목록 안에서 위아래로 끌기 = 지나간 클립 여러 개 선택 (Ctrl을 누른 채면 기존 선택에 더함)
   목록 밖으로 끌고 나가 타임라인에 놓기 = 고른 클립을 그 자리에 목록 순서대로 이어서 넣기
   이미 여러 개 고른 클립 중 하나를 끌면 선택은 그대로 두고 바로 타임라인으로 옮기기 */
const CD = { d: null as null | { idx: number; x: number; y: number; mode: '' | 'sel' | 'carry'; add: boolean; base: Clip[]; carry: Clip[] }, suppress: false };
function clipDown(e: PointerEvent, idx: number) {
  if (e.button !== 0 || (e.target as HTMLElement).closest('button') || e.shiftKey) return;
  CD.d = { idx, x: e.clientX, y: e.clientY, mode: '', add: e.ctrlKey || e.metaKey, base: S.clips.filter(c => S.selClips.includes(c)), carry: [] };
}
function clipIdxAt(y: number) {
  const lis = [...$('#clipList').children] as HTMLElement[]; if (!lis.length) return -1;
  for (let i = 0; i < lis.length; i++) { const r = lis[i].getBoundingClientRect(); if (y < r.bottom) return i; }
  return lis.length - 1;
}
const ghost = () => { let g = document.getElementById('clipGhost'); if (!g) { g = document.createElement('div'); g.id = 'clipGhost'; document.body.appendChild(g); } return g; };
window.addEventListener('pointermove', e => {
  const d = CD.d; if (!d) return;
  if (!d.mode) {
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    const c0 = S.clips[d.idx]; if (!c0) { CD.d = null; return; }
    const inMulti = S.selClips.length > 1 && S.selClips.includes(c0);
    if (inMulti) { d.mode = 'carry'; d.carry = S.clips.filter(c => S.selClips.includes(c) && c.dur > 0); }
    else { d.mode = 'sel'; if (d.add) { if (!S.selClips.includes(c0)) selectClip(c0, 'toggle'); } else selectClip(c0); }
  }
  const ul = $('#clipList'), lr = ul.getBoundingClientRect();
  const inside = e.clientX >= lr.left && e.clientX <= lr.right && e.clientY >= lr.top - 24 && e.clientY <= lr.bottom + 24;
  if (d.mode === 'sel') {
    if (inside) {
      const j = clipIdxAt(e.clientY), a = Math.min(d.idx, j), b = Math.max(d.idx, j);
      const range = S.clips.slice(a, b + 1);
      S.selClips = d.add ? [...new Set([...d.base, ...range])] : range;
      renderClipList();
      if (e.clientY > lr.bottom - 14) ul.scrollTop += 8; else if (e.clientY < lr.top + 14) ul.scrollTop -= 8;   // 끝에 닿으면 목록 스크롤
      return;
    }
    d.mode = 'carry'; d.carry = S.clips.filter(c => S.selClips.includes(c) && c.dur > 0);   // 목록 밖으로 나가면 고른 것을 들고 감
  }
  const g = ghost(), n = d.carry.length;
  g.textContent = n > 1 ? `클립 ${n}개` : n ? d.carry[0].name : '';
  g.style.display = n ? 'block' : 'none'; g.style.left = e.clientX + 14 + 'px'; g.style.top = e.clientY + 10 + 'px';
  document.body.classList.add('carrying');
});
window.addEventListener('pointerup', e => {
  const d = CD.d; CD.d = null; if (!d) return;
  const g = document.getElementById('clipGhost'); if (g) g.style.display = 'none';
  document.body.classList.remove('carrying');
  if (!d.mode) return;
  CD.suppress = true; setTimeout(() => { CD.suppress = false; }, 0);   // 끌고 난 뒤의 클릭은 무시
  if (d.mode !== 'carry' || !d.carry.length) return;
  const sr = strip.getBoundingClientRect();
  if (e.clientX < sr.left || e.clientX > sr.right || e.clientY < sr.top || e.clientY > sr.bottom) return;   // 타임라인 밖에 놓으면 취소
  const h = stripHit(e);
  addClipsAt(d.carry, typeof h.lane === 'number' && h.lane >= 0 ? h.lane : S.track, tlSnap(h.t));
});
export function renderClipList() {
  const ul = $('#clipList'); ul.innerHTML = '';
  const multi = S.selClips.length > 1 && !!S.selClip && S.selClips.includes(S.selClip);
  const bar = $('#clipSelBar'), n = multi ? S.selClips.length : 0;
  bar.style.display = S.clips.length > 1 ? 'flex' : 'none';
  bar.classList.toggle('on', n > 1);
  $('#clipSelTxt').textContent = n > 1 ? `클립 ${n}개 선택 · A·E·Q로 한 번에` : '끌기·Shift+클릭: 여러 개 고르기 · Ctrl+클릭: 하나씩 더하기';
  $('#clipSelClear').style.display = $('#clipSelDel').style.display = n > 1 ? '' : 'none';
  const opt = document.querySelector<HTMLOptionElement>('#fillClips option[value="sel"]'); if (opt) opt.textContent = `선택한 클립만 (${Math.max(1, n)}개)`;
  S.clips.forEach((c, idx) => {
    const li = document.createElement('li');
    const trimmed = c.inPt > 0 || (c.outPt > 0 && c.outPt < c.dur);
    li.innerHTML = `<span class="sw" style="background:hsl(${c.hue},55%,50%)"></span><span class="n"></span>${trimmed ? '<span class="badge" title="사용 구간을 정함">구간</span>' : ''}<span class="d">${c.dur ? fmtShort(trimmed ? useLen(c) : c.dur) : '…'}</span><button class="ic" title="위로">${ic('up')}</button><button class="ic" title="아래로">${ic('down')}</button><button class="ic" title="삭제">${ic('x')}</button>`;
    const nm = li.querySelector<HTMLElement>('.n')!; nm.textContent = `#${idx + 1} ${c.name}`; nm.title = c.name + ' — 타임라인으로 끌어다 놓기';
    li.classList.toggle('sel', multi ? S.selClips.includes(c) : S.selClip === c);
    li.classList.toggle('cur', multi && S.selClip === c);
    li.onpointerdown = e => clipDown(e, idx);
    li.onclick = e => { if (CD.suppress) return; selectClip(c, pickModeOf(e)); };
    li.ondblclick = () => { selectClip(c); addSelectedClip(); };
    const [u, d, x] = li.querySelectorAll('button');
    u.onclick = e => { e.stopPropagation(); moveClip(c, -1); }; d.onclick = e => { e.stopPropagation(); moveClip(c, 1); }; x.onclick = e => { e.stopPropagation(); removeClip(c); };
    ul.appendChild(li);
  });
}
