// 시나리오 13~14, 26: 되돌리기·다시 실행, 예전 형식(v1·v3) 프로젝트 자동 변환
const { test, expect, FX, SONG, loadMusic, loadClips, track } = require('./helpers');

test('13. 되돌리기·다시 실행: 단계별로 왕복, 새 편집을 하면 다시 실행 목록은 비워짐', async ({ app }) => {
  const { page } = app;
  await expect(page.locator('#tlUndo')).toBeDisabled();             // 처음엔 둘 다 꺼짐
  await expect(page.locator('#tlRedo')).toBeDisabled();
  await loadMusic(app, [SONG.s128]);                                // 비트 자동 생성도 되돌리기 대상
  await expect(page.locator('#tlUndo')).toBeEnabled();
  await loadClips(app, ['v1.mp4', 'v2.mp4']);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  const t0 = await track(app);

  await app.E('seek(2)');
  await page.keyboard.press('c');                                   // 자르기
  const t1 = await track(app);
  await page.keyboard.press('Delete');                              // 잘린 뒤쪽 삭제
  const t2 = await track(app);
  expect(t1.length).toBe(t0.length + 1);
  expect(t2.length).toBe(t0.length);

  await page.keyboard.press('Control+z');
  await expect(page.locator('#toast')).toContainText('되돌림: 영상 삭제');
  expect(await track(app)).toEqual(t1);
  await page.click('#tlUndo');
  await expect(page.locator('#toast')).toContainText('되돌림: 영상 자르기');
  expect(await track(app)).toEqual(t0);
  await expect(page.locator('#tlRedo')).toBeEnabled();

  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('#toast')).toContainText('다시 실행: 영상 자르기');
  expect(await track(app)).toEqual(t1);
  await page.keyboard.press('Control+y');
  expect(await track(app)).toEqual(t2);
  await expect(page.locator('#tlRedo')).toBeDisabled();

  // 되돌린 뒤 새 편집을 하면 다시 실행할 것이 없어짐
  await page.keyboard.press('Control+z');
  await page.keyboard.press('d');                                   // 복제 (새 편집)
  await expect(page.locator('#tlRedo')).toBeDisabled();
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('#toast')).toContainText('다시 실행할 작업이 없습니다');

  // 음악 삭제를 되돌리면 음악 목록에도 다시 나타남
  await app.E('removeSong(S.songs[0])');
  expect(await app.E('[S.songs.length, S.audio.length]')).toEqual([0, 0]);
  await page.keyboard.press('Control+z');
  expect(await app.E('[S.songs.length, S.audio.length, S.audio[0].src === S.songs[0]]')).toEqual([1, 1, true]);
  await expect(page.locator('#songList li')).toHaveCount(1);
});

