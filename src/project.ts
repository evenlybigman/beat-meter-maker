// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 프로젝트 저장·불러오기·검증, 자동 저장
import { record } from './history';
import type { AudioItem, ProjectFile, VideoItem } from './types';
import { itemFromFile, itemToFile } from './itemTypes';
/** 자동 저장 한 건 */
export interface AutosaveEntry { time: number; data: ProjectFile }
import { syncBeatInputs, updateBeatInfo } from './beats';
import { SND, loadSoundData } from './beatsound';
import { addClips, renderClipList } from './clips';
import { desk, pathFile } from './desktop';
import { setMusicVol } from './events';
import { refreshEmpty } from './player';
import { applySettingsToUI } from './settings';
import { afterAudioChange, loadMusicFiles, renderSongList } from './songs';
import { DEFAULTS, S } from './state';
import { ensureTracks, sortTrack } from './timeline';
import { $, baseName, download, toast } from './util';

/* ---------- 프로젝트 ---------- */
// 저장·자동 저장이 같이 쓰는 프로젝트 데이터 (미디어 파일은 이름만), 형식 v4
export function projectData(): ProjectFile {
  return {
    app: 'beat-meter-maker', v: 4,
    sounds: SND.list.filter(x => x.custom).map(x => ({ id: x.id, name: x.name, b64: x.b64 || '' })),
    bpm: S.bpm, offset: S.offset, musicStart: S.musicStart, beats: S.beats, set: S.set,
    songs: S.songs.map(x => x.name),
    clips: S.clips.map(c => c.name), trims: S.clips.map(c => ({ name: c.name, inPt: c.inPt, outPt: c.outPt })),
    audio: S.audio.map(itemToFile),
    tracks: S.tracks.map(tr => tr.map(itemToFile)),
    musicVol: S.musicVol,
    ...mediaPaths(),
  };
}
// 데스크톱 앱에서만: 파일 경로 (웹 버전은 경로를 알 수 없어서 넣지 않음)
function mediaPaths(): Pick<ProjectFile, 'paths'> {
  const clips: Record<string, string> = {}, songs: Record<string, string> = {};
  for (const c of S.clips) if (c.path) clips[c.name] = c.path;
  for (const x of S.songs) if (x.path) songs[x.name] = x.path;
  return Object.keys(clips).length || Object.keys(songs).length ? { paths: { clips, songs } } : {};
}
export const isEmptyProject = (d: Partial<ProjectFile>) => !(d.songs || []).length && !(d.clips || []).length && !(d.beats || []).length && !(d.sounds || []).length;
export function saveProject() {
  download(new Blob([JSON.stringify(projectData())], { type: 'application/json' }), `${baseName(S.music.name)}.beatproj.json`);
  toast('프로젝트를 저장했습니다');
}

