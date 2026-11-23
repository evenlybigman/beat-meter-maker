// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 오디오 컨텍스트, 영상 길이, 재생 시계, 음악 재생 예약
import { initBeatAudio, stopBeatSounds } from './beatsound';
import { S } from './state';
import { $, fmt } from './util';

/* ---------- 오디오 ---------- */
// 오디오 컨텍스트는 처음 재생·소리 미리듣기 때 만듦 (브라우저 정책: 사용자 조작 뒤에 시작). 아직 없으면 null
export let actx: AudioContext | null = null, exportDest: MediaStreamAudioDestinationNode | null = null, musicGain: GainNode | null = null;
/** 오디오 컨텍스트 (없으면 만듦) */
export function ensureAudio(): AudioContext {
  if (actx) return actx;
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)() as AudioContext;
  const dest = ctx.createMediaStreamDestination(), g = ctx.createGain();
  g.gain.value = S.musicVol; g.connect(ctx.destination); g.connect(dest);
  actx = ctx; exportDest = dest; musicGain = g;
  initBeatAudio();
  return ctx;
}
/** 음악·녹음 출력 노드 (없으면 오디오를 먼저 만듦) */
export function audioOut() { ensureAudio(); return { musicGain: musicGain!, exportDest: exportDest! }; }

/* ---------- 영상 길이 ---------- */
export const audioEnd = () => S.audio.reduce((m, g) => Math.max(m, g.end), 0);
export const videoEnd = () => S.tracks.flat().reduce((m, g) => Math.max(m, g.end), 0);
export function projDur() {
  if (S.set.durMode === 'manual') return Math.max(1, +S.set.durSec || 0);
  return S.audio.length ? audioEnd() : videoEnd();
}
// 타임라인에 조각을 넣을 때 길이 제한 (음악이 있거나 길이를 직접 정했을 때만)
export const limitDur = () => (S.set.durMode === 'manual' || S.audio.length) ? projDur() : Infinity;
export function updateDurUI() {
  const d = projDur();
  $('#durMode').value = S.set.durMode;
  $('#durSec').value = (S.set.durMode === 'manual' ? +S.set.durSec : d).toFixed(2);
  $('#durSec').disabled = S.set.durMode !== 'manual';
  $('#durInfo').textContent = `영상 길이 ${fmt(d)}` + (S.set.durMode === 'manual' ? ' (직접 지정)' : S.audio.length ? ' (음악 끝까지)' : ' (영상 끝까지)');
}
export function setDuration(sec: number) { S.set.durMode = 'manual'; S.set.durSec = Math.max(1, Math.round(sec * 100) / 100); updateDurUI(); if (now() > projDur()) seek(projDur()); }

/* ---------- 재생 시계 (오디오 시계 기준, 음악 파일과 독립) ---------- */
export const CLK = { pos: 0, p0: 0, t0: 0, nodes: [] as AudioBufferSourceNode[] };
export const now = () => (S.playing && actx) ? Math.max(CLK.p0, Math.min(projDur(), CLK.p0 + (actx.currentTime - CLK.t0))) : CLK.pos;
export function seek(t: number) {
  t = Math.max(0, Math.min(Math.max(0, projDur() - 0.01), t || 0));
  stopBeatSounds();
  if (S.playing && actx) { stopAudio(); CLK.p0 = t; CLK.t0 = actx.currentTime + 0.05; startAudio(t, CLK.t0); }
  else CLK.pos = t;
}
export function startAudio(pos: number, when: number) {
  const ac = ensureAudio(), { musicGain } = audioOut(), end = projDur();
  for (const g of S.audio) {
    if (!g.src || !g.src.buf || g.end <= pos || g.start >= end) continue;
    const st = Math.max(pos, g.start), stop = Math.min(g.end, end), off = g.off + (st - g.start);
    if (stop - st < 0.01 || off >= g.src.buf.duration) continue;
    const src = ac.createBufferSource(), gn = ac.createGain();
    src.buffer = g.src.buf; gn.gain.value = g.vol == null ? 1 : g.vol;
    src.connect(gn); gn.connect(musicGain);
    src.start(when + (st - pos), off, stop - st);
    CLK.nodes.push(src);
  }
}
export function stopAudio() { for (const n of CLK.nodes.splice(0)) { try { n.stop(); } catch (e) {} } }
export function resyncAudio() { if (S.playing && actx) { const t = now(); stopAudio(); CLK.p0 = t; CLK.t0 = actx.currentTime + 0.03; startAudio(t, CLK.t0); } }
