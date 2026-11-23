// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 편집 기록: 되돌리기·다시 실행, 그리고 모든 편집이 거치는 commit()
//
// 사용법
//   commit('조각 자르기', () => { ...상태 변경... })   한 번에 끝나는 편집. 기록 → 변경 → 정렬·화면 갱신
//   record('조각 옮기기') ... afterEdit()              끌기·슬라이더처럼 계속 바뀌는 조작. 시작할 때 한 번 기록, 끝날 때 갱신
// fn이 false를 돌려주면 아무것도 안 바뀐 것으로 보고 기록을 취소함.
import { S } from './state';
import type { UndoEntry } from './types';
import { afterAudioChange, renderSongList } from './songs';
import { updateBeatInfo } from './beats';
import { ensureTracks, refreshTimeline, sortTrack, listOf } from './timeline';
import { $, toast } from './util';

const MAX = 100;
const past: UndoEntry[] = [];
const future: UndoEntry[] = [];

function snapshot(label: string): UndoEntry {
  return {
    label,
    beats: S.beats.slice(),
    songs: S.songs.slice(),
    tracks: S.tracks.map(tr => tr.map(g => ({ ...g }))),
    audio: S.audio.map(g => ({ ...g })),
    dur: [S.set.durMode, S.set.durSec],
    sel: selPos(),
  };
}
// 선택된 조각의 위치(트랙, 순번)를 기억했다가 되돌린 상태에서 같은 자리를 다시 선택
function selPos(): UndoEntry['sel'] {
  const g = S.selItem; if (!g) return null;
  if (g.kind === 'audio') { const i = S.audio.indexOf(g); return i < 0 ? null : [-1, i]; }
  for (let k = 0; k < S.tracks.length; k++) { const i = S.tracks[k].indexOf(g); if (i >= 0) return [k, i]; }
  return null;
}
function restore(u: UndoEntry) {
  S.beats = u.beats; S.songs = u.songs; S.tracks = u.tracks; S.audio = u.audio;
  [S.set.durMode, S.set.durSec] = u.dur;
  const p = u.sel, list = p ? (p[0] < 0 ? S.audio : S.tracks[p[0]]) : null;
  S.selItem = (p && list && list[p[1]]) || null;
  if (p && p[0] >= 0 && S.selItem) S.track = p[0];
}
// 음악 쪽이 바뀌었는지 판단용 (바뀌었을 때만 재생 중인 음악을 다시 예약)
const audioKey = () => JSON.stringify([S.audio.map(g => [g.srcName, g.start, g.end, g.off, g.vol]), S.set.durMode, S.set.durSec]);

/** 변경 직전 상태를 기록. 새 기록이 생기면 다시 실행 목록은 비움 */
export function record(label: string) {
  past.push(snapshot(label));
  if (past.length > MAX) past.shift();
  future.length = 0;
  updateHistoryUI();
}
/** 편집 뒤 공통 처리: 정렬, 사라진 선택 해제, 음악 재예약, 화면 갱신 */
export function afterEdit(audioChanged = true) {
  for (const tr of S.tracks) sortTrack(tr);
  sortTrack(S.audio);
  if (S.selItem && !listOf(S.selItem).includes(S.selItem as never)) S.selItem = null;
  if (audioChanged) { afterAudioChange(); renderSongList(); }
  updateBeatInfo(); refreshTimeline();
}
export function commit(label: string, fn: () => unknown): boolean {
  const key = audioKey();
  record(label);
  let r: unknown;
  try { r = fn(); } catch (e) { past.pop(); updateHistoryUI(); throw e; }
  if (r === false) { past.pop(); updateHistoryUI(); return false; }
  afterEdit(audioKey() !== key);
  return true;
}
export function undo() {
  const u = past.pop();
  if (!u) return toast('되돌릴 작업이 없습니다');
  future.push(snapshot(u.label));
  restore(u); ensureTracks(); afterEdit(true); updateHistoryUI();
  toast(`되돌림: ${u.label}`);
}
export function redo() {
  const u = future.pop();
  if (!u) return toast('다시 실행할 작업이 없습니다');
  past.push(snapshot(u.label));
  restore(u); ensureTracks(); afterEdit(true); updateHistoryUI();
  toast(`다시 실행: ${u.label}`);
}
/** 마지막으로 기록한 것을 조용히 취소 (예: 끌기를 시작했지만 실제로는 안 움직임) */
export function dropLast() { past.pop(); updateHistoryUI(); }
export function updateHistoryUI() {
  const u = $('#tlUndo'), r = $('#tlRedo'); if (!u || !r) return;
  u.disabled = !past.length; r.disabled = !future.length;
  u.title = past.length ? `되돌리기: ${past[past.length - 1].label} (Ctrl+Z)` : '되돌릴 작업 없음';
  r.title = future.length ? `다시 실행: ${future[future.length - 1].label} (Ctrl+Shift+Z)` : '다시 실행할 작업 없음';
}
export const historySize = () => ({ past: past.length, future: future.length });