/** 예전 형식(v1~v3)을 v4로 바꿈. v4는 그대로. 원본은 건드리지 않음 */
export function migrate(d: any): ProjectFile { return stripVideoMark(d.v === 4 ? d : toV4(d)); }
/** 예전 버전은 영상에서 꺼낸 음악 이름 앞에 '🎬 '를 붙여 저장했음 → 떼어 내 지금 이름과 맞춤 */
const VMARK = /^\u{1F3AC}\s?/u;
function stripVideoMark(d: ProjectFile): ProjectFile {
  const f = (n: unknown) => (typeof n === 'string' ? n.replace(VMARK, '') : n) as string;
  if (Array.isArray(d.songs)) d.songs = d.songs.map(f);
  if (Array.isArray(d.audio)) for (const g of d.audio) if (g) g.src = f(g.src);
  if (d.paths && d.paths.songs && typeof d.paths.songs === 'object') d.paths.songs = Object.fromEntries(Object.entries(d.paths.songs).map(([k, v]) => [f(k), v]));
  return d;
}
function toV4(d: any): ProjectFile {
  // 예전 파일 내용은 형식을 알 수 없으므로 any로 받아 v4 모양으로 옮김
  const vid = (g: any) => ({ kind: 'video', start: g.start, end: g.end, src: g.clip, off: g.off || 0, rate: g.rate || 1, vol: g.vol == null ? 0 : g.vol, x: g.x || 0, y: g.y || 0, zoom: g.zoom || 1, flip: !!g.flip });
  const aud = (g: any) => ({ kind: 'audio', start: g.start, end: g.end == null ? null : g.end, src: g.song, off: g.off || 0, rate: 1, vol: g.vol == null ? 1 : g.vol, x: 0, y: 0, zoom: 1, flip: false });
  const trs = Array.isArray(d.tracks) ? d.tracks : (Array.isArray(d.segments) ? [d.segments] : [[]]);
  const audio = Array.isArray(d.audio) ? d.audio.map(aud)
    : d.music ? [{ kind: 'audio', start: 0, end: null, src: d.music, off: 0, rate: 1, vol: 1, x: 0, y: 0, zoom: 1, flip: false }] : [];
  return {
    app: 'beat-meter-maker', v: 4,
    sounds: d.sounds || [], bpm: d.bpm, offset: d.offset, musicStart: d.musicStart, beats: d.beats || [], set: d.set || {},
    songs: d.songs || (d.music ? [d.music] : []), clips: d.clips || [], trims: d.trims || [],
    audio, tracks: trs.map((tr: any) => (Array.isArray(tr) ? tr.map(vid) : tr)),
    musicVol: d.musicVol,
  } as ProjectFile;
}

// 형식 검사: 문제가 있으면 이유(문자열), 없으면 null. 예전 형식은 v4로 바꾼 뒤 검사
export function validateProject(d: any): string | null {
  const num = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
  const str = (v: unknown): v is string => typeof v === 'string';
  const arr = (v: unknown, name: string) => v == null || Array.isArray(v) ? null : `${name} 형식이 잘못됨`;
  if (!d || typeof d !== 'object') return '내용이 비어 있음';
  if (d.app !== 'beat-meter-maker') return '이 프로그램의 프로젝트 파일이 아님';
  if (d.v != null && !(num(d.v) && d.v >= 1 && d.v <= 4)) return `지원하지 않는 버전 (v${d.v})`;
  for (const k of ['sounds', 'beats', 'songs', 'audio', 'clips', 'trims', 'tracks', 'segments']) { const e = arr(d[k], k); if (e) return e; }
  if (d.set != null && (typeof d.set !== 'object' || Array.isArray(d.set))) return '설정(set) 형식이 잘못됨';
  for (const k of ['bpm', 'offset', 'musicStart', 'musicVol']) if (d[k] != null && !num(d[k])) return `${k} 값이 숫자가 아님`;
  if ((d.beats || []).some((t: unknown) => !num(t) || t < 0)) return '비트 목록에 잘못된 값이 있음';
  if ((d.sounds || []).some((x: any) => !x || !str(x.id) || !str(x.name) || !str(x.b64))) return '비트 소리 데이터가 잘못됨';
  if ((d.songs || []).some((x: unknown) => !str(x)) || (d.clips || []).some((x: unknown) => !str(x))) return '파일 이름 목록이 잘못됨';
  for (const tr of d.tracks || []) if (!Array.isArray(tr)) return '화면 트랙 형식이 잘못됨';
  if (d.paths != null) {
    const map = (o: unknown) => o == null || (typeof o === 'object' && !Array.isArray(o) && Object.values(o).every(str));
    if (typeof d.paths !== 'object' || !map(d.paths.clips) || !map(d.paths.songs)) return '파일 경로 목록이 잘못됨';
  }
  const m = migrate(d);
  const item = (g: any, i: number, where: string, kind: string) => {
    if (!g || typeof g !== 'object') return `${where} ${i + 1}번째 조각이 비어 있음`;
    if (g.kind !== kind) return `${where} ${i + 1}번째 조각의 종류가 잘못됨`;
    if (!num(g.start) || g.start < 0) return `${where} ${i + 1}번째 조각의 시작 시각이 잘못됨`;
    if (g.end != null && (!num(g.end) || g.end <= g.start)) return `${where} ${i + 1}번째 조각의 끝 시각이 잘못됨`;
    if (g.end == null && kind !== 'audio') return `${where} ${i + 1}번째 조각의 끝 시각이 없음`;
    if (!str(g.src)) return `${where} ${i + 1}번째 조각의 파일 이름이 없음`;
    for (const k of ['off', 'rate', 'x', 'y', 'zoom', 'vol', 'rot', 'tilt']) if (g[k] != null && !num(g[k])) return `${where} ${i + 1}번째 조각의 ${k} 값이 잘못됨`;
    return null;
  };
  for (let k = 0; k < m.tracks.length; k++) for (let i = 0; i < m.tracks[k].length; i++) { const e = item(m.tracks[k][i], i, `화면 ${k + 1}`, 'video'); if (e) return e; }
  for (let i = 0; i < m.audio.length; i++) { const e = item(m.audio[i], i, '음악', 'audio'); if (e) return e; }
  return null;
}

