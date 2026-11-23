// 시나리오 9~10: 프로젝트 저장·불러오기, 내보내기
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { test, expect, APP, FX, SONG, loadMusic, loadClips } = require('./helpers');

// 저장 전후 비교용 상태 요약
const SNAP = `({
  tracks: S.tracks.map(tr => tr.map(g => [g.srcName, g.start, g.end, g.off, g.rate, g.x, g.y, g.zoom, g.flip, g.vol])),
  audio: S.audio.map(g => [g.srcName, g.start, g.end, g.off, g.vol]),
  beats: S.beats.slice(),
  set: { layout: S.set.layout, mode: S.set.mode, beatVol: S.set.beatVol, durMode: S.set.durMode, beatSound: S.set.beatSound },
  sounds: SND.list.filter(x => x.custom).map(x => x.name),
})`;

test('9. 프로젝트 저장 → 새로고침 → 불러오기 후 상태가 같음', async ({ app }, info) => {
  const { page } = app;
  await loadMusic(app, [SONG.s128]);
  await loadClips(app, ['v1.mp4', 'v2.mp4', 'v3.mp4']);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('f');
  await page.click('.tabs button[data-tab="tLay"]');
  await page.locator('#lays button', { hasText: '좌우 2분할' }).click();
  await app.E('S.tracks[0][0].x = 0.25; S.tracks[0][0].zoom = 1.5; S.tracks[0][0].flip = true; S.set.mode = "dual"; S.set.beatVol = 0.5');
  await page.setInputFiles('#fSnd', FX('snap.wav'));
  await page.waitForFunction(() => SND.list.some(x => x.custom));
  const before = await app.E(SNAP);

  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  // 파일 선택 창에 넣을 경로는 영문으로 (테스트 결과 폴더 이름에 한글·특수문자가 들어감)
  const proj = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bmm-')), 'project.json');
  await dl.saveAs(proj);

  // 프로그램을 껐다 다시 켠 상황: 새 창에서 열기 (새로고침은 "나가기 전 확인" 창 때문에 테스트에서 쓰지 않음)
  const p2 = await page.context().newPage();
  p2.on('pageerror', e => app.errors.push(String(e)));
  await page.close({ runBeforeUnload: false });
  await p2.goto(APP);
  await p2.setInputFiles('#fProj', proj);
  await p2.waitForFunction(() => S.audio.length > 0 && S.tracks.length === 2);
  await p2.setInputFiles('#fMusic', FX(SONG.s128));
  await p2.waitForFunction(() => S.audio.every(g => g.src));
  await p2.setInputFiles('#fClips', ['v1.mp4', 'v2.mp4', 'v3.mp4'].map(FX));
  await p2.waitForFunction(() => S.tracks.flat().every(g => g.src));
  await p2.waitForFunction(() => SND.list.some(x => x.custom));
  const after = await p2.evaluate(SNAP);
  expect(after).toEqual(before);
});

test('10. 3초 영상 내보내기: 파일 생성, 영상+소리, 길이 3±0.1초', async ({ app }, info) => {
  const { page } = app;
  await loadMusic(app, [SONG.s128]);
  await loadClips(app, ['va_sound.mp4', 'v1.mp4']);
  await page.selectOption('#durMode', 'manual');
  await page.fill('#durSec', '3');
  await page.dispatchEvent('#durSec', 'change');
  expect(await app.E('projDur()')).toBe(3);

  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.click('#btnExport')]);
  const ext = dl.suggestedFilename().split('.').pop();
  const out = info.outputPath('export.' + ext);
  await dl.saveAs(out);
  expect(fs.statSync(out).size).toBeGreaterThan(10_000);

  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', out], { encoding: 'utf8' });
  test.skip(probe.error != null, 'ffprobe가 없어 스트림·길이 검사를 건너뜀');
  const j = JSON.parse(probe.stdout);
  const types = j.streams.map(s => s.codec_type).sort();
  expect(types).toEqual(['audio', 'video']);
  expect(Math.abs(+j.format.duration - 3)).toBeLessThanOrEqual(0.1);
});
