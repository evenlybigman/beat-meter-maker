// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 그리기 루프, 재생·정지, 내보내기(녹화)
import { CLK, audioOut, ensureAudio, now, projDur, seek, startAudio, stopAudio } from './audio';
import { R, stopRec } from './beats';
import { stopBeatSounds } from './beatsound';
import { cv } from './dom';
import { drawClipPreview, drawFrame, drawOverlay, drawStrip } from './render';
import { fsTick } from './fullscreen';
import { autoBitrate } from './settings';
import { S } from './state';
import { allItems } from './timeline';
import { EXP, exportDesktop } from './exportFF';
import { desk } from './desktop';
import { btnHtml } from './icons';
import { reportLoopError } from './diag';
import { $, errMsg, baseName, download, fmt, fmtShort, status, toast } from './util';

/* ---------- 루프 ---------- */
export const seekUi = { dragging: false };   // 재생 바를 끌고 있는지 (events에서 바꿈)
export function frame() {
  requestAnimationFrame(frame);   // 먼저 예약: 그리다 오류가 나도 화면이 멈추지 않음
  if (EXP.offline) return;        // 데스크톱 내보내기 중: 화면은 내보내기가 직접 그림
  try { drawTick(); } catch (e) { reportLoopError('그리기', e); }
}
function drawTick() {
  if (S.playing && now() >= projDur() - 0.0005) { pause(); CLK.pos = projDur(); if (R.on) stopRec(); if (S.exporting) finishExport(); }
  const t = now();
  drawFrame(t);
  drawOverlay(t);
  drawStrip(t);
  drawClipPreview();
  fsTick(t);
  const dur = S.music.dur || 0;
  $('#time').textContent = `${fmt(t)} / ${fmtShort(dur)}`;
  if (!seekUi.dragging && dur) $('#seek').value = Math.round(t / dur * 1000);
  if (S.exporting && dur) { const p = Math.min(100, t / dur * 100); $('#expBar').style.width = p + '%'; $('#expTxt').textContent = `${p.toFixed(1)}% · ${fmtShort(t)} / ${fmtShort(dur)}`; }
}

/* ---------- 재생 ---------- */
export async function play() {
  if (projDur() <= 0) return toast('음악이나 영상을 먼저 넣어 주세요');
  const ac = ensureAudio(); if (ac.state === 'suspended') await ac.resume();
  if (CLK.pos >= projDur() - 0.05) CLK.pos = 0;
  CLK.p0 = CLK.pos; CLK.t0 = ac.currentTime + 0.05; S.playing = true;
  startAudio(CLK.p0, CLK.t0); updatePlayBtn();
}
export function pause() { if (S.playing) CLK.pos = now(); S.playing = false; stopAudio(); stopBeatSounds(); updatePlayBtn(); }
export function togglePlay() { if (S.exporting) return; if (R.on) return stopRec(); S.playing ? pause() : play(); }
export function updatePlayBtn() { $('#btnPlay').innerHTML = S.playing ? btnHtml('pause', '정지') : btnHtml('play', '재생'); }
export function refreshEmpty() { $('#empty').style.display = (S.songs.length || S.clips.length) ? 'none' : 'flex'; }

/* ---------- 내보내기 ---------- */
export let rec: MediaRecorder | null = null, recChunks: Blob[] = [], recMime = '', exportCancelled = false;
export async function exportVideo() {
  if (projDur() <= 0) return toast('음악이나 영상을 먼저 넣어 주세요');
  if (!allItems().length) return toast('타임라인에 영상 조각이 없습니다');
  if (desk()) return exportDesktop();
  if (!window.MediaRecorder || !cv.captureStream) return toast('이 브라우저는 내보내기를 지원하지 않습니다 (Chrome 권장)');
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  recMime = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  pause(); seek(0);
  const ac = ensureAudio(); if (ac.state === 'suspended') await ac.resume();
  await new Promise(r => setTimeout(r, 500));
  const vs = cv.captureStream(+S.set.fps);
  const stream = new MediaStream([...vs.getVideoTracks(), ...audioOut().exportDest.stream.getAudioTracks()]);
  let mr: MediaRecorder;
  try {
    mr = new MediaRecorder(stream, { mimeType: recMime || undefined, videoBitsPerSecond: autoBitrate() * 1e6, audioBitsPerSecond: 192000 });
  } catch (e) { return toast('녹화를 시작할 수 없습니다: ' + errMsg(e)); }
  rec = mr;
  recChunks = []; exportCancelled = false;
  mr.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
  mr.onstop = () => {
    vs.getTracks().forEach(t => t.stop());
    S.exporting = false; $('#modal').style.display = 'none';
    if (exportCancelled) { toast('내보내기를 취소했습니다'); return; }
    const mt = mr.mimeType || recMime || 'video/webm';
    const ext = mt.includes('mp4') ? 'mp4' : 'webm';
    download(new Blob(recChunks, { type: mt }), `${baseName(S.music.name)}_beatmeter.${ext}`);
    toast(`${ext.toUpperCase()} 파일로 저장했습니다`, 3500);
    status('내보내기 완료');
  };
  S.exporting = true; $('#modal').style.display = 'flex';
  mr.start(1000);
  await play();
}
export function finishExport() { if (rec && rec.state !== 'inactive') rec.stop(); }
export function cancelExport() {
  if (EXP.offline) { EXP.cancel = true; return; }
  exportCancelled = true; pause(); finishExport(); }
