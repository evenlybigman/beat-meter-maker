// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 클립 기본 편집 값: 회전·반전·자르기·확대·밝기/대비/채도·속도
// 클립에 걸어 두면 그 클립으로 만든 조각 전부(이미 있는 것, 랜덤 채우기로 새로 생기는 것)에 적용됨
import type { Clip, ClipFx, Item } from './types';

export const defaultFx = (): ClipFx => ({ rot: 0, flipH: false, flipV: false, crop: [0, 0, 0, 0], zoom: 1, bri: 100, con: 100, sat: 100, rate: 1 });
const DEF = Object.freeze(defaultFx());
export const fxOf = (c: Clip | null | undefined): ClipFx => (c && c.fx) || DEF;
export const isDefaultFx = (fx: ClipFx | undefined) => !fx || JSON.stringify(fx) === JSON.stringify(DEF);
/** 밝기·대비·채도 → 캔버스 filter 문자열 (그대로면 빈 문자열) */
export const cssFilter = (fx: ClipFx) => (fx.bri === 100 && fx.con === 100 && fx.sat === 100 ? '' : `brightness(${fx.bri}%) contrast(${fx.con}%) saturate(${fx.sat}%)`);
export const clipRate = (c: Clip | null | undefined) => fxOf(c).rate || 1;
/** 실제 재생 속도 = 조각 속도 × 클립 기본 속도 (음악 조각은 조각 속도만) */
export const rateOf = (g: Item) => (g.rate || 1) * (g.kind === 'video' ? clipRate(g.src) : 1);
export const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const clamp = (v: unknown, a: number, b: number, d: number) => { const n = +(v as number); return isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
/** 파일에서 읽은 값 정리 (잘못된 값은 기본값으로) */
export function normFx(o: any): ClipFx {
  const d = defaultFx(); if (!o || typeof o !== 'object') return d;
  const cr = Array.isArray(o.crop) ? o.crop : [];
  return {
    rot: ((Math.round(clamp(o.rot, -360, 720, 0) / 90) * 90) % 360 + 360) % 360,
    flipH: !!o.flipH, flipV: !!o.flipV,
    crop: [0, 1, 2, 3].map(i => clamp(cr[i], 0, 0.45, 0)) as ClipFx['crop'],
    zoom: clamp(o.zoom, 1, 3, 1),
    bri: clamp(o.bri, 0, 200, 100), con: clamp(o.con, 0, 200, 100), sat: clamp(o.sat, 0, 200, 100),
    rate: clamp(o.rate, 0.25, 4, 1),
  };
}
