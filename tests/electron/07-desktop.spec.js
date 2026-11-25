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

test('28. 자동 업데이트: 먼저 묻고 → 다운로드 누르면 진행률 → 준비됨 → 재시작 설치 / 나중에·숨기기 / 내보내는 중엔 막음', async ({ desk }) => {
  const a = await desk.launch({ BMM_FAKE_UPDATE: '9.9.9' });
  const bar = a.page.locator('#updBar'), msg = a.page.locator('#updMsg'), act = a.page.locator('#updAct'), later = a.page.locator('#updLater');
  const installs = () => a.app.evaluate(() => globalThis.__updInstall || 0);

  // 1) 받기 전에 먼저 물어봄
  await expect(bar).toBeVisible({ timeout: 10_000 });
  await expect(msg).toContainText('새 버전 v9.9.9');
  await expect(act).toContainText('다운로드');
  await expect(a.page.locator('#updProg')).toBeHidden();

  // 2) 다운로드 → 진행률 (막대·%·MB), 받는 중엔 숨길 수 있고 다 받으면 다시 뜸
  await act.click();
  await expect(a.page.locator('#updProg')).toBeVisible();
  await expect(msg).toContainText('받는 중');
  await expect(msg).toContainText('MB');
  await expect(act).toBeHidden();
  await later.click();                                  // 숨기기 (계속 받음)
  await expect(bar).toBeHidden();
  await expect.poll(() => a.E(`parseFloat(document.getElementById('updFill').style.width) || 0`)).toBeGreaterThan(0);

  // 3) 다 받으면 다시 뜸 → 내보내는 중엔 재시작 안 함 → 지금 재시작
  await expect(bar).toBeVisible({ timeout: 5_000 });
  await expect(msg).toContainText('v9.9.9 준비됨');
  await expect(act).toContainText('지금 재시작해서 설치');
  await a.E('S.exporting = true');
  await act.click();
  await expect(a.page.locator('#toast')).toContainText('내보내기가 끝난 뒤');
  expect(await installs()).toBe(0);
  await a.E('S.exporting = false');
  await later.click();                                  // 나중에 → 닫기만
  await expect(bar).toBeHidden();
  expect(await installs()).toBe(0);
  await a.E(`document.querySelector('#updBar').style.display = 'flex'`);
  await act.click();
  await expect.poll(installs).toBe(1);
});

test('28c. 자동 업데이트: 받다가 실패하면 알리고, 다시 시도하면 이어서 받음', async ({ desk }) => {
  const a = await desk.launch({ BMM_FAKE_UPDATE: '9.9.9', BMM_FAKE_UPDATE_FAIL: '1' });
  const msg = a.page.locator('#updMsg'), act = a.page.locator('#updAct');
  await expect(act).toContainText('다운로드', { timeout: 10_000 });
  await act.click();
  await expect(msg).toContainText('업데이트를 받지 못했습니다', { timeout: 5_000 });
  await expect(act).toHaveText('다시 시도');
  await act.click();
  await expect(msg).toContainText('준비됨', { timeout: 5_000 });
});

test('28b. 업데이트 흉내가 없으면 바는 뜨지 않음 (테스트·개발 실행에선 확인 안 함)', async ({ desk }) => {
  const a = await desk.launch();
  await a.page.waitForTimeout(1000);
  await expect(a.page.locator('#updBar')).toBeHidden();
});

test('30. 회전·기울기 내보내기: 90도면 위 빨강·아래 파랑, 270도면 반대, 기울이면 귀퉁이 검정', async ({ desk }) => {
  const a = await desk.launch();
  await loadMusic(a, [SONG.s128]);
  await loadClips(a, ['halves.mp4']);   // 왼쪽 빨강 · 오른쪽 파랑
  const run = async (rot, tilt) => {
    await a.E(`(() => {
      Object.assign(S.set, { layout: '1', res: '640x360', fps: 30, durMode: 'manual', durSec: 1, showOverlay: false, fit: 'cover' });
      const c = S.clips.find(x => x.name === 'halves.mp4');
      S.tracks = [[{ kind: 'video', src: c, srcName: c.name, start: 0, end: 1, off: 0, rate: 1, vol: 0, x: 0, y: 0, zoom: 1, flip: false, rot: ${rot}, tilt: ${tilt} }]];
      refreshTimeline();
    })()`);
    const r = await exportNow(a);
    expect(r && r.frames).toBe(30);
    const at = (x, y) => colorName(pixel(desk.out, 0.5, x, y));
    return { top: at(320, 60), bottom: at(320, 300), left: at(160, 180), right: at(480, 180), corner: at(6, 6) };
  };
  expect(await run(0, 0)).toMatchObject({ left: 'red', right: 'blue', corner: 'red' });
  expect(await run(90, 0)).toMatchObject({ top: 'red', bottom: 'blue' });
  expect(await run(270, 0)).toMatchObject({ top: 'blue', bottom: 'red' });
  expect(await run(0, 15)).toMatchObject({ left: 'red', right: 'blue', corner: 'black' });
});

