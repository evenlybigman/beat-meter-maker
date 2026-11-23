// 데스크톱 앱 테스트 도구: 앱 실행(저장 대화상자 대신 정해진 경로, 테스트마다 따로 쓰는 사용자 폴더),
// 페이지 오류 수집, ffmpeg로 결과 영상 검사
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');
const { _electron, test: base, expect } = require('@playwright/test');
const { FX, SONG } = require('../helpers');

const ROOT = path.resolve(__dirname, '..', '..');
const FF = require('ffmpeg-static');

const test = base.extend({
  tmp: async ({}, use) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bmm-e2e-')); await use(d); fs.rmSync(d, { recursive: true, force: true }); },
  desk: async ({ tmp }, use) => {
    const opened = [], out = path.join(tmp, 'out.mp4'), userData = path.join(tmp, 'user');
    const launch = async () => {
      // BMM_EXE: 설치본(electron-builder 결과) 실행 파일로 테스트
      const exe = process.env.BMM_EXE, args = exe ? [] : [ROOT];
      if (process.platform === 'linux' && process.getuid && process.getuid() === 0) args.push('--no-sandbox');
      const app = await _electron.launch({ args, ...(exe ? { executablePath: exe } : {}), env: { ...process.env, BMM_TEST: '1', BMM_TEST_OUT: out, BMM_USER_DATA: userData } });
      const page = await app.firstWindow(), errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      if (process.env.BMM_FF_LOG) page.on('console', m => console.log('[page]', m.text()));
      await page.waitForFunction(() => window.S && window.bmm);
      const a = { app, page, errors, E: expr => page.evaluate(expr) };
      opened.push(a); return a;
    };
    await use({ out, tmp, launch });
    for (const a of opened) { await a.app.close().catch(() => {}); expect(a.errors, '페이지 오류 없음').toEqual([]); }
  },
});

async function loadMusic(a, files) {
  const n = await a.E('S.songs.length');
  await a.page.setInputFiles('#fMusic', files.map(FX));
  await a.page.waitForFunction(n => S.songs.length >= n, n + files.length, { timeout: 30_000 });
}
async function loadClips(a, files) {
  const n = await a.E('S.clips.filter(c => c.dur > 0).length');
  await a.page.setInputFiles('#fClips', files.map(FX));
  await a.page.waitForFunction(n => S.clips.filter(c => c.dur > 0).length >= n, n + files.length, { timeout: 30_000 });
}
// 내보내기 버튼을 누르고 끝날 때까지 기다림 → 결과 정보 (window.__lastExport)
async function exportNow(a, timeout = 90_000) {
  await a.E('window.__lastExport = null');
  await a.page.click('#btnExport');
  await a.page.waitForFunction(() => window.__lastExport || document.querySelector('#toast').textContent.includes('실패'), null, { timeout });
  return a.E('window.__lastExport');
}
// 결과 영상 정보: 스트림, 길이, 영상 프레임 수
function probe(file) {
  const info = spawnSync(FF, ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr;
  const cnt = spawnSync(FF, ['-hide_banner', '-i', file, '-map', '0:v', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
  return {
    video: (/Video: (\w+)/.exec(info) || [])[1], audio: (/Audio: (\w+)/.exec(info) || [])[1],
    fps: +((/, ([\d.]+) fps/.exec(info) || [])[1] || 0), size: (/, (\d+x\d+)[, ]/.exec(info) || [])[1],
    dur: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0,
    frames: +([...cnt.matchAll(/frame=\s*(\d+)/g)].pop() || [])[1],
  };
}
// t초 프레임의 (x, y) 근처 4×4 평균 색 [r, g, b]
function pixel(file, t, x, y) {
  const b = execFileSync(FF, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `crop=4:4:${x - 2}:${y - 2},scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  return [...b.subarray(0, 3)];
}
// from~to초 구간에서 f Hz 근처 소리 크기(dB, 평균)
function toneDb(file, from, to, f) {
  const e = spawnSync(FF, ['-hide_banner', '-i', file, '-vn', '-af', `atrim=${from}:${to},bandpass=f=${f}:width_type=h:w=40,volumedetect`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  return +((/mean_volume: (-?[\d.]+) dB/.exec(e) || [])[1] ?? -99);
}
// 색 이름 판정 (압축 오차 허용)
function colorName([r, g, b]) {
  const hi = v => v > 170, lo = v => v < 85;
  if (hi(r) && hi(g) && hi(b)) return 'white';
  if (hi(r) && lo(g) && lo(b)) return 'red';
  if (lo(r) && hi(g) && lo(b)) return 'green';
  if (lo(r) && lo(g) && hi(b)) return 'blue';
  if (hi(r) && hi(g) && lo(b)) return 'yellow';
  if (hi(r) && lo(g) && hi(b)) return 'magenta';
  if (lo(r) && lo(g) && lo(b)) return 'black';
  return `?${r},${g},${b}`;
}
module.exports = { test, expect, FX, SONG, ROOT, loadMusic, loadClips, exportNow, probe, pixel, colorName, toneDb };
