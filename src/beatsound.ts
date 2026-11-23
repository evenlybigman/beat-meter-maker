// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// 비트 소리: 기본 소리 합성, 예약 재생, 사용자 소리, 음악에서 소리 따기
import type { SoundEntry } from './types';
import { actx, audioOut, ensureAudio, now } from './audio';
import { audioAt } from './songs';
import { S } from './state';
import { $, fmt, lowerBound, toast } from './util';
import { HOUSE_KICK_WAV_B64 } from './sounds/houseKick';

/* ---------- 비트 소리 ---------- */
// 기본 소리는 코드로 합성 (파일 없이 동작)
export const SND: { list: SoundEntry[]; ready: boolean; done: Set<number>; nodes: AudioBufferSourceNode[]; lastMt: number; cnt: number;
  /** 오디오 준비 전에 프로젝트에서 읽은 사용자 소리 */ pending?: { id: string; name: string; b64: string }[] } = { list: [], ready: false, done: new Set(), nodes: [], lastMt: -1, cnt: 0 };
export let beatGain: GainNode | null = null;
type Synth = (d: Float32Array, sr: number, n: number) => void;
export function synthSounds() {
  const ac = ensureAudio(), sr = ac.sampleRate;
  const mk = (dur: number, fn: Synth) => { const n = Math.floor(dur * sr), b = ac.createBuffer(1, n, sr), d = b.getChannelData(0); fn(d, sr, n); let m = 1e-6; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(d[i])); for (let i = 0; i < n; i++) d[i] *= 0.9 / m; return b; };
  const tick = mk(0.05, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.sin(2 * Math.PI * 2400 * t) + 0.5 * Math.sin(2 * Math.PI * 4800 * t)) * Math.exp(-t * 110); } });
  const kick = mk(0.35, (d, sr, n) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / sr, f = 45 + 115 * Math.exp(-t * 28); ph += 2 * Math.PI * f / sr; d[i] = Math.sin(ph) * Math.exp(-t * 9) + (t < 0.004 ? (Math.random() * 2 - 1) * 0.4 : 0); } });
  const clap = mk(0.25, (d, sr, n) => {
    let prev = 0, lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, x = Math.random() * 2 - 1, hp = x - prev; prev = x; lp += (hp - lp) * 0.35;
      let env = 0; for (const t0 of [0, 0.011, 0.022]) if (t >= t0) env += Math.exp(-(t - t0) * 260);
      env += t >= 0.022 ? 0.55 * Math.exp(-(t - 0.022) * 22) : 0;
      d[i] = lp * env;
    }
  });
  const builtIn: SoundEntry[] = [{ id: 'tick', name: '틱 (메트로놈)', buf: tick }, { id: 'kick', name: '킥 (드럼)', buf: kick }, { id: 'clap', name: '클랩 (박수)', buf: clap }];
  try { builtIn.push({ id: 'housekick', name: '하우스 킥 (DWSD)', buf: wavToBuffer(ac, bufFromB64(HOUSE_KICK_WAV_B64)) }); }
  catch (e) { console.warn('하우스 킥 소리를 읽지 못했습니다', e); }
  SND.list.unshift(...builtIn);
  SND.ready = true;
}
/** 16비트 PCM WAV를 바로 AudioBuffer로 (decodeAudioData는 비동기라 시작 직후 잠깐 소리가 비는 걸 피함) */
export function wavToBuffer(ac: BaseAudioContext, ab: ArrayBuffer): AudioBuffer {
  const v = new DataView(ab), tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('WAV 파일이 아님');
  let o = 12, ch = 0, sr = 0, bits = 0, fmt = 0;
  while (o + 8 <= v.byteLength) {
    const id = tag(o), len = v.getUint32(o + 4, true), body = o + 8;
    if (id === 'fmt ') { fmt = v.getUint16(body, true); ch = v.getUint16(body + 2, true); sr = v.getUint32(body + 4, true); bits = v.getUint16(body + 14, true); }
    else if (id === 'data') {
      if (fmt !== 1 || bits !== 16 || !ch) throw new Error('16비트 PCM WAV만 지원');
      const n = Math.floor(len / (2 * ch)), buf = ac.createBuffer(ch, n, sr);
      for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = v.getInt16(body + (i * ch + c) * 2, true) / 32768; }
      return buf;
    }
    o = body + len + (len & 1);
  }
  throw new Error('WAV 데이터가 없음');
}
export function initBeatAudio() {
  if (SND.ready || !actx) return;
  const g = actx.createGain(); g.gain.value = S.set.beatVol;
  g.connect(actx.destination); g.connect(audioOut().exportDest); beatGain = g;
  synthSounds();
  for (const p of SND.pending || []) loadSoundData(p.id, p.name, p.b64);
  SND.pending = [];
  renderSndUI();
}
export const curSnd = () => SND.list.find(x => x.id === S.set.beatSound) || SND.list[0];
export function playSnd(when?: number) {
  const s = curSnd(); if (!s || !s.buf) return null;
  const ac = ensureAudio(), src = ac.createBufferSource(); src.buffer = s.buf; src.connect(beatGain!);
  src.start(Math.max(ac.currentTime, when || 0));
  SND.nodes.push(src); src.onended = () => { const i = SND.nodes.indexOf(src); if (i >= 0) SND.nodes.splice(i, 1); };
  return src;
}
export function stopBeatSounds() { for (const n of SND.nodes.splice(0)) { try { n.stop(); } catch (e) {} } SND.done.clear(); SND.lastMt = -1; }
// 25ms마다 앞으로 0.15초 안에 올 비트를 오디오 시계에 맞춰 예약
export function beatTick() {
  if (!actx || !SND.ready || !S.playing || !S.set.beatSoundOn || !S.music.el) return;
  const mt = now(), ct = actx.currentTime;
  if (SND.lastMt >= 0 && (mt < SND.lastMt - 0.05 || mt - SND.lastMt > 0.6)) stopBeatSounds();   // 탐색/점프 감지
  SND.lastMt = mt;
  for (let j = lowerBound(S.beats, mt - 0.04); j < S.beats.length && S.beats[j] < mt + 0.15; j++) {
    const b = S.beats[j]; if (SND.done.has(b)) continue;
    SND.done.add(b); playSnd(ct + (b - mt));
  }
  if (++SND.cnt % 40 === 0) for (const b of SND.done) if (b < mt - 2) SND.done.delete(b);
}
setInterval(beatTick, 25);
export function b64FromBuf(ab: ArrayBuffer) { let s = ''; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }
export function bufFromB64(b64: string) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
export async function loadSoundData(id: string, name: string, b64: string) {
  try { const buf = await ensureAudio().decodeAudioData(bufFromB64(b64)); SND.list.push({ id, name, buf, b64, custom: true }); renderSndUI(); }
  catch (e) { toast(`소리 '${name}'을(를) 읽지 못했습니다`); }
}
export async function addSoundFile(f: File) {
  const ac = ensureAudio(); if (ac.state === 'suspended') await ac.resume(); initBeatAudio();
  if (f.size > 3 * 1048576) return toast('비트 소리는 3MB 이하의 짧은 파일만 넣을 수 있습니다');
  const ab = await f.arrayBuffer();
  let buf: AudioBuffer; try { buf = await ac.decodeAudioData(ab.slice(0)); } catch (e) { return toast('소리 파일을 읽을 수 없습니다'); }
  if (buf.duration > 3) toast('3초보다 긴 소리입니다 — 비트가 빠르면 소리가 겹칠 수 있습니다', 3500);
  const id = 'c' + Date.now().toString(36);
  SND.list.push({ id, name: f.name.replace(/\.[^.]+$/, ''), buf, b64: b64FromBuf(ab), custom: true });
  S.set.beatSound = id; S.set.beatSoundOn = true; renderSndUI(); previewSnd();
  toast(`비트 소리 '${f.name}' 추가`);
}
/* 음악에서 소리 따기 */
export function grabBuffer() {
  const gs = Math.max(0, +$('#grabStart').value || 0), ag = audioAt(gs); if (!ag || !ag.src || !actx) return null;
  const m = ag.src.buf, sr = m.sampleRate, st = ag.off + (gs - ag.start), len = (+$('#grabLen').value) / 1000;
  const a = Math.floor(st * sr), n = Math.min(Math.floor(len * sr), m.length - a);
  if (n <= 32) return null;
  const out = actx.createBuffer(m.numberOfChannels, n, sr);
  const fi = Math.max(1, Math.floor(sr * 0.002)), fo = Math.max(1, Math.floor(n * 0.3));
  for (let ch = 0; ch < m.numberOfChannels; ch++) {
    const d = out.getChannelData(ch); d.set(m.getChannelData(ch).subarray(a, a + n));
    for (let i = 0; i < fi; i++) d[i] *= i / fi;                                         // 짧은 페이드인 (딸깍 소리 방지)
    for (let i = 0; i < fo; i++) d[n - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fo);   // 부드러운 페이드아웃
  }
  return out;
}
export function encodeWav(buf: AudioBuffer) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length, ab = new ArrayBuffer(44 + n * ch * 2), v = new DataView(ab);
  const w = (o: number, str: string) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const x = Math.max(-1, Math.min(1, data[c][i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2; }
  return ab;
}
export function grabPreview() {
  if (!S.audio.length) return toast('먼저 음악을 넣어 주세요');
  const ac = ensureAudio(); if (ac.state === 'suspended') ac.resume(); initBeatAudio();
  const b = grabBuffer(); if (!b) return toast('구간을 확인해 주세요');
  const src = ac.createBufferSource(); src.buffer = b; src.connect(beatGain!); src.start();
}
export function grabSave() {
  if (!S.audio.length) return toast('먼저 음악을 넣어 주세요');
  ensureAudio(); initBeatAudio();
  const b = grabBuffer(); if (!b) return toast('구간을 확인해 주세요');
  const id = 'g' + Date.now().toString(36), name = `음악 ${fmt(+$('#grabStart').value)} (${$('#grabLen').value}ms)`;
  SND.list.push({ id, name, buf: b, b64: b64FromBuf(encodeWav(b)), custom: true });
  S.set.beatSound = id; S.set.beatSoundOn = true; renderSndUI(); previewSnd();
  toast(`'${name}'을(를) 비트 소리로 저장하고 선택했습니다`);
}
export function setGrabStart(t: number) { $('#grabStart').value = Math.max(0, Math.min(S.music.dur || 0, t)).toFixed(3); }
export function previewSnd() { const ac = ensureAudio(); if (ac.state === 'suspended') ac.resume(); initBeatAudio(); playSnd(); }
export function renderSndUI() {
  for (const id of ['#sndSw', '#sndSw2']) $(id).classList.toggle('on', !!S.set.beatSoundOn);
  const sel = $('#sndSel');
  const list = SND.ready ? SND.list : [{ id: 'tick', name: '틱 (메트로놈)' }, { id: 'kick', name: '킥 (드럼)' }, { id: 'clap', name: '클랩 (박수)' }, { id: 'housekick', name: '하우스 킥 (DWSD)' }];
  const opt = (x: { id: string; name: string }) => `<option value="${x.id}">${x.name.replace(/</g, '&lt;')}</option>`;
  const mine = list.filter(x => (x as { custom?: boolean }).custom);
  sel.innerHTML = `<optgroup label="기본 소리">${list.filter(x => !(x as { custom?: boolean }).custom).map(opt).join('')}</optgroup>` + (mine.length ? `<optgroup label="내 소리">${mine.map(opt).join('')}</optgroup>` : '');
  sel.value = S.set.beatSound; if (sel.value !== S.set.beatSound && list[0]) sel.value = list[0].id;
  $('#sndDel').disabled = !(curSnd() && curSnd().custom);
  $('#sndVol').value = Math.round(S.set.beatVol * 100); $('#vSndVol').textContent = Math.round(S.set.beatVol * 100) + '%';
  $('#sndTap').checked = !!S.set.beatTapSound;
}
export function setSndOn(on: boolean) { S.set.beatSoundOn = on; if (!on) stopBeatSounds(); renderSndUI(); }
