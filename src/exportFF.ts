// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 데스크톱 앱 내보내기: 프레임을 하나씩 만들어 ffmpeg로 MP4(H.264 + AAC) 인코딩
//  - 실시간 재생에 묶이지 않음 → 프레임이 빠지지 않고, PC가 빠르면 재생 시간보다 빨리 끝남
//  - 영상 조각: 조각마다 ffmpeg가 필요한 지점부터 출력 프레임 속도로 디코딩해 보내 줌 (탐색 대기 없음)
//  - 화면 압축: Chromium 내장 H.264(WebCodecs, GPU가 있으면 GPU)로 압축해 ffmpeg는 MP4에 담기만 함.
//    내장 인코더를 못 쓰면 날 프레임을 ffmpeg(x264)로 보내 압축
//  - 소리: 음악·비트 소리는 OfflineAudioContext로 미리 섞고, 클립 소리는 ffmpeg가 원본에서 바로 섞음
import { projDur } from './audio';
import { curSnd, encodeWav } from './beatsound';
import { desk, type DeskApi } from './desktop';
import { cv, cx } from './dom';
import { rateOf } from './clipFx';
import { pause } from './player';
import { drawOverlay, drawPanelImg, layoutRects, panelCaches, panelCount, placeOf } from './render';
import { autoBitrate, outSize } from './settings';
import { S } from './state';
import { activeIdx } from './timeline';
import type { VideoItem } from './types';
import { $, baseName, errMsg, fmtShort, status, toast } from './util';

export const EXP = { offline: false, cancel: false };
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** 음악 + 비트 소리를 영상 길이만큼 미리 섞음 (재생 때와 같은 볼륨) */
export async function renderMix(dur: number): Promise<AudioBuffer> {
  const sr = 48000, oc = new OfflineAudioContext(2, Math.max(1, Math.ceil(dur * sr)), sr);
  const mg = oc.createGain(); mg.gain.value = S.musicVol; mg.connect(oc.destination);
  for (const g of S.audio) {
    if (!g.src || !g.src.buf || g.start >= dur) continue;
    const stop = Math.min(g.end, dur), len = Math.min(stop - g.start, g.src.buf.duration - g.off);
    if (len < 0.01) continue;
    const src = oc.createBufferSource(), gn = oc.createGain();
    src.buffer = g.src.buf; gn.gain.value = g.vol == null ? 1 : g.vol;
    src.connect(gn); gn.connect(mg); src.start(g.start, g.off, len);
  }
  const snd = curSnd();
  if (S.set.beatSoundOn && snd && snd.buf) {
    const bg = oc.createGain(); bg.gain.value = S.set.beatVol; bg.connect(oc.destination);
    for (const b of S.beats) { if (b >= dur) break; const src = oc.createBufferSource(); src.buffer = snd.buf; src.connect(bg); src.start(b); }
  }
  return oc.startRendering();
}

/** 클립 소리가 켜진 조각 목록 (화면에 보이는 트랙만) */
function clipAudioList(dur: number) {
  const out = [];
  for (let k = 0; k < panelCount(); k++) for (const g of S.tracks[k] || []) {
    if (!(g.vol > 0) || !g.src || !g.src.path || g.start >= dur) continue;
    const len = Math.min(g.end, dur) - g.start, rate = rateOf(g);
    out.push({ path: g.src.path, start: g.start, len, ss: g.off, rate, vol: g.vol, loop: g.off + len * rate > g.src.dur - 0.02 });
  }
  return out;
}

