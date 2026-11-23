// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 음악 파일 불러오기, 파형, 무음 감지, BPM 감지
import { commit } from './history';
import { makeItem } from './itemTypes';
import type { AudioItem, Song } from './types';
import { audioEnd, ensureAudio, now, projDur, resyncAudio, seek, updateDurUI } from './audio';
import { generateAll, syncBeatInputs } from './beats';
import { refreshEmpty } from './player';
import { S } from './state';
import { selectItem, sortTrack, updateSegInfo } from './timeline';
import { $, fmt, fmtShort, status, toast } from './util';
import { desk, filePath, type PathFile } from './desktop';
import { ic } from './icons';

/* ---------- 음악 파일 (여러 개) ---------- */
// S.songs: 불러온 음악 목록, S.audio: 타임라인의 음악 조각 (AudioItem)
export async function loadMusicFiles(files: (File | PathFile)[]) {
  const ac = ensureAudio(); if (ac.state === 'suspended') await ac.resume();
  const wasEmpty = !S.audio.length;
  for (const f of files) {
    status(`음악 분석 중… ${f.name}`);
    const isVid = f.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|m4v)$/i.test(f.name);
    const path = filePath(f), viaFF = isVid && path && desk();   // 데스크톱: 영상은 ffmpeg로 소리만 꺼냄 (파일 전체를 메모리에 안 올림)
    if (!viaFF && f.size > 1.5 * 1073741824) { toast(`파일이 너무 큽니다 (1.5GB 이하): ${f.name}`); continue; }
    if (isVid) status(`영상에서 소리 추출 중… ${f.name}`);
    let buf; try {
      const data = viaFF ? await viaFF.extractAudio(path) : await f.arrayBuffer();
      buf = await ac.decodeAudioData(data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer : data);
    }
    catch (e) { toast(isVid ? `소리를 꺼낼 수 없는 영상입니다 (소리가 없거나 지원하지 않는 형식): ${f.name}` : `음악 파일을 읽을 수 없습니다: ${f.name}`, 4500); continue; }
    const song: Song = { name: f.name, fromVideo: isVid, buf, dur: buf.duration, pps: 200, peaks: null, sil: 0, bpm: 0, offset: 0, hue: (S.songs.length * 53 + 30) % 360, path: path || undefined };
    computePeaks(song); song.sil = detectStart(song);
    await new Promise(r => setTimeout(r, 10));
    const r = detectBPM(song.buf, song.sil); song.bpm = r.bpm; song.offset = r.offset;
    S.songs.push(song);
    let relinked = false;
    for (const g of S.audio) if (!g.src && g.srcName === song.name) { g.src = song; if (g.end == null) g.end = g.start + song.dur; relinked = true; }
    if (!relinked) appendSong(song, false);
  }
  afterAudioChange();
  renderSongList(); refreshEmpty();
  if (wasEmpty && S.audio.length) {
    const s0 = S.audio[0].src!; S.bpm = s0.bpm; S.offset = Math.round((S.audio[0].start - S.audio[0].off + s0.offset) * 1000) / 1000; syncBeatInputs();
    if (!S.beats.length) generateAll(true);
  }
  status(`음악 ${S.songs.length}개 · 영상 길이 ${fmt(projDur())}`);
}
/** 곡을 음악 트랙 끝에 붙임. undo=false는 파일을 불러올 때 (불러오기 자체는 되돌리기 대상이 아님) */
export function appendSong(song: Song, undo = true) {
  const add = () => { S.audio.push(makeItem('audio', song, audioEnd(), song.dur, 1)); sortTrack(S.audio); };
  if (undo) commit('곡 이어 붙이기', add); else add();
}
export function removeSong(song: Song) {
  commit('음악 삭제', () => {
    S.songs.splice(S.songs.indexOf(song), 1);
    S.audio = S.audio.filter(g => g.src !== song);
  });
  refreshEmpty();
}
export function afterAudioChange() {
  // 무음 구간: 첫 음악 조각의 앞부분 무음까지는 비트를 만들지 않음
  const g = S.audio[0];
  S.musicStart = g && g.src ? Math.round((g.start + Math.max(0, g.src.sil - g.off)) * 1000) / 1000 : 0;
  $('#mStart').value = S.musicStart;
  updateDurUI(); resyncAudio(); updateSegInfo();
  if (now() > projDur()) seek(projDur());
}
export function renderSongList() {
  const ul = $('#songList'); ul.innerHTML = '';
  S.songs.forEach(sg => {
    const li = document.createElement('li'), used = S.audio.filter(g => g.src === sg).length;
    li.innerHTML = `<span class="sw" style="background:hsl(${sg.hue},55%,50%)"></span>${sg.fromVideo ? '<span class="badge">영상</span>' : ''}<span class="n"></span><span class="d">${fmtShort(sg.dur)} · ${Math.round(sg.bpm * 10) / 10} BPM</span><button class="ic" title="타임라인 끝에 한 번 더 붙이기">${ic('last')}</button><button class="ic" title="삭제">${ic('x')}</button>`;
    const nm = li.querySelector<HTMLElement>('.n')!; nm.textContent = sg.name; nm.title = sg.name;
    if (!used) nm.insertAdjacentHTML('afterend', '<span class="badge dim">미사용</span>');
    const [ap, x] = li.querySelectorAll('button');
    ap.onclick = e => { e.stopPropagation(); appendSong(sg); afterAudioChange(); renderSongList(); };
    x.onclick = e => { e.stopPropagation(); removeSong(sg); };
    li.onclick = () => { const g = S.audio.find(a => a.src === sg); if (g) { selectItem(g, true); if (!S.playing) seek(g.start); } };
    ul.appendChild(li);
  });
  $('#musicName').textContent = S.songs.length ? `음악 ${S.songs.length}개 · 클릭하면 여러 개 추가` : '아직 없음';
}
export function audioAt(t: number) { let best: AudioItem | null = null; for (const g of S.audio) { if (g.start > t) break; if (g.end > t) best = g; } return best; }

