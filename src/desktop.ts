// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 데스크톱 앱(Electron)에서만 있는 기능. 웹 버전에서는 desk()가 null
export interface DeskApi {
  desktop: true;
  pathOf(file: File): string;
  mediaUrl(path: string): string;
  exists(paths: string[]): Promise<boolean[]>;
  showInFolder(path: string): Promise<void>;
  ffVersion(): Promise<string | null>;
  extractAudio(path: string): Promise<Uint8Array>;
  memory(): Promise<{ privateKB: number; residentKB: number; heapKB: number }>;
  mainLog(): Promise<string[]>;
  versions: { electron: string; chrome: string; node: string; os: string };
  metrics(): Promise<{ type: string; name: string; cpu: number; workingSetKB: number; privateKB: number }[]>;
  update?: { onReady(cb: (i: { version: string }) => void): void; install(): Promise<boolean> };
  dec: {
    open(o: { id: string; path: string; ss: number; rate: number; fps: number; w: number; h: number; loop: boolean }): Promise<boolean>;
    read(id: string): Promise<Uint8Array | null>;
    close(id: string): Promise<boolean>;
  };
  exp: {
    begin(o: { name: string; mode: 'h264' | 'rgba'; w: number; h: number; fps: number; dur: number; bitrate: number; wav: Uint8Array;
      clipAudio: { path: string; start: number; len: number; ss: number; rate: number; vol: number; loop: boolean }[] }): Promise<{ canceled?: boolean; path?: string }>;
    frame(data: Uint8Array | Uint8ClampedArray): Promise<boolean>;
    end(cancel: boolean): Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;
  };
}
export const desk = (): DeskApi | null => (window as any).bmm || null;

/** 경로로만 아는 파일 (프로젝트를 열 때 다시 연결). File 대신 addClips·loadMusicFiles에 넘김 */
export interface PathFile { name: string; path: string; size: number; type: string; arrayBuffer(): Promise<ArrayBuffer> }
export function pathFile(p: string): PathFile {
  const D = desk()!, name = p.split(/[\\/]/).pop() || p;   // 경로 파일은 데스크톱에서만 만듦
  return { name, path: p, size: 0, type: '', arrayBuffer: () => fetch(D.mediaUrl(p)).then(r => r.arrayBuffer()) };
}
/** File이든 PathFile이든 실제 경로 (웹 버전이면 '') */
export function filePath(f: File | PathFile): string {
  if ((f as PathFile).path) return (f as PathFile).path;
  const D = desk(); return D && f instanceof Blob ? D.pathOf(f as File) : '';
}
