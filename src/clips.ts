// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 영상 클립 불러오기와 목록
import type { Clip } from './types';
import { limitDur } from './audio';
import { refreshEmpty } from './player';
import { panelCount, releaseVids } from './render';
import { S } from './state';
import { addSelectedClip, allItems, newItem, refreshItemEditor, refreshTimeline, selectClip, useLen } from './timeline';
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
  if (S.selClip === c) selectClip(S.clips[0] || null);
  renderClipList(); refreshTimeline(); refreshEmpty();
}
export function moveClip(c: Clip, d: number) {
  const i = S.clips.indexOf(c), j = i + d; if (j < 0 || j >= S.clips.length) return;
  [S.clips[i], S.clips[j]] = [S.clips[j], S.clips[i]]; renderClipList(); refreshItemEditor();
}
export function renderClipList() {
  const ul = $('#clipList'); ul.innerHTML = '';
  S.clips.forEach((c, idx) => {
    const li = document.createElement('li');
    const trimmed = c.inPt > 0 || (c.outPt > 0 && c.outPt < c.dur);
    li.innerHTML = `<span class="sw" style="background:hsl(${c.hue},55%,50%)"></span><span class="n"></span>${trimmed ? '<span class="badge" title="사용 구간을 정함">구간</span>' : ''}<span class="d">${c.dur ? fmtShort(trimmed ? useLen(c) : c.dur) : '…'}</span><button class="ic" title="위로">${ic('up')}</button><button class="ic" title="아래로">${ic('down')}</button><button class="ic" title="삭제">${ic('x')}</button>`;
    const nm = li.querySelector<HTMLElement>('.n')!; nm.textContent = `#${idx + 1} ${c.name}`; nm.title = c.name + ' — 타임라인으로 끌어다 놓기';
    li.classList.toggle('sel', S.selClip === c);
    li.draggable = true;
    li.ondragstart = e => { e.dataTransfer!.setData('text/clip', String(idx)); e.dataTransfer!.effectAllowed = 'copy'; };
    li.onclick = () => selectClip(c);
    li.ondblclick = () => { selectClip(c); addSelectedClip(); };
    const [u, d, x] = li.querySelectorAll('button');
    u.onclick = e => { e.stopPropagation(); moveClip(c, -1); }; d.onclick = e => { e.stopPropagation(); moveClip(c, 1); }; x.onclick = e => { e.stopPropagation(); removeClip(c); };
    ul.appendChild(li);
  });
}