test('33. 클립 10개 랜덤 채우기 후 재생: 나와야 할 클립의 재생기가 항상 있고 준비됨, 화면당 재생기 2개 이하', async ({ desk }) => {
  test.setTimeout(90_000);
  const a = await desk.launch();
  await loadMusic(a, [SONG.s128]);
  await loadClips(a, Array.from({ length: 10 }, (_, i) => `m${i + 1}.mp4`));
  await a.page.click('.tabs button[data-tab="tCut"]');
  await a.page.fill('#fillEvery', '2');
  await a.page.locator('body').click({ position: { x: 5, y: 5 } });
  await a.page.keyboard.press('f');
  expect(await a.E('new Set(S.tracks[0].map(g => g.srcName)).size')).toBeGreaterThan(5);
  // 재생하면서 30ms마다: 지금 나와야 할 클립의 video가 있는지, 준비됐는지, video 수
  await a.E(`window.__mon = []; window.__monT = setInterval(() => {
    if (!S.playing) return;
    const t = now(); let g = null; for (const x of S.tracks[0]) { if (x.start > t) break; if (x.end > t) g = x; }
    if (!g) return;
    const vs = [...document.querySelectorAll('#vids video')];
    const v = vs.find(v => v.src === g.src.url);
    window.__mon.push([t, g.start, !!v, v ? v.readyState >= 2 && !v.seeking : false, vs.length]);
  }, 30)`);
  await a.page.keyboard.press('Space');
  await a.page.waitForTimeout(8000);
  await a.page.keyboard.press('Space');
  const m = await a.E('clearInterval(window.__monT), window.__mon');
  expect(m.length).toBeGreaterThan(100);
  const missing = m.filter(r => !r[2]);                        // 재생기 자체가 없음 (예전 버그: 방금 만든 것이 바로 지워짐)
  const notReady = m.filter(r => !r[3] && r[0] - r[1] > 0.3);  // 조각 시작 0.3초 뒤에도 준비 안 됨
  expect(missing.length, '나와야 할 클립의 재생기가 없음').toBe(0);
  expect(notReady.length / m.length, '준비 안 된 비율').toBeLessThan(0.05);
  expect(Math.max(...m.map(r => r[4])), '화면당 재생기 수').toBeLessThanOrEqual(2);
});

test('39. 클립 기본 편집 내보내기: 클립 회전·상하 반전·자르기·채도가 결과 영상에 그대로, 클립 속도 2배면 원본을 2배로', async ({ desk }) => {
  const a = await desk.launch();
  await loadMusic(a, [SONG.s128]);
  await loadClips(a, ['halves.mp4']);   // 왼쪽 빨강 · 오른쪽 파랑
  const run = async fx => {
    await a.E(`(() => {
      Object.assign(S.set, { layout: '1', res: '640x360', fps: 30, durMode: 'manual', durSec: 1, showOverlay: false, fit: 'cover' });
      const c = S.clips.find(x => x.name === 'halves.mp4');
      c.fx = Object.assign({ rot: 0, flipH: false, flipV: false, crop: [0, 0, 0, 0], zoom: 1, bri: 100, con: 100, sat: 100, rate: 1 }, ${JSON.stringify(fx)});
      S.tracks = [[{ kind: 'video', src: c, srcName: c.name, start: 0, end: 1, off: 0, rate: 1, vol: 0, x: 0, y: 0, zoom: 1, flip: false, rot: 0, tilt: 0 }]];
      refreshTimeline();
    })()`);
    const r = await exportNow(a);
    expect(r && r.frames).toBe(30);
    const px = (x, y) => pixel(desk.out, 0.5, x, y), at = (x, y) => colorName(px(x, y));
    return { top: at(320, 60), bottom: at(320, 300), left: at(160, 180), right: at(480, 180), raw: px(160, 180) };
  };
  expect(await run({ rot: 90 })).toMatchObject({ top: 'red', bottom: 'blue' });
  expect(await run({ rot: 90, flipV: true })).toMatchObject({ top: 'blue', bottom: 'red' });   // 돌린 뒤 상하 반전
  expect(await run({ crop: [0, 0, 0.45, 0] })).toMatchObject({ left: 'red', right: 'red' });    // 오른쪽(파랑) 잘라 냄
  const g = (await run({ sat: 0 })).raw;                                                         // 채도 0 → 회색
  expect(Math.max(...g) - Math.min(...g)).toBeLessThan(25);

  // 속도 2배: 1초마다 색이 바뀌는 영상(빨강→초록→파랑)에서 0.75초엔 초록, 1.25초엔 파랑
  await loadClips(a, ['colors.mp4']);
  await a.E(`(() => {
    Object.assign(S.set, { durSec: 1.5 });
    const c = S.clips.find(x => x.name === 'colors.mp4'); c.fx.rate = 2;
    S.tracks = [[{ kind: 'video', src: c, srcName: c.name, start: 0, end: 1.5, off: 0, rate: 1, vol: 0, x: 0, y: 0, zoom: 1, flip: false, rot: 0, tilt: 0 }]];
    refreshTimeline();
  })()`);
  await exportNow(a);
  expect([0.25, 0.75, 1.25].map(t => colorName(pixel(desk.out, t, 320, 180)))).toEqual(['red', 'green', 'blue']);
});

