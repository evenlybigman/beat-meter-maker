// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 비트 목록 편집, 탭 템포, 녹음, 패턴
import { afterEdit, commit, record } from './history';
import { btnHtml } from './icons';
import { actx, now, projDur } from './audio';
import { SND, playSnd } from './beatsound';
import { pause, play } from './player';
import { S } from './state';
import { $, fmt, lowerBound, status, toast } from './util';

/* ---------- 비트 ---------- */
export function gridBeats(a: number, b: number, mult: number) {
  const out: number[] = []; if (mult <= 0 || S.bpm <= 0) return out;
  const p = 60 / S.bpm / mult;
  let k = Math.ceil((a - S.offset) / p - 1e-6);
  for (; ; k++) { const t = S.offset + k * p; if (t >= b - 1e-6) break; if (t >= 0) out.push(Math.round(t * 10000) / 10000); }
  return out;
}
export function generateAll(silent?: boolean) {
  const dur = projDur(); if (!dur) return toast('먼저 음악이나 영상을 넣어 주세요');
  commit('비트 자동 생성', () => {
    const mult = +$('#genMult').value; let out = [];
    if (S.audio.length && $('#genSrc').value === 'song') {
      // 음악 조각마다 그 곡의 BPM·박자 위치로 생성 (곡이 바뀌면 템포도 따라 바뀜)
      for (const g of S.audio) {
        const s = g.src; if (!s || !s.bpm) continue;
        const p = 60 / s.bpm / mult, anchor = g.start - g.off + s.offset;
        const a = Math.max(g.start, g.start + s.sil - g.off - 0.03), b = Math.min(g.end, dur);
        for (let k = Math.ceil((a - anchor) / p - 1e-6); ; k++) { const t = anchor + k * p; if (t >= b - 1e-6) break; if (t >= 0) out.push(Math.round(t * 10000) / 10000); }
      }
    } else out = gridBeats(Math.max(0, S.musicStart - 0.03), dur, mult);
    out.sort((x, y) => x - y);
    S.beats = out.filter((t, i) => i === 0 || t - out[i - 1] > 0.01);
  });
}
export function applyRange() {
  let a = +$('#rA').value, b = +$('#rB').value; if (b < a) [a, b] = [b, a];
  if (!(b > a)) return toast('구간을 확인해 주세요');
  commit('구간 속도 적용', () => {
    const keep = S.beats.filter(t => t < a || t >= b);
    S.beats = keep.concat(gridBeats(a, b, +$('#rMult').value)).sort((x, y) => x - y);
  });
  toast(`${a.toFixed(1)}~${b.toFixed(1)}초 구간 적용`);
}
export function snapTime(t: number) { if (!S.snap || S.bpm <= 0) return t; const p = 60 / S.bpm / 4; return S.offset + Math.round((t - S.offset) / p) * p; }
export function addBeat(t: number, snap = true) {
  if (t < 0 || (S.music.dur && t > S.music.dur)) return;
  if (snap) t = snapTime(t);
  t = Math.round(t * 10000) / 10000;
  const i = lowerBound(S.beats, t);
  if ((S.beats[i] !== undefined && Math.abs(S.beats[i] - t) < 0.01) || (i > 0 && Math.abs(S.beats[i - 1] - t) < 0.01)) return;
  commit('비트 추가', () => { S.beats.splice(i, 0, t); });
}
export function nearestBeat(t: number) {
  const i = lowerBound(S.beats, t); let bi = -1, bd = Infinity;
  for (const j of [i - 1, i]) if (j >= 0 && j < S.beats.length) { const d = Math.abs(S.beats[j] - t); if (d < bd) { bd = d; bi = j; } }
  return { i: bi, d: bd };
}
export function removeBeatAt(i: number) { if (i < 0) return; commit('비트 삭제', () => { S.beats.splice(i, 1); }); }
export function beatsChanged() { updateBeatInfo(); }
export function updateBeatInfo() {
  const n = S.beats.length;
  let txt = `비트 ${n}개`;
  if (n > 1 && S.music.dur) txt += ` · 평균 ${(n / S.music.dur * 60).toFixed(1)}회/분`;
  $('#beatInfo').textContent = txt;
}
export function syncBeatInputs() { $('#bpm').value = S.bpm; $('#offset').value = S.offset; }

export let taps: number[] = [];
export function tap() {
  const n = performance.now();
  if (taps.length && n - taps[taps.length - 1] > 2000) taps = [];
  taps.push(n); if (taps.length > 16) taps.shift();
  if (taps.length >= 4) {
    const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    S.bpm = Math.round(60000 / iv * 100) / 100;
    if (S.music.el && S.playing) {
      const p = 60 / S.bpm, t = now() - S.latency / 1000;
      S.offset = Math.round((((t % p) + p) % p) * 1000) / 1000;
    }
    syncBeatInputs(); $('#genSrc').value = 'global';
    status(`탭 템포: ${S.bpm} BPM` + (S.playing ? ` · 오프셋 ${S.offset}s` : '') + ' — "전체 비트 생성"을 누르면 적용됩니다');
  } else status(`탭 템포… ${taps.length}/4`);
}

