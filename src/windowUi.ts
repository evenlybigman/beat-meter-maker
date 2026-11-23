// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 파일 끌어다 놓기, 미리보기 크기, 창 크기 변화
import { addClips } from './clips';
import { cv, strip } from './dom';
import { loadProject } from './project';
import { resizeStrip } from './render';
import { loadMusicFiles } from './songs';
import { S } from './state';
import { $ } from './util';

// 창 전체 드래그 앤 드롭
(['dragenter', 'dragover'] as const).forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); document.querySelectorAll<HTMLElement>('.drop').forEach(d => d.classList.add('over')); }));
(['dragleave', 'drop'] as const).forEach(ev => window.addEventListener(ev, (e: DragEvent) => { e.preventDefault(); if (ev === 'drop' || !e.relatedTarget) document.querySelectorAll<HTMLElement>('.drop').forEach(d => d.classList.remove('over')); }));
window.addEventListener('drop', e => {
  const files = [...(e.dataTransfer?.files || [])];
  const tgt = e.target as HTMLElement;
  if (tgt.closest && tgt.closest('#dropMusic')) {   // 음악 칸에 놓으면 영상도 음악(소리)으로
    const av = files.filter(f => /^(audio|video)\//.test(f.type) || /\.(mp3|wav|ogg|m4a|flac|aac|opus|mp4|webm|mov|mkv|m4v)$/i.test(f.name));
    if (av.length) loadMusicFiles(av);
    return;
  }
  const audios = files.filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac|opus)$/i.test(f.name));
  const proj = files.find(f => /\.json$/i.test(f.name));
  const vids = files.filter(f => f.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|m4v)$/i.test(f.name));
  if (audios.length) loadMusicFiles(audios);
  if (vids.length) addClips(vids);
  if (proj) loadProject(proj);
});
window.addEventListener('resize', () => { resizeStrip(); fitCanvas(); });
// 미리보기 크기: 캔버스를 미리보기 영역에 비율 맞춰 넣기
export function fitCanvas() {
  const st = $('#stage'), W = st.clientWidth, H = st.clientHeight; if (!W || !H) return;
  const ar = cv.width / cv.height; let w = W, h = W / ar;
  if (h > H) { h = H; w = H * ar; }
  cv.style.width = Math.floor(w) + 'px'; cv.style.height = Math.floor(h) + 'px';
}
export const PV: Record<string, number> = { xs: 0.2, sm: 0.3, md: 0.42, lg: 0.58 };
export function setPreviewSize(mode: string, px?: number) {
  const c = $('#center'), st = $('#stage');
  if (mode === 'auto') { c.classList.remove('fixed'); st.style.height = ''; }
  else { c.classList.add('fixed'); st.style.height = Math.round(px || window.innerHeight * PV[mode]) + 'px'; }
  $('#pvSize').value = mode;
  try { localStorage.setItem('bmm.pv', JSON.stringify({ mode, px: px || 0 })); } catch (e) {}
  requestAnimationFrame(() => { fitCanvas(); resizeStrip(); });
}
$('#pvSize').onchange = (e: Event) => setPreviewSize((e.target as HTMLSelectElement).value);
$('#btnKeys').onclick = () => { $('#keys').classList.toggle('hide'); requestAnimationFrame(resizeStrip); };
{
  let sp: { y: number; h: number } | null = null; const split = $('#split');
  split.addEventListener('mousedown', (e: MouseEvent) => { sp = { y: e.clientY, h: $('#stage').clientHeight }; split.classList.add('on'); e.preventDefault(); });
  window.addEventListener('mousemove', e => {
    if (!sp) return;
    const max = $('#center').clientHeight - 120;
    const h = Math.max(90, Math.min(max, sp.h + e.clientY - sp.y));
    setPreviewSize('custom', h);
  });
  window.addEventListener('mouseup', () => { if (sp) { sp = null; split.classList.remove('on'); } });
  split.addEventListener('dblclick', () => setPreviewSize('auto'));
}
if (window.ResizeObserver) { new ResizeObserver(fitCanvas).observe($('#stage')); new ResizeObserver(() => resizeStrip()).observe(strip); }
window.addEventListener('beforeunload', e => { if (S.beats.length || S.clips.length) { e.preventDefault(); e.returnValue = ''; } });