test('14. 예전 형식 프로젝트(v3·v1)를 열면 v4로 바뀌고, 저장하면 v4', async ({ app }) => {
  const { page } = app;
  // v3: 2분할, 음악 볼륨, 조각 위치·확대·반전·속도, 쓰지 않는 예전 설정 키 포함
  await page.setInputFiles('#fProj', FX('project-v3.json'));
  await page.waitForFunction(() => S.tracks.length === 2 && S.audio.length === 1);
  await page.setInputFiles('#fMusic', FX(SONG.s128));
  await page.waitForFunction(() => S.audio.every(g => g.src));
  await page.setInputFiles('#fClips', ['v1.mp4', 'v2.mp4'].map(FX));
  await page.waitForFunction(() => S.tracks.flat().every(g => g.src));
  const st = await app.E(`({
    kinds: [...S.tracks.flat().map(g => g.kind), ...S.audio.map(g => g.kind)],
    t0: S.tracks[0].map(g => [g.srcName, g.start, g.end, g.off, g.rate, g.x, g.zoom, g.flip, g.vol]),
    t1: S.tracks[1].map(g => [g.srcName, g.start, g.end]),
    audio: S.audio.map(g => [g.srcName, g.start, g.end, g.vol]),
    layout: S.set.layout, mode: S.set.mode, oldKeys: ['cutEvery', 'stagger'].some(k => k in S.set),
    trim: [S.clips[0].inPt, S.clips[0].outPt], musicVol: S.musicVol, beats: S.beats.length,
  })`);
  expect(st.kinds).toEqual(['video', 'video', 'video', 'audio']);
  expect(st.t0).toEqual([['v1.mp4', 0, 5, 1, 1, 0.2, 1.5, true, 1], ['v2.mp4', 5, 12, 0, 2, 0, 1, false, 0]]);
  expect(st.t1).toEqual([['v2.mp4', 0, 8]]);
  expect(st.audio).toEqual([['bpm128_sil3_2.ogg', 0, 40, 0.8]]);
  expect([st.layout, st.mode, st.oldKeys]).toEqual(['2h', 'dual', false]);
  expect(st.trim).toEqual([1, 6]);
  expect(st.musicVol).toBe(0.9);
  expect(st.beats).toBe(3);
  const saved = await app.E('projectData()');
  expect(saved.v).toBe(4);
  expect(saved.tracks[0][0]).toMatchObject({ kind: 'video', src: 'v1.mp4', start: 0, end: 5, zoom: 1.5, flip: true });
  expect(saved.audio[0]).toMatchObject({ kind: 'audio', src: 'bpm128_sil3_2.ogg', vol: 0.8 });

  // v1: 트랙 하나(segments)와 음악 이름 하나(music)만 있던 가장 오래된 형식
  await page.setInputFiles('#fProj', FX('project-v1.json'));
  await page.waitForFunction(() => S.tracks.length === 1 && S.tracks[0].length === 1);
  const v1 = await app.E('({ t: S.tracks[0].map(g => [g.kind, g.srcName, g.start, g.end]), a: S.audio.map(g => [g.kind, g.srcName, g.start, g.end]), beats: S.beats })');
  expect(v1.t).toEqual([['video', 'v1.mp4', 0, 4]]);
  expect(v1.a).toEqual([['audio', 'bpm128_sil3_2.ogg', 0, 40.000]].map(x => [x[0], x[1], x[2], expect.any(Number)]));
  expect(v1.beats).toEqual([1, 2]);
});

test('26. 예전 버전이 영상에서 꺼낸 음악 이름 앞에 붙이던 표시(🎬)를 떼고 연결', async ({ app }) => {
  const { page } = app;
  // 예전 버전이 저장한 v4 파일: 음악 이름이 '🎬 va_sound.mp4'
  const d = { app: 'beat-meter-maker', v: 4, sounds: [], bpm: 120, offset: 0, musicStart: 0, beats: [1, 2], set: {}, songs: ['🎬 va_sound.mp4'], clips: [], trims: [],
    audio: [{ kind: 'audio', start: 0, end: 6, src: '🎬 va_sound.mp4', off: 0, rate: 1, vol: 1, x: 0, y: 0, zoom: 1, flip: false }], tracks: [[]], musicVol: 1 };
  const os = require('os'), path = require('path'), dir = require('fs').mkdtempSync(path.join(os.tmpdir(), 'bmm-'));
  const f = path.join(dir, 'old-video-song.beatproj.json');
  require('fs').writeFileSync(f, JSON.stringify(d));
  await page.setInputFiles('#fProj', f);
  await page.waitForFunction(() => S.audio.length === 1);
  expect(await app.E('S.audio.map(g => g.srcName)')).toEqual(['va_sound.mp4']);
  await loadMusic(app, ['va_sound.mp4']);                     // 같은 영상을 다시 넣으면 그 자리에 연결
  expect(await app.E('S.audio.map(g => [!!g.src, g.start, g.end])')).toEqual([[true, 0, 6]]);
  expect(await app.E('S.songs.map(x => [x.name, !!x.fromVideo])')).toEqual([['va_sound.mp4', true]]);
  expect((await app.E('projectData()')).songs).toEqual(['va_sound.mp4']);
});
