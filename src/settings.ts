// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 설정 입력칸과 출력 해상도
import { beatGain, renderSndUI } from './beatsound';
import { cv } from './dom';
import { updateClipSoundBtn } from './events';
import { DEFAULTS, S } from './state';
import { renderLayouts } from './timeline';
import { $ } from './util';
import { fitCanvas } from './windowUi';

/* ---------- 설정 UI ---------- */
export function parseVal(k: string, raw: string | boolean) {
  const d = (DEFAULTS as Record<string, unknown>)[k];
  if (typeof d === 'boolean') return raw === 'true' || raw === true;
  if (typeof d === 'number') { const n = parseFloat(String(raw)); return isNaN(n) ? d : n; }
  return raw;
}
/** 설정값을 이름으로 읽기 (입력칸의 data-k 등) */
const setVal = (k: string | undefined) => (k ? (S.set as Record<string, unknown>)[k] as string | number | boolean : '');
export function applySettingsToUI() {
  if ($('#tlSound')) updateClipSoundBtn();
  renderSndUI(); if (beatGain) beatGain.gain.value = S.set.beatVol;
  document.querySelectorAll<HTMLInputElement>('[data-k]').forEach(el => { el.value = String(setVal(el.dataset.k)); });
  document.querySelectorAll<HTMLElement>('[data-v]').forEach(el => { el.textContent = (+setVal(el.dataset.v)).toFixed(2); });
  applyRes();
  renderLayouts();
}
export function outSize() {
  if (S.set.res === 'custom') { const ev = (v: number) => Math.max(64, Math.min(7680, Math.round((+v || 0) / 2) * 2)); return [ev(S.set.cw), ev(S.set.ch)]; }
  return S.set.res.split('x').map(Number);
}
export function autoBitrate() { const [w, h] = outSize(); return S.set.bitrate > 0 ? S.set.bitrate : Math.max(4, Math.round(w * h * S.set.fps * 0.15 / 1e6)); }
export function applyRes() {
  const [w, h] = outSize();
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; fitCanvas(); }
  $('#customRes').style.display = S.set.res === 'custom' ? 'flex' : 'none';
  $('#resInfo').textContent = `출력 ${w}×${h} · ${S.set.fps}fps · ${autoBitrate()} Mbps${S.set.bitrate > 0 ? '' : ' (자동)'}` + (w * h > 3e6 ? ' · 4K급은 PC 성능에 따라 프레임이 끊길 수 있습니다' : '');
}
document.querySelectorAll<HTMLInputElement>('[data-k]').forEach(el => {
  el.addEventListener('input', () => {
    const k = el.dataset.k; if (!k) return;
    (S.set as Record<string, unknown>)[k] = parseVal(k, el.value);
    const vEl = document.querySelector(`[data-v="${k}"]`); if (vEl) vEl.textContent = (+setVal(k)).toFixed(2);
    if (['res', 'cw', 'ch', 'fps', 'bitrate'].includes(k)) applyRes();
  });
});
