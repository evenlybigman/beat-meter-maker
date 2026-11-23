// 시나리오 11~12: 자동 저장·복구, 손상된 프로젝트 파일 거부
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect, APP, FX, SONG, loadMusic, loadClips } = require('./helpers');

const SNAP = `({
  tracks: S.tracks.map(tr => tr.map(g => [g.srcName, g.start, g.end, g.off, g.x, g.zoom, g.flip, g.vol])),
  audio: S.audio.map(g => [g.srcName, g.start, g.end, g.off, g.vol]),
  beats: S.beats.slice(), layout: S.set.layout, beatVol: S.set.beatVol,
})`;
const tmp = (name, text) => { const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bmm-')), name); fs.writeFileSync(p, text); return p; };

test('11. 자동 저장: 껐다 켜면 복구 안내가 뜨고, 복구하면 작업이 그대로 돌아옴', async ({ app }) => {
  const { page } = app;
  await loadMusic(app, [SONG.s128]);
  await loadClips(app, ['v1.mp4', 'v2.mp4', 'v3.mp4']);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('f');
  await app.E('S.tracks[0][1].x = 0.3; S.tracks[0][1].flip = true; S.set.beatVol = 0.4');
  const before = await app.E(SNAP);
  await page.waitForTimeout(2600);                                  // 자동 저장 주기 2초

  // 프로그램을 껐다 다시 켬 (같은 브라우저 저장소)
  const p2 = await page.context().newPage();
  p2.on('pageerror', e => app.errors.push(String(e)));
  p2.on('dialog', d => d.accept());
  await page.close({ runBeforeUnload: false });
  await p2.goto(APP);
  await expect(p2.locator('#restoreBar')).toBeVisible();
  await expect(p2.locator('#restoreTxt')).toContainText('음악 1개 · 클립 3개');
  await p2.click('#restoreYes');
  await expect(p2.locator('#restoreBar')).toBeHidden();
  await p2.setInputFiles('#fMusic', FX(SONG.s128));
  await p2.waitForFunction(() => S.audio.every(g => g.src));
  await p2.setInputFiles('#fClips', ['v1.mp4', 'v2.mp4', 'v3.mp4'].map(FX));
  await p2.waitForFunction(() => S.tracks.flat().every(g => g.src));
  expect(await p2.evaluate(SNAP)).toEqual(before);

  // 다시 껐다 켜면 방금 복구한 작업이 다시 "이전 작업"으로 뜨고, 삭제하면 사라짐
  await p2.waitForTimeout(2600);
  const p3 = await p2.context().newPage();
  p3.on('pageerror', e => app.errors.push(String(e)));
  p3.on('dialog', d => d.accept());
  await p2.close({ runBeforeUnload: false });
  await p3.goto(APP);
  await expect(p3.locator('#restoreBar')).toBeVisible();
  await p3.click('#restoreNo');
  await expect(p3.locator('#restoreBar')).toBeHidden();
  const p4 = await p3.context().newPage();
  await p3.close({ runBeforeUnload: false });
  await p4.goto(APP);
  await p4.waitForTimeout(500);
  await expect(p4.locator('#restoreBar')).toBeHidden();             // 빈 상태는 복구 대상 아님
});

test('12. 손상된 프로젝트 파일은 거부하고 현재 작업은 그대로, 예전 설정 키는 버림', async ({ app }) => {
  const { page } = app;
  await loadMusic(app, [SONG.s128]);
  await loadClips(app, ['v1.mp4', 'v2.mp4']);
  const before = await app.E(SNAP);
  const good = await app.E('JSON.stringify(projectData())');
  const bad = {
    'not-json.json': '{ 이건 JSON이 아님',
    'other-app.json': JSON.stringify({ app: 'something-else' }),
    'end-before-start.json': (() => { const d = JSON.parse(good); d.tracks[0][0].end = d.tracks[0][0].start - 1; return JSON.stringify(d); })(),
    'beat-nan.json': (() => { const d = JSON.parse(good); d.beats.push('x'); return JSON.stringify(d); })(),
    'future-version.json': (() => { const d = JSON.parse(good); d.v = 99; return JSON.stringify(d); })(),
  };
  for (const [name, text] of Object.entries(bad)) {
    await page.setInputFiles('#fProj', tmp(name, text));
    await expect(page.locator('#toast'), name).toContainText(/열 수 없습니다|읽을 수 없습니다/);
    expect(await app.E(SNAP), `${name} 후 작업 유지`).toEqual(before);
  }
  // 예전 버전(자동 컷 시절) 설정 키가 있어도 열리고, 그 키는 버려짐
  const old = JSON.parse(good); Object.assign(old.set, { cutEvery: 4, stagger: true, singleNoCut: true }); old.seed = 123;
  await page.setInputFiles('#fProj', tmp('old.json', JSON.stringify(old)));
  await expect(page.locator('#toast')).toContainText('프로젝트');
  expect(await app.E('["cutEvery", "stagger", "singleNoCut"].some(k => k in S.set)')).toBe(false);
  expect(await app.E(SNAP)).toEqual(before);
});