/* ---------- 직접 만들기: 녹음 ---------- */
export const R = { on: false, start: 0, set: new Set() };
export function getRange() { let a = +$('#rA').value, b = +$('#rB').value; if (b < a) [a, b] = [b, a]; return [Math.max(0, a), b]; }
export function setA() { $('#rA').value = now().toFixed(2); }
export function setB() { $('#rB').value = now().toFixed(2); }
export function quant(t: number) { if (!$('#recQuant').checked || S.bpm <= 0) return t; const p = 60 / S.bpm / 4; return S.offset + Math.round((t - S.offset) / p) * p; }
export function insertBeat(t: number) {
  const i = lowerBound(S.beats, t);
  if ((S.beats[i] !== undefined && Math.abs(S.beats[i] - t) < 0.01) || (i > 0 && Math.abs(S.beats[i - 1] - t) < 0.01)) return false;
  S.beats.splice(i, 0, t); return true;
}
export async function startRec() {
  if (!S.music.el) return toast('먼저 음악을 넣어 주세요');
  if (S.exporting) return;
  record('비트 녹음');                  // 녹음이 끝날 때까지 찍는 비트는 되돌리기 한 번으로 묶임
  R.on = true; R.start = now(); R.set = new Set();
  $('#btnRec').classList.add('on'); $('#btnRec').innerHTML = btnHtml('stop', '녹음 중지', 'R');
  if (!S.playing) await play();
  status('녹음 중 — 음악에 맞춰 B 키나 TAP 버튼을 누르세요');
}
export function stopRec() {
  if (!R.on) return;
  R.on = false;
  const end = now();
  if ($('#recOver').checked) S.beats = S.beats.filter(b => b < R.start - 0.02 || b > end + 0.02 || R.set.has(b));
  pause();
  $('#btnRec').classList.remove('on'); $('#btnRec').innerHTML = btnHtml('rec', '녹음 시작', 'R');
  afterEdit(false);
  status(`녹음 완료: ${fmt(R.start)} ~ ${fmt(end)} 구간에 비트 ${R.set.size}개`);
  toast(`비트 ${R.set.size}개 녹음 완료 (Ctrl+Z로 되돌리기)`);
}
let hitTimer = 0;
export function hit() {
  const pad = $('#pad'); pad.classList.add('hit'); clearTimeout(hitTimer); hitTimer = window.setTimeout(() => pad.classList.remove('hit'), 90);
  if (!S.music.el) return toast('먼저 음악을 넣어 주세요');
  let t = quant(now() - S.latency / 1000);
  t = Math.round(t * 10000) / 10000;
  if (t < 0) return;
  if (S.set.beatTapSound && actx && SND.ready) playSnd();
  if (R.on) { if (insertBeat(t)) { R.set.add(t); SND.done.add(t); } updateBeatInfo(); status(`녹음 중 · ${R.set.size}개`); }
  else addBeat(t, false);
}

/* ---------- 직접 만들기: 패턴 (1마디 16칸) ---------- */
export const PRESETS: Record<string, number[]> = {
  q: [0, 4, 8, 12], h: [0, 8], e: [0, 2, 4, 6, 8, 10, 12, 14], s: [...Array(16).keys()],
  sync: [0, 3, 6, 8, 11, 14], gallop: [0, 3, 4, 7, 8, 11, 12, 15], dbl: [0, 1, 4, 5, 8, 9, 12, 13], clr: []
};
export let pattern = new Array(16).fill(false);
export function setPreset(k: string) { pattern = new Array(16).fill(false); (PRESETS[k] || []).forEach(i => pattern[i] = true); renderSteps(); }
export function renderSteps() {
  const box = $('#steps'); box.innerHTML = '';
  pattern.forEach((on, i) => {
    const b = document.createElement('button');
    b.textContent = i % 4 === 0 ? String(i / 4 + 1) : '';
    b.title = `${Math.floor(i / 4) + 1}박 ${i % 4 + 1}번째 16분`;
    b.classList.toggle('on', on);
    b.onclick = () => { pattern[i] = !pattern[i]; b.classList.toggle('on', pattern[i]); };
    box.appendChild(b);
  });
}
export function applyPattern(a: number, b: number) {
  if (S.bpm <= 0) return;
  let n = 0;
  commit('패턴 적용', () => {
    const bar = 240 / S.bpm, st = bar / 16, out: number[] = [];
    for (let k = Math.floor((a - S.offset) / bar) - 1; ; k++) {
      const bs = S.offset + k * bar; if (bs >= b) break;
      pattern.forEach((on, i) => { if (!on) return; const t = Math.round((bs + i * st) * 10000) / 10000; if (t >= a && t < b && t >= 0) out.push(t); });
    }
    S.beats = S.beats.filter(t => t < a || t >= b).concat(out.filter(t => t >= S.musicStart - 0.03)).sort((x, y) => x - y);
    n = out.length;
  });
  toast(`${fmt(a)} ~ ${fmt(b)}에 패턴 적용 (비트 ${n}개)`);
}