/** 조각 하나의 디코더: 첫 프레임 시각에 맞춰 원본 지점을 정하고, 화면 크기에 맞게 줄여서 받음 */
interface Dec { id: string; w: number; h: number; c: HTMLCanvasElement; ctx: CanvasRenderingContext2D; has: boolean; done: boolean }
async function openDec(D: DeskApi, g: VideoItem, t: number, r: { w: number; h: number }, n: number): Promise<Dec> {
  const c = g.src!, rate = rateOf(g), vw = c.w || 1280, vh = c.h || 720;
  const s = placeOf(g, vw, vh, r.w, r.h).s;   // 미리보기와 같은 계산 (자르기·회전·확대 포함)
  const k = Math.min(1, s), w = even(vw * k), h = even(vh * k);   // 원본보다 크게는 받지 않음 (캔버스가 늘림)
  let ss = g.off + Math.max(0, t - g.start) * rate;
  if (ss >= c.dur - 0.02) ss = ss % Math.max(0.1, c.dur);
  const id = `d${n}`;
  await D.dec.open({ id, path: c.path!, ss, rate, fps: +S.set.fps, w, h, loop: g.off + (g.end - g.start) * rate > c.dur - 0.02 });
  const cvs = document.createElement('canvas'); cvs.width = w; cvs.height = h;
  return { id, w, h, c: cvs, ctx: cvs.getContext('2d')!, has: false, done: false };
}

/** 내장 H.264 인코더 설정 (못 쓰면 null). 4K까지 되는 레벨부터 시도 */
async function pickH264(w: number, h: number, fps: number, bps: number): Promise<VideoEncoderConfig | null> {
  if (!('VideoEncoder' in window) || (window as any).__forceRgba) return null;
  for (const codec of ['avc1.640033', 'avc1.4D0033', 'avc1.42E033', 'avc1.640028']) {
    const cfg: VideoEncoderConfig = { codec, width: w, height: h, bitrate: bps, framerate: fps, avc: { format: 'annexb' }, hardwareAcceleration: 'no-preference', latencyMode: 'quality' };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch (e) {}
  }
  return null;
}

