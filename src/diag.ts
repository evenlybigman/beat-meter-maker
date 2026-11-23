// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 진단 정보: 오류 기록 모으기, 문제 신고용 파일 만들기
// 파일에는 음악·영상 내용이 들어가지 않고, 폴더 경로는 지움 (파일 이름만 남음)
import { projDur } from './audio';
import { desk } from './desktop';
import { historySize } from './history';
import { S } from './state';
import { LOG, download, logEvent, toast } from './util';

declare const __APP_VERSION__: string;
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

let warned = false;
function onError(msg: string) {
  logEvent('error', msg);
  if (!warned) { warned = true; toast('오류가 기록되었습니다 — 출력 탭의 "진단 정보 저장"으로 파일을 만들어 알려 주세요', 6000); }
}
export function initDiag() {
  window.addEventListener('error', e => onError(`${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno}${e.error && e.error.stack ? '\n' + e.error.stack : ''}`));
  window.addEventListener('unhandledrejection', e => { const r: any = e.reason; onError('처리 안 된 Promise 오류: ' + (r && r.stack ? r.stack : String(r))); });
  for (const k of ['error', 'warn'] as const) {
    const orig = console[k].bind(console);
    console[k] = (...a: any[]) => { logEvent(k, a.map(x => (x && x.stack) || (typeof x === 'object' ? safeJson(x) : String(x))).join(' ')); orig(...a); };
  }
}
/** 그리기 루프처럼 계속 도는 곳의 오류: 기록만 하고 멈추지 않음 */
export function reportLoopError(where: string, e: any) { onError(`${where}: ${e && e.stack ? e.stack : String(e)}`); }

const safeJson = (x: any) => { try { return JSON.stringify(x); } catch (e) { return String(x); } };
/** 폴더 경로를 지우고 파일 이름만 남김 (C:\Users\이름\…\a.mp4 → …/a.mp4, /home/이름/a.mp4 → …/a.mp4)
    폴더 이름에 빈칸이 있어도 지움. 웹 주소(https://…)는 그대로 */
const PATH_RE = /(?:file:\/\/\/?|app:\/\/local\/media\?p=)?(?:[A-Za-z]:[\\/]|\\\\|(?<![:\w/])\/(?=[^\s/]+\/))(?:(?:[^"'<>|*?\\/\s]|[ \t](?![\\/]|[A-Za-z]:[\\/]))+[\\/])+/g;
export const scrubPaths = (s: string) => s.replace(/%(2F|5C|3A|20)/gi, m => decodeURIComponent(m)).replace(PATH_RE, '…/');
/** 객체 안의 모든 문자열에 scrubPaths 적용 */
export const scrubDeep = (x: any): any => typeof x === 'string' ? scrubPaths(x) : Array.isArray(x) ? x.map(scrubDeep)
  : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, scrubDeep(v)])) : x;
const ext = (n: string) => ((/\.([A-Za-z0-9]{1,5})$/.exec(n) || [])[1] || '?').toLowerCase();
const r2 = (x: number) => Math.round(x * 100) / 100;

export async function collectDiag() {
  const D = desk();
  const mem: any = {};
  const pm = (performance as any).memory;
  if (pm) mem.jsHeapMB = Math.round(pm.usedJSHeapSize / 1048576);
  if (D) {
    try { const m = await D.memory(); mem.rendererMB = Math.round(m.privateKB / 1024); } catch (e) {}
    try { mem.processes = (await D.metrics()).map(x => ({ type: x.type, name: x.name, MB: Math.round(x.workingSetKB / 1024), cpu: x.cpu })); } catch (e) {}
  }
  const actx: AudioContext = (window as any).actx;
  const data = {
    app: 'beat-meter-maker', version: APP_VERSION, author: 'Juke', created: new Date().toISOString(),
    mode: D ? 'desktop' : 'web',
    env: {
      userAgent: navigator.userAgent, language: navigator.language, cores: navigator.hardwareConcurrency,
      screen: `${screen.width}x${screen.height} @${devicePixelRatio}`, window: `${innerWidth}x${innerHeight}`,
      ...(D ? { versions: D.versions, ffmpeg: await D.ffVersion().catch(() => null) } : {}),
      audio: actx ? { sampleRate: actx.sampleRate, state: actx.state } : null,
      webcodecsH264: 'VideoEncoder' in window,
    },
    memory: mem,
    project: {
      duration: r2(projDur()), beats: S.beats.length, bpm: S.bpm, layout: S.set.layout,
      songs: S.songs.map(x => ({ ext: ext(x.name), dur: r2(x.dur), bpm: x.bpm, fromVideo: !!x.fromVideo })),
      clips: S.clips.map(c => ({ ext: ext(c.name), dur: r2(c.dur), size: `${c.w}x${c.h}`, failed: !!c.failed })),
      items: { tracks: S.tracks.map(tr => tr.length), audio: S.audio.length, missing: [...S.tracks.flat(), ...S.audio].filter(g => !g.src).length },
      undoSteps: historySize(),
      settings: S.set,
    },
    lastExport: (window as any).__lastExport ? { ...(window as any).__lastExport, path: undefined } : null,
    log: LOG,
    mainLog: D ? await D.mainLog().catch(() => []) : [],
  };
  return scrubDeep(JSON.parse(JSON.stringify(data)));
}
export async function saveDiag() {
  const d = await collectDiag();
  const stamp = d.created.slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})/, '$1-');
  download(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), `beatmeter-진단-${stamp}.json`);
  toast('진단 정보를 저장했습니다 — 문제를 알릴 때 이 파일을 같이 보내 주세요', 4500);
}
