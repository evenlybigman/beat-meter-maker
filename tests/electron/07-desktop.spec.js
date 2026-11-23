// 시나리오 15~19: 데스크톱 앱 — ffmpeg 내보내기(프레임 정확도·소리·취소), 파일 경로 저장·자동 연결
const fs = require('fs');
const path = require('path');
const { test, expect, FX, SONG, loadMusic, loadClips, exportNow, probe, pixel, colorName, toneDb } = require('./helpers');

// 2분할: 왼쪽 = 1초마다 색이 바뀌는 영상을 1초 지점부터 2배속, 오른쪽 = 소리 있는 영상(0.5초부터, 좌우 반전, 클립 소리 켬)
async function setupSplit(a) {
  await loadMusic(a, [SONG.s128]);
  await loadClips(a, ['colors.mp4', 'va_sound.mp4']);
  await a.E(`(() => {
    Object.assign(S.set, { layout: '2h', res: '640x360', fps: 30, durMode: 'manual', durSec: 3, showOverlay: true, beatSoundOn: true });
    const c = n => S.clips.find(x => x.name === n), base = { kind: 'video', x: 0, y: 0, zoom: 1, flip: false, vol: 0 };
    S.tracks = [
      [{ ...base, src: c('colors.mp4'), srcName: 'colors.mp4', start: 0, end: 3, off: 1, rate: 2 }],
      [{ ...base, src: c('va_sound.mp4'), srcName: 'va_sound.mp4', start: 0.5, end: 3, off: 0, rate: 1, vol: 1, flip: true }],
    ];
    refreshTimeline();
  })()`);
}
// 왼쪽 화면 색: 출력 t초 = 원본 1 + 2t초. 원본은 1초마다 빨강→초록→파랑→흰색→노랑→자홍, 6초 넘으면 처음부터 반복
const EXPECT = [[0.25, 'green'], [0.75, 'blue'], [1.25, 'white'], [1.75, 'yellow'], [2.25, 'magenta'], [2.75, 'red']];
function checkOutput(file) {
  const p = probe(file);
  expect(p.video).toBe('h264');
  expect(p.audio).toBe('aac');
  expect(p.size).toBe('640x360');
  expect(p.fps).toBe(30);
  expect(p.frames).toBe(90);                          // 3초 × 30fps, 빠진 프레임 없음
  expect(Math.abs(p.dur - 3)).toBeLessThan(0.08);
  expect(EXPECT.map(([t]) => colorName(pixel(file, t, 160, 100)))).toEqual(EXPECT.map(([, c]) => c));
  expect(colorName(pixel(file, 0.2, 480, 100))).toBe('black');           // 오른쪽은 0.5초 전엔 비어 있음
  expect(colorName(pixel(file, 1.0, 480, 100))).not.toBe('black');
  // 클립 소리(880Hz)는 오른쪽 조각이 시작하는 0.5초부터 섞여 있음
  const before = toneDb(file, 0, 0.45, 880), after = toneDb(file, 1, 2.9, 880);
  expect(after - before, `880Hz ${before}dB → ${after}dB`).toBeGreaterThan(15);
}

test('15. 데스크톱 내보내기(내장 H.264): 2분할·속도·반복·클립 소리, 프레임 정확', async ({ desk }) => {
  const a = await desk.launch();
  expect(await a.E('bmm.ffVersion()')).toContain('ffmpeg version');
  await setupSplit(a);
  const r = await exportNow(a);
  expect(r && r.mode).toBe('h264');
  expect(r.frames).toBe(90);
  checkOutput(desk.out);
  await expect(a.page.locator('#expDone')).toBeVisible();
  expect(await a.E('[S.exporting, document.querySelector("#modal").style.display]')).toEqual([false, 'none']);
});

test('16. 내장 인코더를 못 쓰면 ffmpeg(x264)로 내보내기 — 결과 동일', async ({ desk }) => {
  const a = await desk.launch();
  await setupSplit(a);
  await a.E('window.__forceRgba = true');
  const r = await exportNow(a);
  expect(r && r.mode).toBe('rgba');
  checkOutput(desk.out);
});

test('17. 내보내기 취소: 파일을 남기지 않고, 바로 다시 내보낼 수 있음', async ({ desk }) => {
  const a = await desk.launch();
  await loadMusic(a, [SONG.s128]);
  await loadClips(a, ['v1.mp4']);
  await a.E(`Object.assign(S.set, { res: '1280x720', durMode: 'manual', durSec: 30 })`);
  await a.page.click('#btnExport');
  await a.page.waitForFunction(() => /프레임/.test(document.querySelector('#expTxt').textContent));
  await a.page.click('#btnCancel');
  await a.page.waitForFunction(() => !S.exporting);
  await expect(a.page.locator('#toast')).toContainText('취소');
  expect(fs.existsSync(desk.out)).toBe(false);
  await a.E(`S.set.durSec = 1`);
  const r = await exportNow(a);
  expect(r.frames).toBe(30);
  expect(probe(desk.out).frames).toBe(30);
});