export async function loadProject(file: File) {
  let d: any; try { d = JSON.parse(await file.text()); } catch (e) { return toast('프로젝트 파일을 읽을 수 없습니다 (JSON 형식이 아님)', 4000); }
  const err = validateProject(d);
  if (err) return toast(`프로젝트를 열 수 없습니다: ${err} — 현재 작업은 그대로입니다`, 5000);
  loadProjectData(migrate(d));
}
// 검사를 통과하고 v4로 바뀐 데이터만 넘어옴 (파일 열기·자동 복구 공통)
export function loadProjectData(d: ProjectFile) {
  record('프로젝트 열기');
  S.set = { ...DEFAULTS };
  for (const k of Object.keys(d.set || {})) if (k in DEFAULTS) (S.set as Record<string, unknown>)[k] = (d.set as Record<string, unknown>)[k];   // 예전 버전의 쓰지 않는 설정은 버림
  if (d.bpm != null) S.bpm = d.bpm; if (d.offset != null) S.offset = d.offset;
  S.beats = (d.beats || []).slice().sort((a, b) => a - b);
  S.clips.sort((a, b) => { const ia = d.clips.indexOf(a.name), ib = d.clips.indexOf(b.name); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); });
  if (d.musicStart != null) { S.musicStart = d.musicStart; $('#mStart').value = S.musicStart; }
  S.pendingTrims = {}; (d.trims || []).forEach(tr => { if (!tr || typeof tr.name !== 'string') return; S.pendingTrims[tr.name] = tr; const c = S.clips.find(x => x.name === tr.name); if (c) { c.inPt = tr.inPt || 0; c.outPt = tr.outPt || 0; } });
  applySettingsToUI(); syncBeatInputs(); renderClipList(); updateBeatInfo();
  S.tracks = (d.tracks.length ? d.tracks : [[]]).map(tr => sortTrack(tr.map(itemFromFile)) as VideoItem[]);
  if (d.musicVol != null) setMusicVol(d.musicVol);
  SND.list = SND.list.filter(x => !x.custom);
  for (const x of d.sounds || []) { if (SND.ready) loadSoundData(x.id, x.name, x.b64); else (SND.pending = SND.pending || []).push(x); }
  S.track = 0; S.selItem = null; ensureTracks();
  S.audio = sortTrack(d.audio.map(itemFromFile)) as AudioItem[];
  afterAudioChange(); renderSongList(); refreshEmpty();
  if (desk() && d.paths) relinkMedia(d).then(() => reportMissing(d));
  else reportMissing(d);
}
function reportMissing(d: ProjectFile) {
  const missing = [];
  for (const n of d.songs) if (!S.songs.some(x => x.name === n)) missing.push('음악: ' + n);
  for (const n of d.clips) if (!S.clips.some(c => c.name === n)) missing.push(n);
  toast(missing.length ? `프로젝트 열림 — 다음 파일을 다시 넣어 주세요: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ' 외' : ''}` : '프로젝트를 열었습니다', 5000);
}
/** 데스크톱 앱: 저장해 둔 경로에 파일이 그대로 있으면 자동으로 불러옴. 없는 파일은 reportMissing이 알려 줌 */
async function relinkMedia(d: ProjectFile) {
  const P = d.paths!, D = desk()!;
  const clips = d.clips.filter(n => !S.clips.some(c => c.name === n) && P.clips && P.clips[n]).map(n => P.clips[n]);
  const songs = d.songs.filter(n => !S.songs.some(x => x.name === n) && P.songs && P.songs[n]).map(n => P.songs[n]);
  if (!clips.length && !songs.length) return;
  const ok = await D.exists([...clips, ...songs]);
  const cl = clips.filter((_, i) => ok[i]), so = songs.filter((_, i) => ok[clips.length + i]);
  if (cl.length) addClips(cl.map(pathFile));
  if (so.length) await loadMusicFiles(so.map(pathFile));
}

