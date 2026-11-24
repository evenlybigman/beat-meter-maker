// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 미리보기 전체 화면: 버튼·미리보기 더블클릭·Ctrl+F로 열고, Esc·더블클릭·나가기 버튼으로 닫음
// 전체 화면에서는 아래쪽에 재생·시간·재생 바·나가기 막대. 마우스를 2초 안 움직이면 막대와 커서를 숨김
import { cv } from './dom';
import { projDur, seek } from './audio';
import { btnHtml } from './icons';
import { togglePlay } from './player';
import { S } from './state';
import { $, fmt, fmtShort } from './util';

const stage = () => $('#stage');
export const isFull = () => document.fullscreenElement === stage();
let idleTimer = 0, dragging = false, lastPlaying: boolean | null = null;

export async function toggleFullscreen() {
  try {
    if (isFull()) await document.exitFullscreen();
    else await stage().requestFullscreen();
  } catch (e) { /* 전체 화면을 못 쓰는 환경이면 조용히 무시 */ }
}
function wake() {
  const st = stage(); st.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => { if (isFull() && !dragging) st.classList.add('idle'); }, 2000);
}
/** 매 프레임: 전체 화면이면 시간·재생 바·재생 버튼 갱신 */
export function fsTick(t: number) {
  if (!isFull()) return;
  const dur = projDur();
  $('#fsTime').textContent = `${fmt(t)} / ${fmtShort(dur)}`;
  if (!dragging && dur) $('#fsSeek').value = String(Math.round(t / dur * 1000));
  if (lastPlaying !== S.playing) { lastPlaying = S.playing; $('#fsPlay').innerHTML = btnHtml(S.playing ? 'pause' : 'play', S.playing ? '정지' : '재생'); }
}
export function initFullscreen() {
  $('#btnFull').onclick = toggleFullscreen;
  $('#fsExit').onclick = toggleFullscreen;
  $('#fsPlay').onclick = togglePlay;
  cv.addEventListener('dblclick', toggleFullscreen);
  const sk = $('#fsSeek');
  sk.addEventListener('input', () => { dragging = true; seek(+sk.value / 1000 * projDur()); });
  sk.addEventListener('change', () => { dragging = false; });
  stage().addEventListener('mousemove', wake);
  document.addEventListener('fullscreenchange', () => {
    const on = isFull();
    stage().classList.toggle('full', on);
    lastPlaying = null;
    if (on) wake(); else { clearTimeout(idleTimer); stage().classList.remove('idle'); }
  });
}