test('42. 이미지 클립 (데스크톱): 내보낸 영상에 이미지가 그대로(클립 편집 포함), 영상과 섞여도 정상, 프로젝트 다시 열면 경로로 자동 연결', async ({ desk }) => {
  const a = await desk.launch();
  await loadMusic(a, [SONG.s128]);
  await loadClips(a, ['halves.png', 'anim.gif', 'colors.mp4']);
  expect(await a.E('S.clips.map(c => [c.name, !!c.image])')).toEqual([['halves.png', true], ['anim.gif', true], ['colors.mp4', false]]);
  await a.E(`(() => {
    Object.assign(S.set, { layout: '1', res: '640x360', fps: 30, durMode: 'manual', durSec: 3, showOverlay: false, fit: 'cover' });
    const [p, gif, v] = S.clips;
    const it = (c, s, e, off = 0) => ({ kind: 'video', src: c, srcName: c.name, start: s, end: e, off, rate: 1, vol: 1, x: 0, y: 0, zoom: 1, flip: false, rot: 0, tilt: 0 });
    S.tracks = [[it(p, 0, 1), it(v, 1, 2, 1), it(gif, 2, 3)]];   // 이미지 → 영상(초록 구간) → 움직이는 GIF
    refreshTimeline();
  })()`);
  let r = await exportNow(a);
  expect(r && r.frames).toBe(90);
  const at = (t, x, y) => colorName(pixel(desk.out, t, x, y));
  expect([at(0.5, 160, 180), at(0.5, 480, 180)]).toEqual(['red', 'blue']);   // PNG
  expect(at(1.5, 320, 180)).toBe('green');                                    // 영상
  expect([at(2.2, 320, 180), at(2.8, 320, 180)]).toEqual(['red', 'red']);     // GIF는 첫 장면 그대로
  // 클립 기본 편집(회전 90°)도 내보내기에
  await a.E('S.clips[0].fx.rot = 90');
  r = await exportNow(a);
  expect([at(0.5, 320, 60), at(0.5, 320, 300)]).toEqual(['red', 'blue']);

  // 프로젝트 저장 → 새 창에서 열면 이미지도 경로로 자동 연결, 기본 길이·편집 유지
  await a.E('S.clips[0].dur = 3.5');
  const d = await a.E('projectData()');
  expect(d.paths.clips['halves.png']).toBe(FX('halves.png'));
  const f = path.join(desk.tmp, 'img.beatproj.json'); fs.writeFileSync(f, JSON.stringify(d));
  const b = await desk.launch();
  await b.page.setInputFiles('#fProj', f);
  await b.page.waitForFunction(() => S.clips.length === 3 && S.clips.every(c => c.dur > 0) && S.tracks[0].every(g => g.src), null, { timeout: 30_000 });
  expect(await b.E('[S.clips[0].image, S.clips[0].dur, S.clips[0].fx.rot, !!S.clips[0].bmp]')).toEqual([true, 3.5, 90, true]);
});
