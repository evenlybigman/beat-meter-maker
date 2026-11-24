// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 랜덤 자동 채우기
import type { Clip, VideoItem } from './types';
import { commit } from './history';
import { clipRate, rateOf } from './clipFx';
import { projDur } from './audio';
import { getRange } from './beats';
import { panelCount } from './render';
import { S } from './state';
import { newItem, pickedClips, sortTrack, useLen, useTlLen } from './timeline';
import { $, lowerBound, toast } from './util';

/* ---------- 랜덤 자동 채우기 (교차) ---------- */
// 결과는 일반 조각이라 채운 뒤에도 자유롭게 편집 가능
export function freeGaps(tr: VideoItem[], a: number, b: number) {
  const gaps = []; let cur = a;
  for (const g of [...tr].sort((x, y) => x.start - y.start)) {
    if (g.end <= cur) continue; if (g.start >= b) break;
    if (g.start > cur) gaps.push([cur, Math.min(g.start, b)]);
    cur = Math.max(cur, g.end); if (cur >= b) break;
  }
  if (cur < b) gaps.push([cur, b]);
  return gaps.filter(([x, y]) => y - x > 0.05);
}
export function clearRange(tr: VideoItem[], a: number, b: number) {
  const out = [];
  for (const g of tr) {
    if (g.end <= a || g.start >= b) { out.push(g); continue; }
    if (g.start < a) out.push({ ...g, end: a });
    if (g.end > b) out.push({ ...g, start: b, off: g.off + (b - g.start) * rateOf(g) });
  }
  return sortTrack(out);
}
export function randomFill() {
  const clips = ($('#fillClips').value === 'sel' ? pickedClips() : S.clips).filter(c => c.dur > 0.05);   // 선택한 클립만 쓰기
  if (!clips.length) return toast('먼저 영상 클립을 불러와 주세요');
  const dur = projDur() || clips.reduce((m, c) => m + useTlLen(c), 0);
  const scope = $('#fillScope').value, target = $('#fillTarget').value;
  let a = 0, b = dur;
  if (scope === 'range') { [a, b] = getRange(); b = Math.min(b, dur); if (!(b > a)) return toast('비트 탭/비트 만들기 바의 구간을 확인해 주세요'); }
  const N = Math.max(1, Math.round(+$('#fillEvery').value || 4)), minLen = Math.max(0.1, +$('#fillMin').value || 0.5), noBeatSec = 2;
  const randOff = $('#fillPos').value === 'rand';
  const ks = target === 'all' ? [...Array(panelCount()).keys()] : [S.track];
  const n = ks.length, rnd = Math.random;
  let made = 0;
  commit('랜덤 채우기', () => {
    if (scope !== 'empty') for (const k of ks) S.tracks[k] = clearRange(S.tracks[k], a, b);   // 대상 화면을 먼저 모두 비움
    ks.forEach((k, ki) => {
      const tr = S.tracks[k];
      const gaps = scope === 'empty' ? freeGaps(tr, a, b) : [[a, b]];
      let lastC: Clip | null = null;
      for (const [ga, gb] of gaps) {
        // 비트 N개마다 자르기 (화면이 여러 개면 화면마다 타이밍을 엇갈리게)
        const pts = [ga];
        if (S.beats.length) {
          let cnt = n > 1 ? -Math.round(ki * N / n) : 0;
          for (let j = lowerBound(S.beats, ga + 0.001); j < S.beats.length && S.beats[j] < gb - 0.001; j++) {
            cnt++;
            if (cnt >= N && S.beats[j] - pts[pts.length - 1] >= minLen) { pts.push(S.beats[j]); cnt = 0; }
          }
        } else for (let t = ga + noBeatSec; t < gb - 0.05; t += noBeatSec) pts.push(t);
        if (gb - pts[pts.length - 1] < Math.min(minLen, 0.3) && pts.length > 1) pts.pop();
        pts.push(gb);
        for (let i = 0; i < pts.length - 1; i++) {
          const s0 = pts[i], s1 = pts[i + 1], len = s1 - s0;
          // 직전 클립 제외 + 다른 화면에 같은 시간에 나오는 클립과 최대한 안 겹치게
          const ov = (c: Clip) => { let o = 0; if (n > 1) for (const kk of ks) { if (kk === k) continue; for (const g of S.tracks[kk]) if (g.src === c && g.start < s1 && g.end > s0) o += Math.min(s1, g.end) - Math.max(s0, g.start); } return o; };
          const sc = clips.map(c => ov(c) * 4 + (c === lastC && clips.length > 1 ? len * 0.9 : 0)), m = Math.min(...sc);
          const cands = clips.filter((c, ii) => sc[ii] <= m + 1e-6);
          const c = cands[Math.floor(rnd() * cands.length)]; lastC = c;
          const g = newItem(c, s0, len);
          g.off = randOff ? c.inPt + rnd() * Math.max(0, useLen(c) - len * clipRate(c)) : c.inPt;   // 속도가 빠르면 원본을 더 많이 씀
          tr.push(g); made++;
        }
      }
      sortTrack(tr);
    });
    S.selItem = null; S.selItems = [];
  });
  toast(`조각 ${made}개를 랜덤으로 채웠습니다 — 다시 누르면 새로 섞입니다 (Ctrl+Z 되돌리기)`, 3500);
}