export async function exportDesktop() {
  const D = desk()!, dur = projDur(), fps = +S.set.fps, [W, H] = outSize();
  const items = S.tracks.slice(0, panelCount()).flat();
  const noPath = items.find(g => g.src && !g.src.path);
  if (noPath) return toast(`'${noPath.src!.name}' 파일의 위치를 알 수 없습니다 — 클립을 다시 넣어 주세요`, 4500);
  pause();
  status('소리 섞는 중…');
  let wav: ArrayBuffer;
  try { wav = encodeWav(await renderMix(dur)); } catch (e) { return toast('소리를 섞지 못했습니다: ' + errMsg(e), 4500); }
  const N = Math.max(1, Math.round(dur * fps));
  const cfg = await pickH264(W, H, fps, autoBitrate() * 1e6);
  const b = await D.exp.begin({ name: `${baseName(S.music.name)}_beatmeter.mp4`, mode: cfg ? 'h264' : 'rgba', w: W, h: H, fps, dur: N / fps, bitrate: +S.set.bitrate || 0, wav: new Uint8Array(wav), clipAudio: clipAudioList(dur) });
  if (b.canceled) { status('내보내기 취소'); return; }

  const decs = new Map<VideoItem, Dec>(), t0 = performance.now(), unreadable = new Set<string>();
  let nDec = 0, failed = '', ve: VideoEncoder | null = null, lastWrite: Promise<boolean> | null = null;
  if (cfg) {
    ve = new VideoEncoder({ output: ch => { const u = new Uint8Array(ch.byteLength); ch.copyTo(u); lastWrite = D.exp.frame(u); }, error: e => { failed = '영상 압축 오류: ' + e.message; } });
    ve.configure(cfg);
  }
  const T = { read: 0, put: 0, draw: 0, get: 0, send: 0 }; let tm = 0; const lap = (k: keyof typeof T) => { const n = performance.now(); T[k] += n - tm; tm = n; };
  S.exporting = true; EXP.offline = true; EXP.cancel = false;
  $('#expHint').textContent = '창을 닫지 마세요. 끝나면 저장한 위치를 알려 드립니다.';
  $('#modal').style.display = 'flex';
  for (const pc of panelCaches) if (pc) pc._has = false;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  try {
    for (let i = 0; i < N && !EXP.cancel; i++) {
      const t = i / fps, rects = layoutRects(); tm = performance.now();
      // 1) 화면마다 이번 프레임 받기 (기다리는 동안 다른 그리기가 끼어들지 않게, 그리기는 2)에서 한 번에)
      const panels: { g: VideoItem | null; d: Dec | null }[] = [];
      for (let k = 0; k < rects.length; k++) {
        const tr = S.tracks[k] || [], j = activeIdx(tr, t), g = j >= 0 ? tr[j] : null;
        let d: Dec | null = null;
        if (g && g.src && g.src.path) {
          d = decs.get(g) || null;
          if (!d) { d = await openDec(D, g, t, rects[k], nDec++); decs.set(g, d); }
          if (!d.done) {
            const f = await D.dec.read(d.id); lap('read');
            if (f) { d.ctx.putImageData(new ImageData(new Uint8ClampedArray(f.buffer as ArrayBuffer, f.byteOffset, f.byteLength), d.w, d.h), 0, 0); d.has = true; lap('put'); }
            else { d.done = true; if (!d.has) unreadable.add(g.src.name); }   // 원본 끝: 마지막 프레임 유지 (한 장도 못 받았으면 읽기 실패)
          }
        }
        panels.push({ g, d });
      }
      // 2) 그리기 → 3) ffmpeg로 보내기
      cx.fillStyle = S.set.gapColor; cx.fillRect(0, 0, W, H);
      rects.forEach((r, k) => { const { g, d } = panels[k]; drawPanelImg(g, d && d.has ? d.c : null, d ? d.w : 0, d ? d.h : 0, r, k); });
      drawOverlay(t); lap('draw');
      if (ve) {
        const vf = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
        ve.encode(vf, { keyFrame: i % (fps * 2) === 0 }); vf.close(); lap('get');
        while (ve.encodeQueueSize > 4 && !failed) await new Promise(r => setTimeout(r, 1));
        if (lastWrite && !(await lastWrite)) failed = failed || '인코더가 멈췄습니다'; lap('send');
        if (failed) break;
      } else {
        const px = cx.getImageData(0, 0, W, H).data; lap('get');
        const okf = await D.exp.frame(px); lap('send');
        if (!okf) { failed = '인코더가 멈췄습니다'; break; }
      }
      // 끝난 조각의 디코더 정리
      for (const [g, d] of decs) if (g.end <= t + 0.5 / fps || !S.tracks.some(tr => tr.includes(g))) { D.dec.close(d.id); decs.delete(g); }
      if (i % 3 === 0 || i === N - 1) progress(i + 1, N, t0);
    }
  } catch (e) { failed = errMsg(e); }
  for (const d of decs.values()) D.dec.close(d.id);
  if (ve) {
    try { if (!EXP.cancel && !failed) await ve.flush(); } catch (e) { failed = failed || '영상 압축 오류: ' + errMsg(e); }
    try { ve.close(); } catch (e) {}
    if (lastWrite) await lastWrite;
  }
  const res = await D.exp.end(EXP.cancel || !!failed);
  S.exporting = false; EXP.offline = false; $('#modal').style.display = 'none';
  if (EXP.cancel) { toast('내보내기를 취소했습니다'); status('내보내기 취소'); return; }
  if (failed || !res.ok) { toast('내보내기 실패: ' + (failed || res.error), 6000); status('내보내기 실패'); return; }
  const sec = (performance.now() - t0) / 1000;
  status(`내보내기 완료 · ${res.path}`);
  if (unreadable.size) toast(`저장했지만 다음 영상을 읽지 못해 검은 화면으로 들어갔습니다: ${[...unreadable].join(', ')}`, 7000);
  else toast(`MP4로 저장했습니다 (${sec.toFixed(1)}초 걸림)`, 4000);
  (window as any).__lastExport = { path: res.path, sec, frames: N, mode: cfg ? 'h264' : 'rgba', ms: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, Math.round(v)])) };
  showDone(res.path || '');
}
function progress(i: number, n: number, t0: number) {
  const p = i / n * 100, el = (performance.now() - t0) / 1000, left = el / i * (n - i);
  $('#expBar').style.width = p + '%';
  $('#expTxt').textContent = `${p.toFixed(1)}% · ${i}/${n} 프레임 · 남은 시간 약 ${fmtShort(left)}`;
}
function showDone(path: string) {
  const b = $('#expDone'); if (!b) return;
  b.style.display = 'flex'; $('#expDoneTxt').textContent = path;
  $('#expOpen').onclick = () => { desk()?.showInFolder(path); b.style.display = 'none'; };
  $('#expClose').onclick = () => { b.style.display = 'none'; };
}
