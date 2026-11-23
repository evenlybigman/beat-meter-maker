// 시나리오 20~21: video 요소 수 제한(메모리), 진단 정보·오류 기록·그리기 오류 뒤 계속 동작
const fs = require('fs');
const { test, expect, SONG, loadMusic, loadClips } = require('./helpers');

test('20. 4분할에서 클립 5개를 여기저기 오가도 video 요소는 화면당 2개까지, 클립을 지우면 정리', async ({ app }) => {
  const { page } = app;
  await loadMusic(app, [SONG.s128]);
  await loadClips(app, ['v1.mp4', 'v2.mp4', 'v3.mp4', 'va_sound.mp4', 'colors.mp4']);
  await app.E(`(() => {
    S.set.layout = '4';
    const base = { kind: 'video', x: 0, y: 0, zoom: 1, flip: false, vol: 0, rate: 1 };
    S.tracks = [0, 1, 2, 3].map(k => Array.from({ length: 12 }, (_, i) => { const c = S.clips[(i + k) % 5];
      return { ...base, src: c, srcName: c.name, start: i * 2, end: i * 2 + 2, off: (i + k) % 4 }; }));
    refreshTimeline();
  })()`);
  for (let i = 0; i < 24; i++) { await app.E(`seek(${(i * 7) % 24 + 0.5})`); await page.waitForTimeout(60); }
  await page.click('#btnPlay'); await page.waitForTimeout(1500); await page.click('#btnPlay');
  expect(await app.E('poolSize()')).toBeLessThanOrEqual(8);
  expect(await page.locator('#vids video').count()).toBeLessThanOrEqual(8);   // 길이를 읽던 임시 video도 남지 않음
  await app.E(`document.querySelectorAll('#clipList li button[title="삭제"]')[0].click()`);   // 첫 클립 삭제
  await page.waitForTimeout(100);
  expect(await app.E(`[...document.querySelectorAll('#vids video')].filter(v => v.src && !S.clips.some(c => c.url === v.src)).length`)).toBe(0);
});

test('21. 진단 정보: 오류 기록, 그리기 오류가 나도 화면 계속 동작, 파일에 폴더 경로·파일 이름 없음', async ({ app }) => {
  const { page } = app;
  await loadMusic(app, [SONG.s128]);
  await loadClips(app, ['v1.mp4']);
  // 그리기 중 오류 → 기록되고 안내가 뜨지만 그리기 루프는 멈추지 않음
  await app.E(`window.__tr = S.tracks; S.tracks = null`);
  await expect(page.locator('#toast')).toContainText('오류가 기록되었습니다');
  await app.E(`S.tracks = window.__tr`);
  const t1 = await page.locator('#time').textContent();
  await app.E('seek(5)');
  await expect(page.locator('#time')).not.toHaveText(t1);
  // 잡히지 않은 오류, 경로가 들어간 콘솔 오류
  await app.E(`setTimeout(() => { throw new Error('테스트 오류') }, 0)`);
  await app.E(`console.error('읽기 실패 C:\\\\Users\\\\홍길동\\\\Videos\\\\비밀 폴더\\\\clip.mp4', '/home/someone/private/a.mp4')`);
  await page.waitForTimeout(100);
  app.errors.splice(0);   // 일부러 낸 오류는 테스트 실패로 치지 않음

  await page.click('[data-tab="tOut"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnDiag')]);
  expect(dl.suggestedFilename()).toMatch(/^beatmeter-진단-\d{8}-\d{4}\.json$/);
  const txt = fs.readFileSync(await dl.path(), 'utf8'), d = JSON.parse(txt);
  expect(d.version).toBe(require('../package.json').version);
  expect(d.mode).toBe('web');
  expect(d.project.songs).toEqual([expect.objectContaining({ ext: 'ogg', fromVideo: false })]);
  expect(Math.round(d.project.songs[0].bpm)).toBe(128);
  expect(d.project.clips).toEqual([expect.objectContaining({ ext: 'mp4', size: '320x180' })]);
  const logs = d.log.map(x => x.msg).join('\n');
  expect(logs).toContain('그리기');
  expect(logs).toContain('테스트 오류');
  expect(logs).toContain('…/clip.mp4');
  expect(logs).toContain('…/a.mp4');
  for (const bad of ['홍길동', '비밀 폴더', 'someone', 'private', 'bpm128_sil3_2']) expect(txt).not.toContain(bad);
});