test('18. 프로젝트에 파일 경로 저장 → 다시 열면 파일 자동 연결, 없어진 파일만 알려 줌', async ({ desk }) => {
  const a = await desk.launch();
  await loadMusic(a, [SONG.s128]);
  await loadClips(a, ['v1.mp4', 'v2.mp4']);
  const d = await a.E('projectData()');
  expect(d.paths.clips).toEqual({ 'v1.mp4': FX('v1.mp4'), 'v2.mp4': FX('v2.mp4') });
  expect(d.paths.songs).toEqual({ [SONG.s128]: FX(SONG.s128) });
  const tracks = await a.E('S.tracks[0].map(g => [g.srcName, g.start, g.end])');

  // 그대로 다시 열기: 음악·클립을 다시 넣지 않아도 연결됨
  const f1 = path.join(desk.tmp, 'p1.beatproj.json'); fs.writeFileSync(f1, JSON.stringify(d));
  const b = await desk.launch();
  await b.page.setInputFiles('#fProj', f1);
  await b.page.waitForFunction(() => S.clips.filter(c => c.dur > 0).length === 2 && S.audio.every(g => g.src) && S.tracks[0].every(g => g.src), null, { timeout: 30_000 });
  await expect(b.page.locator('#toast')).toContainText('프로젝트를 열었습니다');
  expect(await b.E('S.tracks[0].map(g => [g.srcName, g.start, g.end])')).toEqual(tracks);
  expect(await b.E('S.songs.map(x => x.path)')).toEqual([FX(SONG.s128)]);

  // 파일 하나가 옮겨진 경우: 나머지는 연결, 없는 것만 알려 줌
  d.paths.clips['v2.mp4'] = path.join(desk.tmp, 'moved', 'v2.mp4');
  const f2 = path.join(desk.tmp, 'p2.beatproj.json'); fs.writeFileSync(f2, JSON.stringify(d));
  const c = await desk.launch();
  await c.page.setInputFiles('#fProj', f2);
  await c.page.waitForFunction(() => S.clips.length === 1 && S.audio.every(g => g.src), null, { timeout: 30_000 });
  await expect(c.page.locator('#toast')).toContainText('v2.mp4');
  expect(await c.E('S.tracks[0].map(g => !!g.src)')).toEqual(tracks.map(([n]) => n === 'v1.mp4'));
  // 다시 넣으면 연결됨 (예전과 같은 방식)
  await loadClips(c, ['v2.mp4']);
  expect(await c.E('S.tracks[0].every(g => g.src)')).toBe(true);
});

test('19. 앱을 껐다 켜서 이전 작업을 복구하면 음악·영상 파일도 다시 연결', async ({ desk }) => {
  const a = await desk.launch();
  await loadMusic(a, [SONG.s128]);
  await loadClips(a, ['v1.mp4']);
  await a.page.waitForFunction(() => window.S && S.clips.length === 1);
  await a.page.waitForTimeout(2600);                      // 자동 저장 주기(2초)
  await a.app.close();
  const b = await desk.launch();
  await expect(b.page.locator('#restoreBar')).toBeVisible();
  await b.page.click('#restoreYes');
  await b.page.waitForFunction(() => S.clips.filter(c => c.dur > 0).length === 1 && S.songs.length === 1 && S.tracks[0].length && S.tracks[0].every(g => g.src), null, { timeout: 30_000 });
});

test('22. 영상을 음악으로 넣으면 ffmpeg가 소리만 꺼냄 (영상 전체를 메모리에 올리지 않음), 소리 없는 영상은 안내', async ({ desk }) => {
  const a = await desk.launch();
  await loadMusic(a, ['va_sound.mp4']);
  const s = await a.E('S.songs.map(x => [x.name, !!x.fromVideo, Math.round(x.dur * 10) / 10, x.buf.numberOfChannels > 0])');
  expect(s).toEqual([['va_sound.mp4', true, 8, true]]);
  await expect(a.page.locator('#songList .badge', { hasText: '영상' })).toHaveCount(1);
  await a.page.setInputFiles('#fMusic', FX('v1.mp4'));
  await expect(a.page.locator('#toast')).toContainText('소리를 꺼낼 수 없는 영상');
  expect(await a.E('S.songs.length')).toBe(1);
});

test('23. 진단 정보(데스크톱): ffmpeg·Electron 버전, 프로세스별 메모리, 앱 기록 포함, 경로는 지움', async ({ desk }) => {
  const a = await desk.launch();
  await loadMusic(a, [SONG.s128]);
  await loadClips(a, ['v1.mp4']);
  const d = await a.E('collectDiag()'), txt = JSON.stringify(d);
  expect(d.mode).toBe('desktop');
  expect(d.env.ffmpeg).toContain('ffmpeg version');
  expect(d.env.versions.electron).toMatch(/^\d+\./);
  expect(d.memory.rendererMB).toBeGreaterThan(0);
  expect(d.memory.processes.some(p => p.type === 'Browser')).toBe(true);
  expect(d.mainLog.join('\n')).toContain('시작 v');
  expect(txt).not.toContain(path.dirname(FX('v1.mp4')));
  expect(txt).not.toContain(require('os').tmpdir() + path.sep + 'bmm-e2e');
});

test('25. 정보 창 링크는 앱 안에서 열지 않고 기본 브라우저로 (https만)', async ({ desk }) => {
  const a = await desk.launch();
  await a.E(`Object.assign(APP_INFO, { donateUrl: 'https://example.com/juke' }); openAbout()`);
  await a.page.click('#aboutDonate');
  await expect.poll(() => a.app.evaluate(() => globalThis.__lastExternal)).toBe('https://example.com/juke');
  expect(a.app.windows().length).toBe(1);                 // 앱 안에 새 창이 생기지 않음
  expect(a.page.url()).toBe('app://local/index.html');    // 앱 화면도 그대로
});