export function computePeaks(song: Song) {
  const b = song.buf, pps = song.pps;
  const c0 = b.getChannelData(0), c1 = b.numberOfChannels > 1 ? b.getChannelData(1) : c0;
  const step = Math.max(1, Math.floor(b.sampleRate / pps));
  const n = Math.floor(c0.length / step);
  const pk = new Float32Array(n);
  let mx = 1e-6;
  for (let i = 0; i < n; i++) {
    let v = 0; const o = i * step;
    for (let j = 0; j < step; j += 4) { const s = Math.abs(c0[o + j] + c1[o + j]) * 0.5; if (s > v) v = s; }
    pk[i] = v; if (v > mx) mx = v;
  }
  for (let i = 0; i < n; i++) pk[i] /= mx;
  song.peaks = pk;
}
/* 음악 앞부분 무음 감지 */
export function detectStart(song: Song) {
  const pk = song.peaks; if (!pk) return 0;
  for (let i = 0; i < pk.length; i++) if (pk[i] > 0.04) return Math.round(Math.max(0, i / song.pps - 0.005) * 1000) / 1000;
  return 0;
}

/* BPM 감지: 온셋 엔벨로프 자기상관 + 위상 탐색 */
export function detectBPM(buf: AudioBuffer, sil = 0) {
  const sr = buf.sampleRate, c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : c0;
  const hop = Math.max(64, Math.round(sr / 172)), n = Math.floor(c0.length / hop);
  const env = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    let e = 0; const o = i * hop;
    for (let j = 0; j < hop; j++) { const s = (c0[o + j] + c1[o + j]) * 0.5; e += s * s; }
    e = Math.log1p(e * 100);
    env[i] = Math.max(0, e - prev); prev = e;
  }
  let mean = 0; for (let i = 0; i < n; i++) mean += env[i]; mean /= n || 1;
  for (let i = 0; i < n; i++) env[i] = Math.max(0, env[i] - mean);
  { const tmp = env.slice(); for (let i = 1; i < n - 1; i++) env[i] = 0.25 * tmp[i - 1] + 0.5 * tmp[i] + 0.25 * tmp[i + 1]; }
  const fr = sr / hop;
  const at = (x: number) => { const i = x | 0, f = x - i; return i + 1 < n ? env[i] * (1 - f) + env[i + 1] * f : 0; };
  let best = 120, bestS = -1;
  for (let bpm = 70; bpm <= 190; bpm += 0.25) {
    const lag = fr * 60 / bpm; let s = 0;
    const lim = n - 2 * lag - 2;
    for (let i = 0; i < lim; i++) s += env[i] * (at(i + lag) + 0.5 * at(i + 2 * lag));
    if (s > bestS) { bestS = s; best = bpm; }
  }
  // 정밀 보정: 음악 시작점 이후만 사용, BPM ±1.5를 0.01 단위로 재탐색 (곡 후반 밀림 방지)
  const startF = Math.max(0, Math.floor(sil * fr) - 2);
  let fb = best, fs = -1, fo = startF;
  for (let bpm = best - 1.5; bpm <= best + 1.5; bpm += 0.01) {
    const per = fr * 60 / bpm; let bsc = -1, bo = 0;
    for (let o = 0; o < per; o += 1) { let s = 0, c = 0; for (let x = startF + o; x < n; x += per) { s += at(x); c++; } s /= c || 1; if (s > bsc) { bsc = s; bo = startF + o; } }
    if (bsc > fs) { fs = bsc; fb = bpm; fo = bo; }
  }
  const per = fr * 60 / fb; let bs = -1, bo = fo;
  for (let o = fo - 1; o <= fo + 1; o += 0.1) { let s = 0; for (let x = o; x < n; x += per) s += at(x); if (s > bs) { bs = s; bo = o; } }
  // 첫 비트 = 음악 시작점 이후 첫 번째 그리드 위치
  let first = bo / fr; const p = 60 / fb;
  while (first - p >= sil - 0.03) first -= p;
  while (first < sil - 0.03) first += p;
  return { bpm: Math.round(fb * 100) / 100, offset: Math.round(first * 1000) / 1000 };
}

export function runDetect(autoGen?: boolean) {
  const g = audioAt(now()) || S.audio[0];
  if (!g || !g.src) return toast('먼저 음악을 넣어 주세요');
  const s = g.src;
  S.bpm = s.bpm; S.offset = Math.round((g.start - g.off + s.offset) * 1000) / 1000; syncBeatInputs();
  $('#genSrc').value = S.audio.length > 1 ? 'song' : 'global';
  if (autoGen) generateAll();
  status(`'${s.name}' 감지 결과: ${s.bpm} BPM`);
  toast(`BPM ${s.bpm} (${s.name})` + (autoGen ? ' — 비트를 생성했습니다' : ''));
}
