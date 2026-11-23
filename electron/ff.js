// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Juke — Beat Meter Maker
// ffmpeg 실행 도구 (preload에서 사용 → 화면과 같은 프로세스라 프레임을 프로세스 사이로 복사하지 않음)
//  - 디코더: 영상 조각마다 ffmpeg 하나, 출력 프레임 속도로 RGBA 프레임을 차례로 읽음
//  - 인코더: 화면 프레임(RGBA)을 받아 H.264로, 음악 WAV와 클립 소리를 섞어 AAC로
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

// 설치본에서는 ffmpeg가 asar 밖(app.asar.unpacked)에 있음. BMM_FFMPEG로 바꿀 수 있음
function ffmpegPath() {
  if (process.env.BMM_FFMPEG) return process.env.BMM_FFMPEG;
  let p = null; try { p = require('ffmpeg-static'); } catch (e) {}
  return p ? p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep) : 'ffmpeg';
}
const FF = ffmpegPath();

const procs = new Set();
function run(args, stdin = false) {
  const p = spawn(FF, ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args], { stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'], windowsHide: true });
  procs.add(p);
  p.err = ''; p.stderr.on('data', d => { if (p.err.length < 8000) p.err += d; });
  p.done = new Promise(res => { p.on('close', code => { procs.delete(p); res(code); }); p.on('error', e => { p.err += String(e); procs.delete(p); res(-1); }); });
  return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.clear(); }

function version() {
  return new Promise(res => {
    const p = spawn(FF, ['-version'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    let s = ''; p.stdout.on('data', d => { s += d; });
    p.on('error', () => res(null)); p.on('close', () => res(s.split('\n')[0] || null));
  });
}
// 파일에 소리 트랙이 있는지 (ffmpeg -i 출력에서 확인)
function hasAudio(file) {
  return new Promise(res => {
    const p = spawn(FF, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let s = ''; p.stderr.on('data', d => { s += d; });
    p.on('error', () => res(false)); p.on('close', () => res(/Stream #.*Audio:/.test(s)));
  });
}

/* ---------- 영상에서 소리만 꺼내기 (무손실 FLAC) ----------
   영상 파일 전체를 메모리에 올리지 않고 소리만 받음 → 큰 영상도 음악으로 쓸 수 있음 */
async function extractAudio(file) {
  const p = run(['-i', file, '-vn', '-sn', '-map', '0:a:0', '-c:a', 'flac', '-f', 'flac', 'pipe:1']);
  const bufs = []; p.stdout.on('data', b => bufs.push(b));
  const code = await p.done;
  if (code !== 0 || !bufs.length) throw new Error(/matches no streams|does not contain any stream/.test(p.err) ? '소리가 없는 영상입니다' : (p.err.trim().split('\n').pop() || '소리를 꺼내지 못했습니다'));
  const b = Buffer.concat(bufs);
  return new Uint8Array(b.buffer, b.byteOffset, b.length);
}

/* ---------- 디코더 ---------- */
const decs = new Map();
function decOpen(o) {
  // o: { id, path, ss(원본 시작 초), rate, fps, w, h, loop }
  // 반복(조각이 원본보다 김)이면 처음(0초)부터 되풀이해야 미리보기와 같음 → 입력 탐색 대신 trim으로 앞부분을 버림
  const ss = Math.max(0, o.ss);
  const vf = `${o.loop ? `trim=start=${ss},` : ''}setpts=(PTS-STARTPTS)/${o.rate},fps=${o.fps},scale=${o.w}:${o.h}:flags=bilinear,format=rgba`;
  const p = run([...(o.loop ? ['-stream_loop', '-1'] : ['-ss', String(ss)]), '-i', o.path, '-an', '-sn', '-vf', vf, '-f', 'rawvideo', 'pipe:1']);
  const d = { p, size: o.w * o.h * 4, q: [], len: 0, ended: false, wake: null };
  p.stdout.on('data', b => { d.q.push(b); d.len += b.length; if (d.len >= d.size * 2) p.stdout.pause(); if (d.wake) d.wake(); });
  p.stdout.on('end', () => { d.ended = true; if (d.wake) d.wake(); });
  decs.set(o.id, d);
  return true;
}
async function decRead(id) {
  const d = decs.get(id); if (!d) return null;
  while (d.len < d.size && !d.ended) { d.p.stdout.resume(); await new Promise(r => { d.wake = r; }); d.wake = null; }
  if (d.len < d.size) return null;   // 원본 끝
  // 쌓인 조각에서 프레임 하나만큼만 복사 (한 번만 복사)
  const out = Buffer.allocUnsafe(d.size); let o = 0;
  while (o < d.size) {
    const b = d.q[0], n = Math.min(b.length, d.size - o);
    b.copy(out, o, 0, n); o += n;
    if (n === b.length) d.q.shift(); else d.q[0] = b.subarray(n);
  }
  d.len -= d.size;
  if (d.len < d.size * 2) d.p.stdout.resume();
  return new Uint8Array(out.buffer, out.byteOffset, out.length);
}
function decClose(id) { const d = decs.get(id); if (d) { try { d.p.kill('SIGKILL'); } catch (e) {} decs.delete(id); } return true; }

/* ---------- 인코더 ---------- */
// 속도 조절: atempo는 0.5~2배씩만 되므로 이어 붙임 (영상 속도를 바꾸면 소리도 같이)
function atempo(r) {
  if (!r || Math.abs(r - 1) < 1e-6) return '';
  const f = []; let x = r;
  while (x > 2) { f.push('atempo=2'); x /= 2; }
  while (x < 0.5) { f.push('atempo=0.5'); x /= 0.5; }
  f.push(`atempo=${x.toFixed(6)}`);
  return f.join(',') + ',';
}
let enc = null;
async function expBegin(o, out) {
  // o: { mode('h264'|'rgba'), w, h, fps, dur(초), bitrate(Mbps, 0=화질 기준), wav(Uint8Array), clipAudio: [{path, start, len, ss, rate, vol, loop}] }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bmm-'));
  const wav = path.join(tmp, 'mix.wav'); fs.writeFileSync(wav, Buffer.from(o.wav.buffer, o.wav.byteOffset, o.wav.byteLength));
  // 입력 0: 화면 — h264(앱이 이미 압축한 H.264, 그대로 담기만 함) 또는 rgba(날 프레임, 여기서 x264로 압축)
  // 입력 1: 음악+비트 소리, 2…: 클립 소리
  const h264 = o.mode === 'h264';
  const vin = h264 ? ['-fflags', '+genpts', '-r', String(o.fps), '-f', 'h264', '-i', 'pipe:0'] : ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${o.w}x${o.h}`, '-r', String(o.fps), '-i', 'pipe:0'];
  const args = ['-y', ...vin, '-i', wav];
  const parts = [];
  for (const c of o.clipAudio || []) {
    if (!(await hasAudio(c.path))) continue;
    const k = 2 + parts.length;
    const ss = Math.max(0, c.ss);
    args.push(...(c.loop ? ['-stream_loop', '-1'] : ['-ss', String(ss)]), '-i', c.path);
    parts.push(`[${k}:a]${c.loop ? `atrim=start=${ss},asetpts=PTS-STARTPTS,` : ''}${atempo(c.rate)}atrim=duration=${c.len.toFixed(4)},asetpts=PTS-STARTPTS,volume=${c.vol},adelay=${Math.round(c.start * 1000)}:all=1[c${parts.length}]`);
  }
  if (parts.length) {
    const ins = ['[1:a]', ...parts.map((_, i) => `[c${i}]`)].join('');
    args.push('-filter_complex', `${parts.join(';')};${ins}amix=inputs=${parts.length + 1}:duration=first:normalize=0[a]`, '-map', '0:v', '-map', '[a]');
  } else args.push('-map', '0:v', '-map', '1:a');
  const rc = o.bitrate > 0 ? ['-b:v', `${o.bitrate}M`, '-maxrate', `${o.bitrate * 1.5}M`, '-bufsize', `${o.bitrate * 2}M`] : ['-crf', '18'];
  const vcodec = h264 ? ['-c:v', 'copy'] : ['-c:v', 'libx264', '-preset', 'veryfast', ...rc, '-pix_fmt', 'yuv420p'];
  args.push(...vcodec, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', o.dur.toFixed(3), out);   // -shortest는 압축된 화면 입력에서 소리를 잘라 버림
  const p = run(args, true);
  p.stdin.on('error', () => {});
  enc = { p, out, tmp, args };
  if (process.env.BMM_FF_LOG) console.log('[ffmpeg]', args.join(' '));
  return { path: out };
}
async function expFrame(data) {
  if (!enc || enc.p.exitCode != null) return false;
  const st = enc.p.stdin;
  st.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  if (process.env.BMM_FF_KEEP) fs.appendFileSync(path.join(enc.tmp, 'video.raw'), Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  // 조금은 쌓아 두고 바로 다음 프레임을 만들게 함 (화면 만들기와 인코딩이 겹쳐서 진행)
  if (st.writableLength > Math.max(data.byteLength * 3, 8 << 20)) await new Promise(r => { const e = enc.p; st.once('drain', r); e.once('close', r); });
  return !!enc && enc.p.exitCode == null;
}
async function expEnd(cancel) {
  if (!enc) return { ok: false, error: '내보내기가 시작되지 않았습니다' };
  const { p, out, tmp } = enc; enc = null;
  if (cancel) { try { p.kill('SIGKILL'); } catch (e) {} } else p.stdin.end();
  const code = await p.done;
  if (!process.env.BMM_FF_KEEP) fs.rmSync(tmp, { recursive: true, force: true });
  if (cancel) { try { fs.rmSync(out, { force: true }); } catch (e) {} return { ok: false, canceled: true }; }
  return code === 0 ? { ok: true, path: out } : { ok: false, error: (p.err || `ffmpeg 종료 코드 ${code}`).trim().slice(-600) };
}

module.exports = { FF, version, extractAudio, decOpen, decRead, decClose, expBegin, expFrame, expEnd, killAll };
