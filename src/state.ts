// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 앱 전체 상태(S)와 기본 설정(DEFAULTS)
import type { AudioItem, Clip, Song, UndoEntry, VideoItem } from './types';
import { projDur } from './audio';

export const DEFAULTS = {
  durMode: 'auto' as 'auto' | 'manual',
  fit: 'cover',
  showOverlay: true, mode: 'single', pos: 'bottom', shape: 'bar',
  barSize: 0.09, barAlpha: 0.55, window: 2.5,
  barColor: '#000000', beatColor: '#ffffff', targetColor: '#14b8a6', flashColor: '#5eead4',
  showCounter: false, clipSound: true, durSec: 60, beatSoundOn: true, beatSound: 'tick', beatVol: 0.8, beatTapSound: true, layout: '1', gap: 6, gapColor: '#000000', res: '1920x1080', cw: 1920, ch: 1080, fps: 30, bitrate: 0
};

export interface AppState {
  clips: Clip[];
  music: { pps: number; readonly dur: number; /** 영상 길이가 0보다 크면 true (예전 코드 호환) */ readonly el: boolean | null; readonly name: string };
  songs: Song[]; audio: AudioItem[];
  beats: number[]; bpm: number; offset: number;
  playing: boolean; exporting: boolean; undo: UndoEntry[];
  zoom: number; latency: number; snap: boolean; musicStart: number; musicVol: number;
  selItem: VideoItem | AudioItem | null; selClip: Clip | null;
  /** 여러 개 선택 (Ctrl·Shift 클릭, 드래그). selItem·selClip은 그중 기준이 되는 하나 (편집 패널에 보이는 것) */
  selItems: (VideoItem | AudioItem)[]; selClips: Clip[];
  pendingTrims: Record<string, { inPt?: number; outPt?: number; fx?: unknown; len?: number }>;
  /** 화면마다 트랙 1개 */
  tracks: VideoItem[][]; track: number;
  /** 지금 선택한 화면의 트랙 (S.tracks[S.track]) */
  segments: VideoItem[];
  set: typeof DEFAULTS;
}

export const S: AppState = {
  clips: [],
  music: { pps: 200, get dur() { return projDur(); }, get el() { return projDur() > 0 ? true : null; }, get name() { return S.songs[0] ? S.songs[0].name : 'beatmeter'; } },
  songs: [], audio: [],
  beats: [], bpm: 120, offset: 0,
  playing: false, exporting: false, undo: [],
  zoom: 8, latency: 0, snap: true, musicStart: 0, musicVol: 1,
  selItem: null, selClip: null, selItems: [], selClips: [], pendingTrims: {}, tracks: [[]], track: 0,
  segments: undefined as never,   // 아래 getter로 대체
  set: { ...DEFAULTS }
};

delete (S as Partial<AppState>).segments;
Object.defineProperty(S, 'segments', { get() { return S.tracks[S.track] || (S.tracks[S.track] = []); }, set(v) { S.tracks[S.track] = v; } });
