// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 소스 탭 '클립 기본 편집' 칸: 고른 클립(여러 개면 모두)에 회전·반전·자르기·확대·색·속도 적용
import type { Clip, ClipFx } from './types';
import { defaultFx, fxOf, isDefaultFx, RATES } from './clipFx';
import { afterEdit, commit, record } from './history';
import { renderClipList } from './clips';
import { S } from './state';
import { $, toast } from './util';

type InEv = Event & { target: HTMLInputElement };
/** 적용 대상: 여러 개 골랐으면 고른 클립 모두, 아니면 기준 클립 하나 */
export const fxTargets = (): Clip[] => (!S.selClip ? [] : S.selClips.length > 1 && S.selClips.includes(S.selClip) ? S.clips.filter(c => S.selClips.includes(c)) : [S.selClip]);
const CROP = ['L', 'T', 'R', 'B'] as const;
const SLIDERS: [string, keyof ClipFx, number, string][] = [['#fxZoom', 'zoom', 100, '%'], ['#fxBri', 'bri', 1, '%'], ['#fxCon', 'con', 1, '%'], ['#fxSat', 'sat', 1, '%']];

/** 기준 클립 값으로 칸 채우기 */
export function renderClipFx() {
  const c = S.selClip; if (!c || !$('#fxBox')) return;
  const fx = fxOf(c), n = fxTargets().length;
  $('#fxTarget').textContent = n > 1 ? `고른 클립 ${n}개에 적용` : '';
  document.querySelectorAll<HTMLElement>('#fxRot button').forEach(b => b.classList.toggle('on', +(b.dataset.rot || 0) === fx.rot));
  $('#fxFlipH').checked = fx.flipH; $('#fxFlipV').checked = fx.flipV;
  CROP.forEach((k, i) => { const v = Math.round(fx.crop[i] * 100); $('#fxCrop' + k).value = String(v); $('#vCrop' + k).textContent = v + '%'; });
  for (const [id, key, sc, unit] of SLIDERS) { const v = Math.round((fx[key] as number) * sc); $(id).value = String(v); $('#v' + id.slice(1)).textContent = v + unit; }
  $('#fxRate').value = String(fx.rate);
  $('#fxReset').disabled = fxTargets().every(x => isDefaultFx(x.fx));
}
/** 대상 클립들에 바꾸기. undo=false는 슬라이더를 끄는 중 (기록은 누를 때 한 번) */
function apply(fn: (fx: ClipFx) => void, undo = true, label = '클립 편집') {
  const cs = fxTargets(); if (!cs.length) return toast('먼저 클립을 고르세요');
  const run = () => { for (const c of cs) { const fx = { ...fxOf(c), crop: [...fxOf(c).crop] as ClipFx['crop'] }; fn(fx); c.fx = fx; } };
  if (undo) commit(label, run); else run();
  renderClipFx(); renderClipList();
}
export function initClipFx() {
  $('#fxRate').innerHTML = RATES.map(r => `<option value="${r}">${r}x</option>`).join('');
  document.querySelectorAll<HTMLElement>('#fxRot button').forEach(b => b.onclick = () => apply(fx => { fx.rot = +(b.dataset.rot || 0); }, true, '클립 회전'));
  $('#fxFlipH').onchange = (e: InEv) => apply(fx => { fx.flipH = e.target.checked; }, true, '클립 좌우 반전');
  $('#fxFlipV').onchange = (e: InEv) => apply(fx => { fx.flipV = e.target.checked; }, true, '클립 상하 반전');
  $('#fxRate').onchange = (e: InEv) => apply(fx => { fx.rate = +e.target.value || 1; }, true, '클립 속도');
  CROP.forEach((k, i) => slider('#fxCrop' + k, '클립 자르기', (fx, v) => { fx.crop[i] = v / 100; }));
  for (const [id, key, sc] of SLIDERS) slider(id, key === 'zoom' ? '클립 확대' : '클립 색 보정', (fx, v) => { (fx[key] as number) = v / sc; });
  $('#fxReset').onclick = () => apply(fx => Object.assign(fx, defaultFx()), true, '클립 편집 초기화');
}
function slider(id: string, label: string, set: (fx: ClipFx, v: number) => void) {
  $(id).addEventListener('pointerdown', () => { if (fxTargets().length) record(label); });
  $(id).addEventListener('input', (e: InEv) => apply(fx => set(fx, +e.target.value), false));
  $(id).addEventListener('change', () => afterEdit(false));
}