/* ---------- 자동 저장 (브라우저 IndexedDB, 프로젝트만) ----------
   'current'  = 지금 작업, 바뀌면 2초 안에 저장
   'previous' = 프로그램을 열 때 'current'를 옮겨 둔 직전 작업. 복구/삭제를 고를 때까지 유지 */
export const AS = { db: null as IDBDatabase | null, last: '', timer: 0, ok: false };
export function idb(): Promise<IDBDatabase> {
  if (AS.db) return Promise.resolve(AS.db);
  return new Promise((res, rej) => {
    const r = indexedDB.open('beat-meter-maker', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('autosave');
    r.onsuccess = () => res(AS.db = r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function idbOp(mode: IDBTransactionMode, fn: (st: IDBObjectStore) => IDBRequest): Promise<unknown> {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction('autosave', mode), st = tx.objectStore('autosave'), r = fn(st); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); });
}
export const idbGet = (k: string) => idbOp('readonly', st => st.get(k)) as Promise<AutosaveEntry | undefined>;
export const idbPut = (k: string, v: AutosaveEntry) => idbOp('readwrite', st => st.put(v, k));
export const idbDel = (k: string) => idbOp('readwrite', st => st.delete(k));
export async function autosaveTick() {
  if (!AS.ok || S.exporting) return;
  const d = projectData(), json = JSON.stringify(d);
  if (json === AS.last) return;
  AS.last = json;
  try { await idbPut('current', { time: Date.now(), data: d }); }
  catch (e) { AS.ok = false; toast('자동 저장을 할 수 없습니다 (브라우저 저장소 사용 불가)', 4000); }
}
export async function initAutosave() {
  try {
    const cur = await idbGet('current');
    if (cur && cur.data && !isEmptyProject(cur.data) && !validateProject(cur.data)) { await idbPut('previous', cur); await idbDel('current'); }
    const prev = await idbGet('previous');
    if (prev && prev.data && !validateProject(prev.data)) showRestoreBar(prev);
    AS.last = JSON.stringify(projectData());
    AS.ok = true;
    setInterval(autosaveTick, 2000);
  } catch (e) { console.warn('autosave unavailable', e); }
}
export function showRestoreBar(prev: AutosaveEntry) {
  const d = prev.data, bar = $('#restoreBar');
  const when = new Date(prev.time).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  $('#restoreTxt').textContent = `이전 작업이 남아 있습니다 (${when} · 음악 ${d.songs.length}개 · 클립 ${d.clips.length}개 · 비트 ${d.beats.length}개)`;
  bar.style.display = 'flex';
  $('#restoreYes').onclick = async () => { bar.style.display = 'none'; loadProjectData(migrate(d)); await idbDel('previous'); };
  $('#restoreNo').onclick = async () => { if (!confirm('이전 작업을 지울까요? 되돌릴 수 없습니다.')) return; bar.style.display = 'none'; await idbDel('previous'); toast('이전 작업을 지웠습니다'); };
}
