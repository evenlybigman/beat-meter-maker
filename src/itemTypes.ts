// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 조각 종류별 동작 표. 새 조각 종류(자막·이미지 등)는 여기에 한 줄 등록하면 편집·끌기·저장이 같이 동작함.
import { S } from './state';
import type { AudioItem, Item, ItemFile, ItemKind, VideoItem } from './types';

export interface ItemType {
  kind: ItemKind;
  /** 사용자에게 보이는 이름 (되돌리기 표시 등) */
  label: string;
  /** 조각이 들어 있는 목록 */
  list(g: Item): Item[];
  /** 오른쪽 끝을 늘릴 수 있는 한계 (원본 끝까지만 등) */
  maxEnd(g: Item): number;
  /** 편집 뒤 값 보정 */
  clamp(g: Item): void;
  /** 편집 패널 요소 id */
  editor: string;
  /** 타임라인 블록 색(hue)과 글자 */
  hue(g: Item): number | null;
  title(g: Item): string;
}

const base = {
  clamp(g: Item) {
    g.start = Math.max(0, g.start);
    g.off = Math.max(0, g.off);
    if (g.end != null) g.end = Math.min(Math.max(g.start + 0.1, g.end), ITEM_TYPES[g.kind].maxEnd(g));
  },
};

export const ITEM_TYPES: Record<ItemKind, ItemType> = {
  video: {
    ...base,
    kind: 'video', label: '영상',
    list: g => S.tracks.find(tr => tr.includes(g as VideoItem)) || [],
    maxEnd: () => Infinity,                     // 원본보다 길면 반복 재생
    editor: '#segEditWrap',
    hue: g => (g.src ? g.src.hue : null),
    title: g => {
      const v = g as VideoItem, ci = v.src ? S.clips.indexOf(v.src) + 1 : '?';
      return `#${ci} ${v.src ? v.src.name : v.srcName + ' (없음)'}${v.rate && v.rate !== 1 ? ' · ' + v.rate + 'x' : ''}${v.vol > 0 ? ' · 소리 켬' : ''}`;
    },
  },
  audio: {
    ...base,
    kind: 'audio', label: '음악',
    list: () => S.audio,
    maxEnd: g => { const src = (g as AudioItem).src; return src ? g.start + src.dur - g.off : Infinity; },   // 음악은 원본 끝까지만
    editor: '#audEdit',
    hue: g => (g.src ? g.src.hue : null),
    title: g => `음악: ${g.src ? g.src.name : g.srcName + ' (없음)'}${g.vol != null && g.vol !== 1 ? ' · ' + Math.round(g.vol * 100) + '%' : ''}`,
  },
};

/** 회전은 0·90·180·270 중 하나로, 기울기는 -45~45도로 */
export const normRot = (r: unknown) => ((Math.round((+(r as number) || 0) / 90) * 90) % 360 + 360) % 360;
export const clampTilt = (t: unknown) => Math.max(-45, Math.min(45, Math.round(+(t as number) || 0)));
/** 회전을 반영한 원본 크기 (90·270도면 가로·세로가 바뀜) */
export const rotSize = (g: { rot?: number } | null, w: number, h: number): [number, number] => (g && (g.rot === 90 || g.rot === 270) ? [h, w] : [w, h]);
/** 새 조각 */
export function makeItem(kind: 'video', src: VideoItem['src'], start: number, len: number, vol: number): VideoItem;
export function makeItem(kind: 'audio', src: AudioItem['src'], start: number, len: number, vol: number): AudioItem;
export function makeItem(kind: ItemKind, src: any, start: number, len: number, vol: number): Item {
  return { kind, start, end: start + len, src, srcName: src ? src.name : '', off: kind === 'video' && src ? src.inPt : 0, rate: 1, vol, x: 0, y: 0, zoom: 1, flip: false, rot: 0, tilt: 0 };
}
/** 저장용 */
export const itemToFile = (g: Item): ItemFile => ({ kind: g.kind, start: g.start, end: g.end, src: g.src ? g.src.name : g.srcName, off: g.off, rate: g.rate || 1, vol: g.vol, x: g.x || 0, y: g.y || 0, zoom: g.zoom || 1, flip: !!g.flip, rot: normRot(g.rot), tilt: clampTilt(g.tilt) });
/** 불러오기용: 이름으로 원본을 찾아 연결 (없으면 나중에 파일을 넣을 때 연결) */
export function itemFromFile(o: ItemFile): Item {
  const src = o.kind === 'audio' ? S.songs.find(x => x.name === o.src) || null : S.clips.find(c => c.name === o.src && c.dur > 0) || null;
  const g = { kind: o.kind, start: o.start, end: o.end, src, srcName: o.src, off: o.off || 0, rate: o.rate || 1, vol: o.vol == null ? (o.kind === 'audio' ? 1 : 0) : o.vol, x: o.x || 0, y: o.y || 0, zoom: o.zoom || 1, flip: !!o.flip, rot: normRot(o.rot), tilt: clampTilt(o.tilt) } as Item;
  if (g.kind === 'audio' && g.end == null && g.src) g.end = g.start + g.src.dur;
  return g;
}
