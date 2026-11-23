// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 핵심 데이터 타입. 프로젝트 파일(JSON) 형식과 앱 내부 상태의 기준.
import type { DEFAULTS } from './state';

export type Settings = typeof DEFAULTS;

/** 불러온 영상 파일 */
export interface Clip {
  name: string;
  url: string;
  dur: number;
  /** 원본 크기 (불러올 때 한 번 읽음). 재생용 video 요소는 render.ts가 화면별로 돌려 씀 */
  w: number;
  h: number;
  /** 사용 구간 시작·끝(초). outPt 0 = 끝까지 */
  inPt: number;
  outPt: number;
  hue: number;
  failed?: boolean;
  /** 데스크톱 앱: 원본 파일 경로 */
  path?: string;
}

/** 불러온 음악 파일 (영상에서 소리만 꺼낸 것 포함) */
export interface Song {
  name: string;
  /** 영상 파일에서 꺼낸 소리 (목록에 '영상' 표시) */
  fromVideo?: boolean;
  buf: AudioBuffer;
  dur: number;
  pps: number;
  peaks: Float32Array | null;
  /** 앞부분 무음 길이(초) */
  sil: number;
  bpm: number;
  /** 곡 안에서 첫 비트 시각(초) */
  offset: number;
  hue: number;
  /** 데스크톱 앱: 원본 파일 경로 */
  path?: string;
}

/** 조각 종류. 종류별 동작은 itemTypes.ts의 ITEM_TYPES 표에 있음 */
export type ItemKind = 'video' | 'audio';

/** 타임라인 조각 (영상·음악 공통 형태) */
interface ItemBase {
  kind: ItemKind;
  /** 타임라인에서 시작·끝(초). 음악 조각은 프로젝트를 열고 곡을 다시 넣기 전까지 end가 null일 수 있음 */
  start: number;
  end: number;
  /** 원본 파일 이름 (파일을 다시 넣을 때 이 이름으로 연결) */
  srcName: string;
  /** 원본에서 시작 위치(초) */
  off: number;
  rate: number;
  /** 소리 크기 (1 = 100%) */
  vol: number;
  /** 화면 안 위치(-1~1, 화면 크기 비율)·확대·좌우 반전. 음악 조각에서는 쓰지 않음 */
  x: number; y: number; zoom: number; flip: boolean;
  /** 회전(0·90·180·270도, 시계 방향)과 기울기(-45~45도). 기울이면 생기는 빈 귀퉁이는 검게 둠 */
  rot: number; tilt: number;
}
/** 영상 조각: 원본은 클립 */
export interface VideoItem extends ItemBase { kind: 'video'; src: Clip | null }
/** 음악 조각: 원본은 곡 */
export interface AudioItem extends ItemBase { kind: 'audio'; src: Song | null }
export type Item = VideoItem | AudioItem;

export interface SoundEntry { id: string; name: string; buf?: AudioBuffer; b64?: string; custom?: boolean }

/** 되돌리기 한 칸: 그 시점의 비트·조각·영상 길이 + 무슨 작업이었는지 */
export interface UndoEntry { label: string; beats: number[]; songs: Song[]; tracks: VideoItem[][]; audio: AudioItem[]; dur: [Settings['durMode'], number]; sel: [number, number] | null /* 선택 위치 [트랙(-1=음악), 순번] */ }

/** 프로젝트 파일에 저장되는 조각 (v4) */
export interface ItemFile { kind: ItemKind; start: number; end: number | null; src: string; off: number; rate: number; vol: number; x: number; y: number; zoom: number; flip: boolean; rot?: number; tilt?: number }

/** 프로젝트 파일(.beatproj.json) 형식, v4. v1~v3은 project.ts의 migrate()가 이 형식으로 바꿈 */
export interface ProjectFile {
  app: 'beat-meter-maker';
  v: 4;
  sounds: { id: string; name: string; b64: string }[];
  bpm: number; offset: number; musicStart: number;
  beats: number[];
  set: Partial<Settings>;
  songs: string[];
  clips: string[];
  trims: { name: string; inPt: number; outPt: number }[];
  /** 음악 트랙 */
  audio: ItemFile[];
  /** 화면마다 영상 트랙 */
  tracks: ItemFile[][];
  musicVol: number;
  /** 데스크톱 앱: 파일 이름 → 경로. 다시 열 때 파일을 자동으로 불러옴 (웹 버전은 무시) */
  paths?: { clips: Record<string, string>; songs: Record<string, string> };
}
